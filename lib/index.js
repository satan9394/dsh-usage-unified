import { dshHomePath, resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import Schema from "@deepseek-ai/schemastery";
import { mkdir, open, readFile, readdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { zstdDecompressSync } from "node:zlib";
//#region src/types.ts
/** Zeroed buckets. */
function zeroBuckets() {
	return {
		input: 0,
		cacheRead: 0,
		cacheWrite: 0,
		output: 0
	};
}
/** Zeroed model tally. */
function zeroTally() {
	return {
		buckets: zeroBuckets(),
		reasoning: 0,
		samples: 0
	};
}
/** Sum of the four disjoint buckets. cacheRead is included. */
function totalOf(buckets) {
	return buckets.input + buckets.cacheRead + buckets.cacheWrite + buckets.output;
}
/** Add (or, with `sign` -1, subtract) `source` into `target` in place. */
function addBuckets(target, source, sign = 1) {
	target.input += sign * source.input;
	target.cacheRead += sign * source.cacheRead;
	target.cacheWrite += sign * source.cacheWrite;
	target.output += sign * source.output;
}
/** Add (or subtract) one tally into another in place. */
function addTally(target, source, sign = 1) {
	addBuckets(target.buckets, source.buckets, sign);
	target.reasoning += sign * source.reasoning;
	target.samples += sign * source.samples;
}
//#endregion
//#region src/fold.ts
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
/** Bump when the fold's output shape or counting rules change: forces a full rebuild. */
const FOLD_VERSION = 2;
/** Anything before this is clock skew, not history. */
const MIN_EVENT_TIME = Date.UTC(2015, 0, 1);
/** One day of tolerance for a clock that runs ahead. */
const FUTURE_SLACK_MS = 864e5;
/** Attribution key used when no route has been announced yet. */
const UNKNOWN_MODEL_KEY = "unknown/unknown";
function asRecord(value) {
	return typeof value === "object" && value !== null ? value : void 0;
}
function asString(value) {
	return typeof value === "string" ? value : void 0;
}
function asFiniteNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
/** Non-negative integer coercion; a malformed count contributes zero, never NaN. */
function count(value) {
	const n = asFiniteNumber(value);
	return n !== void 0 && n >= 0 ? Math.trunc(n) : 0;
}
/** Project a provider usage report onto the four disjoint buckets. */
function bucketsFromUsage(usage) {
	return {
		input: count(usage["inputTokens"]),
		cacheRead: count(usage["cacheReadTokens"]),
		cacheWrite: count(usage["cacheWriteTokens"]),
		output: count(usage["outputTokens"])
	};
}
function bucketsEqual(a, b) {
	return a.input === b.input && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite && a.output === b.output;
}
/**
* Build a local-calendar keyer using `Intl`, so an evening's work lands on the
* correct local day rather than a UTC one.
*
* @param tz - IANA zone.
* @param now - reference time for the future-skew guard.
*/
function makeDayKeyer(tz, now) {
	const format = new Intl.DateTimeFormat("en-CA", {
		timeZone: tz,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23"
	});
	return (time) => {
		if (!Number.isFinite(time) || time < MIN_EVENT_TIME || time > now + FUTURE_SLACK_MS) return null;
		const parts = format.formatToParts(time);
		const pick = (type) => parts.find((part) => part.type === type)?.value ?? "";
		const hour = Number(pick("hour")) % 24;
		if (!Number.isInteger(hour)) return null;
		return {
			day: `${pick("year")}-${pick("month")}-${pick("day")}`,
			hour
		};
	};
}
/** The local calendar day of `now`. */
function todayKey(tz, now) {
	return makeDayKeyer(tz, now)(now)?.day ?? new Date(now).toISOString().slice(0, 10);
}
/** Whether a session is a delegated/subagent session (upstream task-scope filter). */
function isSubtask(fold) {
	return fold.origin === "subagent" || fold.parentSession !== void 0 || fold.delegationDepth > 0;
}
function emptyDaySlice() {
	return {
		tokens: 0,
		messages: 0,
		human: 0,
		tools: 0,
		steps: 0,
		stepsWithoutUsage: 0,
		retriedSteps: 0,
		hours: {},
		models: {}
	};
}
/** Start a fold for one session. */
function createFoldState(header, home) {
	return {
		fold: {
			id: header.id,
			home,
			...header.cwd === void 0 ? {} : { cwd: header.cwd },
			createdAt: header.createdAt,
			...header.origin === void 0 ? {} : { origin: header.origin },
			...header.parentSession === void 0 ? {} : { parentSession: header.parentSession },
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
			compactionCalls: 0
		},
		carry: {
			routeKey: UNKNOWN_MODEL_KEY,
			lastTurn: null,
			last: null,
			openStep: null,
			currentEffort: null
		}
	};
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
function foldEvents(state, events, options) {
	const { fold, carry } = state;
	const keyer = makeDayKeyer(options.tz, options.now);
	const countCompaction = options.includeCompaction !== false;
	const daySlice = (day) => {
		const existing = fold.days[day];
		if (existing !== void 0) return existing;
		const created = emptyDaySlice();
		fold.days[day] = created;
		return created;
	};
	const hourBucket = (slice, hour) => {
		const key = String(hour);
		const existing = slice.hours[key];
		if (existing !== void 0) return existing;
		const created = {
			tokens: 0,
			messages: 0
		};
		slice.hours[key] = created;
		return created;
	};
	const tallyInto = (table, sample, sign) => {
		const tally = table[sample.key] ?? zeroTally();
		addBuckets(tally.buckets, sample.buckets, sign);
		tally.reasoning += sign * sample.reasoning;
		tally.samples += sign;
		table[sample.key] = tally;
	};
	/** Apply (sign 1) or undo (sign -1) one usage sample everywhere it landed, calls included. */
	const applySample = (sample, sign) => {
		addBuckets(fold.totals, sample.buckets, sign);
		fold.reasoningTokens += sign * sample.reasoning;
		tallyInto(fold.models, sample, sign);
		if (sign === 1) {
			const slash = sample.key.indexOf("/");
			fold.calls[sample.callKey] = {
				seq: sample.seq,
				time: sample.time,
				day: sample.day,
				provider: slash < 0 ? "unknown" : sample.key.slice(0, slash),
				model: slash < 0 ? sample.key : sample.key.slice(slash + 1),
				effort: sample.effort,
				durationMs: sample.durationMs,
				buckets: { ...sample.buckets },
				reasoning: sample.reasoning,
				compaction: sample.callKey.startsWith("c:")
			};
		} else delete fold.calls[sample.callKey];
		if (sample.day === null) return;
		const slice = daySlice(sample.day);
		const tokens = totalOf(sample.buckets);
		slice.tokens += sign * tokens;
		tallyInto(slice.models, sample, sign);
		if (sample.hour !== null) hourBucket(slice, sample.hour).tokens += sign * tokens;
	};
	const countMessage = (time, human) => {
		const key = keyer(time);
		if (key === null) return;
		const slice = daySlice(key.day);
		slice.messages += 1;
		if (human) slice.human += 1;
		hourBucket(slice, key.hour).messages += 1;
	};
	const countOnDay = (time, field) => {
		const key = keyer(time);
		if (key === null) return;
		daySlice(key.day)[field] += 1;
	};
	const noteTime = (time) => {
		if (!Number.isFinite(time) || time < MIN_EVENT_TIME || time > options.now + FUTURE_SLACK_MS) return;
		if (fold.firstTime === null || time < fold.firstTime) fold.firstTime = time;
		if (fold.lastTime === null || time > fold.lastTime) fold.lastTime = time;
	};
	for (const event of events) {
		if (event.seq < fold.seedLength) continue;
		noteTime(event.time);
		const data = asRecord(event.data);
		switch (event.type) {
			case "request/context": {
				const provider = asString(data?.["provider"]);
				const model = asString(data?.["model"]);
				if (provider !== void 0 && model !== void 0) carry.routeKey = `${provider}/${model}`;
				break;
			}
			case "request/header": {
				const config = asRecord(asRecord(data?.["header"])?.["config"]);
				const provider = asString(config?.["provider"]);
				const model = asString(config?.["model"]);
				if (provider !== void 0 && model !== void 0) carry.routeKey = `${provider}/${model}`;
				const effort = asString(config?.["reasoningEffort"]);
				if (effort !== void 0 && effort.length > 0) carry.currentEffort = effort;
				break;
			}
			case "step/start": {
				const turn = asFiniteNumber(data?.["turn"]);
				const step = asFiniteNumber(data?.["step"]);
				if (turn !== void 0 && step !== void 0) carry.openStep = {
					turn,
					step,
					time: event.time
				};
				break;
			}
			case "step/end":
			case "turn/end": {
				carry.openStep = null;
				if (event.type !== "step/end") break;
				fold.steps += 1;
				countOnDay(event.time, "steps");
				const turn = asFiniteNumber(data?.["turn"]) ?? null;
				if (carry.lastTurn !== turn) {
					fold.turns += 1;
					carry.lastTurn = turn;
				}
				const step = asFiniteNumber(data?.["step"]) ?? null;
				if (!(carry.last !== null && carry.last.turn === turn && carry.last.step === step)) {
					fold.stepsWithoutUsage += 1;
					countOnDay(event.time, "stepsWithoutUsage");
				}
				break;
			}
			case "user/message":
				if (asString(asRecord(data?.["source"])?.["kind"]) === "user") {
					fold.humanMessages += 1;
					countMessage(event.time, true);
				} else fold.injectedMessages += 1;
				break;
			case "tool/result":
				fold.toolResults += 1;
				countOnDay(event.time, "tools");
				break;
			case "compaction/summary": {
				fold.compactionCalls += 1;
				const usage = asRecord(data?.["usage"]);
				if (usage === void 0 || !countCompaction) break;
				const provider = asString(data?.["provider"]);
				const model = asString(data?.["model"]);
				const key = keyer(event.time);
				applySample({
					callKey: `c:${fold.compactionCalls}`,
					turn: -1,
					step: -1,
					seq: event.seq,
					time: event.time,
					key: provider !== void 0 && model !== void 0 ? `${provider}/${model}` : carry.routeKey,
					buckets: bucketsFromUsage(usage),
					reasoning: count(usage["reasoningTokens"]),
					durationMs: null,
					effort: carry.currentEffort,
					day: key?.day ?? null,
					hour: key?.hour ?? null
				}, 1);
				fold.usageSamples += 1;
				break;
			}
		}
		let turn;
		let step;
		let usage;
		let modelKey = carry.routeKey;
		let fromMessage = false;
		if (event.type === "assistant/chunk") {
			const chunk = asRecord(data?.["chunk"]);
			if (asString(chunk?.["type"]) !== "usage") continue;
			const reported = asRecord(chunk?.["usage"]);
			if (reported === void 0) continue;
			turn = asFiniteNumber(data?.["turn"]) ?? -1;
			step = asFiniteNumber(data?.["step"]) ?? -1;
			usage = reported;
		} else if (event.type === "assistant/message") {
			fromMessage = true;
			const message = asRecord(data?.["message"]);
			const source = asRecord(message?.["source"]);
			const provider = asString(source?.["provider"]);
			const model = asString(source?.["model"]);
			if (provider !== void 0 && model !== void 0) modelKey = `${provider}/${model}`;
			const content = message?.["content"];
			if (Array.isArray(content) && content.length > 0) {
				fold.assistantMessages += 1;
				countMessage(event.time, false);
			}
			const reported = asRecord(data?.["usage"]);
			if (reported === void 0) continue;
			turn = asFiniteNumber(data?.["turn"]) ?? -1;
			step = asFiniteNumber(data?.["step"]) ?? -1;
			usage = reported;
		} else continue;
		const callKey = `${turn}:${step}`;
		const buckets = bucketsFromUsage(usage);
		const reasoning = count(usage["reasoningTokens"]);
		const previous = carry.last !== null && carry.last.turn === turn && carry.last.step === step ? carry.last : null;
		if (previous !== null && previous.key === modelKey && bucketsEqual(previous.buckets, buckets)) {
			if (fromMessage) {
				const open = carry.openStep;
				const stored = fold.calls[callKey];
				if (stored !== void 0) {
					stored.seq = event.seq;
					stored.time = event.time;
					stored.effort = carry.currentEffort;
					stored.durationMs = open !== null && open.turn === turn && open.step === step ? Math.max(0, event.time - open.time) : stored.durationMs;
				}
				previous.seq = event.seq;
				previous.time = event.time;
			}
			continue;
		}
		const key = keyer(event.time);
		const open = carry.openStep;
		const next = {
			callKey,
			turn,
			step,
			seq: event.seq,
			time: event.time,
			key: modelKey,
			buckets,
			reasoning,
			durationMs: open !== null && open.turn === turn && open.step === step ? Math.max(0, event.time - open.time) : null,
			effort: carry.currentEffort,
			day: key?.day ?? null,
			hour: key?.hour ?? null
		};
		if (previous !== null) {
			applySample(previous, -1);
			if (!bucketsEqual(previous.buckets, buckets)) {
				fold.retriedSteps += 1;
				countOnDay(event.time, "retriedSteps");
			}
		} else fold.usageSamples += 1;
		applySample(next, 1);
		carry.last = next;
	}
}
/** Whether a session did anything worth counting as a session. */
function hasWork(fold) {
	return fold.steps > 0 || fold.humanMessages > 0 || totalOf(fold.totals) > 0;
}
//#endregion
//#region src/aggregate.ts
/**
* Cross-session aggregation: the unified snapshot and the call-detail rows.
*
* Two paths on purpose. An all-time view reads each session's authoritative
* counters, so tokens whose timestamps failed the clock-skew guard are still
* counted. A bounded range can only be assembled from the day slices, so those
* tokens necessarily drop out of it — an all-time total may therefore exceed
* the sum of its days. That is the honest behaviour: a token with an
* implausible timestamp belongs in a total but not on a calendar.
*
* Streaks are always all-time scans: a "current streak" is not a property of
* the selected window.
*
* @module dsh-usage-unified/aggregate
*/
const DAY_MS = 864e5;
/** Same session across format generations: v3 prefixes the header id. */
function sessionKey(id) {
	return id.replace(/^session-/, "");
}
/** How many days each bounded range covers, today included. */
const RANGE_DAYS = {
	"30d": 30,
	"7d": 7
};
/** Today-inclusive day bounds for a bounded range. */
function rangeBounds(range, today) {
	return {
		from: shiftDay(today, -(RANGE_DAYS[range] - 1)),
		to: today
	};
}
/**
* Noon-UTC anchor for a local calendar day. Adjacency is tested at noon so a
* DST transition cannot break a streak that never broke.
*
* @param day - 'YYYY-MM-DD'.
*/
function dayAnchor(day) {
	const [year, month, date] = day.split("-").map(Number);
	return Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1, 12);
}
/** Shift a 'YYYY-MM-DD' key by whole days. */
function shiftDay(day, days) {
	return new Date(dayAnchor(day) + days * DAY_MS).toISOString().slice(0, 10);
}
/**
* Compute streaks over ascending, de-duplicated day keys.
*
* The current streak counts only when it reaches today or yesterday —
* otherwise a run that ended last month would read as "current".
*/
function streaks(sortedDays, today) {
	if (sortedDays.length === 0) return {
		active: 0,
		current: 0,
		longest: 0
	};
	let longest = 1;
	let run = 1;
	for (let i = 1; i < sortedDays.length; i++) {
		const previous = sortedDays[i - 1];
		const day = sortedDays[i];
		if (previous === void 0 || day === void 0) continue;
		run = dayAnchor(day) - dayAnchor(previous) === DAY_MS ? run + 1 : 1;
		if (run > longest) longest = run;
	}
	const lastDay = sortedDays[sortedDays.length - 1];
	if (lastDay === void 0) return {
		active: sortedDays.length,
		current: 0,
		longest
	};
	const gap = dayAnchor(today) - dayAnchor(lastDay);
	let current = 0;
	if (gap === 0 || gap === DAY_MS) {
		current = 1;
		for (let i = sortedDays.length - 1; i > 0; i--) {
			const previous = sortedDays[i - 1];
			const day = sortedDays[i];
			if (previous === void 0 || day === void 0) break;
			if (dayAnchor(day) - dayAnchor(previous) !== DAY_MS) break;
			current += 1;
		}
	}
	return {
		active: sortedDays.length,
		current,
		longest
	};
}
/**
* Same session id under two homes (a copied directory) is one session, and a
* session migrated across format generations keeps its identity even though the
* header id gains a `session-` prefix in v3 — so the comparison key is
* normalized. Keeps the copy that saw the most activity.
*/
function dedupeFolds(folds) {
	const best = /* @__PURE__ */ new Map();
	for (const fold of folds) {
		const key = fold.id.replace(/^session-/, "");
		const previous = best.get(key);
		if (previous === void 0) {
			best.set(key, fold);
			continue;
		}
		const newer = (fold.lastTime ?? 0) > (previous.lastTime ?? 0);
		const richer = (fold.lastTime ?? 0) === (previous.lastTime ?? 0) && fold.steps > previous.steps;
		if (newer || richer) best.set(key, fold);
	}
	return [...best.values()];
}
function zeroBreakdown() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		reasoning: 0
	};
}
function zeroTotals() {
	return {
		tokens: 0,
		sessions: 0,
		subagentSessions: 0,
		messages: 0,
		humanMessages: 0,
		assistantMessages: 0,
		toolResults: 0,
		activeDays: 0,
		currentStreak: 0,
		longestStreak: 0,
		peakHour: null,
		...zeroBreakdown()
	};
}
function addBreakdown(target, buckets, reasoning) {
	target.input += buckets.input;
	target.output += buckets.output;
	target.cacheRead += buckets.cacheRead;
	target.cacheWrite += buckets.cacheWrite;
	target.reasoning += reasoning;
}
function modelStatsFromTallies(tallies, totalTokens) {
	const rows = [];
	for (const [key, tally] of tallies) {
		if (totalOf(tally.buckets) === 0) continue;
		const slash = key.indexOf("/");
		rows.push({
			key,
			provider: slash < 0 ? key : key.slice(0, slash),
			model: slash < 0 ? key : key.slice(slash + 1),
			calls: tally.samples,
			tokens: totalOf(tally.buckets),
			percent: 0,
			input: tally.buckets.input,
			output: tally.buckets.output,
			cacheRead: tally.buckets.cacheRead,
			cacheWrite: tally.buckets.cacheWrite,
			reasoning: tally.reasoning
		});
	}
	rows.sort((a, b) => b.tokens - a.tokens || b.calls - a.calls || a.key.localeCompare(b.key));
	for (const row of rows) row.percent = totalTokens === 0 ? 0 : row.tokens / totalTokens * 100;
	return rows;
}
/** Case-insensitive comparison on Windows; exact elsewhere. */
function samePath(a, b) {
	return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}
function inScope(fold, query) {
	if (query.workspace !== void 0) {
		if (fold.cwd === void 0 || !samePath(fold.cwd, query.workspace)) return false;
	}
	if (query.scope === "main" && isSubtask(fold)) return false;
	if (query.scope === "subtasks" && !isSubtask(fold)) return false;
	return true;
}
function datesBetween(from, to) {
	const days = [];
	const cursor = /* @__PURE__ */ new Date(`${from}T00:00:00Z`);
	const end = /* @__PURE__ */ new Date(`${to}T00:00:00Z`);
	while (cursor <= end && days.length < 4e3) {
		days.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return days;
}
function emptyHours() {
	return Array.from({ length: 24 }, () => ({
		tokens: 0,
		messages: 0
	}));
}
function addHours(target, slice) {
	for (const [hourKey, activity] of Object.entries(slice.hours)) {
		const hour = target[Number(hourKey)];
		if (hour === void 0) continue;
		hour.tokens += activity.tokens;
		hour.messages += activity.messages;
	}
}
/** Local hour 0-23 with the most messages, tie-broken by tokens; null when empty. */
function peakHourOf(hours) {
	let peak = null;
	for (let hour = 0; hour < 24; hour++) {
		const candidate = hours[hour];
		if (candidate === void 0) continue;
		if (candidate.messages === 0 && candidate.tokens === 0) continue;
		const best = peak === null ? void 0 : hours[peak];
		if (best === void 0 || candidate.messages > best.messages || candidate.messages === best.messages && candidate.tokens > best.tokens) peak = hour;
	}
	return peak;
}
/**
* Rank sessions by what they spent inside the window.
*
* All-time reads each fold's authoritative counters; a bounded range sums the
* in-range day slices, so a session that only touched part of the window is
* ranked by that part. Sessions with no activity in the window are dropped.
*/
function sessionRowsFor(scoped, all, inRange) {
	const rows = [];
	for (const fold of scoped) {
		const tallies = /* @__PURE__ */ new Map();
		let tokens = 0;
		let input = 0;
		let output = 0;
		let cacheRead = 0;
		let cacheWrite = 0;
		let reasoning = 0;
		let messages = 0;
		let calls = 0;
		if (all) {
			tokens = totalOf(fold.totals);
			input = fold.totals.input;
			output = fold.totals.output;
			cacheRead = fold.totals.cacheRead;
			cacheWrite = fold.totals.cacheWrite;
			reasoning = fold.reasoningTokens;
			messages = fold.humanMessages + fold.assistantMessages;
			calls = Object.keys(fold.calls).length;
			for (const [key, tally] of Object.entries(fold.models)) tallies.set(key, tally);
		} else {
			for (const [day, slice] of Object.entries(fold.days)) {
				if (!inRange(day)) continue;
				tokens += slice.tokens;
				messages += slice.messages;
				for (const [key, tally] of Object.entries(slice.models)) {
					const target = tallies.get(key) ?? zeroTally();
					addTally(target, tally);
					tallies.set(key, target);
				}
			}
			if (tokens === 0 && messages === 0) continue;
			for (const tally of tallies.values()) {
				input += tally.buckets.input;
				output += tally.buckets.output;
				cacheRead += tally.buckets.cacheRead;
				cacheWrite += tally.buckets.cacheWrite;
				reasoning += tally.reasoning;
			}
			for (const call of Object.values(fold.calls)) if (call.day !== null && inRange(call.day)) calls += 1;
		}
		let topModel = UNKNOWN_MODEL_KEY;
		let topModelTokens = 0;
		for (const [key, tally] of tallies) {
			const value = totalOf(tally.buckets);
			if (value > topModelTokens || value === topModelTokens && key < topModel) {
				topModel = key;
				topModelTokens = value;
			}
		}
		const slash = topModel.indexOf("/");
		const row = {
			sessionId: fold.id,
			home: fold.home,
			subtask: isSubtask(fold),
			createdAt: fold.createdAt,
			startTime: fold.firstTime,
			endTime: fold.lastTime,
			tokens,
			input,
			output,
			cacheRead,
			cacheWrite,
			reasoning,
			calls,
			messages,
			topModel,
			topModelProvider: slash < 0 ? "unknown" : topModel.slice(0, slash),
			topModelTokens,
			modelCount: tallies.size
		};
		if (fold.cwd !== void 0) row.cwd = fold.cwd;
		rows.push(row);
	}
	rows.sort((a, b) => b.tokens - a.tokens || b.calls - a.calls || a.sessionId.localeCompare(b.sessionId));
	const total = rows.length;
	if (rows.length > 100) rows.length = 100;
	return {
		rows,
		total
	};
}
/**
* Aggregate folded sessions into one snapshot body.
*
* @param input - one fold per session artifact; duplicates across homes removed here.
* @param query - the window, scope and workspace to report.
*/
function aggregateSnapshot(input, query) {
	const now = query.now ?? Date.now();
	const all = query.range === "all";
	const today = todayKey(query.timeZone, now);
	const scoped = dedupeFolds(input).filter(hasWork).filter((fold) => inScope(fold, query));
	const from = all ? "" : query.from;
	const to = all ? today : query.to;
	const inRange = (day) => all || day >= from && day <= to;
	const allTotals = zeroTotals();
	const allModels = /* @__PURE__ */ new Map();
	const allActiveDays = /* @__PURE__ */ new Set();
	const allHours = emptyHours();
	const workspaces = /* @__PURE__ */ new Map();
	let steps = 0;
	let stepsWithoutUsage = 0;
	let retriedSteps = 0;
	let truncatedSessions = 0;
	for (const fold of scoped) {
		allTotals.tokens += totalOf(fold.totals);
		addBreakdown(allTotals, fold.totals, fold.reasoningTokens);
		if (isSubtask(fold)) allTotals.subagentSessions += 1;
		else allTotals.sessions += 1;
		allTotals.humanMessages += fold.humanMessages;
		allTotals.assistantMessages += fold.assistantMessages;
		allTotals.toolResults += fold.toolResults;
		steps += fold.steps;
		stepsWithoutUsage += fold.stepsWithoutUsage;
		retriedSteps += fold.retriedSteps;
		if (fold.truncated) truncatedSessions += 1;
		if (fold.cwd !== void 0) workspaces.set(fold.cwd, (workspaces.get(fold.cwd) ?? 0) + 1);
		for (const [key, tally] of Object.entries(fold.models)) {
			const target = allModels.get(key) ?? zeroTally();
			addTally(target, tally);
			allModels.set(key, target);
		}
		for (const [day, slice] of Object.entries(fold.days)) {
			if (slice.tokens > 0 || slice.messages > 0) allActiveDays.add(day);
			addHours(allHours, slice);
		}
	}
	allTotals.messages = allTotals.humanMessages + allTotals.assistantMessages;
	const allStreak = streaks([...allActiveDays].sort(), today);
	allTotals.activeDays = allStreak.active;
	allTotals.currentStreak = allStreak.current;
	allTotals.longestStreak = allStreak.longest;
	allTotals.peakHour = peakHourOf(allHours);
	const totals = zeroTotals();
	const rangeModels = /* @__PURE__ */ new Map();
	const dayMap = /* @__PURE__ */ new Map();
	const hours = emptyHours();
	const activeDays = /* @__PURE__ */ new Set();
	const rangeSessionIds = /* @__PURE__ */ new Set();
	const rangeSubagentIds = /* @__PURE__ */ new Set();
	const dayFor = (day) => {
		const existing = dayMap.get(day);
		if (existing !== void 0) return existing;
		const created = {
			date: day,
			tokens: 0,
			calls: 0,
			messages: 0,
			sessions: 0,
			models: {},
			...zeroBreakdown()
		};
		dayMap.set(day, created);
		return created;
	};
	for (const fold of scoped) for (const [day, slice] of Object.entries(fold.days)) {
		if (!inRange(day)) continue;
		const bucket = dayFor(day);
		bucket.tokens += slice.tokens;
		bucket.messages += slice.messages;
		totals.humanMessages += slice.human;
		totals.assistantMessages += slice.messages - slice.human;
		totals.toolResults += slice.tools;
		addHours(hours, slice);
		for (const [key, tally] of Object.entries(slice.models)) {
			const target = rangeModels.get(key) ?? zeroTally();
			addTally(target, tally);
			rangeModels.set(key, target);
			bucket.models[key] = (bucket.models[key] ?? 0) + totalOf(tally.buckets);
			addBreakdown(bucket, tally.buckets, tally.reasoning);
		}
		activeDays.add(day);
		rangeSessionIds.add(fold.id);
		if (isSubtask(fold)) rangeSubagentIds.add(fold.id);
	}
	const sessionsByDay = /* @__PURE__ */ new Map();
	for (const fold of scoped) for (const call of Object.values(fold.calls)) {
		if (call.day === null || !inRange(call.day)) continue;
		dayFor(call.day).calls += 1;
		let ids = sessionsByDay.get(call.day);
		if (ids === void 0) sessionsByDay.set(call.day, ids = /* @__PURE__ */ new Set());
		ids.add(fold.id);
	}
	for (const [day, ids] of sessionsByDay) dayFor(day).sessions = ids.size;
	const daySeries = all ? [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)) : datesBetween(from, to).map((day) => dayMap.get(day) ?? dayFor(day));
	if (!all) {
		totals.tokens = 0;
		Object.assign(totals, zeroBreakdown());
		for (const day of daySeries) {
			totals.tokens += day.tokens;
			totals.input += day.input;
			totals.output += day.output;
			totals.cacheRead += day.cacheRead;
			totals.cacheWrite += day.cacheWrite;
			totals.reasoning += day.reasoning;
		}
		totals.messages = totals.humanMessages + totals.assistantMessages;
		totals.sessions = rangeSessionIds.size;
		totals.subagentSessions = rangeSubagentIds.size;
		totals.activeDays = activeDays.size;
		totals.peakHour = peakHourOf(hours);
	} else Object.assign(totals, allTotals);
	totals.currentStreak = allStreak.current;
	totals.longestStreak = allStreak.longest;
	const modelRows = modelStatsFromTallies(all ? allModels : rangeModels, totals.tokens);
	const allModelRows = modelStatsFromTallies(allModels, allTotals.tokens);
	const workspaceRows = [...workspaces].map(([path, sessions]) => ({
		path,
		sessions
	})).sort((a, b) => b.sessions - a.sessions || a.path.localeCompare(b.path));
	const sessionRows = sessionRowsFor(scoped, all, inRange);
	return {
		tz: query.timeZone,
		range: query.range,
		from,
		to,
		totals,
		allTime: {
			totals: allTotals,
			mostUsedModel: allModelRows[0] ?? null
		},
		mostUsedModel: modelRows[0] ?? null,
		days: daySeries,
		hours,
		models: modelRows,
		workspaces: workspaceRows,
		sessions: sessionRows.rows,
		sessionTotal: sessionRows.total,
		coverage: {
			steps,
			stepsWithoutUsage,
			retriedSteps,
			truncatedSessions
		}
	};
}
function callToRecord(fold, call) {
	const record = {
		key: `${fold.id}:${call.seq}`,
		seq: call.seq,
		time: call.time,
		sessionId: fold.id,
		home: fold.home,
		subtask: isSubtask(fold),
		provider: call.provider,
		model: call.model,
		effort: call.effort,
		durationMs: call.durationMs,
		tokens: {
			...call.buckets,
			reasoning: call.reasoning
		}
	};
	if (fold.cwd !== void 0) record.cwd = fold.cwd;
	return record;
}
/**
* Flatten every session's calls into newest-first rows.
*
* @param input - folded sessions.
* @param query - window and filters.
*/
function collectCalls(input, query) {
	const folds = dedupeFolds(input).filter(hasWork).filter((fold) => inScope(fold, query));
	const all = query.range === "all";
	const wanted = query.session === void 0 ? null : sessionKey(query.session);
	const rows = [];
	for (const fold of folds) {
		if (wanted !== null && sessionKey(fold.id) !== wanted) continue;
		for (const call of Object.values(fold.calls)) {
			if (!all) {
				if (call.day === null || call.day < query.from || call.day > query.to) continue;
			}
			if (query.model !== void 0 && call.model !== query.model) continue;
			if (query.provider !== void 0 && call.provider !== query.provider) continue;
			const tokens = {
				...call.buckets,
				reasoning: call.reasoning
			};
			if (query.minInputTokens !== void 0 && tokens.input < query.minInputTokens) continue;
			if (query.minOutputTokens !== void 0 && tokens.output < query.minOutputTokens) continue;
			rows.push(callToRecord(fold, call));
		}
	}
	rows.sort((a, b) => b.time - a.time || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
	if (rows.length > query.maxRecords) rows.length = query.maxRecords;
	return rows;
}
/** CSV export of the per-day per-model series, mirroring the audit plugin's columns. */
function exportCsv(days, models) {
	const quote = (value) => `"${String(value).replaceAll("\"", "\"\"")}"`;
	const header = [
		"date",
		"model",
		"provider",
		"tokens",
		"input",
		"output",
		"cache_read",
		"cache_write",
		"messages",
		"sessions"
	];
	const rows = [];
	for (const day of days) {
		const entries = Object.entries(day.models);
		if (entries.length === 0) rows.push([
			day.date,
			"",
			"",
			"0",
			"0",
			"0",
			"0",
			"0",
			String(day.messages),
			String(day.sessions)
		]);
		for (const [key, tokens] of entries) {
			const model = models.find((item) => item.key === key);
			rows.push([
				day.date,
				model?.model ?? key,
				model?.provider ?? "",
				String(tokens),
				"",
				"",
				"",
				"",
				String(day.messages),
				String(day.sessions)
			]);
		}
	}
	return [header, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");
}
//#endregion
//#region src/homes.ts
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
/** Directory name the Desktop shell versions its homes under. */
const DESKTOP_DATA_DIR = ".dsh_desktop";
function errorCode$1(error) {
	return error?.code ?? String(error);
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
async function discoverDshHomes(options) {
	const { currentHome, extraRoots = [], env = process.env, osHome = homedir() } = options;
	const candidates = /* @__PURE__ */ new Set([join(osHome, ".dsh"), currentHome]);
	const envHome = env["DSH_HOME"]?.trim();
	if (envHome !== void 0 && envHome.length > 0) candidates.add(envHome);
	for (const root of extraRoots) {
		const trimmed = root.trim();
		if (trimmed.length > 0) candidates.add(trimmed);
	}
	const problems = [];
	const homeLike = /^\.dsh(?:$|[-_.])/;
	try {
		for (const entry of await readdir(osHome, { withFileTypes: true })) {
			if (!entry.isDirectory() || !homeLike.test(entry.name)) continue;
			const home = join(osHome, entry.name);
			candidates.add(home);
			if (entry.name === DESKTOP_DATA_DIR) try {
				for (const version of await readdir(home, { withFileTypes: true })) if (version.isDirectory()) candidates.add(join(home, version.name));
			} catch (error) {
				if (errorCode$1(error) !== "ENOENT") problems.push({
					home,
					error: errorCode$1(error)
				});
			}
		}
	} catch (error) {
		if (errorCode$1(error) !== "ENOENT") problems.push({
			home: osHome,
			error: errorCode$1(error)
		});
	}
	let currentReal;
	try {
		currentReal = await realpath(join(currentHome, "sessions"));
	} catch {}
	const byRoot = /* @__PURE__ */ new Map();
	for (const home of candidates) {
		let sessionsRoot;
		try {
			sessionsRoot = await realpath(join(home, "sessions"));
		} catch (error) {
			const code = errorCode$1(error);
			if (code !== "ENOENT") problems.push({
				home,
				error: code
			});
			continue;
		}
		if (byRoot.has(sessionsRoot)) continue;
		byRoot.set(sessionsRoot, {
			home,
			sessionsRoot,
			current: sessionsRoot === currentReal
		});
	}
	return {
		homes: [...byRoot.values()],
		problems
	};
}
//#endregion
//#region src/zstd-frames.ts
const ZSTD_MAGIC = 4247762216;
/**
* Locate every complete Zstandard frame in `buffer`.
* @param buffer - the artifact bytes, or a tail slice of them.
* @param maxFrames - stop after this many frames (header-only probes pass 1).
* @returns the complete frames plus the torn-tail offset when one exists.
* @throws when a frame header is structurally invalid — that is corruption,
* not a torn tail, and must not be silently treated as end-of-data.
*/
function scanZstdFrames(buffer, maxFrames = Number.POSITIVE_INFINITY) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) return {
			frames,
			tornStart: start
		};
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) throw new Error(`corrupt Zstandard session log: invalid frame magic at byte ${offset}`);
		offset += 4;
		if (offset === buffer.length) return {
			frames,
			tornStart: start
		};
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) throw new Error(`corrupt Zstandard session log: reserved frame-header bit at byte ${offset - 1}`);
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) return {
			frames,
			tornStart: start
		};
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return {
				frames,
				tornStart: start
			};
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) throw new Error(`corrupt Zstandard session log: reserved block type at byte ${offset - 3}`);
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return {
				frames,
				tornStart: start
			};
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return {
				frames,
				tornStart: start
			};
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
		if (frames.length === maxFrames) return { frames };
	}
	return { frames };
}
/** Any canonical session log name: `session.jsonl`, `session.jsonl.zstd`, `session.v3.jsonl.zstd`. */
const LOG_PATTERN = /^session(?:\.[0-9a-zA-Z_-]+)?\.jsonl(?:\.zstd)?$/;
function errorCode(error) {
	return error?.code;
}
/**
* Rank a log filename so the newest readable generation wins when a directory
* holds more than one (a migrated session can briefly keep its predecessor).
*
* @param name - a filename matching {@link LOG_PATTERN}.
* @returns a comparable score; higher is preferred.
*/
function logPriority(name) {
	const version = /\.v(\d+)\./.exec(name);
	const versionScore = version === null ? 0 : Number(version[1]);
	const compressed = name.endsWith(".zstd") ? 1 : 0;
	return versionScore * 2 + compressed;
}
/**
* Walk one home's sessions tree.
*
* Unreadable project directories are skipped rather than aborting the walk:
* a single permission problem must not cost the user every other home.
*
* @param home - a home discovered by `discoverDshHomes`.
* @yields one artifact per session directory that has a log.
*/
async function* walkSessionArtifacts(home) {
	let projects;
	try {
		projects = await readdir(home.sessionsRoot, { withFileTypes: true });
	} catch {
		return;
	}
	for (const project of projects) {
		if (!project.isDirectory()) continue;
		const projectPath = join(home.sessionsRoot, project.name);
		let sessions;
		try {
			sessions = await readdir(projectPath, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const session of sessions) {
			if (!session.isDirectory()) continue;
			let names;
			try {
				names = await readdir(join(projectPath, session.name));
			} catch {
				continue;
			}
			const name = names.filter((name) => LOG_PATTERN.test(name)).sort((a, b) => logPriority(b) - logPriority(a))[0];
			if (name === void 0) continue;
			const path = join(projectPath, session.name, name);
			let stats;
			try {
				stats = await stat(path);
			} catch (error) {
				if (errorCode(error) === "ENOENT") continue;
				continue;
			}
			yield {
				home,
				path,
				key: `${home.sessionsRoot} ${project.name}/${session.name}`,
				size: stats.size,
				mtimeMs: stats.mtimeMs,
				ino: stats.ino,
				dev: stats.dev
			};
		}
	}
}
function isRecord(value) {
	return typeof value === "object" && value !== null;
}
/** Coerce one parsed JSONL line into an event, or reject it. */
function toEvent(value) {
	if (!isRecord(value)) return void 0;
	const type = value["type"];
	const seq = value["seq"];
	if (typeof type !== "string") return void 0;
	if (typeof seq !== "number" || !Number.isFinite(seq)) return void 0;
	const event = {
		type,
		seq,
		time: typeof value["time"] === "number" ? value["time"] : 0
	};
	if ("data" in value) event.data = value["data"];
	return event;
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
function decodeArtifactBytes(bytes, compressed, fromCursor = 0, cachedHeader) {
	let lines;
	let cursor;
	let torn;
	if (compressed) {
		const scan = scanZstdFrames(bytes);
		torn = scan.tornStart !== void 0;
		cursor = fromCursor + (scan.frames[scan.frames.length - 1]?.end ?? 0);
		lines = [];
		for (const frame of scan.frames) {
			const text = zstdDecompressSync(bytes.subarray(frame.start, frame.end)).toString("utf8");
			for (const line of text.split("\n")) if (line.length > 0) lines.push(line);
		}
	} else {
		const text = bytes.toString("utf8");
		const lastNewline = text.lastIndexOf("\n");
		torn = lastNewline !== text.length - 1;
		cursor = fromCursor + (lastNewline + 1);
		lines = text.slice(0, lastNewline + 1).split("\n").filter((line) => line.length > 0);
	}
	let header = cachedHeader;
	let body = lines;
	if (fromCursor === 0) {
		const firstIndex = lines.findIndex((line) => /"type"\s*:\s*"session"/.test(line));
		const first = firstIndex < 0 ? void 0 : lines[firstIndex];
		if (first === void 0) throw new Error("session log has no header line");
		header = JSON.parse(first);
		body = lines.filter((_, index) => index !== firstIndex);
	}
	if (header === void 0) throw new Error("resume read requires a cached header");
	if (typeof header.version === "number" && header.version > 3) return {
		header,
		events: [],
		cursor,
		torn,
		foreign: true
	};
	const events = [];
	for (const line of body) {
		let parsed;
		try {
			parsed = JSON.parse(line);
		} catch {
			continue;
		}
		const event = toEvent(parsed);
		if (event !== void 0) events.push(event);
	}
	return {
		header,
		events,
		cursor,
		torn,
		foreign: false
	};
}
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
async function readArtifact(path, fromCursor, cachedHeader) {
	if (fromCursor > 0) {
		const handle = await open(path, "r");
		try {
			const info = await handle.stat();
			const length = Math.max(0, info.size - fromCursor);
			const tail = Buffer.allocUnsafe(length);
			if (length > 0) await handle.read(tail, 0, length, fromCursor);
			return decodeArtifactBytes(tail, path.endsWith(".zstd"), fromCursor, cachedHeader);
		} finally {
			await handle.close();
		}
	}
	return decodeArtifactBytes(await readFile(path), path.endsWith(".zstd"), 0, cachedHeader);
}
//#endregion
//#region src/pricing.ts
/**
* Optional cost estimation from a local pricing table.
*
* dsh itself carries no price list, so the panel refuses to invent one: costs
* appear only when a `pricing.json` exists under the dsh home, and every model
* without a matching entry is reported as unpriced rather than as free. The
* table is plain JSON so an operator (or `npm run pricing:setup`) can generate
* it from whatever source they already trust.
*
* Prices are USD per million tokens, matching the four disjoint buckets.
*
* @module dsh-usage-unified/pricing
*/
/**
* Share of usage in a peak window when a table does not say.
*
* DeepSeek prices peak as Monday-Friday 01:00-04:00 and 06:00-10:00 UTC — 7
* hours a day, 35 of the week's 168 — and OpenCode Go and Command Code both
* document the same schedule. A flat off-peak number would understate cost by
* exactly this share times the doubling.
*/
const DEFAULT_PEAK_SHARE = .2083;
/** A price of zero everywhere means "unknown", not "free". */
function usablePrice(price) {
	return price.input > 0 || price.output > 0 || price.cacheRead > 0 || price.cacheWrite > 0;
}
function blend(offPeak, peak, share) {
	if (peak <= 0) return offPeak;
	return offPeak * (1 - share) + peak * share;
}
/** Fold a declared peak tier into the effective rates. */
function resolvePrice(declared, peak, share) {
	if (peak === void 0 || share <= 0) return { ...declared };
	return {
		input: blend(declared.input, peak.input, share),
		output: blend(declared.output, peak.output, share),
		cacheRead: blend(declared.cacheRead, peak.cacheRead, share),
		cacheWrite: blend(declared.cacheWrite, peak.cacheWrite, share),
		peak: { ...peak }
	};
}
function peakShareOf(raw) {
	const value = typeof raw === "number" ? raw : Number(raw);
	return Number.isFinite(value) && value > 0 && value < 1 ? value : DEFAULT_PEAK_SHARE;
}
function numberOrZero(value) {
	const n = typeof value === "number" ? value : Number(value);
	return Number.isFinite(n) && n >= 0 ? n : 0;
}
/**
* Normalize a model id for lookup: lowercase, drop a trailing date stamp or
* version tail so `deepseek-chat-v3-0324` still finds `deepseek-chat`.
*/
function normalizeModelId(id) {
	return id.trim().toLowerCase().replace(/@[^@]*$/, "");
}
/** Exact id first, then progressively shorter dash-separated prefixes. */
function lookupCandidates(table, normalized) {
	const exact = table.models.get(normalized);
	if (exact !== void 0) return usablePrice(exact) ? exact : null;
	const segments = normalized.split("-");
	for (let end = segments.length - 1; end >= 2; end--) {
		const candidate = table.models.get(segments.slice(0, end).join("-"));
		if (candidate !== void 0) return usablePrice(candidate) ? candidate : null;
	}
	return null;
}
/**
* Look a model up, trying the exact id first and then progressively shorter
* dash-separated prefixes. Cheap, deterministic, and good enough for the id
* shapes providers actually publish.
*
* A `provider/model` attribution key is accepted directly: this machine routes
* models whose own name contains a slash (`command/deepseek/deepseek-v4.1-flash`),
* so the segment after the last slash is tried as well.
*/
function lookupPrice(table, model) {
	if (table === null) return null;
	const normalized = normalizeModelId(model);
	const direct = lookupCandidates(table, normalized);
	if (direct !== null) return direct;
	const slash = normalized.lastIndexOf("/");
	return slash < 0 ? null : lookupCandidates(table, normalized.slice(slash + 1));
}
/** USD cost of one token report, or null when the model has no price. */
function costOf(table, model, buckets) {
	const price = lookupPrice(table, model);
	if (price === null) return null;
	return (buckets.input * price.input + buckets.output * price.output + buckets.cacheRead * price.cacheRead + buckets.cacheWrite * price.cacheWrite) / 1e6;
}
/**
* Parse a pricing file.
*
* Accepts both this project's shape (`{ models: { id: {input,…} } }`) and the
* CC Switch export (`{ models: [{ modelId, inputCostPerMillion, … }] }`), so an
* operator can point at either without a conversion step.
*/
function parsePricing(raw, fallbackSource) {
	if (typeof raw !== "object" || raw === null) return null;
	const record = raw;
	const models = /* @__PURE__ */ new Map();
	const source = typeof record["source"] === "string" ? record["source"] : fallbackSource;
	const share = peakShareOf(record["peakShare"]);
	const add = (id, offPeak, peak) => {
		if (id.length > 0) models.set(normalizeModelId(id), resolvePrice(offPeak, peak, share));
	};
	const readPeak = (value) => {
		if (typeof value !== "object" || value === null) return void 0;
		const entry = value;
		return {
			input: numberOrZero(entry["input"]),
			output: numberOrZero(entry["output"]),
			cacheRead: numberOrZero(entry["cacheRead"]),
			cacheWrite: numberOrZero(entry["cacheWrite"])
		};
	};
	const declared = record["models"];
	if (Array.isArray(declared)) for (const item of declared) {
		if (typeof item !== "object" || item === null) continue;
		const entry = item;
		const id = typeof entry["modelId"] === "string" ? entry["modelId"] : void 0;
		if (id === void 0) continue;
		add(id, {
			input: numberOrZero(entry["inputCostPerMillion"]),
			output: numberOrZero(entry["outputCostPerMillion"]),
			cacheRead: numberOrZero(entry["cacheReadCostPerMillion"]),
			cacheWrite: numberOrZero(entry["cacheCreationCostPerMillion"])
		});
	}
	else if (typeof declared === "object" && declared !== null) for (const [id, value] of Object.entries(declared)) {
		if (typeof value !== "object" || value === null) continue;
		const entry = value;
		add(id, {
			input: numberOrZero(entry["input"]),
			output: numberOrZero(entry["output"]),
			cacheRead: numberOrZero(entry["cacheRead"]),
			cacheWrite: numberOrZero(entry["cacheWrite"])
		}, readPeak(entry["peak"]));
	}
	if (models.size === 0) return null;
	return {
		source,
		updatedAt: typeof record["updatedAt"] === "number" ? record["updatedAt"] : null,
		peakShare: share,
		models
	};
}
/** Read and parse a pricing file; any failure is a silent "no pricing". */
async function loadPricing(path) {
	try {
		const [text, info] = await Promise.all([readFile(path, "utf8"), stat(path)]);
		const table = parsePricing(JSON.parse(text), path);
		if (table === null) return null;
		return {
			...table,
			updatedAt: table.updatedAt ?? info.mtimeMs
		};
	} catch {
		return null;
	}
}
/**
* Decorate rows with costs and summarize coverage.
*
* Rows are mutated in place — they are freshly built per snapshot, never
* shared — so the caller keeps one object graph. A row with no price is marked
* `priced: false` and its tokens counted as unpriced; the estimate therefore
* never silently reads as "free".
*/
function applyPricing(input, table) {
	if (table === null) return null;
	let total = 0;
	let pricedTokens = 0;
	let unpricedTokens = 0;
	const seen = /* @__PURE__ */ new Set();
	const price = ({ row, modelId }) => {
		if (seen.has(row)) return null;
		seen.add(row);
		const cost = costOf(table, modelId, {
			input: row.input,
			output: row.output,
			cacheRead: row.cacheRead,
			cacheWrite: row.cacheWrite
		});
		if (cost === null) {
			row.priced = false;
			return null;
		}
		row.costUsd = cost;
		row.priced = true;
		return cost;
	};
	for (const target of input.basis) {
		if (seen.has(target.row)) continue;
		const cost = price(target);
		if (cost === null) unpricedTokens += target.row.tokens;
		else {
			total += cost;
			pricedTokens += target.row.tokens;
		}
	}
	for (const target of input.extra ?? []) price(target);
	return {
		currency: "USD",
		total,
		pricedTokens,
		unpricedTokens,
		source: table.source,
		updatedAt: table.updatedAt,
		peakShare: table.peakShare
	};
}
//#endregion
//#region src/index-store.ts
/**
* The incremental index: every session on this machine, folded once.
*
* A full scan is not viable on the read path. The index therefore folds once
* in the background and afterwards only reads the bytes appended since,
* keyed on `(dev, ino, size, mtimeMs)`. Append-only logs make the tail read
* sound; an inode swap, a shrink, or a backwards clock each force that one
* session to be refolded from zero.
*
* Persistence is a single JSON file below `DSH_HOME` (atomic temp+rename),
* not `ctx.storageDomain`: an optional service must never be the reason the
* plugin — and its panel — fails to load, and a plain file is portable across
* every dsh composition.
*
* @module dsh-usage-unified/index-store
*/
/** Resolve the local IANA zone, falling back to UTC on a stripped-down ICU build. */
function localTimeZone() {
	return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}
function isIndexEntry(value) {
	if (typeof value !== "object" || value === null) return false;
	const entry = value;
	return typeof entry.path === "string" && typeof entry.size === "number" && typeof entry.mtimeMs === "number" && typeof entry.ino === "number" && typeof entry.dev === "number" && typeof entry.cursor === "number" && typeof entry.header === "object" && entry.header !== null && typeof entry.fold === "object" && entry.fold !== null && typeof entry.carry === "object" && entry.carry !== null;
}
function isCache(value) {
	if (typeof value !== "object" || value === null) return false;
	const cache = value;
	return cache.schema === 2 && typeof cache.meta === "object" && cache.meta !== null && typeof cache.entries === "object" && cache.entries !== null;
}
/**
* Owns the folded index and answers summary/call queries.
*
* Single-writer: concurrent `refresh()` calls share one pass. The store never
* throws out of `refresh()` — a scan failure is reported through `status`, so
* a transient filesystem problem degrades the panel instead of the plugin.
*/
var UnifiedIndexStore = class {
	entries = /* @__PURE__ */ new Map();
	options;
	now;
	meta;
	running;
	loading;
	writeTimer;
	dirty = false;
	disposed = false;
	homeInfos = [];
	skippedArtifacts = 0;
	pricing = null;
	state;
	constructor(options) {
		this.options = options;
		this.now = options.now ?? (() => Date.now());
		this.meta = {
			tz: localTimeZone(),
			foldVersion: 2,
			builtAt: 0
		};
		this.state = {
			phase: "idle",
			indexed: 0,
			total: 0,
			durable: false,
			updatedAt: null
		};
		this.options;
	}
	/** Current build phase and progress. */
	get status() {
		return { ...this.state };
	}
	/** Stop the in-flight scan and refuse further work. */
	dispose() {
		this.disposed = true;
		if (this.writeTimer !== void 0) clearTimeout(this.writeTimer);
		this.writeTimer = void 0;
	}
	/** Load a previous cache; a meta/fold mismatch discards it rather than migrating. */
	async load() {
		try {
			const parsed = JSON.parse(await readFile(this.options.cachePath, "utf8"));
			if (!isCache(parsed)) return;
			const meta = parsed.meta;
			if (meta.tz !== this.meta.tz || meta.foldVersion !== 2) return;
			let count = 0;
			for (const [key, entry] of Object.entries(parsed.entries)) if (isIndexEntry(entry)) {
				this.entries.set(key, entry);
				count += 1;
			}
			this.meta = meta;
			this.state = {
				...this.state,
				phase: count > 0 ? "ready" : "idle",
				indexed: count,
				total: count,
				durable: true,
				updatedAt: meta.builtAt > 0 ? meta.builtAt : null
			};
		} catch {}
	}
	/**
	* Bring the index up to date.
	*
	* Concurrent callers join the running pass rather than starting a second one.
	*/
	refresh() {
		if (this.running !== void 0) return this.running;
		const pass = this.ensureLoaded().then(() => this.scan()).finally(() => {
			this.running = void 0;
		});
		this.running = pass;
		return pass;
	}
	/** Load the previous cache exactly once, before the first scan. */
	ensureLoaded() {
		this.loading ??= this.load();
		return this.loading;
	}
	/**
	* Build a snapshot from what the index currently holds, synchronously.
	*
	* @param query - the window, scope and workspace to report.
	*/
	snapshot(query) {
		const now = this.now();
		const today = todayKey(this.meta.tz, now);
		const custom = query.from !== void 0 && query.to !== void 0;
		const bounds = custom ? {
			from: query.from,
			to: query.to
		} : query.range === "all" ? {
			from: "",
			to: today
		} : rangeBounds(query.range, today);
		const rangeId = custom ? "30d" : query.range;
		const snapshotQuery = {
			from: bounds.from,
			to: bounds.to,
			timeZone: this.meta.tz,
			range: rangeId,
			scope: query.scope,
			now,
			...query.workspace === void 0 ? {} : { workspace: query.workspace }
		};
		const result = aggregateSnapshot([...this.entries.values()].map((entry) => entry.fold), snapshotQuery);
		const coverage = {
			...result.coverage,
			skippedArtifacts: this.skippedArtifacts
		};
		const cost = this.priceResult(result.models, result.sessions, [result.mostUsedModel, result.allTime.mostUsedModel]);
		return {
			version: 1,
			generatedAt: now,
			tz: this.meta.tz,
			range: {
				from: result.from,
				to: result.to,
				timeZone: this.meta.tz,
				id: result.range
			},
			status: this.status,
			totals: result.totals,
			allTime: result.allTime,
			mostUsedModel: result.mostUsedModel,
			days: result.days,
			hours: result.hours,
			models: result.models,
			workspaces: result.workspaces,
			sessions: result.sessions,
			sessionTotal: result.sessionTotal,
			cost,
			homes: this.homeInfos,
			coverage
		};
	}
	/** Decorate the model/session rows in place and summarize coverage. */
	priceResult(models, sessions, extras) {
		return applyPricing({
			basis: models.map((row) => ({
				row,
				modelId: row.key
			})),
			extra: [...sessions.map((row) => ({
				row,
				modelId: row.topModel
			})), ...extras.flatMap((row) => row === null ? [] : [{
				row,
				modelId: row.key
			}])]
		}, this.pricing);
	}
	/**
	* Paginate the call-detail rows.
	*
	* @param query - window, scope, workspace, filters and pagination.
	*/
	calls(query) {
		const now = this.now();
		const today = todayKey(this.meta.tz, now);
		const custom = query.from !== void 0 && query.to !== void 0;
		const bounds = custom ? {
			from: query.from,
			to: query.to
		} : query.range === "all" ? {
			from: "",
			to: today
		} : rangeBounds(query.range, today);
		const filter = {
			from: bounds.from,
			to: bounds.to,
			timeZone: this.meta.tz,
			range: custom ? "30d" : query.range,
			scope: query.scope,
			now,
			maxRecords: query.maxRecords,
			...query.workspace === void 0 ? {} : { workspace: query.workspace },
			...query.model === void 0 ? {} : { model: query.model },
			...query.provider === void 0 ? {} : { provider: query.provider },
			...query.session === void 0 ? {} : { session: query.session },
			...query.minInputTokens === void 0 ? {} : { minInputTokens: query.minInputTokens },
			...query.minOutputTokens === void 0 ? {} : { minOutputTokens: query.minOutputTokens }
		};
		const rows = collectCalls([...this.entries.values()].map((entry) => entry.fold), filter);
		const offset = (query.page - 1) * query.pageSize;
		return {
			indexReady: this.state.phase === "ready" || this.state.phase === "error",
			items: rows.slice(offset, offset + query.pageSize),
			page: query.page,
			pageSize: query.pageSize,
			total: rows.length,
			hasMore: rows.length > query.page * query.pageSize
		};
	}
	/** Total tokens across all indexed sessions — cheap enough for the CSV export. */
	async exportRows(query) {
		const snapshot = this.snapshot(query);
		return {
			days: snapshot.days,
			models: snapshot.models
		};
	}
	async scan() {
		if (this.disposed) return;
		const firstBuild = this.state.phase !== "ready";
		if (firstBuild) this.state = {
			...this.state,
			phase: "building",
			indexed: 0,
			total: 0
		};
		this.skippedArtifacts = 0;
		const seen = /* @__PURE__ */ new Set();
		let discovered = 0;
		let processed = 0;
		const publishProgress = () => {
			if (firstBuild) this.state = {
				...this.state,
				indexed: processed,
				total: discovered
			};
		};
		try {
			this.pricing = this.options.pricingPath === void 0 ? null : await loadPricing(this.options.pricingPath);
			const discovery = await discoverDshHomes({
				currentHome: this.options.currentHome,
				extraRoots: this.options.extraSessionRoots,
				...this.options.osHome === void 0 ? {} : { osHome: this.options.osHome }
			});
			const infos = discovery.homes.map((home) => ({
				home: home.home,
				current: home.current,
				sessions: 0
			}));
			for (const problem of discovery.problems) infos.push({
				home: problem.home,
				current: false,
				sessions: 0,
				error: problem.error
			});
			this.homeInfos = infos;
			const infoByRoot = new Map(discovery.homes.map((home, index) => [home.sessionsRoot, infos[index]]));
			const pending = [];
			for (const home of discovery.homes) for await (const artifact of walkSessionArtifacts(home)) {
				if (this.disposed) return;
				seen.add(artifact.key);
				const info = infoByRoot.get(home.sessionsRoot);
				if (info !== void 0) info.sessions += 1;
				discovered += 1;
				pending.push(artifact);
			}
			publishProgress();
			let lastYield = this.now();
			let next = 0;
			const lane = async () => {
				for (;;) {
					if (this.disposed) return;
					const artifact = pending[next];
					next += 1;
					if (artifact === void 0) return;
					await this.foldOne(artifact);
					processed += 1;
					publishProgress();
					const stamp = this.now();
					if (stamp - lastYield >= this.options.chunkYieldMs) {
						lastYield = stamp;
						await new Promise((resolve) => {
							setImmediate(resolve);
						});
					}
				}
			};
			const lanes = Math.max(1, Math.min(16, Math.floor(this.options.concurrency ?? 4)));
			await Promise.all(Array.from({ length: lanes }, () => lane()));
			for (const key of [...this.entries.keys()]) {
				if (seen.has(key)) continue;
				this.entries.delete(key);
				this.dirty = true;
			}
			this.meta = {
				...this.meta,
				builtAt: this.now()
			};
			this.state = {
				...this.state,
				phase: "ready",
				indexed: this.entries.size,
				total: this.entries.size,
				durable: true,
				updatedAt: this.meta.builtAt
			};
			if (this.dirty) {
				this.dirty = false;
				this.scheduleWrite();
			}
		} catch (error) {
			this.state = {
				...this.state,
				phase: "error",
				message: error instanceof Error ? error.message : String(error)
			};
		}
	}
	/**
	* Bring one artifact's entry up to date, reusing the previous read when the
	* file only grew. Unchanged artifacts cost a stat, not a decode.
	*/
	async foldOne(artifact) {
		const previous = this.entries.get(artifact.key);
		if (previous !== void 0 && previous.size === artifact.size && previous.mtimeMs === artifact.mtimeMs && previous.ino === artifact.ino && previous.dev === artifact.dev) return;
		const resumable = previous !== void 0 && previous.ino === artifact.ino && previous.dev === artifact.dev && artifact.size >= previous.cursor && artifact.mtimeMs >= previous.mtimeMs;
		const updated = await this.foldArtifact(artifact, resumable ? previous : void 0);
		if (updated === void 0) {
			this.skippedArtifacts += 1;
			if (previous !== void 0) {
				this.entries.delete(artifact.key);
				this.dirty = true;
			}
			return;
		}
		this.entries.set(artifact.key, updated);
		this.dirty = true;
	}
	async foldArtifact(artifact, previous) {
		try {
			const read = await readArtifact(artifact.path, previous?.cursor ?? 0, previous?.header);
			if (read.foreign) return void 0;
			const state = previous === void 0 ? createFoldState(read.header, artifact.home.sessionsRoot) : {
				fold: previous.fold,
				carry: previous.carry
			};
			foldEvents(state, read.events, {
				tz: this.meta.tz,
				now: this.now(),
				includeCompaction: this.options.includeCompaction
			});
			state.fold.truncated = read.torn;
			return {
				path: artifact.path,
				size: artifact.size,
				mtimeMs: artifact.mtimeMs,
				ino: artifact.ino,
				dev: artifact.dev,
				cursor: read.cursor,
				header: read.header,
				fold: state.fold,
				carry: state.carry
			};
		} catch {
			return;
		}
	}
	scheduleWrite() {
		if (this.disposed || this.writeTimer !== void 0) return;
		this.writeTimer = setTimeout(() => {
			this.writeTimer = void 0;
			this.persist().catch(() => {});
		}, this.options.cacheWriteDelayMs);
		this.writeTimer.unref?.();
	}
	async persist() {
		if (this.disposed) return;
		const entries = {};
		for (const [key, entry] of this.entries) entries[key] = entry;
		const cache = {
			schema: 2,
			meta: this.meta,
			entries
		};
		const temporary = `${this.options.cachePath}.${process.pid}.tmp`;
		await mkdir(dirname(this.options.cachePath), { recursive: true });
		await writeFile(temporary, JSON.stringify(cache), {
			encoding: "utf8",
			mode: 384
		});
		await rename(temporary, this.options.cachePath);
	}
	/** Flush the index immediately; used on host disposal. */
	async flush() {
		if (this.writeTimer !== void 0) {
			clearTimeout(this.writeTimer);
			this.writeTimer = void 0;
		}
		await this.persist().catch(() => {});
	}
};
//#endregion
//#region src/transport.ts
const LOOPBACK_ADDRESSES = /* @__PURE__ */ new Set([
	"127.0.0.1",
	"::1",
	"::ffff:127.0.0.1"
]);
/** Whether a request arrived over the loopback interface. */
function isLoopbackRequest(request) {
	const address = request.socket.remoteAddress;
	return address !== void 0 && LOOPBACK_ADDRESSES.has(address);
}
function sendJson(response, status, body) {
	const payload = body === null ? "" : JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	response.end(payload);
}
const RANGES = /* @__PURE__ */ new Set([
	"all",
	"30d",
	"7d"
]);
/**
* Retired range ids that still answer, mapped to their replacement.
*
* `year` fed the activity heatmap, which both halves have dropped. A browser
* holding a cached client bundle can still ask for it, and a 400 there would
* break the whole panel rather than one removed chart — so it degrades to
* all-time instead of failing.
*/
const RANGE_ALIASES = /* @__PURE__ */ new Map([["year", "all"]]);
const SCOPES = /* @__PURE__ */ new Set([
	"all",
	"main",
	"subtasks"
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function parseCommon(url) {
	const requested = url.searchParams.get("range") ?? "all";
	const range = RANGE_ALIASES.get(requested) ?? requested;
	if (!RANGES.has(range)) throw new Error("Invalid range");
	const scope = url.searchParams.get("scope") ?? "all";
	if (!SCOPES.has(scope)) throw new Error("Invalid task scope");
	const rawWorkspace = url.searchParams.get("workspace") ?? void 0;
	if (rawWorkspace !== void 0 && (rawWorkspace.length === 0 || rawWorkspace.length > 4096)) throw new Error("Invalid workspace filter");
	const rawFrom = url.searchParams.get("from") ?? void 0;
	const rawTo = url.searchParams.get("to") ?? void 0;
	if (rawFrom !== void 0 && !ISO_DATE.test(rawFrom)) throw new Error("Invalid from date");
	if (rawTo !== void 0 && !ISO_DATE.test(rawTo)) throw new Error("Invalid to date");
	if (rawFrom !== void 0 && rawTo !== void 0 && rawFrom > rawTo) throw new Error("Invalid date range");
	const parsed = {
		range,
		scope
	};
	if (rawWorkspace !== void 0) parsed.workspace = rawWorkspace;
	if (rawFrom !== void 0 && rawTo !== void 0) {
		parsed.from = rawFrom;
		parsed.to = rawTo;
	}
	return parsed;
}
function parseInteger(url, name, min, max, fallback) {
	const raw = url.searchParams.get(name);
	if (raw === null || raw === "") return fallback;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
	return value;
}
/**
* Serve the unified routes.
*
* @param webServer - `ctx.webServer`.
* @param store - the index answering every query.
* @param apiPath - the same-origin prefix, without a trailing slash.
* @returns the disposer removing the route.
*/
function registerRoutes(webServer, store, apiPath) {
	return webServer.register({
		kind: "prefix",
		path: apiPath,
		handler: (request, response) => {
			if (!isLoopbackRequest(request)) {
				sendJson(response, 403, { error: "usage statistics are served to loopback clients only" });
				return;
			}
			if (request.method !== "GET" && request.method !== "HEAD") {
				response.writeHead(405, { allow: "GET, HEAD" });
				response.end();
				return;
			}
			const url = new URL(request.url ?? "/", "http://localhost");
			store.refresh();
			const head = request.method === "HEAD";
			try {
				if (url.pathname === `${apiPath}/calls`) {
					const common = parseCommon(url);
					const model = url.searchParams.get("model") ?? void 0;
					const provider = url.searchParams.get("provider") ?? void 0;
					const session = url.searchParams.get("session") ?? void 0;
					if (model !== void 0 && model.length > 4096) throw new Error("Invalid model filter");
					if (provider !== void 0 && provider.length > 4096) throw new Error("Invalid provider filter");
					if (session !== void 0 && (session.length === 0 || session.length > 256)) throw new Error("Invalid session filter");
					const threshold = (name) => {
						const raw = url.searchParams.get(name);
						if (raw === null || raw === "") return void 0;
						const value = Number(raw);
						if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name}`);
						return value;
					};
					const minInputTokens = threshold("minInputTokens");
					const minOutputTokens = threshold("minOutputTokens");
					const page = store.calls({
						...common,
						page: parseInteger(url, "page", 1, 1e6, 1),
						pageSize: parseInteger(url, "pageSize", 1, 200, 50),
						maxRecords: parseInteger(url, "maxRecords", 1, 1e4, 1e3),
						...model === void 0 ? {} : { model },
						...provider === void 0 ? {} : { provider },
						...session === void 0 ? {} : { session },
						...minInputTokens === void 0 ? {} : { minInputTokens },
						...minOutputTokens === void 0 ? {} : { minOutputTokens }
					});
					sendJson(response, 200, head ? null : page);
					return;
				}
				const common = parseCommon(url);
				const snapshot = store.snapshot(common);
				if (url.pathname === `${apiPath}/export.csv`) {
					const csv = exportCsv(snapshot.days, snapshot.models);
					response.writeHead(200, {
						"content-type": "text/csv; charset=utf-8",
						"content-disposition": "attachment; filename=\"dsh-usage-unified.csv\"",
						"cache-control": "no-store",
						"x-content-type-options": "nosniff"
					});
					response.end(head ? void 0 : `\uFEFF${csv}`);
					return;
				}
				if (url.pathname === `${apiPath}/export.json`) response.setHeader("content-disposition", "attachment; filename=\"dsh-usage-unified.json\"");
				else if (url.pathname !== `${apiPath}/snapshot`) {
					sendJson(response, 404, { error: "Not found" });
					return;
				}
				sendJson(response, 200, head ? null : snapshot);
			} catch (error) {
				sendJson(response, 400, { error: error instanceof Error ? error.message : "Bad request" });
			}
		}
	});
}
/** The path segment the snapshot route answers on, for the client's reference. */
const DEFAULT_API_PATH = "/usage-unified/v1";
//#endregion
//#region src/index.ts
const name = "usage-unified";
const Config = Schema.object({
	extraSessionRoots: Schema.array(String).default([]),
	includeCompaction: Schema.boolean().default(true),
	refreshIntervalMs: Schema.number().min(1e3).default(3e4),
	indexChunkYieldMs: Schema.number().min(1).max(1e3).default(16),
	apiPath: Schema.string().default(DEFAULT_API_PATH),
	cachePath: Schema.string().description("Optional index path; defaults below DSH_HOME."),
	pricingPath: Schema.string().description("Optional pricing table; defaults below DSH_HOME."),
	indexConcurrency: Schema.number().min(1).max(16).default(4),
	cacheWriteDelayMs: Schema.number().min(250).max(3e4).default(1e3)
});
/**
* Mount the index and its transport.
* @param ctx - the plugin context.
* @param config - validated configuration.
*/
function apply(ctx, config) {
	const apiPath = (config.apiPath || "/usage-unified/v1").replace(/\/$/, "");
	const store = new UnifiedIndexStore({
		extraSessionRoots: config.extraSessionRoots,
		includeCompaction: config.includeCompaction,
		chunkYieldMs: config.indexChunkYieldMs,
		currentHome: resolveDshHome(),
		cachePath: config.cachePath ?? dshHomePath("usage-unified", "index-v1.json"),
		pricingPath: config.pricingPath ?? dshHomePath("usage-unified", "pricing.json"),
		concurrency: config.indexConcurrency,
		cacheWriteDelayMs: config.cacheWriteDelayMs
	});
	ctx.effect(() => () => {
		store.dispose();
	}, "usageUnified.index");
	const serverFiber = ctx.inject(["webServer"], (childCtx) => {
		childCtx.effect(() => registerRoutes(childCtx.webServer, store, apiPath), "usageUnified.route");
	});
	ctx.effect(() => () => {
		serverFiber.dispose();
	}, "usageUnified.optionalWebServer");
	ctx.effect(() => {
		store.refresh();
		const timer = setInterval(() => {
			store.refresh();
		}, config.refreshIntervalMs);
		timer.unref?.();
		return () => {
			clearInterval(timer);
			store.flush();
		};
	}, "usageUnified.refreshLoop");
	ctx.logger?.debug?.("usage-unified: indexing in %s", localTimeZone());
}
//#endregion
export { Config, DEFAULT_API_PATH, DEFAULT_PEAK_SHARE, FOLD_VERSION, UnifiedIndexStore, addBuckets, addTally, aggregateSnapshot, apply, applyPricing, collectCalls, costOf, createFoldState, decodeArtifactBytes, discoverDshHomes, exportCsv, foldEvents, hasWork, isSubtask, loadPricing, logPriority, lookupPrice, name, normalizeModelId, parsePricing, peakHourOf, rangeBounds, readArtifact, registerRoutes, scanZstdFrames, streaks, totalOf, walkSessionArtifacts, zeroBuckets, zeroTally };
