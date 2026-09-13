import Schema from "@deepseek-ai/schemastery";
import { Context } from "@deepseek-ai/cordis";
import { IncomingMessage, ServerResponse } from "node:http";
//#region src/types.d.ts
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
interface Buckets {
  /** Fresh (uncached) prompt tokens. */
  input: number;
  /** Prompt tokens served from the provider's cache. */
  cacheRead: number;
  /** Prompt tokens written into the provider's cache. */
  cacheWrite: number;
  /** Completion tokens, reasoning included. */
  output: number;
}
/** Token breakdown as the dashboard consumes it: buckets plus display-only reasoning. */
interface TokenBreakdown extends Buckets {
  /** Subset of `output`; display only. Never added into a total. */
  reasoning: number;
}
/** Activity in one time bucket (a local day, or one local hour of it). */
interface TimeBucket {
  tokens: number;
  messages: number;
}
/** Tokens attributed to one model, at any level of aggregation. */
interface ModelTally {
  buckets: Buckets;
  /** Subset of `buckets.output`; display only. */
  reasoning: number;
  /** Number of provider usage samples that landed here. */
  samples: number;
}
/** Per-model rollup as presented to the UI (audit-plugin naming kept). */
interface ModelStats extends TokenBreakdown {
  /** `provider/model`, the attribution key. */
  key: string;
  provider: string;
  model: string;
  /** Sum of the four disjoint buckets. */
  tokens: number;
  /** Number of usage samples attributed to this model. */
  calls: number;
  /** Share of the enclosing total, 0-100. */
  percent: number;
}
/** One local calendar day of activity, gap-free for a bounded range. */
interface DayStats extends TokenBreakdown {
  /** 'YYYY-MM-DD' local. */
  date: string;
  tokens: number;
  calls: number;
  messages: number;
  sessions: number;
  /** `provider/model` → tokens attributed to that model on this day. */
  models: Record<string, number>;
}
/** One assistant (or compaction) call row served by the `/calls` route. */
interface CallRecord {
  /** Stable identity: `${sessionId}:${seq}`. */
  key: string;
  seq: number;
  time: number;
  sessionId: string;
  /** The dsh home the session was read from. */
  home: string;
  /** Working directory of the session, when recorded. */
  cwd?: string;
  /** True when the session is a delegated/subagent session. */
  subtask: boolean;
  provider: string;
  model: string;
  effort: string | null;
  durationMs: number | null;
  tokens: TokenBreakdown;
}
/** Paginated payload served by `/calls`. */
interface CallsPage {
  indexReady: boolean;
  items: CallRecord[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
/** One dsh home the index scanned. */
interface HomeInfo {
  /** The home directory as discovered (e.g. `~/.dsh_desktop/0.1.5-rc.1`). */
  home: string;
  /** True for the home this process itself is running against. */
  current: boolean;
  /** Sessions found under this home. */
  sessions: number;
  /** Set when the home was found but could not be read (e.g. EACCES). */
  error?: string;
}
/** Facts the UI must disclose rather than silently absorb. */
interface Coverage {
  /** Total model steps observed. */
  steps: number;
  /** Steps that left no provider usage sample — the honest denominator. */
  stepsWithoutUsage: number;
  /** Steps whose second usage sample replaced the first (replaced attempt lost). */
  retriedSteps: number;
  /** Sessions whose log ended inside an incomplete frame. */
  truncatedSessions: number;
  /** Artifacts skipped entirely (unreadable, or a foreign format version). */
  skippedArtifacts: number;
}
/** Index build phase, surfaced so the panel never lies about being complete. */
type IndexPhase = 'idle' | 'building' | 'ready' | 'error';
/** Progress and durability of the host-side index. */
interface IndexStatus {
  phase: IndexPhase;
  /** Sessions folded so far. */
  indexed: number;
  /** Sessions discovered; equals `indexed` once `phase` is 'ready'. */
  total: number;
  /** False when durable storage is unavailable and the index is memory-only. */
  durable: boolean;
  /** Epoch ms of the last completed refresh, or null before the first one. */
  updatedAt: number | null;
  /** Operator-facing detail; present when `phase` is 'error'. */
  message?: string;
}
/** Aggregate totals for one window. */
interface TokenTotals extends TokenBreakdown {
  /** Sum of the four disjoint buckets (includes cache reads). */
  tokens: number;
  /** Top-level sessions with work; subagents are counted separately. */
  sessions: number;
  /** Subagent sessions; their tokens ARE in the totals. */
  subagentSessions: number;
  /** Headline message count: human + non-empty assistant. */
  messages: number;
  humanMessages: number;
  assistantMessages: number;
  toolResults: number;
  activeDays: number;
  currentStreak: number;
  /** The longest run of consecutive active days ever, not just in the window. */
  longestStreak: number;
  /** Local hour 0-23 with the most messages, or null when there is no data. */
  peakHour: number | null;
}
/** Time window a snapshot describes. */
interface RangeInfo {
  from: string;
  to: string;
  timeZone: string;
  id: RangeId;
}
/** Requested window: a bounded strip, a year for the heatmap, or all-time. */
type RangeId = 'all' | 'year' | '30d' | '7d';
/** Task scope filter (upstream `dsh-usage-stats`). */
type TaskScope = 'all' | 'main' | 'subtasks';
/** Everything the dashboard renders. Produced by the host, consumed by the browser. */
interface Snapshot {
  /** Wire schema version; the client refuses a value it does not know. */
  version: 1;
  generatedAt: number;
  /** IANA zone used for every day/hour bucket. */
  tz: string;
  range: RangeInfo;
  status: IndexStatus;
  /** Totals inside `range`. */
  totals: TokenTotals;
  /** Authoritative all-time totals, independent of `range`. */
  allTime: {
    totals: TokenTotals;
    mostUsedModel: ModelStats | null;
  };
  /** Most-used model inside `range`. */
  mostUsedModel: ModelStats | null;
  /** 'YYYY-MM-DD' (local) → activity. Gap-free for a bounded range, sparse for all-time. */
  days: DayStats[];
  /** Length 24, indexed by local hour, for the selected range. */
  hours: TimeBucket[];
  /** Sorted by tokens descending, for the selected range. */
  models: ModelStats[];
  /** Distinct working directories seen, with session counts. */
  workspaces: {
    path: string;
    sessions: number;
  }[];
  homes: HomeInfo[];
  coverage: Coverage;
}
/** Failure envelope returned by the transport on a non-200. */
interface ApiError {
  error: string;
}
/** Zeroed buckets. */
declare function zeroBuckets(): Buckets;
/** Zeroed model tally. */
declare function zeroTally(): ModelTally;
/** Sum of the four disjoint buckets. cacheRead is included. */
declare function totalOf(buckets: Buckets): number;
/** Add (or, with `sign` -1, subtract) `source` into `target` in place. */
declare function addBuckets(target: Buckets, source: Buckets, sign?: 1 | -1): void;
/** Add (or subtract) one tally into another in place. */
declare function addTally(target: ModelTally, source: ModelTally, sign?: 1 | -1): void;
//#endregion
//#region src/fold.d.ts
/** Bump when the fold's output shape or counting rules change: forces a full rebuild. */
declare const FOLD_VERSION = 2;
/**
 * Structural stand-in for a decoded session event.
 *
 * Deliberately not a harness type: the fold is a pure function that must run
 * in tests over hand-written fixtures, and every field read is defensive.
 */
interface EventLike {
  type: string;
  seq: number;
  time: number;
  data?: unknown;
}
/** Structural stand-in for the session log's header line. */
interface HeaderLike {
  version: number;
  id: string;
  createdAt: number;
  cwd?: string;
  origin?: string;
  parentSession?: string;
  delegationDepth?: number;
  seedLength?: number;
  isSeeded?: boolean;
}
/** One day of a single session, kept so a bounded range is a real sum. */
interface DaySlice extends TimeBucket {
  /** Human messages; `messages - human` is the assistant share. */
  human: number;
  /** Tool results, kept out of `messages` and added only into the surface count. */
  tools: number;
  /** Model steps that ended on this day. */
  steps: number;
  /** Of those, steps that left no provider usage sample. */
  stepsWithoutUsage: number;
  /** Of those, steps whose usage sample was replaced by a differing one. */
  retriedSteps: number;
  /** Local hour ('0'..'23') → activity. Sparse: absent hours had none. */
  hours: Record<string, TimeBucket>;
  /** `provider/model` → tokens attributed to that model on this day. */
  models: Record<string, ModelTally>;
}
/** One call row as stored inside a session fold (session context added later). */
interface FoldCall {
  seq: number;
  time: number;
  /** Local day the call landed on, or null when its timestamp failed the skew guard. */
  day: string | null;
  provider: string;
  model: string;
  effort: string | null;
  durationMs: number | null;
  buckets: Buckets;
  reasoning: number;
  /** True for a compaction-summary call rather than a chat completion. */
  compaction: boolean;
}
/** One session's accounting. Plain JSON — this is what the index persists. */
interface SessionFold {
  id: string;
  /** The `sessionsRoot` this session was read from; part of the index key. */
  home: string;
  cwd?: string;
  createdAt: number;
  /** 'subagent' for a delegated session; absent for top-level and forks. */
  origin?: string;
  parentSession?: string;
  delegationDepth: number;
  seedLength: number;
  /** True when the log ended inside an incomplete frame. */
  truncated: boolean;
  /** Authoritative session total, including tokens whose timestamps were rejected. */
  totals: Buckets;
  /** Subset of `totals.output`; display only. */
  reasoningTokens: number;
  /** Authoritative per-model tallies, kept alongside the day slices. */
  models: Record<string, ModelTally>;
  /** 'YYYY-MM-DD' (local) → that day's slice. */
  days: Record<string, DaySlice>;
  /** `${turn}:${step}` or `c:${n}` → the surviving call row. */
  calls: Record<string, FoldCall>;
  firstTime: number | null;
  lastTime: number | null;
  humanMessages: number;
  injectedMessages: number;
  assistantMessages: number;
  toolResults: number;
  turns: number;
  steps: number;
  usageSamples: number;
  stepsWithoutUsage: number;
  retriedSteps: number;
  compactionCalls: number;
}
/** One provider usage report, remembered so a later one for the same step can replace it. */
interface UsageSample {
  callKey: string;
  turn: number;
  step: number;
  seq: number;
  time: number;
  key: string;
  buckets: Buckets;
  reasoning: number;
  durationMs: number | null;
  effort: string | null;
  day: string | null;
  hour: number | null;
}
/** Mid-log state a resumed fold needs; meaningless on its own. */
interface FoldCarry {
  /** Last announced `provider/model` route, used when a message carries none. */
  routeKey: string;
  /** Turn of the last `step/end`, for turn counting across a resume. */
  lastTurn: number | null;
  /** The single live usage slot, per the replace-not-add discipline. */
  last: UsageSample | null;
  /** The open step, for pairing `step/start` → `assistant/message` timing. */
  openStep: {
    turn: number;
    step: number;
    time: number;
  } | null;
  /** Last reasoning effort announced by a `request/header`. */
  currentEffort: string | null;
}
/** A fold in progress. */
interface FoldState {
  fold: SessionFold;
  carry: FoldCarry;
}
/** Knobs the fold needs from the outside world. */
interface FoldOptions {
  /** IANA zone for every day and hour bucket. */
  tz: string;
  /** Reference "now" for the future-skew guard. */
  now: number;
  /** Count `compaction/summary.usage`. Default true. */
  includeCompaction?: boolean;
}
/** Whether a session is a delegated/subagent session (upstream task-scope filter). */
declare function isSubtask(fold: Pick<SessionFold, 'origin' | 'parentSession' | 'delegationDepth'>): boolean;
/** Start a fold for one session. */
declare function createFoldState(header: HeaderLike, home: string): FoldState;
/**
 * Fold a batch of events into an existing state.
 *
 * Safe to call repeatedly with successive batches, which is exactly what the
 * incremental index does: the carry preserves everything a naive restart
 * would lose.
 *
 * @param state - the fold in progress; mutated.
 * @param events - decoded events, in log order.
 * @param options - timezone, reference now, and the compaction switch.
 */
declare function foldEvents(state: FoldState, events: readonly EventLike[], options: FoldOptions): void;
/** Whether a session did anything worth counting as a session. */
declare function hasWork(fold: SessionFold): boolean;
//#endregion
//#region src/index-store.d.ts
/** Tunables the store needs; all sourced from the plugin config. */
interface IndexStoreOptions {
  /** Additional home directories the discovery heuristic cannot find. */
  extraSessionRoots: readonly string[];
  /** Count `compaction/summary.usage` in totals. */
  includeCompaction: boolean;
  /** Cooperative yield interval during a scan, in ms. */
  chunkYieldMs: number;
  /** The home this process is running against. */
  currentHome: string;
  /** Absolute index cache path; defaults to `$DSH_HOME/usage-unified/index-v1.json`. */
  cachePath: string;
  /** Debounce delay before writing the index, in ms. */
  cacheWriteDelayMs: number;
  /** OS home directory the discovery heuristic hangs off; injectable for tests. */
  osHome?: string;
  /** Injectable clock; tests pin it. */
  now?: () => number;
}
/** Query the transport layer asks the store for. */
interface StoreQuery {
  range: RangeId;
  scope: TaskScope;
  workspace?: string;
}
/** Query for the call-detail route. */
interface StoreCallsQuery extends StoreQuery {
  model?: string;
  provider?: string;
  minInputTokens?: number;
  minOutputTokens?: number;
  page: number;
  pageSize: number;
  maxRecords: number;
}
/**
 * Owns the folded index and answers summary/call queries.
 *
 * Single-writer: concurrent `refresh()` calls share one pass. The store never
 * throws out of `refresh()` — a scan failure is reported through `status`, so
 * a transient filesystem problem degrades the panel instead of the plugin.
 */
declare class UnifiedIndexStore {
  private readonly entries;
  private readonly options;
  private readonly now;
  private meta;
  private running;
  private loading;
  private writeTimer;
  private disposed;
  private homeInfos;
  private skippedArtifacts;
  private state;
  constructor(options: IndexStoreOptions);
  /** Current build phase and progress. */
  get status(): IndexStatus;
  /** Stop the in-flight scan and refuse further work. */
  dispose(): void;
  /** Load a previous cache; a meta/fold mismatch discards it rather than migrating. */
  load(): Promise<void>;
  /**
   * Bring the index up to date.
   *
   * Concurrent callers join the running pass rather than starting a second one.
   */
  refresh(): Promise<void>;
  /** Load the previous cache exactly once, before the first scan. */
  private ensureLoaded;
  /**
   * Build a snapshot from what the index currently holds, synchronously.
   *
   * @param query - the window, scope and workspace to report.
   */
  snapshot(query: StoreQuery): Snapshot;
  /**
   * Paginate the call-detail rows.
   *
   * @param query - window, scope, workspace, filters and pagination.
   */
  calls(query: StoreCallsQuery): CallsPage;
  /** Total tokens across all indexed sessions — cheap enough for the CSV export. */
  exportRows(query: StoreQuery): Promise<{
    days: Snapshot['days'];
    models: Snapshot['models'];
  }>;
  private scan;
  private foldArtifact;
  private scheduleWrite;
  private persist;
  /** Flush the index immediately; used on host disposal. */
  flush(): Promise<void>;
}
//#endregion
//#region src/transport.d.ts
/** Minimal view of the route registry this module needs. */
interface WebServerLike {
  register(route: {
    kind: 'exact' | 'prefix';
    path: string;
    handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
  }): () => void;
}
/**
 * Serve the unified routes.
 *
 * @param webServer - `ctx.webServer`.
 * @param store - the index answering every query.
 * @param apiPath - the same-origin prefix, without a trailing slash.
 * @returns the disposer removing the route.
 */
declare function registerRoutes(webServer: WebServerLike, store: UnifiedIndexStore, apiPath: string): () => void;
/** The path segment the snapshot route answers on, for the client's reference. */
declare const DEFAULT_API_PATH = "/usage-unified/v1";
//#endregion
//#region src/aggregate.d.ts
/** Today-inclusive day bounds for a bounded range. */
declare function rangeBounds(range: Exclude<RangeId, 'all'>, today: string): {
  from: string;
  to: string;
};
/** Active-day count and the two streak lengths. */
interface Streaks {
  active: number;
  current: number;
  longest: number;
}
/**
 * Compute streaks over ascending, de-duplicated day keys.
 *
 * The current streak counts only when it reaches today or yesterday —
 * otherwise a run that ended last month would read as "current".
 */
declare function streaks(sortedDays: readonly string[], today: string): Streaks;
/** The query a snapshot answers. */
interface SnapshotQuery {
  /** Inclusive lower day bound; ignored when `range` is 'all'. */
  from: string;
  /** Inclusive upper day bound; ignored when `range` is 'all'. */
  to: string;
  timeZone: string;
  range: RangeId;
  scope: TaskScope;
  workspace?: string;
  /** Reference time; defaults to now. */
  now?: number;
}
/** The snapshot body before the store attaches status/homes/coverage extras. */
interface AggregateResult {
  tz: string;
  range: RangeId;
  from: string;
  to: string;
  totals: TokenTotals;
  allTime: {
    totals: TokenTotals;
    mostUsedModel: ModelStats | null;
  };
  mostUsedModel: ModelStats | null;
  days: DayStats[];
  hours: TimeBucket[];
  models: ModelStats[];
  workspaces: {
    path: string;
    sessions: number;
  }[];
  coverage: Omit<Coverage, 'skippedArtifacts'>;
}
/** Local hour 0-23 with the most messages, tie-broken by tokens; null when empty. */
declare function peakHourOf(hours: readonly TimeBucket[]): number | null;
/**
 * Aggregate folded sessions into one snapshot body.
 *
 * @param input - one fold per session artifact; duplicates across homes removed here.
 * @param query - the window, scope and workspace to report.
 */
declare function aggregateSnapshot(input: readonly SessionFold[], query: SnapshotQuery): AggregateResult;
/** Filters for the call-detail route. */
interface CallsQuery extends SnapshotQuery {
  model?: string;
  provider?: string;
  minInputTokens?: number;
  minOutputTokens?: number;
  maxRecords: number;
}
/**
 * Flatten every session's calls into newest-first rows.
 *
 * @param input - folded sessions.
 * @param query - window and filters.
 */
declare function collectCalls(input: readonly SessionFold[], query: CallsQuery): CallRecord[];
/** CSV export of the per-day per-model series, mirroring the audit plugin's columns. */
declare function exportCsv(days: readonly DayStats[], models: readonly ModelStats[]): string;
//#endregion
//#region src/homes.d.ts
/**
 * Enumeration of every dsh home on this machine (decision D1).
 *
 * `ctx.sessionPersistence` is bound to a single root
 * (`packages/bundle/base/cordis.patch.yml:98-101`), so machine-wide statistics
 * cannot go through it. Homes are discovered instead, and de-duplicated by the
 * realpath of their `sessions` directory so an aliased or symlinked home is
 * never counted twice.
 *
 * The `~/.dsh_desktop/<version>` layout is a Desktop-shell invention
 * (deepseek-harness-desktop `src/main/home.ts`), not an upstream contract —
 * hence `extraSessionRoots` in the plugin config for anything this heuristic
 * cannot see (e.g. a custom `$DSH_HOME` used previously but not set now).
 *
 * @module @zoytown/dsh-token/homes
 */
/** One discovered dsh home with a readable sessions directory. */
interface DshHome {
  /** The home directory as discovered; display only. */
  home: string;
  /** realpath'd `<home>/sessions` — THIS is the dedupe identity. */
  sessionsRoot: string;
  /** True for the home this process is running against. */
  current: boolean;
}
/** A home that was found but could not be used. */
interface HomeProblem {
  home: string;
  /** The errno code or message; surfaced to the UI, never fatal. */
  error: string;
}
/** Discovery result: usable homes plus the ones that failed. */
interface HomeDiscovery {
  homes: DshHome[];
  problems: HomeProblem[];
}
/** Where to look. Every source is overridable so discovery can be tested hermetically. */
interface DiscoveryOptions {
  /** The home this process resolved at boot. */
  currentHome: string;
  /** Configured additional home directories. */
  extraRoots?: readonly string[];
  /** Environment to read `DSH_HOME` from. */
  env?: NodeJS.ProcessEnv;
  /** OS home directory; `~/.dsh` and `~/.dsh_desktop` hang off it. */
  osHome?: string;
}
/**
 * Discover every dsh home that has a sessions directory.
 *
 * Candidates are `~/.dsh`, the current home, `$DSH_HOME`, every immediate
 * subdirectory of `~/.dsh_desktop`, and any configured extra roots. A
 * candidate without a `sessions` directory is skipped silently — that is an
 * ordinary state for a freshly created home, not a problem.
 *
 * @param options - where to look.
 * @returns usable homes (deduped by realpath) and unusable ones with a reason.
 */
declare function discoverDshHomes(options: DiscoveryOptions): Promise<HomeDiscovery>;
//#endregion
//#region src/reader.d.ts
/** One session log found on disk. */
interface SessionArtifact {
  /** The home it belongs to. */
  home: DshHome;
  path: string;
  /** Stable identity across homes: `${sessionsRoot} ${project}/${session}`. */
  key: string;
  size: number;
  mtimeMs: number;
  /** Distinguishes an inode swap (atomic republish) from an in-place append. */
  ino: number;
  dev: number;
}
/**
 * Rank a log filename so the newest readable generation wins when a directory
 * holds more than one (a migrated session can briefly keep its predecessor).
 *
 * @param name - a filename matching {@link LOG_PATTERN}.
 * @returns a comparable score; higher is preferred.
 */
declare function logPriority(name: string): number;
/**
 * Walk one home's sessions tree.
 *
 * Unreadable project directories are skipped rather than aborting the walk:
 * a single permission problem must not cost the user every other home.
 *
 * @param home - a home discovered by `discoverDshHomes`.
 * @yields one artifact per session directory that has a log.
 */
declare function walkSessionArtifacts(home: DshHome): AsyncGenerator<SessionArtifact>;
/** Decoded slice of one artifact. */
interface ArtifactRead {
  /** The header line carried by the log. */
  header: HeaderLike;
  events: EventLike[];
  /** Byte offset just past the last COMPLETE frame — the resume cursor. */
  cursor: number;
  /** True when the buffer ended inside a frame (a live writer mid-batch). */
  torn: boolean;
  /** True when the header's format version is newer than this build can read. */
  foreign: boolean;
}
/**
 * Decode artifact bytes into session events.
 *
 * @param bytes - the whole file, or the tail slice starting at `fromCursor`.
 * @param compressed - whether the path ends in `.zstd`.
 * @param fromCursor - byte offset `bytes` begins at; 0 for a full read.
 * @param cachedHeader - required when `fromCursor > 0`; the header line lives
 * in the first frame and is therefore absent from any tail slice.
 * @returns the decoded events plus the next resume cursor.
 * @throws when the container is structurally corrupt, or a full read finds no
 * header line — both are conditions the caller must see, not paper over.
 */
declare function decodeArtifactBytes(bytes: Buffer, compressed: boolean, fromCursor?: number, cachedHeader?: HeaderLike): ArtifactRead;
/**
 * Read an artifact, optionally resuming from a stored cursor.
 *
 * Resuming is sound because container frames are independently decodable, so
 * a tail slice starting at a frame boundary decodes to exactly the frames
 * appended since.
 *
 * @param path - absolute artifact path.
 * @param fromCursor - byte offset to resume from; 0 reads everything.
 * @param cachedHeader - the header from the initial full read, when resuming.
 */
declare function readArtifact(path: string, fromCursor: number, cachedHeader?: HeaderLike): Promise<ArtifactRead>;
//#endregion
//#region src/zstd-frames.d.ts
/**
 * Frame scanner for the session-log container.
 *
 * PORTED — verbatim in behaviour from deepseek-harness
 * `packages/session/session-persistence-jsonl/src/zstd.ts:48-104` (MIT).
 * This is the only upstream logic this package reimplements, and it is not
 * optional: `session.jsonl.zstd` is a container of CONCATENATED, independently
 * decodable frames (one per durable append batch), and Node's own zstd APIs
 * stop at the first one — measured on Node 22.22.3, a 232,794-byte / 482-frame
 * artifact yields 209 bytes from both `zstdDecompressSync` and
 * `createZstdDecompress()`.
 *
 * Independent decodability is also what makes the incremental cursor sound:
 * a tail slice starting at a previously recorded frame boundary decodes to
 * exactly the frames appended since.
 *
 * The container carries no version of its own — the JSONL header line does.
 * Callers MUST gate on `header.version === SESSION_FORMAT_VERSION`.
 *
 * @module @zoytown/dsh-token/zstd-frames
 */
/** Byte range of one complete frame, `end` exclusive. */
interface ZstdFrameRange {
  start: number;
  end: number;
}
/** Result of scanning a buffer for frame boundaries. */
interface ZstdFrameScan {
  /** Complete frames, in order. */
  frames: ZstdFrameRange[];
  /**
   * Offset where an incomplete trailing frame begins, when the buffer ended
   * mid-frame (a live writer between batches). Callers drop it and must never
   * advance a stored cursor into it.
   */
  tornStart?: number;
}
/**
 * Locate every complete Zstandard frame in `buffer`.
 * @param buffer - the artifact bytes, or a tail slice of them.
 * @param maxFrames - stop after this many frames (header-only probes pass 1).
 * @returns the complete frames plus the torn-tail offset when one exists.
 * @throws when a frame header is structurally invalid — that is corruption,
 * not a torn tail, and must not be silently treated as end-of-data.
 */
declare function scanZstdFrames(buffer: Buffer, maxFrames?: number): ZstdFrameScan;
//#endregion
//#region src/index.d.ts
declare const name = "usage-unified";
/** Plugin configuration. */
interface Config {
  /**
   * Extra dsh home directories to scan. Home discovery is a heuristic over
   * `~/.dsh`, `~/.dsh_desktop/<version>` and `$DSH_HOME`, not a documented
   * contract, so a home reached through a `$DSH_HOME` that is not currently
   * set is invisible to it — list it here.
   */
  extraSessionRoots: string[];
  /**
   * Count the tokens spent generating compaction summaries. They are real
   * spend the upstream `tokenUsage` projection cannot see; set false to
   * reconcile 1:1 with it.
   */
  includeCompaction: boolean;
  /** How often to re-scan for appended sessions, in ms. */
  refreshIntervalMs: number;
  /** Cooperative yield interval while scanning, so a cold build stays responsive. */
  indexChunkYieldMs: number;
  /** Same-origin read-only API prefix. */
  apiPath: string;
  /** Optional index cache path; defaults below `DSH_HOME`. */
  cachePath?: string;
  /** Debounce delay for index writes, in ms. */
  cacheWriteDelayMs: number;
}
declare const Config: Schema<Config>;
/**
 * Mount the index and its transport.
 * @param ctx - the plugin context.
 * @param config - validated configuration.
 */
declare function apply(ctx: Context, config: Config): void;
//#endregion
export { ApiError, Buckets, CallRecord, CallsPage, Config, Coverage, DEFAULT_API_PATH, DayStats, FOLD_VERSION, HomeInfo, IndexPhase, IndexStatus, ModelStats, ModelTally, RangeId, RangeInfo, Snapshot, TaskScope, TimeBucket, TokenBreakdown, TokenTotals, UnifiedIndexStore, addBuckets, addTally, aggregateSnapshot, apply, collectCalls, createFoldState, decodeArtifactBytes, discoverDshHomes, exportCsv, foldEvents, hasWork, isSubtask, logPriority, name, peakHourOf, rangeBounds, readArtifact, registerRoutes, scanZstdFrames, streaks, totalOf, walkSessionArtifacts, zeroBuckets, zeroTally };