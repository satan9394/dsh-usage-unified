# Merge plan — `dsh-usage-unified`

## Goal

The two upstream plugins overlap but neither is a superset, so a user must
install both and read two panels that can disagree. Merge them into **one**
project whose dashboard shows every feature from both, backed by one index.

## Gap analysis (what each side was missing)

`dsh-usage-stats` (audit plugin) is built on `ctx.sessionQuery`, which is bound
to a single session root — the current dsh home. It cannot see
`~/.dsh_desktop/<version>` or a stale `$DSH_HOME`, has no longest streak / peak
hour / coverage disclosure, and does no per-model bucket split.

`@zoytown/dsh-token` folds raw logs from every home, but has only a Settings
page: no sidebar overlay, no per-day trend chart, no per-call table, no
workspace/scope filters, no exports, and its reader hard-codes the legacy
`session.jsonl[.zstd]` filename, so on a current harness (which writes
`session.v3.jsonl.zstd`) it finds nothing.

## Decision: merge at the data layer, machine-wide as the base

The machine-wide raw-log fold is the superset data source (it covers the current
home too), so the unified host is built on it, and the audit plugin's richer
data model (per-day series, per-call rows, workspaces) is added **inside the
fold**, not as a second pipeline. Consequence: one index, one set of numbers,
one UI.

### Host

1. `homes.ts` — kept from the token plugin (discover `~/.dsh`, current home,
   `$DSH_HOME`, every `~/.dsh_desktop/*`, extra roots; dedupe by sessions
   realpath).
2. `reader.ts` — reworked:
   - match any canonical log name, including the versioned
     `session.v<version>.jsonl[.zstd]`, preferring the newest compressed
     generation when several exist;
   - decode lines without the private `decodeStorageRecord`: keep lines with a
     string `type` + numeric `seq`, treat the `type: 'session'` line as the
     header, skip packed content records (they carry no `seq` and no usage);
   - gate on a supported format version, but keep the shape tolerant.
3. `fold.ts` — extended from the token plugin's pure fold:
   - adds `calls: Record<callKey, FoldCall>` — one surviving row per
     `(turn, step)` plus one per compaction summary;
   - tracks step start time and current reasoning effort to fill `durationMs`
     and `effort` on each call, as the audit plugin did;
   - keeps the replace-not-add usage discipline, seed-boundary skip, day/hour
     slices and per-model tallies.
4. `aggregate.ts` — rewritten to emit one snapshot that is the union of the two
   payloads: range + all-time totals, gap-filled day series, hours, per-model
   rollups with buckets, workspaces, streaks, peak hour, coverage; plus
   `collectCalls` with model/provider/threshold filters and newest-first rows.
5. `index-store.ts` — incremental scan kept; persistence replaced with a single
   atomic JSON cache under `DSH_HOME` (no `ctx.storageDomain` dependency), so a
   missing optional service can never stop the panel from loading.
6. `transport.ts` — one prefix: `/snapshot`, `/calls`, `/export.csv`,
   `/export.json`, loopback-only.
7. `types.ts` — the union wire contract.

### Client

Ported the audit plugin's dashboard (sidebar action + `shell.overlay` +
`settings.section`), and added the token plugin's extras that the audit UI
lacked: longest-streak card, peak-hour card, subagent subtitle, per-model bucket
bars, and the homes/coverage footer. The range selector gains **All**. The
transport seam (`source.ts`) points at the unified routes.

The browser half declares its own minimal structural types for the injected
runtime (`src/client/runtime.d.ts`) instead of importing
`@deepseek-ai/dsh-client-runtime`, whose published line no longer matches what
the installed harness ships; everything else stays a `peerDependency` supplied
by the harness.

## Verification strategy

- **Unit** (62 tests): zstd frame scanning, both log decoders (incl. packed
  records, torn tails, foreign versions, resume, and a tail-only on-disk read),
  home discovery, the fold (replace/retry/seed/compaction/calls/timing/effort),
  aggregation (ranges, gap-fill, scope/workspace filters, streaks, peak hour,
  call pagination, session ranking, session filter), pricing (lookup,
  normalization, both file shapes, coverage), i18n parity, and every transport
  route including the session filter's bounds.
- **Real data** (`npm run verify:realdata`): read-only over this machine's
  ~1,200 real sessions in both formats; the folded totals are checked against an
  independently coded per-step usage reconstruction (**exact match, 0 tokens
  delta**), plus a full store scan + persistence round-trip.
- **Build**: `tsdown` emits `lib/index.js` (ESM, `@deepseek-ai/*` external) and
  `lib/client.js` (CJS wrapped in `window.__ModuleLoader__.load`).

## Follow-up pass (v0.2.0)

After living with the merge, the review surfaced four things worth changing:

1. **Two model panels became one.** Each upstream shipped its own model panel —
   share-only vs split-only — and the merge kept both, so the model list
   appeared twice under two headings. They are now one collapsible panel whose
   rows carry the share, the stacked four-bucket bar and the call count, with
   the long tail behind a "show all" toggle.
2. **Collapsible panels.** Every large panel (trend, models, breakdown, session
   ranking, call details) now collapses from its header, with the flag kept in a
   module store so it survives the overlay unmounting and so the session
   drill-down can force the call table open.
3. **Session ranking + drill-down.** `aggregate.ts` gained `sessionRowsFor`,
   reusing the fold's per-session counters; the drill-down reuses the existing
   `/calls` route with a `session` filter rather than a second detail view that
   could disagree with the first.
4. **Optional cost.** `pricing.ts` reads a local pricing table; `priced`
   coverage is tracked so an unmatched model is reported as unpriced rather than
   free. `scripts/setup-pricing.mjs` generates the table from CC Switch.
   Also removed dead heatmap/bar-chart CSS and the now-unused dictionary keys.

Performance work in the same pass: the scan now decodes with bounded
concurrency (default 4 — measured: 2–4 lanes is the sweet spot, 8+ regresses),
a resume reads only the appended tail instead of the whole log, and the index is
persisted only when it actually changed (it used to rewrite ~20 MB every refresh
interval). Async `zlib.zstdDecompress` was measured and rejected: per-frame
`await` overhead made it ~2× **slower** than the synchronous path.

## Known trade-offs (inherited, disclosed in the UI)

- Retried steps keep only the final usage report; the replaced attempt was
  billed but is gone from the log. Surfaced as `retried` in the footer.
- A bounded range excludes tokens whose timestamps fail the clock-skew guard,
  so it can total less than all-time.
- The call-detail view is capped by the configurable "detail limit" (default
  1,000, max 10,000) — inherited from the audit plugin.
- Folding ~320 MB of compressed logs takes on the order of minutes on a cold
  index; the panel renders partial results and reports build progress.
