# Security & permissions

Scope, capabilities, and failure bounds of the plugin runtime (the code that is
actually loaded by the harness), plus the optional helper scripts.

## Plugin runtime (loaded by DSH)

What it is: a host half (`lib/index.js`) that reads local session logs and
serves a same-origin read API, and a browser half (`lib/client.js`) that renders
the dashboard.

- **Reads**: session logs under every discovered dsh home
  (`~/.dsh`, `~/.dsh_desktop/<version>`, `~/.dsh*` siblings, `$DSH_HOME`,
  configured extra roots). Read-only; it never writes to a session.
- **Writes**: exactly one file — the index cache at
  `$DSH_HOME/usage-unified/index-v1.json`, written atomically (temp + rename)
  with POSIX mode **`0600`**, and only when the index actually changed. This is
  the only filesystem-permission signal.
- **Reads (cost estimate)**: one optional extra file, the pricing table at
  `$DSH_HOME/usage-unified/pricing.json` (path overridable via `pricingPath`).
  When it is absent or unparseable the plugin simply reports no cost; a model
  with no entry is disclosed as *unpriced* rather than assumed free. The file is
  read-only input and nothing from it is written anywhere.
- **Network**: **none**. The runtime makes no outbound request and opens no
  server socket of its own; it registers one route on the harness-provided
  `webServer` and answers **loopback callers only** (non-loopback → `403`).
  `lib/index.js` imports only `node:fs/promises`, `node:path`, `node:os`,
  `node:zlib` and `@deepseek-ai/*`.
- **Processes**: none. No `child_process`, no shell, no eval.
- **Tool surface**: none. The plugin registers no model-facing tool and appends
  no session event, so mounting it costs the conversation nothing.
- **Secrets**: none read, none written, none logged.

### Failure bounds

| Failure | Behaviour |
| --- | --- |
| A session log is unreadable/corrupt | That one log is skipped and counted in `coverage.skippedArtifacts`; every other session is still indexed |
| The scan throws | `status.phase = "error"` with a message; the last good index keeps serving |
| The cache file cannot be written | Degrades to an in-memory index for the session; correctness is unaffected |
| A route is hit by a non-loopback caller | `403` |
| A malformed request | `400` with an `{ error }` body |

## Dependencies

- Runtime: none bundled beyond `@deepseek-ai/*` (peer-provided by the harness)
  and `schemastery` (config schema, bundled).
- `peerDependencies` are intentionally not bundled — the harness supplies one
  instance of every official module.

## External services

The **plugin runtime uses no external service.** Contact with the network
happens only in the optional, developer-side helpers under `scripts/`, which are
**not** part of the loaded plugin and are **not** shipped in the npm `files`
list:

- `scripts/report.mjs` fetches the public tokscale profile API and
  `<https://tokscale.ai>` for an opt-in profile card.
- `scripts/setup-leaderboard.ps1` / `refresh-and-submit.ps1` install, log in to,
  and submit to **tokscale** (`tokscale.ai`) — entirely opt-in; see
  [LEADERBOARD.md](./LEADERBOARD.md) for exactly what is uploaded.
- `scripts/pr-watch.ps1` queries the **GitHub API** via `gh`.

None of these run unless the user invokes them.
