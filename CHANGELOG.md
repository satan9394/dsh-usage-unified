# Changelog

Notable changes per release, newest first. The same text is on each
[release](https://github.com/satan9394/dsh-usage-unified/releases); this file is the
one place to read them in order.

## 0.4.1 — 2026-09-18

- Documentation rewritten to a conventional shape in both languages: a table of contents, a
  configuration table with every key and default, an explicit **Data and privacy** section, a
  **Known limitations** section that lists what the panel cannot know, and the DSH STORE listing
  status stated plainly rather than left for a reader to discover.
- `CHANGELOG.md` added, and the machine-size figure in the limitations corrected (~1,380 log
  files / ~790 MB compressed, measured, rather than a stale estimate).

## 0.4.0 — 2026-09-18

- `dsh.compatibility` declared in `package.json`: `>=0.1.5-rc.2 <0.1.6` with
  `dshReleases["0.1.5-rc.2"] = "compatible"`. Only verified releases are claimed; a caret
  range would have implied untested ones.
- Removed the retired `year` range (it fed the activity heatmap, since dropped). `range=year`
  now degrades to all-time instead of failing, so a browser holding a cached client bundle
  cannot receive a 400 that breaks the panel. Other unknown values still return 400.
- CI added (`.github/workflows/ci.yml`): typecheck, tests and build on Node 22/24 (Ubuntu) and
  Node 24 (Windows), plus a check that the committed `lib/` matches the source.
- `.github/dependabot.yml` repaired — it had pointed at an empty `package-ecosystem` and
  `directory`, which is why the pull requests it opened were unusable. Constraints that are real
  for this package (React 18 is the harness's, `@types/node` tracks the oldest supported runtime,
  a build-tool bump changes the committed artifact) are now `ignore` rules.
- Test suite given a 30s timeout: a five-event, zero-I/O test had hit vitest's 5s default on a
  loaded Windows runner.

## 0.3.3 — 2026-09-18

- vitest 3 → 5, plus the `vite` devDependency vitest 5 no longer bundles (without it, every run
  died with `ERR_MODULE_NOT_FOUND` before collecting a test).
- `scripts/store-watch.ps1` no longer loses a poll: it checks `gh`'s exit code, parses from the
  first brace to the last, and records the raw output when it cannot parse.

## 0.3.2 — 2026-09-18

- Retired the DSH supplement tokscale no longer needs. tokscale 4.17.0 reads versioned
  `session.v<N>.jsonl.zstd` itself, so keeping the exporter and its `extraScanPaths` entry
  reported DSH at 24.80B against the 15.38B it reads unaided. Removed: the exporter script, its
  output directory, the npm script, the daily refresh step and the scan-path entry.
  `leaderboard:setup` now warns when tokscale is older than 4.17.0.
- The CC Switch supplement stays — tokscale still cannot see proxy-side Claude usage by itself.

## 0.3.1 — 2026-09-18

- The static report now reads the same as the panel. Its headline cards had the same defect the
  panel just fixed: they read `snapshot.allTime`, so `--range 7d` still showed the all-time
  total. Also mirrored: the merged model panel, the session ranking, the cost card with the
  peak-blend disclosure, and `pricingPath` so the numbers match exactly.
- Activity heatmap dropped from the report for the same reason the panel dropped it.

## 0.3.0 — 2026-09-18

- **The range governs the whole page.** Eight of the eleven headline cards read
  `snapshot.allTime`, which is deliberately range-independent, so switching 7d/30d/all changed
  nothing visible. They now read the selected window; the two streak cards stay all-time and are
  tagged as such. A caption under the range control and in the trend header spells out the
  resolved window, and a smoke assertion pins the behaviour.
- **DeepSeek's off-peak/peak pricing.** A price entry may carry a `peak` tier, folded into the
  effective rate by `peakShare` (default 0.2083) and disclosed on the card. `deepseek-v4.1-flash`
  was missing entirely (21.7% of this machine's tokens); the Flash family and `v4-pro` were
  corrected. `scripts/pricing.override.json` holds the hand-checked entries and is merged over
  CC Switch's table on every `pricing:setup`.
- Zero-token model rows are filtered out of the panel.

## 0.2.1 — 2026-09-18

- Cost estimate no longer double-counts: the summary summed the per-model rows *and* the session
  rows, which describe the same tokens, roughly doubling the figure. Only the per-model rows
  partition a window, so they alone feed the total.
- Nested model ids (`command/deepseek/deepseek-v4.1-flash`) now match the price table: the lookup
  tries the segment after the last slash as well.

## 0.2.0 — 2026-09-18

- **One model panel** replaces the two that each upstream shipped (one share-only, one
  split-only): a row carries the share, the stacked four-bucket bar, the call count and the cost,
  with the long tail behind a toggle. Every large panel collapses.
- **Session ranking** with click-through into that session's calls, reusing the existing call
  route with a `session` filter.
- **Optional cost estimate** from a local pricing table; models without a price are disclosed as
  unpriced rather than assumed free.
- **Faster index**: bounded-concurrency decoding, a resume read that seeks to the appended tail
  instead of re-reading the whole log, and persistence only when the index actually changed.

## 0.1.1 — 2026-09-13

- Dashboard UI update: cards with accent bars, glow and a hero sparkline; a cache-hit-rate card
  and a model-call card; a smooth multi-series trend replacing the bar chart; a custom date
  range; and the activity heatmap removed as redundant with the trend.

## 0.1.0 — 2026-09-12

- First release: the merge of `lanlandeli/dsh-usage-stats` and `zoyluoblue/deepseek-harness-token`
  into one plugin, one index and one dashboard.
