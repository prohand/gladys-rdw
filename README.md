# RDW — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com)
to the public vehicle register of the **RDW** (Rijksdienst voor het Wegverkeer,
the Dutch vehicle authority): type the plates of your vehicles, and Gladys
follows their **APK** (periodic roadworthiness test), their **WAM insurance**
and their **open recalls**.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) ·
[Deutsch](./docs/de.md) · [Español](./docs/es.md).

## What it does

One Gladys device per plate, read-only:

| Feature         | Type           | Meaning                                        |
| --------------- | -------------- | ---------------------------------------------- |
| APK days left   | duration, days | Days until the APK expiry date, negative after |
| APK expiry date | text           | `YYYY-MM-DD`, the last day the APK is valid    |
| Insured (WAM)   | binary         | `1` when the register knows a WAM insurance    |
| Open recall     | binary         | `1` when a manufacturer recall is still to do  |

It requires Gladys 5.3.0 or later, and extends the scene editor and the dashboard
(`src/capabilities/`):

| Capability                         | Manifest key       |
| ---------------------------------- | ------------------ |
| Trigger: APK due soon or expired   | `apk_reminder`     |
| Trigger: recall opened             | `recall_opened`    |
| Trigger: insurance ended           | `insurance_lost`   |
| Scene action: refresh the vehicles | `refresh_vehicles` |
| Scene action: read a vehicle       | `get_vehicle`      |
| Widget: RDW vehicles               | `vehicles`         |

And two buttons in the Configuration screen: **Test the connection** and
**Look up a plate** (any plate, followed or not).

## How it talks to the RDW

One transport, declared in the manifest: **cloud** —
`https://opendata.rdw.nl/resource/m9d7-ebf2.json`, the "Gekentekende
voertuigen" dataset of the RDW open data portal. Free, no account, no key. All
the plates are read in **one** request (`$where=kenteken in(...)`), every
`refresh_hours` (6 by default): the register changes once a day at most. An
optional free app token lifts the per-IP throttling of the portal.

The states are published every hour, so the days left follow the calendar
(Dutch dates, `Europe/Amsterdam`) between two reads. Each device shows a
transport badge: `cloud` when the register answered, `unreachable` when it did
not (the last values read are kept), `cloud` + orange dot when the register
does not know the plate.

Scene triggers fire **once per change**. To know what changed, the last state
seen of each vehicle is kept in `/data/rdw-state.json`, the only writable path
of the container: an update or a restart does not fire everything again.

## Project structure

```
.
├─ index.js                          # creates the SDK object, wires it, connects
├─ src/
│  ├─ integration.js                 # every SDK handler + the hourly cycle
│  ├─ config.js                      # defaults + normalization
│  ├─ i18n.js                        # en / fr / de / es helpers
│  ├─ rdw/                           # client, plates, APK status, fleet, memory
│  ├─ devices/vehicle.js             # the vehicle device
│  └─ capabilities/                  # actions, scenes, widget
├─ docs/                             # user documentation (en, fr, de, es)
├─ test/                             # node --test, no network
├─ gladys-assistant-integration.json # manifest
├─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
├─ CHANGELOG.md                      # Keep a Changelog, rolled by the Release workflow
├─ CLAUDE.md                         # project rules for coding assistants & contributors
├─ SECURITY.md                       # how to report a vulnerability privately
└─ .github/                          # CI, Release, build, GitHub Releases, Dependabot
```

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="rdw" \
RDW_DATA_DIR="./data" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its container; the SDK reads them. `RDW_DATA_DIR`
(default `/data`) is where the trigger memory is kept.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint           # ESLint
npm test               # node --test, against the fake Gladys of the SDK and a fake register
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs the first three on every push and pull request, on Node 22 and 24;
pull requests also run the store checks and build the Docker image.

## Release

1. Describe the changes under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
2. **Actions → Release → Run workflow**, pick `patch`, `minor` or `major`.

The workflow bumps `package.json` and the manifest (`version` + `docker_image`),
moves the changelog section under the new version, tags `vX.Y.Z`, builds the
`linux/amd64` + `linux/arm64` image to `ghcr.io/prohand/gladys-rdw`
(`:X.Y.Z` + `:latest`) and publishes the GitHub Release. The Gladys store
indexer picks up the new version.

The repository needs the GitHub topic `gladys-assistant-integration` to be
listed in the store.

## License

Apache-2.0. Vehicle data: RDW open data.
