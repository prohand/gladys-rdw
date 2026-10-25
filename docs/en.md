# RDW

Follow your Dutch vehicles in Gladys: **APK** (the periodic roadworthiness
test), **WAM insurance** and **open recalls**, read from the public register of
the RDW, the Dutch vehicle authority.

## What you need

- Gladys **5.3.0 or later**.
- The **licence plates** of your vehicles (Dutch plates).
- Nothing else: the RDW register is public open data, no account and no key.

## Configuration

Open **Integrations → RDW → Configuration**.

| Field                    | What to type                                                                                                               |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Plates                   | Your plates, separated by commas: `AB-123-C, 12-XYZ-3`. Dashes, spaces and lower case do not matter.                       |
| APK reminder (days)      | How many days before the APK expiry date the vehicle shows as due (30 by default).                                         |
| Register refresh (hours) | Hours between two reads of the register (6 by default). It changes once a day at most.                                     |
| App token (optional)     | A free token from [opendata.rdw.nl](https://opendata.rdw.nl/) that lifts the request limit. Not needed for a few vehicles. |

Save, then click **Test the connection**: the message says how many vehicles
the register found, which plates it does not know, and what was not a plate.

**Look up a plate** checks any plate without following it — before adding it,
or for a car you are about to buy.

## Devices

Open **Discover**: each plate is offered as a device, named after the register
(`Volkswagen Golf (AB-123-C)`). Add the ones you want. Each one has:

| Feature         | Value                                                                       |
| --------------- | --------------------------------------------------------------------------- |
| APK days left   | Days until the APK expiry date. `0` on the last day, negative once expired. |
| APK expiry date | The last day the APK is valid, `YYYY-MM-DD`.                                |
| Insured (WAM)   | `1` when the register knows a WAM third-party insurance, `0` otherwise.     |
| Open recall     | `1` when a manufacturer recall is still to be carried out, `0` otherwise.   |

A value the register does not give (a moped without APK, for instance) stays
empty: it is never made up.

The badge of each device says where the data stands: **cloud** when the
register answered, **unreachable** when it did not (the last values read are
kept), and an **orange dot** when the register does not know the plate (check
it with **Look up a plate**).

## Scenes and dashboard (Gladys 5.1)

### Triggers

| Trigger                | When it fires                                                                                             | Variables                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **APK due or expired** | The APK enters the reminder period ("due soon"), then again when it expires. Once per APK date and stage. | plate, vehicle, expiry_date, days_left |
| **Recall opened**      | The register shows a recall that was not there.                                                           | plate, vehicle                         |
| **Insurance ended**    | The register no longer shows a WAM insurance for a vehicle that had one.                                  | plate, vehicle                         |

Each trigger can be limited to one vehicle; the APK trigger also to one stage
(due soon, expired). In the next actions, read the details with
`{{triggerEvent.data.plate}}`, `{{triggerEvent.data.days_left}}`…

The triggers fire **once per change**, not at every refresh, and an update or
a restart does not fire them again. A vehicle already due when you add it
fires the APK reminder at once; the recall and insurance triggers wait for a
change.

### Actions

| Action                   | What it does                                 | Outputs                                                                                   |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Refresh the vehicles** | Reads the register now.                      | success, vehicles, alerts                                                                 |
| **Read a vehicle**       | Gives the facts of one vehicle to the scene. | found, plate, vehicle, apk_stage, apk_expiry, apk_days_left, insured, open_recall, alerts |

`apk_stage` is `ok`, `due_soon`, `expired` or `unknown`. `alerts` counts what
needs attention (APK due or expired, not insured, open recall).

### Widget

Add the **RDW vehicles** widget to a dashboard: one card per vehicle, with
its APK date and a badge with what needs attention first (APK expired, not
insured, open recall, APK due soon). Settings:

- **One vehicle only**: shows that vehicle, with its APK days left as a live
  tile;
- **Only what needs attention**: hides the vehicles that are fine.

The **Refresh** button reads the register now.

### Example

"Remind me of the APK": trigger **APK due or expired** (stage: due soon) →
action **Send a message**: `APK of {{triggerEvent.data.vehicle}}
({{triggerEvent.data.plate}}) in {{triggerEvent.data.days_left}} days.`

## Troubleshooting

- **"This plate is not in the RDW register"**: check the plate with **Look up
  a plate**. Only Dutch plates are in the register; an exported or scrapped
  vehicle may disappear from it.
- **"The RDW register does not answer"**: the portal is down or throttles your
  address. The values read before are kept; the next read retries. Add an app
  token if it happens often.
- The register is updated once a day: a new insurance or a passed APK can take
  a day to show.

## Privacy

The plates are only sent to `opendata.rdw.nl`. The integration keeps the last
state seen of each vehicle in its own storage, to fire the triggers once.
