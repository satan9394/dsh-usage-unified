# Compatibility

Declared compatibility ranges and the evidence behind them.

## Ranges

| Dimension | Supported | Declared in |
| --- | --- | --- |
| Node.js | `^22.19.0 \|\| >=24.0.0` (the plugin's own code, including `node:zlib` zstd; a host dsh install also has to meet dsh's own `engines.node`, which is `>=24.9.0` for 0.2.2-rc.5) | `package.json` → `engines.node` |
| DeepSeek Harness (verified releases) | `0.1.5-rc.2`, `0.2.0-rc.1`, `0.2.0-rc.2`, `0.2.1-rc.5`, `0.2.2-rc.1`, `0.2.2-rc.5` | `package.json` → `dsh.compatibility.dshReleases` |
| DeepSeek Harness (plugin API range) | `^0.1.5-rc.1 \|\| >=0.2.0-rc.1 <0.2.3-0`; the harness gates each `@deepseek-ai/dsh-*` peer with `semver.satisfies(..., { includePrerelease: true })`. `dsh.compatibility.dsh` restates the verified span `>=0.1.5-rc.2 <0.2.3-0` | `package.json` → `peerDependencies`; `dsh.compatibility.dsh` |
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
- **dsh 0.2.2-rc.1** was re-verified on 2026-11-05 against the live install:
  `dsh-session` still declares `SESSION_FORMAT_VERSION = 4`
  (`lib/index.js:56`) and the format catalog still reports `currentVersion: 4`;
  the JSONL backend still writes one independently decodable, checksummed zstd
  frame per durable append batch (`encodeEventBatch` →
  `compressZstdFrame`), which is exactly the container the reader's
  `scanZstdFrames` walks. The `dsh.client.inject` list dropped
  `@deepseek-ai/dsh-client-runtime` because 0.2.2 no longer ships that frontend
  module id (it is absent from the install tree and from every package
  manifest).
- **dsh 0.2.2-rc.5** was re-verified on 2026-11-23 against the live install (npm
  `latest`; `0.2.3-alpha.2` is alpha and the peer range ends at `<0.2.3-0`,
  which excludes every 0.2.3 prerelease under the harness's
  `includePrerelease` gate). Nothing the plugin consumes changed shape:
  - `dsh-session` still declares `SESSION_FORMAT_VERSION = 4` (`lib/index.js:56`)
    and the format catalog still reports `currentVersion: 4`; no
    `dsh-session-format-v4-to-v5` package exists.
  - Diffing the consumed declarations against 0.2.1-rc.5: `dsh-home-paths` is
    unchanged; `dsh-host-webserver` only widened (`register` also accepts a
    `{ kind, path, resource }` route, index injection carries a Peer) — the
    `{ kind: 'prefix', path, handler }` registration this plugin makes is
    untouched; the client slot maps only gained entries elsewhere
    (`settings.section.icon`, `sidebar.panel.icon`, `sidebar.session.action`,
    render factories), while the three slots this plugin registers kept their
    declarations (`sidebar.footer.action` still hands the owner `wide`,
    `shell.overlay` is still a root list, `settings.section` keeps its owner
    props); `openSettings` gained an optional `sectionId` and
    `dsh-client-locale.register` accepts extra locale ids.
  - The client packages' `cordis` peer moved `~4.0.5` → `~4.1.0`. The plugin's
    own `^4.0.4` peer already admitted it; the dev dependency now tracks 4.1.0 so
    `npm ls @deepseek-ai/cordis` reports no invalid peer.
  - The boot gate accepted the plugin: booting the `web` profile (which links
    this repo) on 0.2.2-rc.5 printed no skip/deny line for `dsh-usage-unified`,
    `GET /usage-unified/v1/snapshot?range=7d` answered 200 with 2,238,416
    tokens, `/calls` answered 200, an unknown path answered 404, and a headless
    Chromium run found the sidebar button, opened the dialog with 5 panels and
    recorded no page or console error.
  - `npm run verify:realdata` matches exactly (18,143,047,071 tokens over 1,509
    logs in `session.v4.jsonl.zstd` plus legacy files) and `npm run smoke:local`
    passes all 10 assertions.
- `npm run verify:realdata` reads this machine's real dsh homes in **both** log
  formats and cross-checks folded tokens against an independently coded
  reconstruction (exact match), over every fixed window (1d / 7d / 14d / 30d / all).
- `npm run smoke:local` runs 10 HTTP assertions against real data (snapshot
  1d/7d/14d/30d/all, **start-to-now custom spans**, main scope, calls,
  **session ranking + drill-down**, **range isolation**, CSV, JSON, 404)
  without installing anything into a DSH profile.
- `dsh --profile web --dump-config` shows the resolved `usage-unified` row above.
