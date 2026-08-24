'use strict';

const { toFiniteNumber } = require('./lhm-client');

const WMI_NAMESPACE = 'root/LibreHardwareMonitor';

/**
 * Load node-wmi only when the HTTP endpoint is unavailable. This keeps the
 * primary path independent of the legacy native dependency.
 *
 * @returns {Function}
 */
function loadQueryFactory() {
	try {
		return require('node-wmi').Query;
	} catch (error) {
		throw new Error(`Legacy WMI client could not be loaded: ${error.message}`);
	}
}

/**
 * Execute one LibreHardwareMonitor WMI class query.
 *
 * @param {string} className
 * @param {Function} queryFactory
 * @returns {Promise<Record<string, unknown>[]>}
 */
function queryWmiClass(className, queryFactory) {
	return new Promise((resolve, reject) => {
		let query;

		try {
			query = queryFactory().namespace(WMI_NAMESPACE).class(className);
		} catch (error) {
			reject(error);
			return;
		}

		query.exec((error, data) => {
			if (error) {
				reject(error);
				return;
			}

			if (!Array.isArray(data)) {
				reject(new Error(`WMI class ${className} returned no data`));
				return;
			}

			resolve(data);
		});
	});
}

/**
 * Read sensors from LibreHardwareMonitor 0.9.4 and earlier through WMI.
 *
 * @param {{queryFactory?: Function}} options
 * @returns {Promise<ReturnType<import('./lhm-client').flattenSensors>>}
 */
async function fetchLibreHardwareMonitorWmiData(options = {}) {
	if (process.platform !== 'win32' && !options.queryFactory) {
		throw new Error('Legacy WMI fallback is supported on Windows only');
	}

	const queryFactory = options.queryFactory || loadQueryFactory();
	const [hardwareRows, sensorRows] = await Promise.all([
		queryWmiClass('Hardware', queryFactory),
		queryWmiClass('Sensor', queryFactory),
	]);
	const hardwareNames = new Map();

	for (const row of hardwareRows) {
		if (typeof row.Identifier !== 'string' || !row.Identifier) continue;
		hardwareNames.set(
			row.Identifier,
			typeof row.Name === 'string' && row.Name ? row.Name : row.Identifier
		);
	}

	const sensors = [];
	for (const row of sensorRows) {
		if (
			typeof row.Identifier !== 'string' ||
			!row.Identifier ||
			typeof row.SensorType !== 'string' ||
			!row.SensorType
		) {
			continue;
		}

		const rawValue = toFiniteNumber(row.Value);
		const hardwareId = typeof row.Parent === 'string' ? row.Parent : '';
		sensors.push({
			id: row.Identifier,
			name:
				typeof row.Name === 'string' && row.Name
					? row.Name
					: row.Identifier,
			type: row.SensorType,
			rawValue,
			formattedValue: rawValue === null ? '' : String(rawValue),
			hardwareId,
			hardwareName: hardwareNames.get(hardwareId) || 'Unknown hardware',
		});
	}

	if (sensors.length === 0) {
		throw new Error('Legacy WMI returned no LibreHardwareMonitor sensors');
	}

	return sensors;
}

module.exports = {
	WMI_NAMESPACE,
	fetchLibreHardwareMonitorWmiData,
	queryWmiClass,
};
