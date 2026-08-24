'use strict';

const http = require('http');
const https = require('https');

const DEFAULT_DATA_URL = 'http://127.0.0.1:8085/data.json';
const DEFAULT_TIMEOUT_MS = 3000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;

const SENSOR_SUFFIXES = Object.freeze({
	Voltage: 'V',
	Current: 'A',
	Clock: 'MHz',
	Load: '%',
	Temperature: '°C',
	Fan: 'RPM',
	Flow: 'L/h',
	Control: '%',
	Level: '%',
	Power: 'W',
	Data: 'GB',
	SmallData: 'MB',
	Factor: '',
	Frequency: 'Hz',
	Throughput: 'B/s',
	TimeSpan: 's',
	Timing: 'ns',
	Energy: 'mWh',
	Noise: 'dBA',
	Conductivity: 'µS/cm',
	Humidity: '%',
});

const SENSOR_DECIMALS = Object.freeze({
	Voltage: 3,
	Current: 3,
	Fan: 0,
	Factor: 3,
	Timing: 3,
	Energy: 0,
	Noise: 0,
	Humidity: 0,
});

/**
 * Convert a user-provided server value into the LibreHardwareMonitor data URL.
 * A bare host such as "127.0.0.1:8085" is accepted for convenience.
 *
 * @param {unknown} value
 * @returns {URL}
 */
function normalizeDataUrl(value) {
	let input = typeof value === 'string' ? value.trim() : '';
	if (!input) input = DEFAULT_DATA_URL;

	if (!/^[a-z][a-z\d+.-]*:\/\//i.test(input)) {
		input = `http://${input}`;
	}

	const url = new URL(input);
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`Unsupported protocol: ${url.protocol}`);
	}

	if (!url.pathname || url.pathname === '/') {
		url.pathname = '/data.json';
	}

	url.hash = '';
	return url;
}

/**
 * @param {unknown} value
 * @returns {number|null}
 */
function toFiniteNumber(value) {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}

	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}

	return null;
}

/**
 * Parse a formatted LibreHardwareMonitor value. LibreHardwareMonitor 0.9.6 can
 * expose RawValue as a unit-bearing string instead of a JSON number.
 *
 * @param {unknown} value
 * @returns {{number: number, unit: string}|null}
 */
function parseFormattedNumber(value) {
	if (typeof value !== 'string') return null;

	const match = value
		.trim()
		.match(/^([+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)(?:e[+-]?\d+)?)\s*(.*)$/i);
	if (!match) return null;

	const parsed = Number(match[1].replace(',', '.'));
	if (!Number.isFinite(parsed)) return null;

	return {
		number: parsed,
		unit: match[2].trim(),
	};
}

/**
 * Convert a formatted display unit back to the base unit used by Deckboard.
 * Most sensor types already use a fixed unit; only dynamically scaled types
 * need conversion here.
 *
 * @param {number} value
 * @param {string} unit
 * @param {string} sensorType
 * @returns {number}
 */
function convertFormattedValueToBaseUnit(value, unit, sensorType) {
	const normalizedUnit = unit.toLowerCase();

	if (sensorType === 'Throughput') {
		const throughputMultipliers = {
			'b/s': 1,
			'kb/s': 1024,
			'mb/s': 1024 ** 2,
			'gb/s': 1024 ** 3,
			'tb/s': 1024 ** 4,
		};
		return Object.prototype.hasOwnProperty.call(
			throughputMultipliers,
			normalizedUnit
		)
			? value * throughputMultipliers[normalizedUnit]
			: value;
	}

	if (sensorType === 'Frequency') {
		const frequencyMultipliers = {
			hz: 1,
			khz: 1000,
			mhz: 1000 ** 2,
			ghz: 1000 ** 3,
		};
		return Object.prototype.hasOwnProperty.call(
			frequencyMultipliers,
			normalizedUnit
		)
			? value * frequencyMultipliers[normalizedUnit]
			: value;
	}

	if (sensorType === 'Clock' && normalizedUnit === 'ghz') {
		return value * 1000;
	}

	return value;
}

/**
 * Read both the documented numeric RawValue and the formatted representation
 * emitted by LibreHardwareMonitor 0.9.6. Value is also accepted as a fallback
 * for compatible web-server implementations that omit RawValue.
 *
 * @param {unknown} rawValue
 * @param {unknown} formattedValue
 * @param {string} sensorType
 * @returns {number|null}
 */
function toSensorNumber(rawValue, formattedValue, sensorType) {
	const directValue = toFiniteNumber(rawValue);
	if (directValue !== null) return directValue;

	for (const candidate of [rawValue, formattedValue]) {
		const parsed = parseFormattedNumber(candidate);
		if (!parsed) continue;

		return convertFormattedValueToBaseUnit(
			parsed.number,
			parsed.unit,
			sensorType
		);
	}

	return null;
}

/**
 * Flatten LibreHardwareMonitor's /data.json tree into sensor records.
 *
 * @param {unknown} payload
 * @returns {Array<{
 *   id: string,
 *   name: string,
 *   type: string,
 *   rawValue: number|null,
 *   formattedValue: string,
 *   hardwareId: string,
 *   hardwareName: string
 * }>}
 */
function flattenSensors(payload) {
	const sensors = [];

	/**
	 * @param {unknown} node
	 * @param {{id: string, name: string}|null} currentHardware
	 */
	function visit(node, currentHardware) {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return;

		const record = /** @type {Record<string, unknown>} */ (node);
		let hardware = currentHardware;

		if (typeof record.HardwareId === 'string' && record.HardwareId) {
			hardware = {
				id: record.HardwareId,
				name:
					typeof record.Text === 'string' && record.Text
						? record.Text
						: record.HardwareId,
			};
		}

		if (
			typeof record.SensorId === 'string' &&
			record.SensorId &&
			typeof record.Type === 'string' &&
			record.Type
		) {
			sensors.push({
				id: record.SensorId,
				name:
					typeof record.Text === 'string' && record.Text
						? record.Text
						: record.SensorId,
				type: record.Type,
				rawValue: toSensorNumber(record.RawValue, record.Value, record.Type),
				formattedValue:
					typeof record.Value === 'string' ? record.Value : '',
				hardwareId: hardware ? hardware.id : '',
				hardwareName: hardware ? hardware.name : 'Unknown hardware',
			});
		}

		if (Array.isArray(record.Children)) {
			for (const child of record.Children) {
				visit(child, hardware);
			}
		}
	}

	visit(payload, null);
	return sensors;
}

/**
 * @param {string} sensorType
 * @returns {string}
 */
function getSensorSuffix(sensorType) {
	return Object.prototype.hasOwnProperty.call(SENSOR_SUFFIXES, sensorType)
		? SENSOR_SUFFIXES[sensorType]
		: '';
}

/**
 * @param {string} sensorType
 * @returns {number}
 */
function getSensorDecimals(sensorType) {
	return Object.prototype.hasOwnProperty.call(SENSOR_DECIMALS, sensorType)
		? SENSOR_DECIMALS[sensorType]
		: 1;
}

/**
 * Convert a LibreHardwareMonitor sensor ID to the stable key used by the
 * original Deckboard extension. Keeping this format preserves configured
 * buttons when migrating from the WMI implementation.
 *
 * @param {string} sensorId
 * @returns {string}
 */
function toDeckboardSensorId(sensorId) {
	return `lhw-${sensorId}`;
}

/**
 * @param {ReturnType<typeof flattenSensors>} sensors
 * @returns {Record<string, {value: string, title: string, description: string, suffix: string}>}
 */
function buildDeckboardValues(sensors) {
	const values = {};

	for (const sensor of sensors) {
		if (!Number.isFinite(sensor.rawValue)) continue;

		values[toDeckboardSensorId(sensor.id)] = {
			value: sensor.rawValue.toFixed(getSensorDecimals(sensor.type)),
			title: sensor.name,
			description: sensor.hardwareName,
			suffix: getSensorSuffix(sensor.type),
		};
	}

	return values;
}

/**
 * @param {ReturnType<typeof flattenSensors>} sensors
 * @param {string[]|null} allowedTypes
 * @returns {{value: string, label: string}[]}
 */
function buildSensorOptions(sensors, allowedTypes = null) {
	const filtered = allowedTypes
		? sensors.filter((sensor) => allowedTypes.includes(sensor.type))
		: sensors;

	const baseLabels = filtered.map(
		(sensor) => `${sensor.hardwareName}: ${sensor.name}`
	);
	const labelCounts = new Map();

	for (const label of baseLabels) {
		labelCounts.set(label, (labelCounts.get(label) || 0) + 1);
	}

	return filtered
		.map((sensor, index) => {
			const baseLabel = baseLabels[index];
			const duplicate = (labelCounts.get(baseLabel) || 0) > 1;
			const shortId = sensor.id.split('/').filter(Boolean).slice(-2).join('/');

			return {
				value: toDeckboardSensorId(sensor.id),
				label: duplicate ? `${baseLabel} [${shortId}]` : baseLabel,
			};
		})
		.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * @param {URL} url
 * @param {{username?: string, password?: string, timeoutMs?: number}} options
 * @returns {Promise<unknown>}
 */
function requestJson(url, options = {}) {
	const transport = url.protocol === 'https:' ? https : http;
	const timeoutMs = Number.isFinite(options.timeoutMs)
		? Math.max(500, Number(options.timeoutMs))
		: DEFAULT_TIMEOUT_MS;

	const username = options.username || decodeURIComponent(url.username || '');
	const password = options.password || decodeURIComponent(url.password || '');
	const headers = {
		Accept: 'application/json',
		'User-Agent': 'deckboard-librehardwaremonitor/2.0.0',
	};

	if (username || password) {
		headers.Authorization = `Basic ${Buffer.from(
			`${username}:${password}`,
			'utf8'
		).toString('base64')}`;
	}

	return new Promise((resolve, reject) => {
		const request = transport.request(
			url,
			{
				method: 'GET',
				headers,
			},
			(response) => {
				if (response.statusCode !== 200) {
					response.resume();
					const detail = response.statusMessage
						? ` ${response.statusMessage}`
						: '';
					reject(
						new Error(
							`LibreHardwareMonitor returned HTTP ${response.statusCode}${detail}`
						)
					);
					return;
				}

				let size = 0;
				const chunks = [];

				response.on('data', (chunk) => {
					size += chunk.length;
					if (size > MAX_RESPONSE_BYTES) {
						request.destroy(
							new Error('LibreHardwareMonitor response exceeded 10 MiB')
						);
						return;
					}
					chunks.push(chunk);
				});

				response.on('end', () => {
					try {
						const body = Buffer.concat(chunks).toString('utf8');
						resolve(JSON.parse(body));
					} catch (error) {
						reject(
							new Error(
								`Invalid JSON from LibreHardwareMonitor: ${error.message}`
							)
						);
					}
				});
			}
		);

		request.setTimeout(timeoutMs, () => {
			request.destroy(
				new Error(`LibreHardwareMonitor request timed out after ${timeoutMs} ms`)
			);
		});

		request.on('error', reject);
		request.end();
	});
}

/**
 * @param {{url?: string, username?: string, password?: string, timeoutMs?: number}} options
 * @returns {Promise<{payload: unknown, url: URL}>}
 */
async function fetchLibreHardwareMonitorData(options = {}) {
	const url = normalizeDataUrl(options.url);
	const payload = await requestJson(url, options);
	return { payload, url };
}

module.exports = {
	DEFAULT_DATA_URL,
	DEFAULT_TIMEOUT_MS,
	SENSOR_SUFFIXES,
	buildDeckboardValues,
	buildSensorOptions,
	fetchLibreHardwareMonitorData,
	flattenSensors,
	getSensorDecimals,
	getSensorSuffix,
	normalizeDataUrl,
	requestJson,
	toDeckboardSensorId,
	toFiniteNumber,
	toSensorNumber,
};
