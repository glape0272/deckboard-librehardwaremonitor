# Changelog

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
