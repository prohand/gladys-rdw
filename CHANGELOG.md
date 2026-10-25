# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.2.0] - 2026-10-25

### Added

- Catalog: the new `vehicles` shelf of the Gladys store, search keywords (kenteken, licence plate, APK-keuring…) and the Netherlands as the country the integration serves.

### Changed

- Gladys 5.3.0 or later is now required.
- Gladys integration SDK 0.16.

## [0.1.2] - 2026-10-23

- Maintenance release, no functional change.

## [0.1.1] - 2026-10-21

### Added

- Follow Dutch vehicles by their plate from the RDW open data register: one
  Gladys device per plate, with the APK days left, the APK expiry date, the WAM
  insurance and the open recall flag.
- Scene triggers (Gladys 5.1+): APK due or expired, recall opened, insurance
  ended — fired once per change, remembered across restarts.
- Scene actions (Gladys 5.1+): refresh the vehicles, read one vehicle.
- "RDW vehicles" dashboard widget (Gladys 5.1+): one card per vehicle with what
  needs attention first, a live tile for one vehicle, a refresh button.
- Configuration screen actions: test the connection, look up any plate.
- Cloud transport badge per vehicle: up to date, unreachable, or plate unknown
  to the register.
- English, French, German and Spanish everywhere: configuration screen,
  messages, widget, scenes and documentation.
- CI (format, lint, tests on Node 22 and 24, store checks and Docker build on
  pull requests), UI-driven Release workflow, multi-arch image build, GitHub
  Releases, Dependabot.
- `SECURITY.md` and `CLAUDE.md`.

[Unreleased]: https://github.com/prohand/gladys-rdw/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/prohand/gladys-rdw/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/prohand/gladys-rdw/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/prohand/gladys-rdw/releases/tag/v0.1.1
