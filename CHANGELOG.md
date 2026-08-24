# Changelog

## 2.1.0 - 2026-08-25

- Added automatic fallback to the legacy `root\\LibreHardwareMonitor` WMI
  provider when the Remote Web Server endpoint is unavailable.
- Added automatic recovery to HTTP acquisition when the endpoint becomes
  available again.
- Preserved sensor IDs and Deckboard button compatibility across both sources.

## 2.0.1 - 2026-08-25

- Added compatibility with unit-bearing `RawValue` fields emitted by
  LibreHardwareMonitor 0.9.6.
- Added fallback parsing from the formatted `Value` field.
- Preserved base units for dynamically scaled throughput, frequency, and clock
  values.

## 2.0.0 - 2026-08-19

- Replaced the removed LibreHardwareMonitor WMI provider with `/data.json` HTTP
  polling.
- Added LibreHardwareMonitor 0.9.6+ compatibility.
- Removed `node-wmi`.
- Added configurable endpoint, HTTP Basic Authentication, interval, and timeout.
- Added support for all numeric sensor types while retaining the legacy Load and
  Temperature actions and sensor keys.
- Added automatic sensor-list refresh, request overlap protection, error
  deduplication, tests, CI, and third-party notices.
