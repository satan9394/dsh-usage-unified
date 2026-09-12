/**
 * The fold: session events → one session's token accounting, plus its call rows.
 *
 * Pure and resumable. Pure so it can be unit-tested against fixtures and
 * re-run identically; resumable because the incremental index appends only
 * the frames written since the last pass, and the carried mid-log state
 * (`routeKey`, `lastTurn`, `last`, `openStep`, `currentEffort`) must survive
 * that boundary or a tail refold would silently mis-attribute what it sees.
 *
 * Counting discipline:
 *  - The four buckets are DISJOINT; `reasoningTokens` is a subset of output.
 *  - A usage sample arrives twice per step — once as `assistant/chunk`
 *    `{type:'usage'}` during streaming, once on `assistant/message` — so
 *    samples are keyed by (turn, step) and REPLACED, never accumulated.
 *  - One call row is kept per (turn, step): the surviving sample. A compaction
 *    summary is its own call. This is what the Calls detail table enumerates.
 *  - Fork children persist the parent's seed verbatim; events below
 *    `header.seedLength` are not ours to count.
 *  - `compaction/summary` carries real spend the upstream `tokenUsage`
 *    projection cannot see; counted by default, switchable for reconciliation.
 *
 * @module dsh-usage-unified/fold
 */

import {
  addBuckets,
  totalOf,
  zeroBuckets,
  zeroTally,
  type Buckets,
  type ModelTally,
  type TimeBucket,
} from './types.ts'

/** Bump when the fold's output shape or counting rules change: forces a full rebuild. */
export const FOLD_VERSION = 2

/** Anything before this is clock skew, not history. */
const MIN_EVENT_TIME = Date.UTC(2015, 0, 1)

/** One day of tolerance for a clock that runs ahead. */
const FUTURE_SLACK_MS = 86_400_000

/** Attribution key used when no route has been announced yet. */
export const UNKNOWN_MODEL_KEY = 'unknown/unknown'

/**
 * Structural stand-in for a decoded session event.
 *
 * Deliberately not a harness type: the fold is a pure function that must run
 * in tests over hand-written fixtures, and every field read is defensive.
 */
export interface EventLike {
  type: string
  seq: number
  time: number
  data?: unknown
}

/** Structural stand-in for the session log's header line. */
export interface HeaderLike {
  version: number
  id: string
  createdAt: number
  cwd?: string
  origin?: string
  parentSession?: string
  delegationDepth?: number
  seedLength?: number
  isSeeded?: boolean
}

/** One day of a single session, kept so a bounded range is a real sum. */
export interface DaySlice extends TimeBucket {
  /** Human messages; `messages - human` is the assistant share. */
  human: number
  /** Tool results, kept out of `messages` and added only into the surface count. */
  tools: number
  /** Model steps that ended on this day. */
  steps: number
  /** Of those, steps that left no provider usage sample. */
  stepsWithoutUsage: number
  /** Of those, steps whose usage sample was replaced by a differing one. */
  retriedSteps: number
  /** Local hour ('0'..'23') → activity. Sparse: absent hours had none. */
  hours: Record<string, TimeBucket>
  /** `provider/model` → tokens attributed to that model on this day. */
  models: Record<string, ModelTally>
}

/** One call row as stored inside a session fold (session context added later). */
export interface FoldCall {
  seq: number
  time: number
  /** Local day the call landed on, or null when its timestamp failed the skew guard. */
  day: string | null
  provider: string
  model: string
  effort: string | null
  durationMs: number | null
  buckets: Buckets
  reasoning: number
  /** True for a compaction-summary call rather than a chat completion. */
  compaction: boolean
}

/** One session's accounting. Plain JSON — this is what the index persists. */
export interface SessionFold {
  id: string
  /** The `sessionsRoot` this session was read from; part of the index key. */
  home: string
  cwd?: string
  createdAt: number
  /** 'subagent' for a delegated session; absent for top-level and forks. */
  origin?: string
  parentSession?: string
  delegationDepth: number
  seedLength: number
  /** True when the log ended inside an incomplete frame. */
  truncated: boolean
  /** Authoritative session total, including tokens whose timestamps were rejected. */
  totals: Buckets
  /** Subset of `totals.output`; display only. */
  reasoningTokens: number
  /** Authoritative per-model tallies, kept alongside the day slices. */
  models: Record<string, ModelTally>
  /** 'YYYY-MM-DD' (local) → that day's slice. */
  days: Record<string, DaySlice>
  /** `${turn}:${step}` or `c:${n}` → the surviving call row. */
  calls: Record<string, FoldCall>
  firstTime: number | null
  lastTime: number | null
  humanMessages: number
  injectedMessages: number
  assistantMessages: number
  toolResults: number
  turns: number
  steps: number
  usageSamples: number
  stepsWithoutUsage: number
  retriedSteps: number
  compactionCalls: number
}

/** One provider usage report, remembered so a later one for the same step can replace it. */
export interface UsageSample {
  callKey: string
  turn: number
  step: number
  seq: number
  time: number
  key: string
  buckets: Buckets
  reasoning: number
  durationMs: number | null
  effort: string | null
  day: string | null
  hour: number | null
}

/** Mid-log state a resumed fold needs; meaningless on its own. */
export interface FoldCarry {
  /** Last announced `provider/model` route, used when a message carries none. */
  routeKey: string
  /** Turn of the last `step/end`, for turn counting across a resume. */
  lastTurn: number | null
  /** The single live usage slot, per the replace-not-add discipline. */
  last: UsageSample | null
  /** The open step, for pairing `step/start` → `assistant/message` timing. */
  openStep: { turn: number; step: number; time: number } | null
  /** Last reasoning effort announced by a `request/header`. */
  currentEffort: string | null
}

/** A fold in progress. */
export interface FoldState {
  fold: SessionFold
  carry: FoldCarry
}

/** Knobs the fold needs from the outside world. */
export interface FoldOptions {
  /** IANA zone for every day and hour bucket. */
  tz: string
  /** Reference "now" for the future-skew guard. */
  now: number
  /** Count `compaction/summary.usage`. Default true. */
  includeCompaction?: boolean
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** Non-negative integer coercion; a malformed count contributes zero, never NaN. */
function count(value: unknown): number {
  const n = asFiniteNumber(value)
  return n !== undefined && n >= 0 ? Math.trunc(n) : 0
}

/** Project a provider usage report onto the four disjoint buckets. */
function bucketsFromUsage(usage: Record<string, unknown>): Buckets {
  return {
    input: count(usage['inputTokens']),
    cacheRead: count(usage['cacheReadTokens']),
    cacheWrite: count(usage['cacheWriteTokens']),
    output: count(usage['outputTokens']),
  }
}

function bucketsEqual(a: Buckets, b: Buckets): boolean {
  return a.input === b.input && a.cacheRead === b.cacheRead
    && a.cacheWrite === b.cacheWrite && a.output === b.output
}

/** Local calendar key for an epoch, or null when the timestamp fails the skew guard. */
export type DayKeyer = (time: number) => { day: string; hour: number } | null

/**
 * Build a local-calendar keyer using `Intl`, so an evening's work lands on the
 * correct local day rather than a UTC one.
 *
 * @param tz - IANA zone.
 * @param now - reference time for the future-skew guard.
 */
export function makeDayKeyer(tz: string, now: number): DayKeyer {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  })
  return time => {
    if (!Number.isFinite(time) || time < MIN_EVENT_TIME || time > now + FUTURE_SLACK_MS) return null
    const parts = format.formatToParts(time)
    const pick = (type: string): string => parts.find(part => part.type === type)?.value ?? ''
    const hour = Number(pick('hour')) % 24
    if (!Number.isInteger(hour)) return null
    return { day: `${pick('year')}-${pick('month')}-${pick('day')}`, hour }
  }
}

/** The local calendar day of `now`. */
export function todayKey(tz: string, now: number): string {
  return makeDayKeyer(tz, now)(now)?.day ?? new Date(now).toISOString().slice(0, 10)
}

/** Whether a session is a delegated/subagent session (upstream task-scope filter). */
export function isSubtask(fold: Pick<SessionFold, 'origin' | 'parentSession' | 'delegationDepth'>): boolean {
  return fold.origin === 'subagent' || fold.parentSession !== undefined || fold.delegationDepth > 0
}

function emptyDaySlice(): DaySlice {
  return {
    tokens: 0,
    messages: 0,
    human: 0,
    tools: 0,
    steps: 0,
    stepsWithoutUsage: 0,
    retriedSteps: 0,
    hours: {},
    models: {},
  }
}

/** Start a fold for one session. */
export function createFoldState(header: HeaderLike, home: string): FoldState {
  return {
    fold: {
      id: header.id,
      home,
      ...(header.cwd === undefined ? {} : { cwd: header.cwd }),
      createdAt: header.createdAt,
      ...(header.origin === undefined ? {} : { origin: header.origin }),
      ...(header.parentSession === undefined ? {} : { parentSession: header.parentSession }),
      delegationDepth: header.delegationDepth ?? 0,
      seedLength: header.seedLength ?? 0,
      truncated: false,
      totals: zeroBuckets(),
      reasoningTokens: 0,
      models: {},
      days: {},
      calls: {},
      firstTime: null,
      lastTime: null,
      humanMessages: 0,
      injectedMessages: 0,
      assistantMessages: 0,
      toolResults: 0,
      turns: 0,
      steps: 0,
      usageSamples: 0,
      stepsWithoutUsage: 0,
      retriedSteps: 0,
      compactionCalls: 0,
    },
    carry: { routeKey: UNKNOWN_MODEL_KEY, lastTurn: null, last: null, openStep: null, currentEffort: null },
  }
}

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
export function foldEvents(
  state: FoldState,
  events: readonly EventLike[],
  options: FoldOptions,
): void {
  const { fold, carry } = state
  const keyer = makeDayKeyer(options.tz, options.now)
  const countCompaction = options.includeCompaction !== false

  const daySlice = (day: string): DaySlice => {
    const existing = fold.days[day]
    if (existing !== undefined) return existing
    const created = emptyDaySlice()
    fold.days[day] = created
    return created
  }
  const hourBucket = (slice: DaySlice, hour: number): TimeBucket => {
    const key = String(hour)
    const existing = slice.hours[key]
    if (existing !== undefined) return existing
    const created: TimeBucket = { tokens: 0, messages: 0 }
    slice.hours[key] = created
    return created
  }

  const tallyInto = (table: Record<string, ModelTally>, sample: UsageSample, sign: 1 | -1): void => {
    const tally = table[sample.key] ?? zeroTally()
    addBuckets(tally.buckets, sample.buckets, sign)
    tally.reasoning += sign * sample.reasoning
    tally.samples += sign
    table[sample.key] = tally
  }

  /** Apply (sign 1) or undo (sign -1) one usage sample everywhere it landed, calls included. */
  const applySample = (sample: UsageSample, sign: 1 | -1): void => {
    addBuckets(fold.totals, sample.buckets, sign)
    fold.reasoningTokens += sign * sample.reasoning
    tallyInto(fold.models, sample, sign)
    if (sign === 1) {
      const slash = sample.key.indexOf('/')
      fold.calls[sample.callKey] = {
        seq: sample.seq,
        time: sample.time,
        day: sample.day,
        provider: slash < 0 ? 'unknown' : sample.key.slice(0, slash),
        model: slash < 0 ? sample.key : sample.key.slice(slash + 1),
        effort: sample.effort,
        durationMs: sample.durationMs,
        buckets: { ...sample.buckets },
        reasoning: sample.reasoning,
        compaction: sample.callKey.startsWith('c:'),
      }
    } else {
      delete fold.calls[sample.callKey]
    }
    if (sample.day === null) return
    const slice = daySlice(sample.day)
    const tokens = totalOf(sample.buckets)
    slice.tokens += sign * tokens
    tallyInto(slice.models, sample, sign)
    if (sample.hour !== null) hourBucket(slice, sample.hour).tokens += sign * tokens
  }

  const countMessage = (time: number, human: boolean): void => {
    const key = keyer(time)
    if (key === null) return
    const slice = daySlice(key.day)
    slice.messages += 1
    if (human) slice.human += 1
    hourBucket(slice, key.hour).messages += 1
  }

  const countOnDay = (time: number, field: 'tools' | 'steps' | 'stepsWithoutUsage' | 'retriedSteps'): void => {
    const key = keyer(time)
    if (key === null) return
    daySlice(key.day)[field] += 1
  }

  const noteTime = (time: number): void => {
    if (!Number.isFinite(time) || time < MIN_EVENT_TIME || time > options.now + FUTURE_SLACK_MS) return
    if (fold.firstTime === null || time < fold.firstTime) fold.firstTime = time
    if (fold.lastTime === null || time > fold.lastTime) fold.lastTime = time
  }

  for (const event of events) {
    // Fork children carry the parent's log verbatim below this watermark.
    if (event.seq < fold.seedLength) continue
    noteTime(event.time)
    const data = asRecord(event.data)

    switch (event.type) {
      case 'request/context': {
        const provider = asString(data?.['provider'])
        const model = asString(data?.['model'])
        if (provider !== undefined && model !== undefined) carry.routeKey = `${provider}/${model}`
        break
      }
      case 'request/header': {
        const header = asRecord(data?.['header'])
        const config = asRecord(header?.['config'])
        const provider = asString(config?.['provider'])
        const model = asString(config?.['model'])
        if (provider !== undefined && model !== undefined) carry.routeKey = `${provider}/${model}`
        const effort = asString(config?.['reasoningEffort'])
        if (effort !== undefined && effort.length > 0) carry.currentEffort = effort
        break
      }
      case 'step/start': {
        const turn = asFiniteNumber(data?.['turn'])
        const step = asFiniteNumber(data?.['step'])
        if (turn !== undefined && step !== undefined) carry.openStep = { turn, step, time: event.time }
        break
      }
      case 'step/end':
      case 'turn/end': {
        carry.openStep = null
        if (event.type !== 'step/end') break
        fold.steps += 1
        countOnDay(event.time, 'steps')
        const turn = asFiniteNumber(data?.['turn']) ?? null
        if (carry.lastTurn !== turn) {
          fold.turns += 1
          carry.lastTurn = turn
        }
        const step = asFiniteNumber(data?.['step']) ?? null
        const covered = carry.last !== null && carry.last.turn === turn && carry.last.step === step
        if (!covered) {
          fold.stepsWithoutUsage += 1
          countOnDay(event.time, 'stepsWithoutUsage')
        }
        break
      }
      case 'user/message': {
        if (asString(asRecord(data?.['source'])?.['kind']) === 'user') {
          fold.humanMessages += 1
          countMessage(event.time, true)
        } else {
          fold.injectedMessages += 1
        }
        break
      }
      case 'tool/result': {
        fold.toolResults += 1
        countOnDay(event.time, 'tools')
        break
      }
      case 'compaction/summary': {
        fold.compactionCalls += 1
        const usage = asRecord(data?.['usage'])
        if (usage === undefined || !countCompaction) break
        const provider = asString(data?.['provider'])
        const model = asString(data?.['model'])
        const key = keyer(event.time)
        applySample({
          // A compaction call is its own provider request, never a retry of one.
          callKey: `c:${fold.compactionCalls}`,
          turn: -1,
          step: -1,
          seq: event.seq,
          time: event.time,
          key: provider !== undefined && model !== undefined ? `${provider}/${model}` : carry.routeKey,
          buckets: bucketsFromUsage(usage),
          reasoning: count(usage['reasoningTokens']),
          durationMs: null,
          effort: carry.currentEffort,
          day: key?.day ?? null,
          hour: key?.hour ?? null,
        }, 1)
        fold.usageSamples += 1
        break
      }
      default:
        break
    }

    // --- usage samples -------------------------------------------------
    let turn: number
    let step: number
    let usage: Record<string, unknown>
    let modelKey = carry.routeKey
    let fromMessage = false

    if (event.type === 'assistant/chunk') {
      const chunk = asRecord(data?.['chunk'])
      if (asString(chunk?.['type']) !== 'usage') continue
      const reported = asRecord(chunk?.['usage'])
      if (reported === undefined) continue
      turn = asFiniteNumber(data?.['turn']) ?? -1
      step = asFiniteNumber(data?.['step']) ?? -1
      usage = reported
    } else if (event.type === 'assistant/message') {
      fromMessage = true
      const message = asRecord(data?.['message'])
      const source = asRecord(message?.['source'])
      const provider = asString(source?.['provider'])
      const model = asString(source?.['model'])
      // The per-call model beats the announced route: a session may switch.
      if (provider !== undefined && model !== undefined) modelKey = `${provider}/${model}`
      const content = message?.['content']
      // Empty content means the message exists only to host a usage report.
      if (Array.isArray(content) && content.length > 0) {
        fold.assistantMessages += 1
        countMessage(event.time, false)
      }
      const reported = asRecord(data?.['usage'])
      if (reported === undefined) continue
      turn = asFiniteNumber(data?.['turn']) ?? -1
      step = asFiniteNumber(data?.['step']) ?? -1
      usage = reported
    } else {
      continue
    }

    const callKey = `${turn}:${step}`
    const buckets = bucketsFromUsage(usage)
    const reasoning = count(usage['reasoningTokens'])
    const previous = carry.last !== null && carry.last.turn === turn && carry.last.step === step
      ? carry.last
      : null
    // The routine chunk→message repeat reports identical numbers; refine the
    // stored call's timing from the message, then skip an undo/redo churn.
    if (previous !== null && previous.key === modelKey && bucketsEqual(previous.buckets, buckets)) {
      if (fromMessage) {
        const open = carry.openStep
        const stored = fold.calls[callKey]
        if (stored !== undefined) {
          stored.seq = event.seq
          stored.time = event.time
          stored.effort = carry.currentEffort
          stored.durationMs = open !== null && open.turn === turn && open.step === step
            ? Math.max(0, event.time - open.time)
            : stored.durationMs
        }
        previous.seq = event.seq
        previous.time = event.time
      }
      continue
    }

    const key = keyer(event.time)
    const open = carry.openStep
    const next: UsageSample = {
      callKey,
      turn,
      step,
      seq: event.seq,
      time: event.time,
      key: modelKey,
      buckets,
      reasoning,
      durationMs: open !== null && open.turn === turn && open.step === step
        ? Math.max(0, event.time - open.time)
        : null,
      effort: carry.currentEffort,
      day: key?.day ?? null,
      hour: key?.hour ?? null,
    }
    if (previous !== null) {
      applySample(previous, -1)
      // Different numbers for the same step means an in-step retry happened.
      if (!bucketsEqual(previous.buckets, buckets)) {
        fold.retriedSteps += 1
        countOnDay(event.time, 'retriedSteps')
      }
    } else {
      fold.usageSamples += 1
    }
    applySample(next, 1)
    carry.last = next
  }
}

/** Whether a session did anything worth counting as a session. */
export function hasWork(fold: SessionFold): boolean {
  return fold.steps > 0 || fold.humanMessages > 0 || totalOf(fold.totals) > 0
}
