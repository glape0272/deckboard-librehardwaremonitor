'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
	WMI_NAMESPACE,
	fetchLibreHardwareMonitorWmiData,
} = require('../lib/lhm-wmi-client');

/**
 * Create a node-wmi compatible query factory backed by fixed test rows.
 *
 * @param {Record<string, Record<string, unknown>[]>} rowsByClass
 * @returns {Function}
 */
function createQueryFactory(rowsByClass) {
	return () => {
		let selectedNamespace = '';
		let selectedClass = '';

		return {
			namespace(value) {
				selectedNamespace = value;
				return this;
			},
			class(value) {
				selectedClass = value;
				return this;
			},
			exec(callback) {
				assert.equal(selectedNamespace, WMI_NAMESPACE);
				callback(null, rowsByClass[selectedClass] || []);
			},
		};
	};
}

test('fetchLibreHardwareMonitorWmiData maps legacy WMI rows to current sensors', async () => {
	const queryFactory = createQueryFactory({
		Hardware: [
			{
				Identifier: '/amdcpu/0',
				Name: 'AMD Ryzen',
				HardwareType: 'Cpu',
			},
		],
		Sensor: [
			{
				Identifier: '/amdcpu/0/temperature/0',
				Parent: '/amdcpu/0',
				Name: 'CPU Package',
				SensorType: 'Temperature',
				Value: 61.25,
			},
		],
	});

	const sensors = await fetchLibreHardwareMonitorWmiData({ queryFactory });

	assert.deepEqual(sensors, [
		{
			id: '/amdcpu/0/temperature/0',
			name: 'CPU Package',
			type: 'Temperature',
			rawValue: 61.25,
			formattedValue: '61.25',
			hardwareId: '/amdcpu/0',
			hardwareName: 'AMD Ryzen',
		},
	]);
});

test('fetchLibreHardwareMonitorWmiData rejects an empty legacy sensor result', async () => {
	const queryFactory = createQueryFactory({ Hardware: [], Sensor: [] });

	await assert.rejects(
		fetchLibreHardwareMonitorWmiData({ queryFactory }),
		/returned no LibreHardwareMonitor sensors/
	);
});
