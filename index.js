'use strict';

const deckboardKit = require('deckboard-kit');
const {
	DEFAULT_DATA_URL,
	buildDeckboardValues,
	buildSensorOptions,
	fetchLibreHardwareMonitorData,
	flattenSensors,
} = require('./lib/lhm-client');

const { Extension, log } = deckboardKit;
const INPUT_METHOD = deckboardKit.INPUT_METHOD || {};
const PLATFORMS = deckboardKit.PLATFORMS || {};

const INPUT_TEXT = INPUT_METHOD.INPUT_TEXT || 'input:text';
const INPUT_SELECT = INPUT_METHOD.INPUT_SELECT || 'input:select';
const WINDOWS = PLATFORMS.WINDOWS || 'WINDOWS';

const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 3000;

function clampNumber(value, fallback, minimum, maximum) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback;
	return Math.min(maximum, Math.max(minimum, parsed));
}

class LibreHardwareMonitor extends Extension {
	constructor(props = {}) {
		super(props);
		this.setValue =
			typeof props.setValue === 'function' ? props.setValue : () => {};
		this.name = 'Libre Hardware Monitor';
		this.platforms = [WINDOWS];

		this.configs = {
			serverUrl: {
				type: INPUT_TEXT,
				name: 'Data URL',
				descriptions:
					'LibreHardwareMonitor Remote Web Server data URL. A bare host:port is also accepted.',
				value: DEFAULT_DATA_URL,
			},
			username: {
				type: INPUT_TEXT,
				name: 'Username',
				descriptions:
					'Optional HTTP Basic Authentication username.',
				value: '',
			},
			password: {
				type: INPUT_TEXT,
				name: 'Password',
				descriptions:
					'Optional HTTP Basic Authentication password. Deckboard may store this as plain text.',
				value: '',
			},
			pollIntervalSeconds: {
				type: INPUT_TEXT,
				name: 'Polling interval (seconds)',
				descriptions: 'Allowed range: 1 to 300 seconds.',
				value: String(DEFAULT_POLL_INTERVAL_SECONDS),
			},
			requestTimeoutMilliseconds: {
				type: INPUT_TEXT,
				name: 'Request timeout (milliseconds)',
				descriptions: 'Allowed range: 500 to 30000 milliseconds.',
				value: String(DEFAULT_REQUEST_TIMEOUT_MS),
			},
		};

		this.inputs = [];
		this.pollTimer = null;
		this.pollInProgress = false;
		this.lastSensorOptionSignature = '';
		this.lastErrorMessage = '';
		this.hasConnected = false;
		this.currentConfigSignature = '';

		this.setInputOptions([], [], []);
	}

	initExtension() {
		if (process.platform !== 'win32') {
			log.warn(
				'[Libre Hardware Monitor] This extension is supported on Windows only.'
			);
			return;
		}

		this.restartPolling();
	}

	update() {
		if (process.platform !== 'win32') return;
		this.restartPolling();
	}

	getConfigValue(key, fallback = '') {
		const item = this.configs && this.configs[key];
		if (!item || typeof item !== 'object') return fallback;
		return item.value === undefined || item.value === null
			? fallback
			: String(item.value);
	}

	getRuntimeConfig() {
		const url = this.getConfigValue('serverUrl', DEFAULT_DATA_URL).trim();
		const username = this.getConfigValue('username', '');
		const password = this.getConfigValue('password', '');
		const pollIntervalSeconds = clampNumber(
			this.getConfigValue(
				'pollIntervalSeconds',
				String(DEFAULT_POLL_INTERVAL_SECONDS)
			),
			DEFAULT_POLL_INTERVAL_SECONDS,
			1,
			300
		);
		const timeoutMs = clampNumber(
			this.getConfigValue(
				'requestTimeoutMilliseconds',
				String(DEFAULT_REQUEST_TIMEOUT_MS)
			),
			DEFAULT_REQUEST_TIMEOUT_MS,
			500,
			30000
		);

		return {
			url,
			username,
			password,
			pollIntervalMs: pollIntervalSeconds * 1000,
			timeoutMs,
		};
	}

	restartPolling() {
		this.stopPolling();

		const config = this.getRuntimeConfig();
		this.currentConfigSignature = JSON.stringify(config);
		this.pollOnce();
		this.pollTimer = setInterval(
			() => this.pollOnce(),
			config.pollIntervalMs
		);
	}

	stopPolling() {
		if (this.pollTimer) {
			clearInterval(this.pollTimer);
			this.pollTimer = null;
		}
	}

	async pollOnce() {
		if (this.pollInProgress) return;

		const config = this.getRuntimeConfig();
		const nextSignature = JSON.stringify(config);
		if (
			this.currentConfigSignature &&
			nextSignature !== this.currentConfigSignature
		) {
			this.restartPolling();
			return;
		}

		this.pollInProgress = true;

		try {
			const { payload, url } = await fetchLibreHardwareMonitorData(config);
			const sensors = flattenSensors(payload);

			this.refreshSensorInputs(sensors);
			this.setValue(buildDeckboardValues(sensors));

			if (!this.hasConnected || this.lastErrorMessage) {
				const version =
					payload && typeof payload === 'object' && payload.Version
						? ` v${payload.Version}`
						: '';
				log.info(
					`[Libre Hardware Monitor] Connected to ${url.origin}${version}; ${sensors.length} sensors discovered.`
				);
			}

			this.hasConnected = true;
			this.lastErrorMessage = '';
		} catch (error) {
			const message = error && error.message ? error.message : String(error);
			if (message !== this.lastErrorMessage) {
				log.error(`[Libre Hardware Monitor] ${message}`);
				this.lastErrorMessage = message;
			}
		} finally {
			this.pollInProgress = false;
		}
	}

	refreshSensorInputs(sensors) {
		const loadSensors = buildSensorOptions(sensors, ['Load']);
		const temperatureSensors = buildSensorOptions(sensors, ['Temperature']);
		const allSensors = buildSensorOptions(sensors);
		const signature = JSON.stringify({
			loadSensors,
			temperatureSensors,
			allSensors,
		});

		if (signature === this.lastSensorOptionSignature) return;

		this.setInputOptions(loadSensors, temperatureSensors, allSensors);
		this.lastSensorOptionSignature = signature;
	}

	setInputOptions(loadSensors, temperatureSensors, allSensors) {
		this.inputs = [
			{
				label: 'Display Load Stats',
				value: 'lhw-load',
				icon: 'tachometer-alt',
				mode: 'graph',
				fontIcon: 'fas',
				color: '#8E44AD',
				input: [
					{
						label: 'Sensor',
						type: INPUT_SELECT,
						items: loadSensors,
					},
				],
				display: {
					type: 'graph',
					defaultTitle: 'Load',
				},
			},
			{
				label: 'Display Temperature Stats',
				value: 'lhw-temperature',
				icon: 'thermometer-half',
				mode: 'graph',
				fontIcon: 'fas',
				color: '#8E44AD',
				input: [
					{
						label: 'Sensor',
						type: INPUT_SELECT,
						items: temperatureSensors,
					},
				],
				display: {
					type: 'graph',
					defaultTitle: 'Temperature',
				},
			},
			{
				label: 'Display Any Sensor',
				value: 'lhw-sensor',
				icon: 'microchip',
				mode: 'graph',
				fontIcon: 'fas',
				color: '#8E44AD',
				input: [
					{
						label: 'Sensor',
						type: INPUT_SELECT,
						items: allSensors,
					},
				],
				display: {
					type: 'graph',
					defaultTitle: 'Sensor',
				},
			},
		];
	}

	execute(action, args) {}
}

module.exports = (props) => new LibreHardwareMonitor(props);
