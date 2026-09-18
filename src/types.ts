/**
 * Wire types shared by the host half and the browser half.
 *
 * This module is the transport contract. It imports nothing — the browser
 * bundle inlines it, and keeping it dependency-free is what lets the two
 * halves stay type-safe without a code generator.
 *
 * It is the union of the two upstream plugins' payloads:
 *  - the machine-wide accounting vocabulary from `@zoytown/dsh-token`
 *    (`Buckets`, streaks, peak hour, coverage, homes), and
 *  - the dashboard vocabulary from `dsh-usage-stats` (per-day series, per-model
 *    rollups, per-call rows, workspaces, CSV/JSON export).
 *
 * @module dsh-usage-unified/types
 */

/**
 * The four DISJOINT provider-reported token buckets.
 *
 * Counts are DISJOINT (billed input = input + cacheRead + cacheWrite), which is
 * what makes summing them a total rather than a double count. `reasoning` is a
 * SUBSET of `output` and is carried separately for display only.
 */
export interface Buckets {
  /** Fresh (uncached) prompt tokens. */
  input: number
  /** Prompt tokens served from the provider's cache. */
  cacheRead: number
  /** Prompt tokens written into the provider's cache. */
  cacheWrite: number
  /** Completion tokens, reasoning included. */
  output: number
}

/** Token breakdown as the dashboard consumes it: buckets plus display-only reasoning. */
export interface TokenBreakdown extends Buckets {
  /** Subset of `output`; display only. Never added into a total. */
  reasoning: number
}

/**
 * Cost estimate fields, present only when a local pricing table resolved the
 * model. `priced: false` means the tokens are deliberately excluded from the
 * estimate rather than counted as free.
 */
export interface Costed {
  /** Estimated USD for this row; absent when the model has no price. */
  costUsd?: number
  /** False when the row's model was missing from the pricing table. */
  priced?: boolean
}

/** Activity in one time bucket (a local day, or one local hour of it). */
export interface TimeBucket {
  tokens: number
  messages: number
}

/** Tokens attributed to one model, at any level of aggregation. */
export interface ModelTally {
  buckets: Buckets
  /** Subset of `buckets.output`; display only. */
  reasoning: number
  /** Number of provider usage samples that landed here. */
  samples: number
}

/** Per-model rollup as presented to the UI (audit-plugin naming kept). */
export interface ModelStats extends TokenBreakdown, Costed {
  /** `provider/model`, the attribution key. */
  key: string
  provider: string
  model: string
  /** Sum of the four disjoint buckets. */
  tokens: number
  /** Number of usage samples attributed to this model. */
  calls: number
  /** Share of the enclosing total, 0-100. */
  percent: number
}

/**
 * One session's roll-up, for the ranking panel and its drill-down.
 *
 * Token figures follow the enclosing window, so a bounded range ranks sessions
 * by what they spent inside it rather than by their lifetime total.
 */
export interface SessionStats extends TokenBreakdown, Costed {
  /** Normalized session id; also the `/calls?session=` filter value. */
  sessionId: string
  /** The dsh home the session was read from. */
  home: string
  /** Working directory, when the session recorded one. */
  cwd?: string
  /** True for a delegated/subagent session. */
  subtask: boolean
  /** Session creation time from the log header. */
  createdAt: number
  /** First and last event timestamps, or null when none passed the skew guard. */
  startTime: number | null
  endTime: number | null
  tokens: number
  /** Surviving call rows in the window. */
  calls: number
  /** Human + non-empty assistant messages in the window. */
  messages: number
  /** Attribution key of the busiest model, or the unknown key. */
  topModel: string
  topModelProvider: string
  /** Tokens attributed to `topModel`. */
  topModelTokens: number
  /** Distinct models this session used in the window. */
  modelCount: number
}

/** One local calendar day of activity, gap-free for a bounded range. */
export interface DayStats extends TokenBreakdown {
  /** 'YYYY-MM-DD' local. */
  date: string
  tokens: number
  calls: number
  messages: number
  sessions: number
  /** `provider/model` → tokens attributed to that model on this day. */
  models: Record<string, number>
}

/** One assistant (or compaction) call row served by the `/calls` route. */
export interface CallRecord {
  /** Stable identity: `${sessionId}:${seq}`. */
  key: string
  seq: number
  time: number
  sessionId: string
  /** The dsh home the session was read from. */
  home: string
  /** Working directory of the session, when recorded. */
  cwd?: string
  /** True when the session is a delegated/subagent session. */
  subtask: boolean
  provider: string
  model: string
  effort: string | null
  durationMs: number | null
  tokens: TokenBreakdown
}

/** Paginated payload served by `/calls`. */
export interface CallsPage {
  indexReady: boolean
  items: CallRecord[]
  page: number
  pageSize: number
  total: number
  hasMore: boolean
}

/** One dsh home the index scanned. */
export interface HomeInfo {
  /** The home directory as discovered (e.g. `~/.dsh_desktop/0.1.5-rc.1`). */
  home: string
  /** True for the home this process itself is running against. */
  current: boolean
  /** Sessions found under this home. */
  sessions: number
  /** Set when the home was found but could not be read (e.g. EACCES). */
  error?: string
}

/** Facts the UI must disclose rather than silently absorb. */
export interface Coverage {
  /** Total model steps observed. */
  steps: number
  /** Steps that left no provider usage sample — the honest denominator. */
  stepsWithoutUsage: number
  /** Steps whose second usage sample replaced the first (replaced attempt lost). */
  retriedSteps: number
  /** Sessions whose log ended inside an incomplete frame. */
  truncatedSessions: number
  /** Artifacts skipped entirely (unreadable, or a foreign format version). */
  skippedArtifacts: number
}

/** Index build phase, surfaced so the panel never lies about being complete. */
export type IndexPhase = 'idle' | 'building' | 'ready' | 'error'

/** Progress and durability of the host-side index. */
export interface IndexStatus {
  phase: IndexPhase
  /** Sessions folded so far. */
  indexed: number
  /** Sessions discovered; equals `indexed` once `phase` is 'ready'. */
  total: number
  /** False when durable storage is unavailable and the index is memory-only. */
  durable: boolean
  /** Epoch ms of the last completed refresh, or null before the first one. */
  updatedAt: number | null
  /** Operator-facing detail; present when `phase` is 'error'. */
  message?: string
}

/** Aggregate totals for one window. */
export interface TokenTotals extends TokenBreakdown {
  /** Sum of the four disjoint buckets (includes cache reads). */
  tokens: number
  /** Top-level sessions with work; subagents are counted separately. */
  sessions: number
  /** Subagent sessions; their tokens ARE in the totals. */
  subagentSessions: number
  /** Headline message count: human + non-empty assistant. */
  messages: number
  humanMessages: number
  assistantMessages: number
  toolResults: number
  activeDays: number
  currentStreak: number
  /** The longest run of consecutive active days ever, not just in the window. */
  longestStreak: number
  /** Local hour 0-23 with the most messages, or null when there is no data. */
  peakHour: number | null
}

/** Time window a snapshot describes. */
export interface RangeInfo {
  from: string
  to: string
  timeZone: string
  id: RangeId
}

/** Requested window: a bounded strip or all-time. */
export type RangeId = 'all' | '30d' | '7d'

/** Task scope filter (upstream `dsh-usage-stats`). */
export type TaskScope = 'all' | 'main' | 'subtasks'

/** Everything the dashboard renders. Produced by the host, consumed by the browser. */
export interface Snapshot {
  /** Wire schema version; the client refuses a value it does not know. */
  version: 1
  generatedAt: number
  /** IANA zone used for every day/hour bucket. */
  tz: string
  range: RangeInfo
  status: IndexStatus

  /** Totals inside `range`. */
  totals: TokenTotals
  /** Authoritative all-time totals, independent of `range`. */
  allTime: { totals: TokenTotals; mostUsedModel: ModelStats | null }
  /** Most-used model inside `range`. */
  mostUsedModel: ModelStats | null

  /** 'YYYY-MM-DD' (local) → activity. Gap-free for a bounded range, sparse for all-time. */
  days: DayStats[]
  /** Length 24, indexed by local hour, for the selected range. */
  hours: TimeBucket[]
  /** Sorted by tokens descending, for the selected range. */
  models: ModelStats[]
  /** Distinct working directories seen, with session counts. */
  workspaces: { path: string; sessions: number }[]
  /** Top sessions by tokens in the range, capped; `sessionTotal` is the real count. */
  sessions: SessionStats[]
  /** Distinct sessions with work in the range. */
  sessionTotal: number
  /** Cost estimate from the optional local pricing table; null when absent. */
  cost: CostSummary | null

  homes: HomeInfo[]
  coverage: Coverage
}

/** Cost estimate roll-up, disclosed beside the number it explains. */
export interface CostSummary {
  currency: 'USD'
  total: number
  /** Tokens whose model had a price. */
  pricedTokens: number
  /** Tokens whose model had no price — excluded, never treated as free. */
  unpricedTokens: number
  /** Provenance label of the pricing table. */
  source: string
  /** Epoch ms the pricing source changed, or null when unknown. */
  updatedAt: number | null
  /**
   * Share of usage assumed to fall in the provider's peak window, 0-1, for
   * models priced with two time-of-day tiers. Disclosed because the estimate
   * depends on it.
   */
  peakShare?: number
}

/** Failure envelope returned by the transport on a non-200. */
export interface ApiError {
  error: string
}

/** Zeroed buckets. */
export function zeroBuckets(): Buckets {
  return { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 }
}

/** Zeroed model tally. */
export function zeroTally(): ModelTally {
  return { buckets: zeroBuckets(), reasoning: 0, samples: 0 }
}

/** Sum of the four disjoint buckets. cacheRead is included. */
export function totalOf(buckets: Buckets): number {
  return buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output
}

/** Add (or, with `sign` -1, subtract) `source` into `target` in place. */
export function addBuckets(target: Buckets, source: Buckets, sign: 1 | -1 = 1): void {
  target.input += sign * source.input
  target.cacheRead += sign * source.cacheRead
  target.cacheWrite += sign * source.cacheWrite
  target.output += sign * source.output
}

/** Add (or subtract) one tally into another in place. */
export function addTally(target: ModelTally, source: ModelTally, sign: 1 | -1 = 1): void {
  addBuckets(target.buckets, source.buckets, sign)
  target.reasoning += sign * source.reasoning
  target.samples += sign * source.samples
}
