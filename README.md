# dsh-usage-unified

[![CI](https://github.com/satan9394/dsh-usage-unified/actions/workflows/ci.yml/badge.svg)](https://github.com/satan9394/dsh-usage-unified/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/satan9394/dsh-usage-unified)](https://github.com/satan9394/dsh-usage-unified/releases)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24-brightgreen)](https://nodejs.org)

**Machine-wide token accounting for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).**
One dashboard over every session log on the machine: trends, per-model breakdown, a session
ranking, call details, exports, and an optional local cost estimate. Everything runs locally —
the plugin never contacts the network.

English | [中文](./README.zh.md)

## Contents

- [What it is](#what-it-is)
- [Features](#features)
- [Requirements](#requirements)
- [Install](#install)
- [Usage](#usage)
- [Configuration](#configuration)
- [Data and privacy](#data-and-privacy)
- [Cost estimate (opt-in)](#cost-estimate-opt-in)
- [Known limitations](#known-limitations)
- [Architecture](#architecture)
- [Development](#development)
- [Compatibility](#compatibility)
- [Cross-agent leaderboard (opt-in)](#cross-agent-leaderboard-opt-in)
- [Credits](#credits)

## What it is

`dsh` writes a session log per conversation. Reading those logs is the only way to answer
"what did this machine actually spend, and on what" — the harness's own projection only covers
the home it is running against.

This plugin merges two earlier plugins into one, at the data layer rather than side by side, so
one index feeds one dashboard and the numbers agree everywhere:

| Upstream | What it contributed |
| --- | --- |
| [`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) | The dashboard: sidebar entry and overlay, per-day trend, per-call detail table with filters and pagination, CSV/JSON export, workspace and task-scope filters, zh/en, theme-adaptive styling. |
| [`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token) | The machine-wide core: discovery of every dsh home, raw zstd log reading, a pure resumable fold, an incremental durable index, streaks, peak hour, per-model disjoint-bucket split, coverage disclosure, settings section. |

## Features

- **Every dsh home, both log generations.** `~/.dsh`, `~/.dsh_desktop/<version>`, `$DSH_HOME`,
  plus any extra roots you list. Reads legacy `session.jsonl[.zstd]` and versioned
  `session.v<N>.jsonl[.zstd]`, and never depends on the harness's private decoder.
- **One range governs the whole page.** 7 days / 30 days / all time / a custom date range drives
  the headline cards, the trend, the model panel, the session ranking, the call table and the
  cost. Only the streaks are all-time facts, and those two cards say so.
- **One model panel.** Per row: share of the total, the stacked input / cache-read / cache-write /
  output bar, the call count and (when priced) the cost. The long tail sits behind a toggle.
- **Session ranking with drill-down.** Sessions ranked by tokens for the selected window; click a
  row to filter the call table to that session.
- **Smooth multi-series trend** (total / input / output / cache read) with a legend you can toggle
  and a hover readout, over any range including all-time.
- **Call details**: time, response time, input, output, cache rate, model, thinking effort, with
  model/provider/threshold filters, pagination and a configurable row cap.
- **CSV / JSON export** of the current window.
- **Collapsible panels**, zh/en, light/dark, and a coverage footer that discloses what was
  skipped or replaced rather than quietly dropping it.
- **Optional cost estimate** from a local pricing table, with off-peak/peak weighting (below).

## Requirements

- `dsh` 0.1.5-rc.1 or newer on the plugin API (see [Compatibility](#compatibility)).
- Node `^22.19.0 || >=24.0.0` — the runtime the harness itself uses.
- No runtime dependencies. `react` and the `@deepseek-ai/*` modules are peers, provided by the
  harness.

## Install

```powershell
# from GitHub
dsh plugin --profile web add github:satan9394/dsh-usage-unified

# from a local checkout
dsh plugin --profile web add E:\path\to\dsh-usage-unified
```

Then restart the Web profile. The dashboard appears as **使用统计 / Usage Stats** in the sidebar
footer, and as a section under **Settings**.

> **DSH STORE status.** The marketplace lists this plugin as `blocked`. Its automatic admission
> policy refuses any plugin whose runtime source touches the filesystem, the network, commands or
> credentials, and this one must: the host half reads session logs from disk and the browser half
> fetches its own loopback route. The catalog keeps the manual install path above, and
> [docs/SECURITY.md](./docs/SECURITY.md) states exactly what the runtime does with those
> capabilities. Nothing about the plugin's behaviour differs from the description here.

### Updating

The runtime (`lib/`) is loaded when the harness starts, so a new build only takes effect after a
restart of the Web profile.

- **From a checkout or a `link:`** — `git pull` in that directory, rebuild if the source changed
  (`npm run build`), then restart. A `link:` dependency is a directory junction, so there is no
  copy to refresh: the profile reads the checkout itself.
- **From GitHub or npm** — `dsh plugin --profile web add <same target>` again. That install is
  pinned to a commit, so re-adding is what moves it.

Only a change to the runtime needs the restart; documentation and `scripts/` changes do not.

## Usage

Open the sidebar footer entry (or Settings → Usage Stats). Pick a range; the caption under the
range control and the trend panel's header both spell out the exact window being reported.

The host serves four same-origin, loopback-only routes under `/usage-unified/v1`:
`/snapshot`, `/calls`, `/export.csv`, `/export.json`. Non-loopback callers get `403`.

## Configuration

Set these in the profile's plugin row (the bundle patch in
[`cordis.patch.yml`](./cordis.patch.yml) shows the shape).

| Key | Type | Default | Meaning |
| --- | --- | --- | --- |
| `extraSessionRoots` | `string[]` | `[]` | Extra dsh home directories to scan. Home discovery is a heuristic, so a home only reachable through an unset `$DSH_HOME` has to be listed here. |
| `includeCompaction` | `boolean` | `true` | Count the tokens spent generating compaction summaries. Set `false` to reconcile 1:1 with the harness's own projection. |
| `refreshIntervalMs` | `number` | `30000` | How often to re-scan for appended sessions. |
| `indexChunkYieldMs` | `number` | `16` | Cooperative yield interval during a scan, so a cold build stays responsive. |
| `indexConcurrency` | `number` | `4` | Sessions decoded in parallel. Measured: 2–4 is the sweet spot; 8+ regresses. |
| `apiPath` | `string` | `/usage-unified/v1` | Same-origin read-only API prefix. |
| `cachePath` | `string` | `$DSH_HOME/usage-unified/index-v1.json` | Index cache location. |
| `pricingPath` | `string` | `$DSH_HOME/usage-unified/pricing.json` | Cost table. Absent file means no cost is shown. |
| `cacheWriteDelayMs` | `number` | `1000` | Debounce before the index is written. It is written only when it actually changed. |

## Data and privacy

This is the whole picture; [docs/SECURITY.md](./docs/SECURITY.md) has the details and the failure
bounds.

- **Reads** — session logs under every discovered dsh home, and (for the cost estimate) one
  optional pricing file. Read-only: it never writes to a session or to another home.
- **Writes** — exactly one file, the index cache at `$DSH_HOME/usage-unified/index-v1.json`,
  atomically (temp + rename) with mode `0600`, and only when the index changed.
- **Network** — none. The runtime makes no outbound request and opens no socket of its own. It
  registers one route on the harness-provided web server and answers **loopback callers only**
  (anything else gets `403`). Its imports are `node:fs/promises`, `node:path`, `node:os`,
  `node:zlib` and `@deepseek-ai/*`.
- **Processes and credentials** — none. No `child_process`, no shell, no eval, and no secret is
  read, written or logged.
- **Tool surface** — none. The plugin registers no model-facing tool and appends no session
  event, so mounting it costs a conversation nothing.

## Cost estimate (opt-in)

`dsh` ships no price list, so the plugin **shows no cost by default**. When a pricing table
exists, an "Est. cost" card and a per-model cost appear; a model with no entry is counted as
**unpriced**, never as free, and the card plus the footer disclose the priced share.

```powershell
npm run pricing:setup     # writes $DSH_HOME/usage-unified/pricing.json
```

Two sources are merged, the second winning:

1. **Primary** — CC Switch's `~/.cc-switch/model-pricing.json` (`--source` can point at any file
   in this project's own `{ models: { id: {...} } }` shape).
2. **Override** — `scripts/pricing.override.json` (in git): the models the primary table lacks,
   plus two-tier rates. It lives here rather than in CC Switch because a models.dev re-sync can
   drop hand-added rows; every `pricing:setup` re-applies it.

**Time-of-day tiers.** DeepSeek prices its whole Flash/Pro line by clock: peak is UTC Mon–Fri
01:00–04:00 and 06:00–10:00 (35 of the week's 168 hours). An entry may declare both an off-peak
table and a `peak` tier; the plugin folds them into the effective rate as
`offPeak × (1 − peakShare) + peak × peakShare`, with `peakShare` defaulting to **0.2083**, and
discloses that share on the card — neither the optimistic off-peak bound nor the peak one. The
values shipped match [DeepSeek's pricing page](https://api-docs.deepseek.com/quick_start/pricing),
[OpenCode Go](https://opencode.ai/docs/go) and
[Command Code](https://commandcode.ai/docs/resources/pricing-limits).

## Known limitations

Disclosed rather than hidden — the footer repeats the ones that apply to the current data.

- **Retried steps keep only the final usage.** A step whose provider report was replaced was
  billed for both attempts; the log only preserves the survivor. Surfaced as `retried` in the
  footer.
- **A bounded range can total less than all-time.** Tokens whose timestamps fail the clock-skew
  guard belong in a total but not on a calendar, so all-time reads authoritative per-session
  counters while a bounded range sums day slices.
- **Days are bucketed in the host process's timezone**, fixed when the index is built. On a
  machine whose system zone differs from the user's, "today" means today in that zone; changing
  it forces a full rebuild.
- **The call table is capped** by the configurable detail limit (default 1,000, max 10,000).
- **A cold index takes minutes** on a large history (this machine: ~1,380 log files, ~790 MB
  compressed). The panel renders partial results and reports progress.
- **The activity heatmap was removed** — it duplicated the trend chart.

## Architecture

```
src/
  index.ts          host entry: Config, mount index + routes + refresh loop
  homes.ts          discover every dsh home (deduped by sessions realpath)
  reader.ts         walk session logs; decode both on-disk formats (no private API)
  zstd-frames.ts    scan concatenated zstd frames (resume cursor is frame-aligned)
  fold.ts           pure resumable fold: session → totals, day/hour slices, calls
  aggregate.ts      snapshot + session ranking + call rows + streaks/peak hour + CSV
  pricing.ts        optional pricing table: load, match by model id, cost + coverage
  index-store.ts    incremental index (parallel decode), file-backed cache under DSH_HOME
  transport.ts      /snapshot, /calls (incl. ?session= drill-down), /export.* (loopback only)
  types.ts          the wire contract shared by both halves
  client/
    index.tsx       sidebar + overlay + settings registrations, dashboard
    i18n.ts         zh/en dictionaries
    source.ts       the one transport seam
    styles.ts       dashboard stylesheet
```

Design decisions worth knowing (full rationale in [PLAN.md](./PLAN.md)):

- **The reader is harness-version-agnostic.** Legacy logs are JSONL *storage records* where
  streaming content is packed with no `seq`; versioned logs are plain events. Accounting only
  needs the sequenced events, so the reader keeps any line with a string `type` and numeric
  `seq` — no dependency on the harness's private `decodeStorageRecord`, which has moved between
  releases.
- **One row per `(turn, step)`.** A usage report arrives twice per step (a streaming chunk and
  the final message); the fold *replaces* rather than accumulates, and keeps one call row per
  step. Compaction summaries are their own rows.
- **File-backed cache, no optional services.** The index persists to a plain file under
  `$DSH_HOME` rather than `ctx.storageDomain`, so a missing optional service can never stop the
  panel from loading.
- **No invented numbers.** Unpriced models are reported as unpriced; coverage, retried steps and
  skipped logs are always disclosed.

## Development

```powershell
npm install          # .npmrc sets legacy-peer-deps for the @deepseek-ai peer tree
npm run typecheck    # tsc --noEmit
npm run test         # vitest (68 tests)
npm run build        # tsdown → lib/index.js + lib/client.js
npm run check        # typecheck + test + build
npm run verify:realdata   # read-only pass over this machine's real dsh homes
npm run smoke:local       # local HTTP self-test against real ~/.dsh (no install)
npm run smoke:serve       # keep the local viewer up (prints the URL)
npm run pricing:setup     # build the cost table from this machine's CC Switch
npm run report            # static self-contained report (all-time) → opens in browser
npm run report:30d        # same, last 30 days
```

`smoke:local` is the "run it in the workspace, point at the real data" path: it does **not**
touch the DSH profile. It mounts the same host routes over a plain Node server on a free loopback
port, points the index at the real `~/.dsh`, and runs nine HTTP assertions. `verify:realdata`
walks every real session log and cross-checks the folded tokens against an independently coded
reconstruction (exact match, zero-token delta on this machine).

`lib/` is committed, because DSH STORE requires the runtime artifacts to exist inside the fixed
commit. CI therefore asserts that the committed build output matches the source, so a source
change that was never rebuilt cannot be installed as the old code.

The static report is generated from the same snapshot and reads the same way: `--range` drives
the headline cards, it carries the same merged model panel, session ranking and cost card, and it
drops the heatmap for the same reason the panel did.

> The scripts under `scripts/` are only available from a source checkout; they are not part of
> the published package.

## Compatibility

- Plugin API: the `@deepseek-ai/*` `peerDependencies` (currently `^0.1.5-rc.1`); Node
  `^22.19.0 || >=24.0.0`.
- Session logs: legacy `session.jsonl[.zstd]` **and** versioned `session.v<N>.jsonl[.zstd]`.
- Platform: Windows, macOS and Linux. The optional leaderboard task uses Windows Task Scheduler;
  its scripts are cross-platform otherwise.
- `dsh.compatibility` in `package.json` declares **only what has actually been verified**:
  `>=0.1.5-rc.2 <0.1.6` with `dshReleases["0.1.5-rc.2"] = "compatible"`. A caret range is
  deliberately not used — it would claim rc.3+ as well, which nobody has tested.

Details and the evidence behind each claim: [docs/COMPATIBILITY.md](./docs/COMPATIBILITY.md).

## Cross-agent leaderboard (opt-in)

The dashboard is **DSH-only** and works entirely offline. Aggregating every agent on the machine
(DSH, Claude Code, Codex, OpenCode, …) into one number and posting it to the
[tokscale](https://github.com/junhoyeo/tokscale) leaderboard is **opt-in**, and only happens if
you run the guided setup from a clone:

```powershell
git clone https://github.com/satan9394/dsh-usage-unified && cd dsh-usage-unified
npm install
npm run leaderboard:setup     # guided: install/login tokscale, export, first submit
npm run leaderboard:off       # undo: remove the daily task, stop submitting
```

`leaderboard:setup` follows [docs/LEADERBOARD.md](./docs/LEADERBOARD.md), which states exactly
what leaves the machine and asks before anything is uploaded. A submit carries **aggregates
only** — token buckets per day, estimated cost, message counts, client and model names, MCP
server names, session timing metrics, a random device key and the CLI version. It never carries
prompts, responses, source code or workspace paths. Two items cannot be redacted at upload:
model/provider names and MCP server names (rename your MCP servers if those are sensitive).

## Credits

MIT — see [LICENSE](./LICENSE) and [NOTICE](./NOTICE). Derived from two MIT-licensed plugins,
[`lanlandeli/dsh-usage-stats`](https://github.com/lanlandeli/dsh-usage-stats) and
[`zoyluoblue/deepseek-harness-token`](https://github.com/zoyluoblue/deepseek-harness-token);
their sources are kept under `_upstream/` for comparison.

Change history: [CHANGELOG.md](./CHANGELOG.md).
