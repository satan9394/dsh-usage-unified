# Compatibility

Declared compatibility ranges and the evidence behind them.

## Ranges

| Dimension | Supported | Declared in |
| --- | --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` | `package.json` → `engines.node` |
| DeepSeek Harness | `0.1.5-rc.1` (tested); plugin API range `^0.1.5-rc.1` | `package.json` → `peerDependencies` (`@deepseek-ai/cordis`, `@deepseek-ai/dsh-*`) |
| React | `^18.2.0` | `peerDependencies.react` |
| Session log format | legacy `session.jsonl[.zstd]` **and** versioned `session.v<N>.jsonl[.zstd]` | reader |
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
#     config: { apiPath: /usage-unified/v1, ... }

# runtime check (loopback only)
#   GET http://127.0.0.1:<port>/usage-unified/v1/snapshot?range=30d  -> 200

# uninstall
dsh plugin --profile <profile> remove dsh-usage-unified
```

The package ships its build output (`lib/index.js`, `lib/index.d.ts`,
`lib/client.js`), so **no install-time build runs** — there is no `prepare`,
`preinstall`, or `postinstall` script.

## Evidence

- `npm run check` (typecheck + 46 unit tests + build) passes.
- `npm run verify:realdata` reads this machine's real dsh homes in **both** log
  formats and cross-checks folded tokens against an independently coded
  reconstruction (exact match).
- `dsh --profile web --dump-config` shows the resolved `usage-unified` row above.
