# deckboard-librehardwaremonitor

English | [日本語](README.ja_JP.md)

Unofficial maintained fork of Riva Farabi's Deckboard extension for displaying
LibreHardwareMonitor sensors as Deckboard graph blocks.

Version 2 replaces the removed WMI provider with LibreHardwareMonitor's Remote
Web Server JSON endpoint, so it works with LibreHardwareMonitor 0.9.6 and later.
It also accepts the unit-bearing `RawValue` fields emitted by the 0.9.6 web
server and converts dynamically scaled values back to stable base units.
When the HTTP endpoint is unavailable, version 2.1 automatically falls back to
the WMI provider included in LibreHardwareMonitor 0.9.4 and earlier. HTTP is
retried on every polling cycle, so acquisition returns to the current API after
the Remote Web Server becomes available again.

## Changes from the original extension

- Uses `GET /data.json` instead of `root\\LibreHardwareMonitor` WMI queries.
- Falls back to `root\\LibreHardwareMonitor` WMI for version 0.9.4 and earlier.
- Loads the legacy `node-wmi` dependency only when HTTP acquisition fails.
- Keeps the original `lhw-<SensorId>` keys and the existing Load and
  Temperature action IDs for migration compatibility.
- Adds a **Display Any Sensor** action for fan speed, power, clocks, voltage,
  throughput, and other numeric sensors.
- Adds configurable URL, Basic Authentication, polling interval, and timeout.
- Refreshes the sensor dropdown automatically when hardware changes.
- Prevents overlapping requests and suppresses repeated identical errors.
- Includes parser and local HTTP integration tests.

## Supported environment

| Component | Supported or assumed environment |
|---|---|
| OS | Windows; the extension does not start polling on other platforms |
| Deckboard | A version that supports `deckboard-kit` 0.3.x extensions |
| Current monitor | LibreHardwareMonitor 0.9.6 or newer with Remote Web Server enabled |
| Legacy monitor | LibreHardwareMonitor 0.9.4 or earlier with its WMI provider available |
| Extension runtime | Node.js 12-compatible APIs used by the Deckboard runtime |
| Development and packaging | Node.js 18 or newer and npm |

The extension runtime itself uses APIs compatible with older Node.js versions
used by Deckboard.

LibreHardwareMonitor 0.9.5 and later no longer provide the legacy WMI data used
by version 1 of this extension. The HTTP endpoint is therefore the primary
source. The WMI fallback is intended for older installations, not as a way to
restore WMI in current LibreHardwareMonitor releases.

## Acquisition and implementation

The extension polls once immediately after startup and then at the configured
interval. Each polling cycle follows this order:

1. Request the configured LibreHardwareMonitor `/data.json` endpoint.
2. Parse the hierarchical JSON response and publish all finite numeric sensors.
3. If HTTP fails or returns no sensors, query `Hardware` and `Sensor` from the
   legacy `root\\LibreHardwareMonitor` WMI namespace.
4. Retry HTTP at the next polling cycle, even while WMI is active.

This produces automatic recovery in both directions: an older WMI-capable
installation remains usable when the web server is unavailable, and the
extension returns to HTTP automatically when the endpoint becomes available.

Implementation responsibilities:

| File | Responsibility |
|---|---|
| `index.js` | Deckboard lifecycle, settings, polling, source selection, and value publishing |
| `lib/lhm-client.js` | HTTP requests, URL normalization, JSON tree parsing, units, and Deckboard value mapping |
| `lib/lhm-wmi-client.js` | Lazy loading of `node-wmi` and conversion of legacy WMI rows to the current sensor model |
| `test/lhm-client.test.js` | HTTP parsing, value conversion, authentication, and mapping tests |
| `test/lhm-wmi-client.test.js` | Legacy WMI mapping and empty-result tests using an injected query client |

Both sources retain the `lhw-<Identifier>` key format. Existing Load and
Temperature blocks therefore use the same saved sensor keys after switching
between HTTP and WMI. Requests are not overlapped, repeated identical errors
are logged once, and sensor selections are refreshed when the discovered
hardware set changes.

## LibreHardwareMonitor setup

1. Start LibreHardwareMonitor, preferably as administrator so all supported
   sensors are available.
2. Open **Options > Remote Web Server > Run**.
3. Verify this URL in a browser:

   ```text
   http://127.0.0.1:8085/data.json
   ```

   A JSON document containing `Version` and `Children` should be displayed.

WMI is not required for current LibreHardwareMonitor versions. If the Remote Web
Server is unavailable, the extension checks `root\\LibreHardwareMonitor` so an
older WMI-capable installation can continue to provide sensor data.

## Install from source

Place the repository anywhere, then run:

```powershell
npm install
npm run validate
npm run build
```

The packaged extension is generated at:

```text
dist/libre-hardware-monitor.asar
```

On Windows, copy the generated file to:

```text
%USERPROFILE%\deckboard\extensions\
```

To build and copy it directly into Deckboard's extensions folder:

```powershell
npm run install:deckboard
```

Restart Deckboard after installation.

## Deckboard configuration

The extension settings contain these fields:

| Setting | Default | Purpose |
|---|---|---|
| Data URL | `http://127.0.0.1:8085/data.json` | LibreHardwareMonitor JSON endpoint |
| Username | empty | Optional HTTP Basic Authentication username |
| Password | empty | Optional HTTP Basic Authentication password |
| Polling interval | `5` seconds | Sensor refresh interval; range 1–300 |
| Request timeout | `3000` ms | HTTP timeout; range 500–30000 |

A bare value such as `127.0.0.1:8085` is accepted and automatically expanded to
`http://127.0.0.1:8085/data.json`.

Deckboard may store extension settings, including the optional password, as
plain text. For a local-only setup, leaving LibreHardwareMonitor authentication
disabled is usually simpler. Do not expose port 8085 to the public internet.

## Add a sensor block

After Deckboard connects successfully, create a button and select one of:

- **Display Load Stats**
- **Display Temperature Stats**
- **Display Any Sensor**

Then choose the required sensor. Sensor lists are populated after the first
successful HTTP or WMI acquisition.

## Migration from version 1

The extension package name remains `libre-hardware-monitor`, and Load and
Temperature action IDs remain unchanged. Sensor value keys also retain the
original `lhw-<Identifier>` format because HTTP `SensorId` uses the same
LibreHardwareMonitor identifier format as the former WMI provider.

Existing buttons should therefore remain configured when the old `.asar` file
is replaced. Re-select a sensor if Deckboard cached an obsolete hardware
identifier.

## Troubleshooting

### Sensor dropdown is empty

- Confirm LibreHardwareMonitor is running.
- Confirm **Remote Web Server > Run** is checked.
- Open `http://127.0.0.1:8085/data.json` in a browser.
- Wait at least one polling interval, then reopen the Deckboard button editor.
- Restart both applications after changing extension files.

### HTTP 401

Either disable authentication in LibreHardwareMonitor or enter the matching
username and password in the extension settings.

### Connection refused or timeout

Check the configured IP address and port. If LibreHardwareMonitor is bound to a
specific network interface, use that address instead of `127.0.0.1`.

### A sensor has no current value

LibreHardwareMonitor can report `null` or `NaN` for temporarily unavailable
sensors. Such values are skipped until they become finite numbers.

## License

MIT. The original copyright and license notice are retained, with an additional
copyright line for the maintained changes.

LibreHardwareMonitor is licensed under MPL-2.0, but it is not redistributed or
incorporated into this extension. The extension only consumes its HTTP or WMI
output.
See `THIRD_PARTY_NOTICES.txt` and `THIRD_PARTY_LICENSES.txt` for attribution and
bundled license details.

This is a practical license assessment, not legal advice.

This project is not affiliated with or endorsed by the Deckboard or
LibreHardwareMonitor maintainers.
