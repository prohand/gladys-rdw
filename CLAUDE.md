# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one
runtime dependency: `@gladysassistant/integration-sdk`) that follows **Dutch
vehicles by their licence plate** in the public register of the **RDW** (the
Dutch vehicle authority), read from its open data portal `opendata.rdw.nl`
(dataset `m9d7-ebf2`, no account, no key). Each plate is a Gladys device with
its APK (periodic roadworthiness test) days left and expiry date, its WAM
insurance and its open recall flag. Requires Gladys 5.3+; scene triggers (APK due or
expired, recall opened, insurance ended), scene actions (refresh, read one
vehicle) and an "RDW vehicles" widget come with it.

Started from the official
[JavaScript template](https://github.com/GladysAssistant/integration-template-js);
workflows, i18n and conventions follow
[gladys-devmel](https://github.com/prohand/gladys-devmel).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/fleet.test.js              # one file
node --test --test-name-pattern "reminder"  # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store .   # store admission checks
```

CI (`.github/workflows/ci.yml`) runs `format:check`, `lint` and `test` on Node 22
and 24; pull requests also run the store checks and build the Docker image. Run
the three commands before pushing.

## Architecture

```
index.js                  creates the SDK object, wires it, connects (nothing else)
src/integration.js        SDK wiring: every handler, the hourly cycle, connection status
src/config.js             DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js               LANGUAGES (en, fr, de, es), pick, localize, formatDate
src/rdw/client.js         opendata.rdw.nl: all plates in ONE request, row parsing
src/rdw/plate.js          plate normalization (AB123C), list parsing, dashed display
src/rdw/status.js         APK stage and days left for today (Europe/Amsterdam), alerts
src/rdw/fleet.js          the cycle: read when due, publish states, badges, scene events
src/rdw/memory.js         last state seen per vehicle, in /data/rdw-state.json
src/devices/vehicle.js    the vehicle device: discovery payload and states
src/capabilities/         manifest actions, scene triggers/actions, dashboard widget
gladys-assistant-integration.json   manifest (config schema, actions, 5.1 capabilities, 5.3 store fields)
docs/en.md fr.md de.md es.md        user documentation, re-hosted by Gladys
test/                     node --test, fake Gladys of the SDK + fake register (helpers/)
```

### Invariants worth knowing

- **External ids are forever.** A device is `gladys.externalIds('vehicle', PLATE)`
  with the plate normalized (`AB123C`: capitals, no dash). Feature keys
  (`apk-days-left`, `apk-expiry`, `insured`, `open-recall`), config keys, action,
  trigger, scene action, output, variable and widget keys are stored by users:
  never rename them.
- **One request per cycle**, whatever the number of plates
  (`kenteken in(...)`): the portal throttles per IP. Plates are reduced to
  `[A-Z0-9]` before going into the query, which is what keeps it safe.
- **The register is read every `refresh_hours`, the states are published every
  hour** (`CYCLE_MS`): the days left change at midnight even when the register
  does not. `publishChangedStates` sends only what changed (daily heartbeat).
- **Dates are Dutch days**: "today" is computed in `Europe/Amsterdam`. The APK
  expiry date is the last valid day: expired from the day after.
- **Scene events fire once per change**, compared with the memory in `/data`
  (survives restarts). The APK reminder fires per APK date and stage, the
  recall and insurance triggers on a change only (never at first sight, never
  from an unknown value). A refresh asked by a scene action fires no event
  (loop risk): the next hourly cycle does.
- **Cycles are serialized** (`Fleet.update` queues): timer, scene action and
  widget button may ask at once.
- **An unreachable register keeps the vehicles read before**; the badge turns
  `unreachable` and the connection status says so.
- **Unknown is not "no"**: a value absent from the register is not published
  and never fires a trigger.
- **The container rootfs is read-only.** Write only under `/data`
  (`RDW_DATA_DIR` overrides it). Never log the app token.
- Manifest: `transports: ["cloud"]` (the integration only talks to the
  internet), `gladys_version >=5.3.0` (scene and widget fields need 5.1.0,
  `keywords` / `countries` 5.3.0), `categories` `vehicles` + `services`,
  `countries: ["NL"]` (Dutch register only).

## Rules

- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag, by
  hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
  Never write a version heading: the Release workflow moves the section, and it
  becomes the notes of the GitHub Release.
- **Manifest.** Texts are multi-language objects `{ en, fr, de, es }`: `label`,
  `description` and `placeholder` alike, never a plain string. The catalog
  `description` holds 10 to 100 characters per language. `test/manifest.test.js`
  ties the manifest to the code (defaults, handlers, triggers, languages):
  change both sides together.
- **User-facing text** is written in the four languages of `src/i18n.js`:
  action messages, connection status, widget, badges, and `docs/en.md`,
  `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync. Widget badges hold 16
  characters at most.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in
  English. Tests never touch the network (`test/helpers/fakeRdw.js`).
