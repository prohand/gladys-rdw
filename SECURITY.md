# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, licence plates and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and the RDW open data portal (opendata.rdw.nl), which this integration only
reads.

## What the integration handles

- **The optional RDW app token** is a secret configuration field: it is sent
  only to `opendata.rdw.nl`, in the `X-App-Token` header, and never logged.
- **Licence plates** are public register keys, but they still say which
  vehicles a household owns: they are only sent to `opendata.rdw.nl`, and only
  kept in Gladys and in `/data/rdw-state.json` (the last state seen of each
  vehicle, for the scene triggers).
- The container runs as a non-root user on a read-only root filesystem; `/data`
  is the only writable path.
