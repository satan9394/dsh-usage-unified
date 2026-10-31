# Compatibility

Declared compatibility ranges and the evidence behind them.

## Ranges

| Dimension | Supported | Declared in |
| --- | --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` | `package.json` → `engines.node` |
| DeepSeek Harness | `0.1.5-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-rc.5` (verified); plugin API range `>=0.1.5-rc.2 <0.3.0` | `package.json` → `peerDependencies` (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-*`) |
| React | `^18.2.0` | `peerDependencies.react` |
| Session log format | legacy `session.jsonl[.zstd]` **and** versioned `session.v<N>.jsonl[.zstd]`, v0–v4 | reader (`MAX_SUPPORTED_FORMAT`) |
| Platform | Windows / macOS / Linux (reader + host are pure Node; the optional leaderboard task uses Windows Task Scheduler) | — |

DSH compatibility is declared the standard way for this ecosystem: the
`@deepseek-ai/*` **peerDependencies** are the plugin API contract, and `engines.node`
is the runtime contract. The plugin never bundles an official module.

## Install / start / uninstall

```powershell
# install (pinned to a fixed commit for reproducibility)
dsh plugin --profile <profile> add github:satan9394/dsh-usage-unified

# start: the loader applies the bundle patch at boot; verify the row resolved
dsh --profile <profile> --dump-config | Select-String usage-unified
#   - id: usage-unified
#     name: dsh-usage-unified
#     inject: [webServer]
#     config: { apiPath: /usage-unified/v1, pricingPath: <DSH_HOME>/usage-unified/pricing.json, indexConcurrency: 4, ... }

# runtime check (loopback only)
#   GET http://127.0.0.1:<port>/usage-unified/v1/snapshot?range=30d  -> 200

# uninstall
dsh plugin --profile <profile> remove dsh-usage-unified
```

The package ships its build output (`lib/index.js`, `lib/index.d.ts`,
`lib/client.js`), so **no install-time build runs** — there is no `prepare`,
`preinstall`, or `postinstall` script.

## Evidence

- `npm run check` (typecheck + 85 unit tests + build) passes.
- **dsh 0.2.1-rc.5** was verified against a live install: the running host serves
  the same `webServer` route contract, every session log on disk is `session.v4.
  jsonl.zstd`, and `@deepseek-ai/dsh-session-format-catalog` still reports
  `currentVersion: 4` with no v4→v5 migration published. The folded totals are
  unchanged across the 0.2.0-rc.2 → 0.2.1-rc.5 upgrade (18,024,754,900 tokens on
  this machine's history).
- `npm run verify:realdata` reads this machine's real dsh homes in **both** log
  formats and cross-checks folded tokens against an independently coded
  reconstruction (exact match), over every fixed window (1d / 7d / 14d / 30d / all).
- `npm run smoke:local` runs 10 HTTP assertions against real data (snapshot
  1d/7d/14d/30d/all, **start-to-now custom spans**, main scope, calls,
  **session ranking + drill-down**, **range isolation**, CSV, JSON, 404)
  without installing anything into a DSH profile.
- `dsh --profile web --dump-config` shows the resolved `usage-unified` row above.
