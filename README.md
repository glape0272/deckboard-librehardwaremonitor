# deckboard-librehardwaremonitor

Unofficial maintained fork of Riva Farabi's Deckboard extension for displaying
LibreHardwareMonitor sensors as Deckboard graph blocks.

Version 2 replaces the removed WMI provider with LibreHardwareMonitor's Remote
Web Server JSON endpoint, so it works with LibreHardwareMonitor 0.9.6 and later.
It also accepts the unit-bearing `RawValue` fields emitted by the 0.9.6 web
server and converts dynamically scaled values back to stable base units.

## Changes from the original extension

- Uses `GET /data.json` instead of `root\\LibreHardwareMonitor` WMI queries.
- Removes the native `node-wmi` dependency.
- Keeps the original `lhw-<SensorId>` keys and the existing Load and
  Temperature action IDs for migration compatibility.
- Adds a **Display Any Sensor** action for fan speed, power, clocks, voltage,
  throughput, and other numeric sensors.
- Adds configurable URL, Basic Authentication, polling interval, and timeout.
- Refreshes the sensor dropdown automatically when hardware changes.
- Prevents overlapping requests and suppresses repeated identical errors.
- Includes parser and local HTTP integration tests.

## Requirements

- Windows
- Deckboard
- LibreHardwareMonitor 0.9.6 or newer
- Node.js 18 or newer for building and testing the extension

The extension runtime itself uses APIs compatible with older Node.js versions
used by Deckboard.

## LibreHardwareMonitor setup

1. Start LibreHardwareMonitor, preferably as administrator so all supported
   sensors are available.
2. Open **Options > Remote Web Server > Run**.
3. Verify this URL in a browser:

   ```text
   http://127.0.0.1:8085/data.json
   ```

   A JSON document containing `Version` and `Children` should be displayed.

WMI is not required and `root\\LibreHardwareMonitor` does not need to exist.

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
successful HTTP request.

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
incorporated into this extension. The extension only consumes its HTTP output.
See `THIRD_PARTY_NOTICES.txt` for attribution details.

This is a practical license assessment, not legal advice.

This project is not affiliated with or endorsed by the Deckboard or
LibreHardwareMonitor maintainers.
