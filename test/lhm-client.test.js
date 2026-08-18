'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');

const {
	buildDeckboardValues,
	buildSensorOptions,
	fetchLibreHardwareMonitorData,
	flattenSensors,
	normalizeDataUrl,
	toDeckboardSensorId,
} = require('../lib/lhm-client');

const fixture = JSON.parse(
	fs.readFileSync(path.join(__dirname, 'fixtures', 'data.json'), 'utf8')
);

test('normalizeDataUrl accepts a bare host and supplies /data.json', () => {
	const url = normalizeDataUrl('127.0.0.1:8085');
	assert.equal(url.href, 'http://127.0.0.1:8085/data.json');
});

test('flattenSensors preserves the nearest hardware context', () => {
	const sensors = flattenSensors(fixture);
	assert.equal(sensors.length, 3);

	assert.deepEqual(sensors[0], {
		id: '/amdcpu/0/temperature/0',
		name: 'CPU Package',
		type: 'Temperature',
		rawValue: 62.5,
		formattedValue: '62.5 °C',
		hardwareId: '/amdcpu/0',
		hardwareName: 'AMD Ryzen 9 5900XT',
	});

	assert.equal(sensors[2].hardwareName, 'NVIDIA GeForce RTX 5070');
});

test('buildDeckboardValues keeps legacy sensor keys and sensor-specific precision', () => {
	const sensors = flattenSensors(fixture);
	const values = buildDeckboardValues(sensors);

	assert.deepEqual(values['lhw-/amdcpu/0/temperature/0'], {
		value: '62.5',
		title: 'CPU Package',
		description: 'AMD Ryzen 9 5900XT',
		suffix: '°C',
	});

	assert.equal(values['lhw-/gpu-nvidia/0/fan/0'].value, '1350');
	assert.equal(values['lhw-/gpu-nvidia/0/fan/0'].suffix, 'RPM');
	assert.equal(
		toDeckboardSensorId('/amdcpu/0/load/0'),
		'lhw-/amdcpu/0/load/0'
	);
});

test('buildSensorOptions filters and sorts sensor types', () => {
	const sensors = flattenSensors(fixture);
	const temperatures = buildSensorOptions(sensors, ['Temperature']);

	assert.deepEqual(temperatures, [
		{
			value: 'lhw-/amdcpu/0/temperature/0',
			label: 'AMD Ryzen 9 5900XT: CPU Package',
		},
	]);
});

test('fetchLibreHardwareMonitorData supports HTTP Basic Authentication', async (t) => {
	const expectedAuthorization = `Basic ${Buffer.from('deckboard:secret').toString(
		'base64'
	)}`;

	const server = http.createServer((request, response) => {
		if (request.headers.authorization !== expectedAuthorization) {
			response.writeHead(401);
			response.end();
			return;
		}

		response.writeHead(200, { 'Content-Type': 'application/json' });
		response.end(JSON.stringify(fixture));
	});

	await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
	t.after(() => server.close());

	const address = server.address();
	const result = await fetchLibreHardwareMonitorData({
		url: `http://127.0.0.1:${address.port}/data.json`,
		username: 'deckboard',
		password: 'secret',
		timeoutMs: 1000,
	});

	assert.equal(result.payload.Version, '0.9.6');
});
