# dsh-usage-unified

One DeepSeek Harness (`dsh`) plugin that is the **union** of two upstream plugins,
so no feature lives in one and not the other:

| Upstream | What it contributed |
| --- | --- |
| [`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) | The rich dashboard: sidebar + full-screen overlay, per-day token trend, activity heatmap, model donut, token-composition card, per-call detail table with filters and pagination, CSV/JSON export, workspace/task-scope filters, zh/en i18n, theme-adaptive styling. |
| [`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token) | The machine-wide core: discovery of **every** dsh home (`~/.dsh`, `~/.dsh_desktop/<version>`, `$DSH_HOME`), raw session-log reading (zstd container frames), the pure resumable fold, an incremental durable index, all-time / 7d / 30d ranges, current + longest streaks, peak hour, per-model disjoint-bucket split, coverage disclosure, and a Settings section. |

The two were **merged at the data layer**, not bolted together: one machine-wide
index now feeds one dashboard, so the numbers agree everywhere.

## Feature matrix (after the merge)

| Feature | Upstream #1 | Upstream #2 | Unified |
| --- | :---: | :---: | :---: |
| Machine-wide (all dsh homes / old Desktop versions) | ✗ | ✓ | ✓ |
| Both session-log formats (`session.jsonl.zstd`, `session.v3.jsonl.zstd`) | n/a | ✗ (v0 only) | ✓ |
| Sidebar entry + full-screen overlay | ✓ | ✗ | ✓ |
| Settings → Usage section | ✗ | ✓ | ✓ |
| Token totals incl. cache reads | ✓ | ✓ | ✓ |
| 7d / 30d trend | ✓ | ✓ | ✓ |
| All-time range | partial (cards) | ✓ | ✓ |
| Year heatmap | ✓ | ✓ | ✓ |
| Current streak | ✓ | ✓ | ✓ |
| Longest streak | ✗ | ✓ | ✓ |
| Peak hour | ✗ | ✓ | ✓ |
| Per-model donut + share | ✓ | ✗ | ✓ |
| Per-model input/cacheRead/cacheWrite/output split | ✗ | ✓ | ✓ |
| Per-call detail table (time, duration, tokens, cache %, model, effort) | ✓ | ✗ | ✓ |
| Workspace + main/subtask scope filters | ✓ | ✗ | ✓ |
| CSV / JSON export | ✓ | ✗ | ✓ |
| Coverage + homes + skipped-log disclosure | ✗ | ✓ | ✓ |
| zh/en, light/dark | ✓ | ✓ | ✓ |

## Install

```powershell
# straight from GitHub (builds `lib/` on install via the `prepare` script):
dsh plugin --profile web add github:satan9394/dsh-usage-unified

# from an npm release, once published:
dsh plugin --profile web add dsh-usage-unified

# from a local checkout:
dsh plugin --profile web add E:\path\to\dsh-usage-merged
```

Restart the Web profile. The dashboard appears as a **使用统计 / Usage Stats**
item in the sidebar footer, and as a section under **Settings**. All data stays
local; the routes answer loopback callers only.

## Architecture

```
src/
  index.ts          host entry: Config, mount index + routes + refresh loop
  homes.ts          discover every dsh home (deduped by sessions realpath)
  reader.ts         walk session logs; decode both on-disk formats (no private API)
  zstd-frames.ts    scan concatenated zstd frames (resume cursor is frame-aligned)
  fold.ts           pure resumable fold: session → totals, day/hour slices, calls
  aggregate.ts      snapshot + call rows + streaks/peak hour + CSV
  index-store.ts    incremental index, file-backed cache under DSH_HOME
  transport.ts      /snapshot, /calls, /export.csv, /export.json (loopback only)
  types.ts          the wire contract shared by both halves
  client/
    index.tsx       sidebar + overlay + settings registrations, dashboard
    i18n.ts         merged zh/en dictionaries
    source.ts       the one transport seam
    styles.ts       dashboard stylesheet
```

Key design decisions (full rationale in [PLAN.md](./PLAN.md)):

- **The reader is harness-version-agnostic.** Legacy logs are JSONL *storage
  records* where streaming content is packed (`text-chunks`, …) with no `seq`;
  versioned logs are plain events. Token accounting only needs the sequenced
  events (`assistant/message` carries the final usage), so the reader keeps any
  line with a string `type` and numeric `seq` and skips the packed runs — no
  dependency on the harness's private `decodeStorageRecord`, which has moved
  between releases.
- **One row per `(turn, step)`.** A usage report arrives twice per step (a
  streaming `assistant/chunk` and the final `assistant/message`); the fold
  *replaces* rather than accumulates, and stores one call row per step for the
  detail table. Compaction summaries are their own rows.
- **All-time vs bounded range.** All-time reads authoritative per-session
  counters (so tokens with rejected timestamps are still counted); a bounded
  range is summed from day slices (so it can be smaller — the honest behaviour).
- **File-backed cache.** The index persists to `$DSH_HOME/usage-unified/index-v1.json`
  atomically, rather than depending on `ctx.storageDomain`, so the panel always
  loads.

## Development

```powershell
npm install          # .npmrc sets legacy-peer-deps for the dsh peer tree
npm run typecheck    # tsc --noEmit
npm run test         # vitest (45 tests)
npm run build        # tsdown → lib/index.js + lib/client.js
npm run check        # all three
npm run verify:realdata   # read-only pass over this machine's real dsh homes
npm run smoke:local       # local HTTP self-test against real ~/.dsh (no install)
npm run smoke:serve       # keep the local viewer up (prints the URL)
npm run report            # static self-contained report (30d) → opens in browser
npm run report:all        # same, all-time range
```

`smoke:local` is the "run it in the workspace, point at the real data" path: it
does **not** touch the DSH profile. It mounts the same host routes over a plain
Node server on a free loopback port, points the index at the real `~/.dsh`,
runs seven HTTP assertions (snapshot 7d/all, main scope, calls, CSV, JSON,
404), and — with `smoke:serve` — serves a small built-in viewer so the real
numbers are visible without the DSH UI. The first cold scan takes minutes; the
index is cached in `.smoke-cache/` (gitignored), so later runs are seconds.

`verify:realdata` walks every real session log, folds it, and cross-checks the
folded tokens against an independently coded reconstruction of provider usage;
it prints the discovery, both formats, totals, models, workspaces, coverage,
the call endpoint and a persistence round-trip.

## Compatibility

- Targets the `dsh` 0.1.5-rc.1 plugin API (`peerDependencies`), and reads both
  the legacy and the current session-log layouts, so it is not limited to one
  harness generation.
- The browser half declares its own minimal structural types for the injected
  runtime seam (`src/client/runtime.d.ts`) instead of importing
  `@deepseek-ai/dsh-client-runtime`, whose published line has diverged from the
  one the harness ships. The `@deepseek-ai/*` client modules remain
  `peerDependencies`, provided by the harness at load time.

## Cross-agent leaderboard (optional, opt-in)

The dashboard here is **DSH-only** and works entirely offline — installing the
plugin never contacts the network and never uploads anything. Aggregating every
agent on the machine (DSH, Claude Code, Codex, OpenCode, …) into one number and
posting it to the [tokscale](https://github.com/junhoyeo/tokscale) leaderboard
is **opt-in** and only happens if you run the guided setup **from a clone** of
this repo (the plugin itself never needs it):

```powershell
git clone https://github.com/satan9394/dsh-usage-unified && cd dsh-usage-unified
npm install
npm run leaderboard:setup     # guided: install/login tokscale, export, first submit
npm run leaderboard:off       # undo: remove the daily task, stop submitting
```

`leaderboard:setup` follows [docs/LEADERBOARD.md](docs/LEADERBOARD.md), which
states exactly what leaves the machine and asks before anything is uploaded.
That document also covers the exporters (`scripts/tokscale-export.mjs` for DSH's
versioned logs, `scripts/ccswitch-export.mjs` for CC Switch's proxy-side Claude
usage), the pricing table (`scripts/custom-pricing.mjs`), and the daily refresh
task.

### Privacy at a glance

A submit carries **aggregates only** — token buckets per day, estimated cost,
message counts, client and model names, MCP server names, session timing
metrics, a random `dev_…` device key, and the CLI version. It never carries
prompts, responses, source code, or workspace/file paths. Two items cannot be
redacted at upload: model/provider names and MCP server names (rename your MCP
servers if those are sensitive). Set `TOKSCALE_USERNAME` before `npm run report`
to embed your own profile card; leave it unset and the report stays anonymous.

## License

MIT — see [LICENSE](./LICENSE). Derived from two MIT-licensed plugins; see
`_upstream/` for their sources.
