window.__ModuleLoader__.load({
	id: "dsh-usage-unified",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/i18n.ts
		/**
		* Merged dictionaries for the unified dashboard.
		*
		* The Chinese object is the source of truth for the key set; the English one
		* is typed against it so a missing translation is a compile error.
		*
		* @module dsh-usage-unified/client/i18n
		*/
		const zh = {
			nav: "使用统计",
			title: "使用统计",
			appUsage: "全机用量",
			back: "返回对话",
			rangeLabel: "趋势范围",
			last7Days: "近 7 天",
			last30Days: "近 30 天",
			allRange: "全部",
			workspace: "工作区",
			taskScope: "任务范围",
			allWorkspaces: "全部工作区",
			allTasks: "全部任务",
			mainOnly: "仅主任务",
			subtasksOnly: "仅子任务",
			heatmap: "活跃热力图",
			less: "较少",
			more: "较多",
			mon: "一",
			wed: "三",
			fri: "五",
			callsSuffix: "轮",
			dailyTrend: "按天 Token 趋势",
			modelUsage: "模型用量",
			tokenSummary: "输入、输出与缓存合计",
			callsCount: "次调用",
			tokenComposition: "Token 构成",
			modelBuckets: "模型 Token 明细",
			bucketInput: "输入",
			bucketCacheRead: "缓存读",
			bucketCacheWrite: "缓存写",
			bucketOutput: "输出",
			input: "输入",
			output: "输出",
			cacheRead: "缓存读取",
			cacheWrite: "缓存写入",
			tokensUsage: "Tokens 用量",
			inputOutputDetail: "输入 {input} · 输出 {output}",
			sessions: "会话数量",
			messages: "消息数量",
			activeDays: "活跃天数",
			streak: "当前连续天数",
			longestStreak: "最长连续天数",
			peakHour: "高峰时段",
			mostUsedModel: "最常用模型",
			noData: "暂无数据",
			subagentNote: "含 {n} 个子会话",
			loadError: "统计数据暂时无法读取",
			loading: "正在建立本地增量索引…",
			callsTitle: "调用明细",
			callsNote: "每次模型调用 · 最新在前",
			callsLoadError: "调用明细暂时无法读取",
			callsLoading: "正在加载调用明细…",
			callsIndexing: "正在建立本地增量索引…",
			callsEmpty: "暂无调用数据",
			allModels: "全部模型",
			allProviders: "全部提供商",
			minInput: "输入 ≥",
			minOutput: "输出 ≥",
			tokenUnit: "Token",
			clearFilters: "清除筛选",
			maxRecords: "明细上限 {size} 条",
			recordCount: "{size} 条",
			perPage: "{size} 条/页",
			prevPage: "上一页",
			nextPage: "下一页",
			pageInfo: "{start}–{end} / 共 {total} 条",
			colTime: "时间",
			colDuration: "响应耗时",
			colInput: "输入",
			colOutput: "输出",
			colCacheRate: "缓存率",
			colModel: "模型",
			colEffort: "思考程度",
			effortMax: "最大",
			effortHigh: "高",
			effortMedium: "中",
			effortLow: "低",
			notRecorded: "未记录",
			cacheRate: "{percent}%",
			durationSubSecond: "<1s",
			timeAm: "上午",
			timePm: "下午",
			peakHourPattern: "{period} {h12} 点",
			footHomes: "{n} 个 dsh home",
			footUpdated: "更新于{when}",
			footMemory: "内存索引",
			footCoverage: "{percent}% 的步骤有 provider 计量",
			footRetried: "{n} 个重试步骤未计入",
			footTruncated: "{n} 个会话仍在写入",
			footSkipped: "跳过 {n} 个日志",
			whenJustNow: "刚刚",
			whenMinutes: "{n} 分钟前",
			whenHours: "{n} 小时前",
			whenDays: "{n} 天前",
			whenNever: "从未",
			cacheIncludedNote: "总量含缓存读"
		};
		const en = {
			nav: "Usage Stats",
			title: "Usage Stats",
			appUsage: "Machine-wide",
			back: "Back to chat",
			rangeLabel: "Range",
			last7Days: "Last 7 days",
			last30Days: "Last 30 days",
			allRange: "All",
			workspace: "Workspace",
			taskScope: "Scope",
			allWorkspaces: "All workspaces",
			allTasks: "All tasks",
			mainOnly: "Main tasks only",
			subtasksOnly: "Subtasks only",
			heatmap: "Activity Heatmap",
			less: "Less",
			more: "More",
			mon: "M",
			wed: "W",
			fri: "F",
			callsSuffix: "calls",
			dailyTrend: "Daily Token Trend",
			modelUsage: "Model Usage",
			tokenSummary: "Input, output and cache total",
			callsCount: "calls",
			tokenComposition: "Token Breakdown",
			modelBuckets: "Per-model Token Split",
			bucketInput: "Input",
			bucketCacheRead: "Cache read",
			bucketCacheWrite: "Cache write",
			bucketOutput: "Output",
			input: "Input",
			output: "Output",
			cacheRead: "Cache read",
			cacheWrite: "Cache write",
			tokensUsage: "Tokens Used",
			inputOutputDetail: "Input {input} · Output {output}",
			sessions: "Sessions",
			messages: "Messages",
			activeDays: "Active Days",
			streak: "Current Streak",
			longestStreak: "Longest Streak",
			peakHour: "Peak Hour",
			mostUsedModel: "Most Used Model",
			noData: "No data",
			subagentNote: "+{n} subagent",
			loadError: "Unable to load usage stats",
			loading: "Building local index…",
			callsTitle: "Call Details",
			callsNote: "Per model call · newest first",
			callsLoadError: "Unable to load call details",
			callsLoading: "Loading call details…",
			callsIndexing: "Building local index…",
			callsEmpty: "No calls yet",
			allModels: "All models",
			allProviders: "All providers",
			minInput: "Input ≥",
			minOutput: "Output ≥",
			tokenUnit: "Token",
			clearFilters: "Clear filters",
			maxRecords: "Detail limit {size}",
			recordCount: "{size} records",
			perPage: "{size} / page",
			prevPage: "Prev",
			nextPage: "Next",
			pageInfo: "{start}–{end} / {total}",
			colTime: "Time",
			colDuration: "Response time",
			colInput: "Input",
			colOutput: "Output",
			colCacheRate: "Cache",
			colModel: "Model",
			colEffort: "Thinking",
			effortMax: "Max",
			effortHigh: "High",
			effortMedium: "Medium",
			effortLow: "Low",
			notRecorded: "Not recorded",
			cacheRate: "{percent}%",
			durationSubSecond: "<1s",
			peakHourPattern: "{h12} {period}",
			timeAm: "AM",
			timePm: "PM",
			footHomes: "{n} dsh homes",
			footUpdated: "updated {when}",
			footMemory: "in-memory index",
			footCoverage: "{percent}% of steps had provider metering",
			footRetried: "{n} retried steps not counted",
			footTruncated: "{n} sessions still being written",
			footSkipped: "{n} logs skipped",
			whenJustNow: "just now",
			whenMinutes: "{n}m ago",
			whenHours: "{n}h ago",
			whenDays: "{n}d ago",
			whenNever: "never",
			cacheIncludedNote: "Totals include cache reads"
		};
		const NS = "usage-unified";
		const dictionaries = {
			zh,
			en
		};
		function languageOf(locale) {
			return /^zh(?:-|$)/i.test(locale) ? "zh" : "en";
		}
		function translate(lang, key, vars) {
			let text = dictionaries[lang][key];
			if (vars !== void 0) for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value));
			return text;
		}
		function formatDateLabel(date, lang) {
			const [, month = "", day = ""] = date.split("-");
			return lang === "zh" ? `${Number(month)}月${Number(day)}日` : `${Number(month)}/${Number(day)}`;
		}
		function numberLocaleOf(lang) {
			return lang === "zh" ? "zh-CN" : "en-US";
		}
		/** Format a 0-23 hour through the dictionary's own 12/24-hour convention. */
		function formatHour(hour, t) {
			if (hour === null) return "—";
			return t("peakHourPattern", {
				h12: hour % 12 === 0 ? 12 : hour % 12,
				h24: hour,
				period: hour < 12 ? t("timeAm") : t("timePm")
			});
		}
		let localeRuntime = null;
		function installLocale(locale) {
			localeRuntime = locale;
			const unregister = locale.register(NS, dictionaries);
			return () => {
				unregister();
				if (localeRuntime === locale) localeRuntime = null;
			};
		}
		const FALLBACK_SNAPSHOT = {
			active: "zh",
			revision: 0
		};
		function useLocale() {
			const lang = languageOf((0, react.useSyncExternalStore)((callback) => localeRuntime?.subscribe(callback) ?? (() => {}), () => localeRuntime?.getSnapshot() ?? FALLBACK_SNAPSHOT).active);
			return {
				lang,
				numberLocale: numberLocaleOf(lang),
				t: (key, vars) => translate(lang, key, vars)
			};
		}
		//#endregion
		//#region src/client/source.ts
		/** Must match the host's `apiPath`. */
		const API_PATH = "/usage-unified/v1";
		/** Wire schema this build understands. */
		const SUPPORTED_VERSION = 1;
		function messageOf(body, status) {
			if (typeof body === "object" && body !== null && typeof body.error === "string") return body.error;
			return `request failed with status ${status}`;
		}
		function commonParams(range, scope, workspace) {
			const params = new URLSearchParams({
				range,
				scope,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
			});
			if (workspace !== "") params.set("workspace", workspace);
			return params;
		}
		/** Fetch the dashboard snapshot for one window. */
		async function fetchSnapshot(range, scope, workspace, signal) {
			const response = await fetch(`${API_PATH}/snapshot?${commonParams(range, scope, workspace)}`, {
				signal,
				headers: { accept: "application/json" }
			});
			const body = await response.json().catch(() => void 0);
			if (!response.ok) throw new Error(messageOf(body, response.status));
			const snapshot = body;
			if (snapshot?.version !== SUPPORTED_VERSION) throw new Error("usage-unified format mismatch — reload after the update completes");
			return snapshot;
		}
		/** Fetch one page of call rows. */
		async function fetchCalls(request, signal) {
			const params = commonParams(request.range, request.scope, request.workspace);
			params.set("page", String(request.page));
			params.set("pageSize", String(request.pageSize));
			params.set("maxRecords", String(request.maxRecords));
			if (request.model !== "") params.set("model", request.model);
			if (request.provider !== "") params.set("provider", request.provider);
			if (request.minInputTokens !== "") params.set("minInputTokens", request.minInputTokens);
			if (request.minOutputTokens !== "") params.set("minOutputTokens", request.minOutputTokens);
			const response = await fetch(`${API_PATH}/calls?${params}`, {
				signal,
				headers: { accept: "application/json" }
			});
			const body = await response.json().catch(() => void 0);
			if (!response.ok) throw new Error(messageOf(body, response.status));
			return body;
		}
		/** Same-origin download URL for a CSV/JSON export of the current window. */
		function exportUrl(range, scope, workspace, format) {
			return `${API_PATH}/export.${format}?${commonParams(range, scope, workspace)}`;
		}
		//#endregion
		//#region src/client/styles.ts
		const styles = String.raw`
[data-usage-stats] {
  --us-bg: var(--dsw-alias-bg-base, #ffffff);
  --us-surface: color-mix(in srgb, var(--dsw-alias-bg-layer-1, #f5f5f5) 92%, var(--us-bg));
  --us-raised: var(--dsw-alias-bg-layer-2, #ffffff);
  --us-hover: var(--dsw-alias-interactive-bg-hover, #eef1f4);
  --us-text: var(--dsw-alias-label-primary, #17191c);
  --us-muted: var(--dsw-alias-label-secondary, #747b86);
  --us-border: var(--dsw-alias-border-l1, #e4e7eb);
  --us-accent: #1677ff;
  --us-blue-2: #65a9ff;
  --us-blue-3: #b9d9ff;
  --us-green: #2aa86f;
  --us-shadow-soft: 0 1px 2px rgba(18, 26, 41, .03), 0 8px 28px rgba(18, 26, 41, .035);
  color: var(--us-text);
  font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif);
  font-size: 14px;
  box-sizing: border-box;
}
[data-usage-stats], [data-usage-stats] button, [data-usage-stats] input, [data-usage-stats] select, [data-usage-stats] table { font-family: var(--dsw-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', Helvetica, Arial, sans-serif); }
body[data-ds-dark-theme] [data-usage-stats] {
    --us-bg: var(--dsw-alias-bg-base, #18191c);
    --us-surface: var(--dsw-alias-bg-layer-1, #222428);
    --us-raised: var(--dsw-alias-bg-layer-2, #292b30);
    --us-hover: var(--dsw-alias-interactive-bg-hover, #31343a);
    --us-text: var(--dsw-alias-label-primary, #f2f3f5);
    --us-muted: var(--dsw-alias-label-secondary, #a6acb5);
    --us-border: var(--dsw-alias-border-l1, #35383e);
}
[data-usage-stats] *, [data-usage-stats] *::before, [data-usage-stats] *::after { box-sizing: border-box; }
.us-nav { width: 100%; height: 38px; border: 0; border-radius: 10px; display: flex; align-items: center; justify-content: flex-start; gap: 10px; padding: 0 10px; color: var(--us-muted); background: transparent; cursor: pointer; font: inherit; }
.us-nav:hover { color: var(--us-text); background: var(--us-hover); }
.us-nav[data-rail="true"] { width: 36px; padding: 0; justify-content: center; }
.us-nav svg { flex: none; }
.us-shell { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--us-bg); overflow: hidden; animation: us-enter 180ms ease-out; }
.us-top { min-height: 90px; flex: none; display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 18px clamp(24px, 4vw, 58px) 10px; }
.us-heading { display: flex; align-items: flex-end; gap: 20px; }
.us-title { font-size: clamp(28px, 3vw, 40px); line-height: 1.12; font-weight: 750; letter-spacing: -.045em; }
.us-tab { position: relative; padding: 0 2px 9px; font-size: 16px; color: var(--us-text); }
.us-tab::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; border-radius: 2px; background: var(--us-text); }
.us-back { height: 40px; display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 12px; padding: 0 14px; color: var(--us-muted); background: transparent; cursor: pointer; font: inherit; transition: color 150ms ease, background 150ms ease, transform 150ms ease; }
.us-back:hover { color: var(--us-text); background: var(--us-hover); transform: translateX(-2px); }
.us-close, .us-icon-btn { margin-left: auto; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 10px; color: var(--us-muted); background: transparent; cursor: pointer; }
.us-close:hover, .us-icon-btn:hover { color: var(--us-text); background: var(--us-hover); }
.us-scroll { overflow: auto; scrollbar-gutter: stable; padding: 10px clamp(24px, 4vw, 58px) 40px; }
.us-content { width: min(1180px, 100%); margin: 0 auto; }
.us-range-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin: 0 0 12px; }
.us-range-label { font-size: 16px; font-weight: 520; }
.us-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.us-filterbar { padding: 10px; border: 1px solid color-mix(in srgb, var(--us-border) 72%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--us-surface) 70%, transparent); }
.us-segment { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--us-border); border-radius: 11px; background: var(--us-raised); }
.us-segment button { border: 0; min-width: 98px; padding: 7px 13px; border-radius: 8px; color: var(--us-muted); background: transparent; cursor: pointer; font: inherit; white-space: nowrap; }
.us-segment button[aria-pressed="true"] { color: var(--us-text); background: var(--us-hover); box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.us-field { height: 38px; min-width: 150px; max-width: 260px; padding: 0 32px 0 11px; border: 1px solid transparent; border-radius: 10px; color: var(--us-text); background: var(--us-raised); font: inherit; outline: none; transition: border-color 140ms ease, box-shadow 140ms ease; }
.us-field:hover { border-color: var(--us-border); }
.us-field:focus { border-color: color-mix(in srgb, var(--us-accent) 58%, var(--us-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--us-accent) 12%, transparent); }
.us-select { position: relative; min-width: 190px; max-width: 280px; }
.us-select-trigger { width: 100%; height: 38px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 0 11px; border: 1px solid transparent; border-radius: 10px; color: var(--us-text); background: var(--us-raised); cursor: pointer; font: inherit; text-align: left; outline: none; transition: border-color 140ms ease, box-shadow 140ms ease; }
.us-select-trigger span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.us-select-trigger svg { flex: none; transition: transform 160ms ease; }
.us-select[data-open] .us-select-trigger svg { transform: rotate(180deg); }
.us-select-trigger:hover { border-color: var(--us-border); }
.us-select-trigger:focus-visible, .us-select[data-open] .us-select-trigger { border-color: color-mix(in srgb, var(--us-accent) 58%, var(--us-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--us-accent) 12%, transparent); }
.us-select-menu { position: absolute; z-index: 80; top: calc(100% + 6px); left: 0; right: 0; max-height: 248px; display: grid; gap: 4px; overflow-y: auto; padding: 5px; border: 1px solid var(--us-border); border-radius: 10px; color: var(--us-text); background: var(--us-raised); box-shadow: 0 12px 34px rgba(0,0,0,.14); animation: us-select-in 130ms ease-out; }
.us-select-menu button { width: 100%; min-height: 34px; display: block; overflow: hidden; padding: 6px 10px; border: 0; border-radius: 7px; color: inherit; background: transparent; cursor: pointer; font: inherit; text-align: left; text-overflow: ellipsis; white-space: nowrap; }
.us-select-menu button:hover { background: var(--us-hover); }
.us-select-menu button[aria-selected="true"] { color: var(--us-accent); background: color-mix(in srgb, var(--us-accent) 10%, transparent); }
.us-spacer { flex: 1; }
.us-export { height: 38px; display: inline-flex; align-items: center; gap: 7px; border: 0; border-radius: 10px; padding: 0 12px; background: transparent; color: var(--us-muted); text-decoration: none; font-size: 13px; transition: color 140ms ease, background 140ms ease; }
.us-export:hover { color: var(--us-text); background: var(--us-raised); }
.us-cards { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
.us-card, .us-panel { border: 1px solid color-mix(in srgb, var(--us-border) 55%, transparent); background: var(--us-surface); border-radius: 16px; box-shadow: var(--us-shadow-soft); }
.us-card { min-height: 112px; padding: 17px 18px; transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; animation: us-card-in 320ms both; }
.us-card:nth-child(2) { animation-delay: 35ms; } .us-card:nth-child(3) { animation-delay: 70ms; } .us-card:nth-child(4) { animation-delay: 105ms; } .us-card:nth-child(5) { animation-delay: 140ms; } .us-card:nth-child(6) { animation-delay: 175ms; }
.us-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--us-border) 88%, transparent); box-shadow: 0 2px 3px rgba(18,26,41,.04), 0 14px 36px rgba(18,26,41,.07); }
.us-card-label { display: flex; align-items: center; gap: 8px; color: var(--us-muted); font-size: 14px; }
.us-card-value { margin-top: 10px; font-size: clamp(29px,3vw,38px); line-height: 1; font-weight: 700; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
.us-card-detail { margin-top: 8px; color: var(--us-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.us-panel { margin-top: 14px; padding: 18px 20px; overflow: hidden; animation: us-panel-in 380ms 90ms both; }
.us-panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.us-panel-title { font-size: 16px; font-weight: 620; }
.us-panel-note { color: var(--us-muted); font-size: 12px; }
.us-heat-panel { overflow: visible; }
.us-heat-scroll { display: flex; align-items: flex-start; gap: 8px; width: 100%; overflow: visible; padding: 8px 4px 18px; }
.us-heat-week { flex: none; display: grid; grid-template-rows: repeat(7, 15px); gap: 4px; width: 14px; color: var(--us-muted); font-size: 10px; line-height: 15px; }
.us-heat-week span:nth-child(2) { grid-row: 3; }
.us-heat-week span:nth-child(3) { grid-row: 5; }
.us-heat { flex: 1; min-width: 0; display: grid; grid-template-rows: repeat(7, auto); grid-template-columns: repeat(53, minmax(0, 1fr)); grid-auto-flow: column; gap: clamp(2px, .28vw, 4px); width: 100%; }
.us-cell { width: 100%; max-width: 15px; aspect-ratio: 1; justify-self: center; border-radius: 3px; display: inline-block; background: color-mix(in srgb, var(--us-border) 66%, transparent); }
.us-cell[data-level="1"] { background: #d6e9ff; }
.us-cell[data-level="2"] { background: #a9d1ff; }
.us-cell[data-level="3"] { background: #72b2ff; }
.us-cell[data-level="4"] { background: #368ef2; }
.us-cell[data-level="5"] { background: #1068ca; }
body[data-ds-dark-theme] .us-cell[data-level="1"] { background: #173b63; }
body[data-ds-dark-theme] .us-cell[data-level="2"] { background: #1d568f; }
body[data-ds-dark-theme] .us-cell[data-level="3"] { background: #2173bd; }
body[data-ds-dark-theme] .us-cell[data-level="4"] { background: #2b91e9; }
body[data-ds-dark-theme] .us-cell[data-level="5"] { background: #67b7ff; }
.us-heat-legend { display: inline-flex; align-items: center; gap: 5px; }
.us-heat-legend .us-cell { width: 16px; height: 16px; }
.us-cell-tip { position: relative; cursor: default; outline: none; transition: transform 90ms ease, box-shadow 90ms ease; }
.us-cell-tip:hover, .us-cell-tip:focus-visible { box-shadow: 0 0 0 2px var(--us-bg), 0 0 0 3px var(--us-text); z-index: 3; }
.us-cell-tip:hover, .us-cell-tip:focus-visible { transform: scale(1.12); }
.us-floating-tip { position: fixed; z-index: 200; transform: translate(-50%, -100%); width: max-content; max-width: min(360px, calc(100vw - 24px)); padding: 9px 11px; border: 1px solid var(--us-border); border-radius: 10px; color: var(--us-text); background: color-mix(in srgb, var(--us-raised) 94%, transparent); box-shadow: 0 12px 38px rgba(0,0,0,.16); backdrop-filter: blur(14px); font-size: 12px; line-height: 1.4; pointer-events: none; animation: us-tip-in 110ms ease-out; }
.us-trend { padding: 22px 22px 18px; }
.us-chart-frame { position: relative; height: 330px; padding: 0 8px; border-radius: 12px; background: color-mix(in srgb, var(--us-raised) 38%, transparent); overflow: hidden; }
.us-grid-lines { position: absolute; inset: 26px 36px 47px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
.us-grid-lines i { display: block; width: 100%; border-top: 1px dashed color-mix(in srgb, var(--us-border) 72%, transparent); }
.us-chart-scroll { position: relative; height: 100%; width: 100%; overflow: hidden; }
.us-chart { height: 100%; width: 100%; min-width: 0; display: flex; align-items: stretch; gap: clamp(8px, 1.4vw, 24px); padding: 26px 36px 0; }
.us-chart[data-dense="true"] { gap: clamp(2px, .35vw, 6px); }
.us-bar-column { min-width: 0; flex: 1 1 0; height: 100%; display: grid; grid-template-rows: minmax(0, 1fr) 46px; align-items: end; }
.us-bar-wrap { width: min(68%, 76px); min-width: 3px; height: 100%; justify-self: center; display: flex; flex-direction: column-reverse; justify-content: flex-start; border-bottom: 1px solid color-mix(in srgb, var(--us-border) 90%, transparent); }
.us-chart[data-dense="true"] .us-bar-wrap { width: clamp(4px, 58%, 22px); }
.us-bar-hit { width: 100%; display: flex; flex-direction: column-reverse; justify-content: flex-start; border-radius: 3px 3px 0 0; outline: none; cursor: default; }
.us-bar-hit:focus-visible { box-shadow: 0 0 0 2px var(--us-bg), 0 0 0 3px var(--us-text); }
.us-bar-segment { flex: none; width: 100%; min-height: 1px; transform-origin: bottom; animation: us-bar-in 560ms cubic-bezier(.2,.8,.2,1) both; transition: filter 140ms ease, opacity 140ms ease; }
.us-bar-segment:last-child { border-radius: 3px 3px 0 0; }
.us-bar-hit:hover .us-bar-segment { filter: saturate(1.12) brightness(1.04); }
.us-date-label { align-self: start; justify-self: center; min-width: 68px; padding-top: 12px; color: var(--us-muted); font-size: 12px; line-height: 20px; text-align: center; white-space: nowrap; }
.us-legend { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 14px 28px; margin-top: 16px; color: var(--us-muted); font-size: 13px; }
.us-chart-tip { position: fixed; z-index: 220; transform: translate(-50%, -50%); min-width: 260px; max-width: min(390px, calc(100vw - 24px)); padding: 12px 14px; border: 1px solid var(--us-border); border-radius: 11px; color: var(--us-text); background: color-mix(in srgb, var(--us-raised) 96%, transparent); box-shadow: 0 14px 38px rgba(0,0,0,.16); backdrop-filter: blur(14px); pointer-events: none; animation: us-chart-tip-in 120ms ease-out; }
.us-chart-tip-head { display: flex; align-items: baseline; gap: 14px; margin-bottom: 8px; font-size: 15px; white-space: nowrap; }
.us-chart-tip-head strong { font-weight: 600; }
.us-chart-tip-head span { color: var(--us-text); }
.us-chart-tip-row { display: grid; grid-template-columns: 5px minmax(0, 1fr) auto; align-items: center; gap: 10px; min-height: 25px; }
.us-chart-tip-row i { width: 5px; height: 18px; border-radius: 3px; }
.us-chart-tip-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 550; }
.us-chart-tip-row b { font-weight: 400; font-variant-numeric: tabular-nums; }
.us-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--us-accent); display: inline-block; margin-right: 6px; }
.us-model-layout { display: grid; grid-template-columns: 230px 1fr; align-items: center; gap: 28px; }
.us-donut { width: 190px; aspect-ratio: 1; margin: auto; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--us-accent) 0 var(--us-p1), var(--us-green) var(--us-p1) var(--us-p2), var(--us-blue-3) var(--us-p2)); position: relative; }
.us-donut::after { content: ''; position: absolute; inset: 28px; border-radius: 50%; background: var(--us-surface); }
.us-donut-center { z-index: 1; text-align: center; font-weight: 700; font-size: 23px; }
.us-donut-center small { display: block; margin-top: 3px; color: var(--us-muted); font-weight: 400; font-size: 11px; }
.us-model-row { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 8px 16px; padding: 12px 0; border-bottom: 1px solid var(--us-border); }
.us-model-row:last-child { border-bottom: 0; }
.us-model-name { font-weight: 580; overflow: hidden; text-overflow: ellipsis; }
.us-model-meta, .us-model-percent { color: var(--us-muted); font-size: 12px; }
.us-breakdown { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; }
.us-break-item { min-width: 0; padding: 5px 14px 3px; border-left: 1px solid color-mix(in srgb, var(--us-border) 65%, transparent); background: transparent; }
.us-break-item:first-child { padding-left: 0; border-left: 0; }
.us-break-item span { display: block; color: var(--us-muted); font-size: 13px; margin-bottom: 5px; }
.us-break-item strong { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.us-state { min-height: 420px; display: grid; place-items: center; color: var(--us-muted); text-align: center; }
.us-spinner { width: 28px; height: 28px; margin: 0 auto 14px; border: 3px solid var(--us-border); border-top-color: var(--us-accent); border-radius: 50%; animation: us-spin .8s linear infinite; }
@keyframes us-spin { to { transform: rotate(360deg); } }
@keyframes us-enter { from { opacity: 0; transform: translateY(4px); } }
@keyframes us-card-in { from { opacity: 0; transform: translateY(8px); } }
@keyframes us-panel-in { from { opacity: 0; transform: translateY(10px); } }
@keyframes us-bar-in { from { transform: scaleY(0); opacity: .25; } }
@keyframes us-tip-in { from { opacity: 0; transform: translate(-50%, calc(-100% + 4px)); } }
@keyframes us-select-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } }
@keyframes us-chart-tip-in { from { opacity: 0; transform: translate(-50%, calc(-50% + 4px)) scale(.985); } }
@media (max-width: 760px) { .us-top { min-height: 88px; } .us-heading { gap: 12px; } .us-tab { display: none; } .us-cards { grid-template-columns: repeat(2,minmax(0,1fr)); } .us-model-layout { grid-template-columns: 1fr; } .us-breakdown { grid-template-columns: repeat(2,1fr); } .us-chart-frame { height: 280px; } .us-legend { justify-content: flex-start; } }
@media (max-width: 480px) { .us-cards { grid-template-columns: 1fr; } .us-toolbar { align-items: stretch; } .us-field, .us-select { max-width:none; flex:1; } }
@media (prefers-reduced-motion: reduce) { .us-shell, .us-spinner, .us-bar-segment, .us-card, .us-panel, .us-floating-tip, .us-chart-tip { animation: none; transition: none; } }
.us-calls-wrap { overflow: visible; }
.us-calls-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 12px; }
.us-calls-select { min-width: 180px; max-width: 240px; }
.us-calls-select .us-select-trigger { height: 34px; border-color: var(--us-border); }
.us-calls-select .us-select-menu { min-width: 100%; width: max-content; max-width: min(320px, calc(100vw - 32px)); }
.us-calls-number-field { height: 34px; width: 150px; display: flex; align-items: center; border: 1px solid var(--us-border); border-radius: 10px; color: var(--us-muted); background: var(--us-raised); transition: border-color 140ms ease, box-shadow 140ms ease; }
.us-calls-number-field:focus-within { border-color: color-mix(in srgb, var(--us-accent) 58%, var(--us-border)); box-shadow: 0 0 0 3px color-mix(in srgb, var(--us-accent) 10%, transparent); }
.us-calls-number-input { height: 32px; width: 92px; min-width: 0; padding: 0 0 0 10px; border: 0; outline: none; color: var(--us-text); background: transparent; font: inherit; }
.us-calls-number-field > span { padding: 0 9px 0 6px; font-size: 11px; color: var(--us-muted); }
.us-calls-clear { height: 34px; padding: 0 10px; border: 0; border-radius: 9px; color: var(--us-muted); background: transparent; cursor: pointer; font: inherit; transition: color 140ms ease, background 140ms ease; }
.us-calls-clear:hover { color: var(--us-text); background: var(--us-hover); }
.us-calls-page-size { min-width: 110px; }
.us-calls-max-records { min-width: 150px; }
.us-calls-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0 2px; font-size: 13px; }
.us-calls-table col { width: calc(100% / 7); }
.us-calls-table th { position: sticky; z-index: 2; top: 0; padding: 9px 10px; text-align: left; color: var(--us-muted); font-size: 12px; font-weight: 560; border-bottom: 1px solid var(--us-border); background: color-mix(in srgb, var(--us-surface) 96%, var(--us-raised)); white-space: nowrap; }
.us-calls-table td { padding: 9px 10px; box-shadow: inset 0 -1px color-mix(in srgb, var(--us-border) 48%, transparent); background-clip: padding-box; font-variant-numeric: tabular-nums; white-space: nowrap; transition: background 120ms ease, box-shadow 120ms ease; }
.us-calls-table tbody td:first-child { border-radius: 10px 0 0 10px; }
.us-calls-table tbody td:last-child { border-radius: 0 10px 10px 0; }
.us-calls-table tbody tr:hover td { background: color-mix(in srgb, var(--us-hover) 76%, transparent); box-shadow: none; }
.us-calls-table .us-number, .us-calls-table .us-center { text-align: left; font-variant-numeric: tabular-nums; }
.us-calls-time { color: var(--us-muted); }
.us-calls-model { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
.us-calls-effort.is-empty { color: var(--us-muted); }
.us-calls-pager { display: flex; align-items: center; gap: 12px; justify-content: flex-end; margin-top: 12px; color: var(--us-muted); font-size: 12px; }
.us-calls-page-buttons { display: inline-flex; gap: 4px; }
.us-calls-pager button { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; border: 1px solid var(--us-border); border-radius: 8px; color: var(--us-text); background: var(--us-raised); cursor: pointer; font: inherit; transition: background 120ms ease, border-color 120ms ease; }
.us-calls-pager button:hover:not(:disabled) { border-color: color-mix(in srgb, var(--us-border) 70%, var(--us-text)); background: var(--us-hover); }
.us-calls-pager button svg { width: 15px; height: 15px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.us-calls-pager button:disabled { opacity: .45; cursor: default; }
@media (max-width: 760px) {
  .us-calls-toolbar .us-spacer { display: none; }
  .us-calls-select { flex: 1 1 180px; min-width: 0; max-width: none; }
  .us-calls-number-field { flex: 1 1 150px; width: auto; min-width: 0; }
  .us-calls-page-size { flex: 1 1 130px; }
  .us-calls-max-records { flex: 1 1 160px; }
}
@media (max-width: 480px) {
  .us-calls-wrap { overflow-x: auto; }
  .us-calls-select, .us-calls-number-field, .us-calls-page-size { flex-basis: 100%; width: 100%; }
  .us-calls-pager { justify-content: space-between; }
}
.us-subnote { margin-left: 6px; color: var(--us-muted); font-size: 11px; }
.us-buckets { display: grid; gap: 12px; }
.us-bucket-row { display: grid; gap: 6px; }
.us-bucket-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; font-size: 13px; }
.us-bucket-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 560; }
.us-bucket-total { color: var(--us-muted); font-variant-numeric: tabular-nums; }
.us-bucket-stack { display: flex; height: 12px; overflow: hidden; border-radius: 6px; background: color-mix(in srgb, var(--us-border) 55%, transparent); }
.us-bucket-seg { height: 100%; min-width: 0; transition: filter 140ms ease; }
.us-bucket-seg[data-bucket="input"] { background: #1684ff; }
.us-bucket-seg[data-bucket="cacheRead"] { background: #22b8b5; }
.us-bucket-seg[data-bucket="cacheWrite"] { background: #f59e0b; }
.us-bucket-seg[data-bucket="output"] { background: #219653; }
.us-bucket-legend { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--us-muted); font-size: 12px; }
.us-foot { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 16px; padding: 12px 15px; border: 1px solid color-mix(in srgb, var(--us-border) 55%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--us-surface) 70%, transparent); color: var(--us-muted); font-size: 12px; }
.us-foot-item { white-space: nowrap; }
.us-embed { padding: 4px 0 24px; }
.us-embed .us-content { width: min(1180px, 100%); margin: 0 auto; }
`;
		//#endregion
		//#region src/client/index.tsx
		const inject = ["slots", "locale"];
		function Icon({ name, size = 18 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true",
				children: {
					chart: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 19V9M10 19V5M16 19v-7M22 19H2" }) }),
					close: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6 6 12 12M18 6 6 18" }) }),
					back: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m15 18-6-6 6-6" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M9 12h11" })] }),
					download: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" }) }),
					tokens: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13 2 5 14h7l-1 8 8-12h-7z" }) }),
					chat: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" }) }),
					message: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 5h16v12H8l-4 3z" }) }),
					calendar: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: "3",
						y: "5",
						width: "18",
						height: "16",
						rx: "3"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 3v4m8-4v4M3 10h18" })] }),
					streak: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 22c4 0 7-3 7-7 0-5-4-8-6-12 0 4-3 6-4 8-1-2-2-3-2-5-2 2-3 5-3 8 0 5 3 8 8 8z" }) }),
					model: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 17 12 3l8 14-8 4zM8 17h8" }) }),
					clock: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "9"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 7v5l3 2" })] })
				}[name]
			});
		}
		var VisibilityController = class {
			open = false;
			listeners = /* @__PURE__ */ new Set();
			getSnapshot = () => this.open;
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			show = () => {
				this.set(true);
			};
			hide = () => {
				this.set(false);
			};
			set(value) {
				if (value === this.open) return;
				this.open = value;
				for (const listener of this.listeners) listener();
			}
		};
		function FooterAction({ wide, show }) {
			const { t } = useLocale();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				"data-usage-stats": true,
				className: "us-nav",
				"data-rail": !wide,
				onClick: show,
				title: wide ? void 0 : t("nav"),
				"aria-label": t("nav"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, { name: "chart" }), wide && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("nav") })]
			});
		}
		function compact(value, locale) {
			return new Intl.NumberFormat(locale, {
				notation: value >= 1e4 ? "compact" : "standard",
				maximumFractionDigits: 1
			}).format(value);
		}
		function Card({ icon, label, value, detail }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: "us-card",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-card-label",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: icon,
							size: 16
						}), label]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-card-value",
						children: value
					}),
					detail && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-card-detail",
						title: detail,
						children: detail
					})
				]
			});
		}
		function SelectControl({ label, triggerLabel, value, options, onChange, className = "" }) {
			const [open, setOpen] = (0, react.useState)(false);
			const root = (0, react.useRef)(null);
			const selected = options.find((option) => option.value === value) ?? options[0];
			(0, react.useEffect)(() => {
				if (!open) return;
				const close = (event) => {
					if (!root.current?.contains(event.target)) setOpen(false);
				};
				window.addEventListener("pointerdown", close);
				return () => {
					window.removeEventListener("pointerdown", close);
				};
			}, [open]);
			const onKeyDown = (event) => {
				if (event.key === "Escape") {
					setOpen(false);
					return;
				}
				if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
				event.preventDefault();
				const option = options[(Math.max(0, options.findIndex((option) => option.value === value)) + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length];
				if (option !== void 0) onChange(option.value);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: `us-select ${className}`.trim(),
				ref: root,
				"data-open": open || void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "us-select-trigger",
					"aria-label": label,
					"aria-haspopup": "listbox",
					"aria-expanded": open,
					onClick: () => setOpen((current) => !current),
					onKeyDown,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: triggerLabel ?? selected?.label ?? "" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 16 16",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							d: "m4.5 6.5 3.5 3 3.5-3",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.5",
							strokeLinecap: "round",
							strokeLinejoin: "round"
						})
					})]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "us-select-menu",
					role: "listbox",
					"aria-label": label,
					children: options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "option",
						"aria-selected": option.value === value,
						onClick: () => {
							onChange(option.value);
							setOpen(false);
						},
						children: option.label
					}, option.value))
				})]
			});
		}
		function Heatmap({ snapshot }) {
			const { t, lang, numberLocale } = useLocale();
			const [tip, setTip] = (0, react.useState)(null);
			const max = Math.max(1, ...snapshot.days.map((day) => day.tokens));
			const level = (tokens) => tokens === 0 ? 0 : Math.max(1, Math.min(5, Math.ceil(Math.log1p(tokens) / Math.log1p(max) * 5)));
			const showTip = (target, text) => {
				const rect = target.getBoundingClientRect();
				setTip({
					x: Math.min(window.innerWidth - 150, Math.max(150, rect.left + rect.width / 2)),
					y: rect.top - 10,
					text
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel us-heat-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-panel-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-title",
						children: t("heatmap")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "us-panel-note us-heat-legend",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("less") }),
							[
								0,
								1,
								2,
								3,
								4,
								5
							].map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
								className: "us-cell",
								"data-level": item
							}, item)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("more") })
						]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-heat-scroll",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-heat-week",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("mon") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("wed") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("fri") })
						]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-heat",
						children: snapshot.days.map((day) => {
							const text = `${formatDateLabel(day.date, lang)}: ${compact(day.tokens, numberLocale)} Tokens · ${day.calls} ${t("callsSuffix")}`;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "us-cell us-cell-tip",
								"data-level": level(day.tokens),
								"aria-label": text,
								tabIndex: 0,
								onMouseEnter: (event) => showTip(event.currentTarget, text),
								onMouseLeave: () => setTip(null),
								onFocus: (event) => showTip(event.currentTarget, text),
								onBlur: () => setTip(null)
							}, day.date);
						})
					})]
				})]
			}), tip && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-usage-stats": true,
				className: "us-floating-tip",
				role: "tooltip",
				style: {
					left: tip.x,
					top: tip.y
				},
				children: tip.text
			}), document.body)] });
		}
		function DailyChart({ snapshot }) {
			const { t, lang, numberLocale } = useLocale();
			const [tip, setTip] = (0, react.useState)(null);
			const max = Math.max(1, ...snapshot.days.map((day) => day.tokens));
			const visibleModels = snapshot.models.slice(0, 6);
			const colors = [
				"#1684ff",
				"#219653",
				"#9368ef",
				"#f59e0b",
				"#ef5da8",
				"#22b8b5"
			];
			const tickEvery = snapshot.days.length <= 8 ? 1 : Math.max(1, Math.ceil(snapshot.days.length / 7));
			const showTip = (target, day) => {
				const rect = target.getBoundingClientRect();
				const rows = visibleModels.flatMap((model, index) => {
					const value = day.models[model.key] ?? 0;
					return value === 0 ? [] : [{
						key: model.key,
						name: model.model,
						value,
						color: colors[index] ?? colors[0]
					}];
				});
				const halfWidth = Math.min(195, Math.max(130, window.innerWidth / 2 - 12));
				const halfHeight = (52 + rows.length * 25) / 2;
				const x = Math.min(window.innerWidth - halfWidth - 12, Math.max(halfWidth + 12, rect.left + rect.width / 2));
				const preferredY = rect.top > halfHeight + 24 ? rect.top - halfHeight - 12 : rect.bottom + halfHeight + 12;
				const y = Math.min(window.innerHeight - halfHeight - 12, Math.max(halfHeight + 12, preferredY));
				setTip({
					x,
					y,
					date: formatDateLabel(day.date, lang),
					total: day.tokens,
					rows
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel us-trend",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-panel-head",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "us-panel-title",
							children: t("dailyTrend")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-chart-frame",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "us-grid-lines",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "us-chart-scroll",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "us-chart",
								"data-dense": snapshot.days.length > 14,
								children: snapshot.days.map((day, dayIndex) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "us-bar-column",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "us-bar-wrap",
										children: day.tokens > 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "us-bar-hit",
											style: { height: `${day.tokens / max * 100}%` },
											tabIndex: 0,
											"aria-label": `${formatDateLabel(day.date, lang)}, ${compact(day.tokens, numberLocale)} tokens`,
											onMouseEnter: (event) => showTip(event.currentTarget, day),
											onMouseLeave: () => setTip(null),
											onFocus: (event) => showTip(event.currentTarget, day),
											onBlur: () => setTip(null),
											children: visibleModels.map((model, modelIndex) => {
												const value = day.models[model.key] ?? 0;
												if (value === 0) return null;
												return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
													className: "us-bar-segment",
													style: {
														height: `${value / day.tokens * 100}%`,
														background: colors[modelIndex]
													}
												}, model.key);
											})
										})
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "us-date-label",
										children: dayIndex % tickEvery === 0 || dayIndex === snapshot.days.length - 1 ? formatDateLabel(day.date, lang) : ""
									})]
								}, day.date))
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-legend",
						children: visibleModels.map((model, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
							className: "us-dot",
							style: { background: colors[index] }
						}), model.model] }, model.key))
					})
				]
			}), tip && (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-usage-stats": true,
				className: "us-chart-tip",
				role: "tooltip",
				style: {
					left: tip.x,
					top: tip.y
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-chart-tip-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: tip.date }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [compact(tip.total, numberLocale), " tokens"] })]
				}), tip.rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-chart-tip-row",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: row.color } }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: row.name }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: new Intl.NumberFormat(numberLocale).format(row.value) })
					]
				}, row.key))]
			}), document.body)] });
		}
		function ModelUsage({ snapshot }) {
			const { t, numberLocale } = useLocale();
			const p1 = Math.min(100, snapshot.models[0]?.percent ?? 0);
			const p2 = Math.min(100, p1 + (snapshot.models[1]?.percent ?? 0));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-panel-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-title",
						children: t("modelUsage")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-note",
						children: t("tokenSummary")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-model-layout",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "us-donut",
						style: {
							"--us-p1": `${p1}%`,
							"--us-p2": `${p2}%`
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "us-donut-center",
							children: [compact(snapshot.totals.tokens, numberLocale), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: "tokens" })]
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: snapshot.models.slice(0, 8).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-model-row",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "us-model-name",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: "us-dot" }), model.model]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "us-model-percent",
								children: [model.percent.toFixed(model.percent < 10 ? 1 : 0), "%"]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "us-model-meta",
								children: [
									model.provider,
									" · ",
									compact(model.tokens, numberLocale),
									" tokens · ",
									model.calls,
									" ",
									t("callsCount")
								]
							})
						]
					}, model.key)) })]
				})]
			});
		}
		const BUCKETS = [
			"input",
			"cacheRead",
			"cacheWrite",
			"output"
		];
		const BUCKET_LABEL = {
			input: "bucketInput",
			cacheRead: "bucketCacheRead",
			cacheWrite: "bucketCacheWrite",
			output: "bucketOutput"
		};
		function BucketBars({ models }) {
			const { t, numberLocale } = useLocale();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-panel-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-title",
						children: t("modelBuckets")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-note us-bucket-legend",
						children: BUCKETS.map((bucket) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", {
							className: "us-dot us-bucket-seg",
							"data-bucket": bucket,
							style: {
								width: 8,
								height: 8,
								borderRadius: 2,
								marginRight: 6
							}
						}), t(BUCKET_LABEL[bucket])] }, bucket))
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "us-buckets",
					children: models.slice(0, 12).map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-bucket-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "us-bucket-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "us-bucket-name",
								title: model.key,
								children: [
									model.model,
									" · ",
									model.provider
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "us-bucket-total",
								children: compact(model.tokens, numberLocale)
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "us-bucket-stack",
							children: BUCKETS.map((bucket) => {
								const value = model[bucket];
								if (value <= 0 || model.tokens <= 0) return null;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "us-bucket-seg",
									"data-bucket": bucket,
									style: { width: `${value / model.tokens * 100}%` },
									title: `${t(BUCKET_LABEL[bucket])}: ${new Intl.NumberFormat(numberLocale).format(value)}`
								}, bucket);
							})
						})]
					}, model.key))
				})]
			});
		}
		function Breakdown({ snapshot }) {
			const { t, numberLocale } = useLocale();
			const rows = [
				[t("input"), snapshot.totals.input],
				[t("output"), snapshot.totals.output],
				[t("cacheRead"), snapshot.totals.cacheRead],
				[t("cacheWrite"), snapshot.totals.cacheWrite]
			];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-panel-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-title",
						children: t("tokenComposition")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "us-panel-note",
						children: t("cacheIncludedNote")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "us-breakdown",
					children: rows.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-break-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: compact(value, numberLocale) })]
					}, label))
				})]
			});
		}
		function formatCallTime(value) {
			const d = new Date(value);
			return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		}
		function formatCallTokens(n, numberLocale) {
			if (n < 1e3) return `${n} token`;
			return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 }).format(n / 1e3)}k token`;
		}
		function formatExactTokens(n, numberLocale) {
			return `${new Intl.NumberFormat(numberLocale).format(n)} tokens`;
		}
		function formatExactTime(value, numberLocale) {
			return new Intl.DateTimeFormat(numberLocale, {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			}).format(value);
		}
		function formatCallDuration(ms, t) {
			if (ms === null || ms === void 0) return "—";
			if (ms < 1e3) return t("durationSubSecond");
			const s = ms / 1e3;
			if (s < 60) return `${Math.round(s * 10) / 10}s`;
			return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
		}
		function callCachePercent(tokens, t) {
			const denominator = tokens.input + tokens.cacheRead + tokens.cacheWrite;
			return denominator === 0 ? "—" : t("cacheRate", { percent: Math.round(tokens.cacheRead / denominator * 100) });
		}
		function formatEffort(value, t) {
			if (value === null || value === "") return t("notRecorded");
			const key = {
				max: "effortMax",
				high: "effortHigh",
				medium: "effortMedium",
				low: "effortLow"
			}[value.toLowerCase()];
			return key === void 0 ? value : t(key);
		}
		const PAGE_SIZE_OPTIONS = [
			5,
			10,
			20,
			50
		];
		const PAGE_SIZE_STORAGE_KEY = "dsh-usage-unified:calls-page-size";
		const MAX_RECORD_OPTIONS = [
			100,
			500,
			1e3,
			2e3,
			5e3,
			1e4
		];
		const MAX_RECORD_STORAGE_KEY = "dsh-usage-unified:calls-max-records";
		function initialPageSize() {
			if (typeof window === "undefined") return 5;
			try {
				const saved = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
				return PAGE_SIZE_OPTIONS.includes(saved) ? saved : 5;
			} catch {
				return 5;
			}
		}
		function initialMaxRecords() {
			if (typeof window === "undefined") return 1e3;
			try {
				const saved = Number(window.localStorage.getItem(MAX_RECORD_STORAGE_KEY));
				return MAX_RECORD_OPTIONS.includes(saved) ? saved : 1e3;
			} catch {
				return 1e3;
			}
		}
		function CallsPanel({ snapshot, range, scope, workspace }) {
			const { t, numberLocale } = useLocale();
			const [page, setPage] = (0, react.useState)(1);
			const [model, setModel] = (0, react.useState)("");
			const [provider, setProvider] = (0, react.useState)("");
			const [minInput, setMinInput] = (0, react.useState)("");
			const [minOutput, setMinOutput] = (0, react.useState)("");
			const [debouncedMinInput, setDebouncedMinInput] = (0, react.useState)("");
			const [debouncedMinOutput, setDebouncedMinOutput] = (0, react.useState)("");
			const [pageSize, setPageSize] = (0, react.useState)(initialPageSize);
			const [maxRecords, setMaxRecords] = (0, react.useState)(initialMaxRecords);
			const [data, setData] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			(0, react.useEffect)(() => {
				setPage(1);
			}, [
				range,
				scope,
				workspace
			]);
			(0, react.useEffect)(() => {
				const timer = window.setTimeout(() => {
					setDebouncedMinInput(minInput);
					setDebouncedMinOutput(minOutput);
				}, 250);
				return () => {
					window.clearTimeout(timer);
				};
			}, [minInput, minOutput]);
			(0, react.useEffect)(() => {
				try {
					window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize));
				} catch {}
			}, [pageSize]);
			(0, react.useEffect)(() => {
				try {
					window.localStorage.setItem(MAX_RECORD_STORAGE_KEY, String(maxRecords));
				} catch {}
			}, [maxRecords]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				setError(null);
				fetchCalls({
					range,
					scope,
					workspace,
					model,
					provider,
					minInputTokens: debouncedMinInput,
					minOutputTokens: debouncedMinOutput,
					page,
					pageSize,
					maxRecords
				}, abort.signal).then(setData).catch((reason) => {
					if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
				});
				return () => {
					abort.abort();
				};
			}, [
				range,
				scope,
				workspace,
				model,
				provider,
				debouncedMinInput,
				debouncedMinOutput,
				page,
				pageSize,
				maxRecords
			]);
			const modelOptions = (0, react.useMemo)(() => ["", ...new Set((snapshot.models ?? []).map((item) => item.model))], [snapshot.models]);
			const providerOptions = (0, react.useMemo)(() => ["", ...new Set((snapshot.models ?? []).map((item) => item.provider))], [snapshot.models]);
			const hasFilters = model !== "" || provider !== "" || minInput !== "" || minOutput !== "";
			const clearFilters = () => {
				setModel("");
				setProvider("");
				setMinInput("");
				setMinOutput("");
				setDebouncedMinInput("");
				setDebouncedMinOutput("");
				setPage(1);
			};
			const content = error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("callsLoadError") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: error })] })
			}) : data === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "us-spinner" }), t("callsLoading")] })
			}) : !data.indexReady ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: t("callsIndexing")
			}) : data.items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: t("callsEmpty")
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "us-calls-wrap",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("table", {
					className: "us-calls-table",
					"aria-label": t("callsTitle"),
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("colgroup", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-time" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-duration" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-token" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-token" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-cache" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-model" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("col", { className: "us-col-effort" })
						] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("thead", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colTime") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "us-number",
								children: t("colDuration")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "us-number",
								children: t("colInput")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "us-number",
								children: t("colOutput")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "us-number",
								children: t("colCacheRate")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", { children: t("colModel") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("th", {
								className: "us-center",
								children: t("colEffort")
							})
						] }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("tbody", { children: data.items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: "us-calls-time",
								title: formatExactTime(item.time, numberLocale),
								children: formatCallTime(item.time)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: "us-number",
								children: formatCallDuration(item.durationMs, t)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: "us-number",
								title: formatExactTokens(item.tokens.input, numberLocale),
								children: formatCallTokens(item.tokens.input, numberLocale)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: "us-number",
								title: formatExactTokens(item.tokens.output, numberLocale),
								children: formatCallTokens(item.tokens.output, numberLocale)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: "us-number",
								children: callCachePercent(item.tokens, t)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("td", {
								className: "us-calls-model",
								title: `${item.provider}/${item.model}`,
								children: [item.model, item.subtask && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "us-subnote",
									children: "sub"
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("td", {
								className: item.effort === null ? "us-calls-effort us-center is-empty" : "us-calls-effort us-center",
								children: formatEffort(item.effort, t)
							})
						] }, item.key)) })
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-calls-pager",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("pageInfo", {
						start: (page - 1) * pageSize + 1,
						end: Math.min(page * pageSize, data.total),
						total: data.total
					}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-calls-page-buttons",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": t("prevPage"),
							title: t("prevPage"),
							disabled: page <= 1,
							onClick: () => setPage(page - 1),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								viewBox: "0 0 16 16",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m9.5 4-4 4 4 4" })
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							"aria-label": t("nextPage"),
							title: t("nextPage"),
							disabled: !data.hasMore,
							onClick: () => setPage(page + 1),
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								viewBox: "0 0 16 16",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "m6.5 4 4 4-4 4" })
							})
						})]
					})]
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "us-panel",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-panel-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "us-panel-title",
							children: t("callsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "us-panel-note",
							children: t("callsNote")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-calls-toolbar",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
								className: "us-calls-select",
								label: t("colModel"),
								value: model,
								options: modelOptions.map((value) => ({
									value,
									label: value === "" ? t("allModels") : value
								})),
								onChange: (value) => {
									setModel(value);
									setPage(1);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
								className: "us-calls-select",
								label: t("allProviders"),
								value: provider,
								options: providerOptions.map((value) => ({
									value,
									label: value === "" ? t("allProviders") : value
								})),
								onChange: (value) => {
									setProvider(value);
									setPage(1);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "us-calls-number-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "us-calls-number-input",
									type: "text",
									inputMode: "numeric",
									value: minInput,
									"aria-label": t("minInput"),
									placeholder: t("minInput"),
									onChange: (event) => {
										setMinInput(event.target.value.replace(/\D/g, ""));
										setPage(1);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tokenUnit") })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: "us-calls-number-field",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: "us-calls-number-input",
									type: "text",
									inputMode: "numeric",
									value: minOutput,
									"aria-label": t("minOutput"),
									placeholder: t("minOutput"),
									onChange: (event) => {
										setMinOutput(event.target.value.replace(/\D/g, ""));
										setPage(1);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("tokenUnit") })]
							}),
							hasFilters && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "us-calls-clear",
								onClick: clearFilters,
								children: t("clearFilters")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "us-spacer" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
								className: "us-calls-select us-calls-max-records",
								label: t("maxRecords", { size: maxRecords.toLocaleString(numberLocale) }),
								triggerLabel: t("maxRecords", { size: maxRecords.toLocaleString(numberLocale) }),
								value: String(maxRecords),
								options: MAX_RECORD_OPTIONS.map((value) => ({
									value: String(value),
									label: t("recordCount", { size: value.toLocaleString(numberLocale) })
								})),
								onChange: (value) => {
									setMaxRecords(Number(value));
									setPage(1);
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
								className: "us-calls-select us-calls-page-size",
								label: t("perPage", { size: pageSize }),
								value: String(pageSize),
								options: PAGE_SIZE_OPTIONS.map((value) => ({
									value: String(value),
									label: t("perPage", { size: value })
								})),
								onChange: (value) => {
									setPageSize(Number(value));
									setPage(1);
								}
							})
						]
					}),
					content
				]
			});
		}
		function relativeWhen(t, at, now) {
			if (at === null) return t("whenNever");
			const minutes = Math.floor((now - at) / 6e4);
			if (minutes < 1) return t("whenJustNow");
			if (minutes < 60) return t("whenMinutes", { n: minutes });
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return t("whenHours", { n: hours });
			return t("whenDays", { n: Math.floor(hours / 24) });
		}
		function Footer({ snapshot }) {
			const { t } = useLocale();
			const items = [];
			const homes = snapshot.homes.filter((home) => home.error === void 0).length;
			items.push(t("footHomes", { n: homes }));
			items.push(t("footUpdated", { when: relativeWhen(t, snapshot.status.updatedAt, snapshot.generatedAt) }));
			if (!snapshot.status.durable) items.push(t("footMemory"));
			const coverage = snapshot.coverage;
			if (coverage.steps > 0 && coverage.stepsWithoutUsage > 0) items.push(t("footCoverage", { percent: Math.round((coverage.steps - coverage.stepsWithoutUsage) / coverage.steps * 100) }));
			if (coverage.retriedSteps > 0) items.push(t("footRetried", { n: coverage.retriedSteps }));
			if (coverage.truncatedSessions > 0) items.push(t("footTruncated", { n: coverage.truncatedSessions }));
			if (coverage.skippedArtifacts > 0) items.push(t("footSkipped", { n: coverage.skippedArtifacts }));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-foot",
				children: items.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "us-foot-item",
					children: item
				}, item))
			});
		}
		const RANGE_OPTIONS = [
			{
				value: "7d",
				label: "last7Days"
			},
			{
				value: "30d",
				label: "last30Days"
			},
			{
				value: "all",
				label: "allRange"
			}
		];
		function Dashboard({ hide, embedded = false }) {
			const { t, numberLocale } = useLocale();
			const [range, setRange] = (0, react.useState)("30d");
			const [scope, setScope] = (0, react.useState)("all");
			const [workspace, setWorkspace] = (0, react.useState)("");
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [heatmap, setHeatmap] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(null);
			const refresh = (0, react.useCallback)((signal) => {
				setError(null);
				fetchSnapshot(range, scope, workspace, signal).then(setSnapshot).catch((reason) => {
					if (reason.name !== "AbortError") setError(reason instanceof Error ? reason.message : String(reason));
				});
			}, [
				range,
				scope,
				workspace
			]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				refresh(abort.signal);
				return () => {
					abort.abort();
				};
			}, [refresh]);
			(0, react.useEffect)(() => {
				const abort = new AbortController();
				fetchSnapshot("year", scope, workspace, abort.signal).then(setHeatmap).catch(() => {
					setHeatmap(null);
				});
				return () => {
					abort.abort();
				};
			}, [scope, workspace]);
			(0, react.useEffect)(() => {
				if (hide === void 0) return;
				const onKey = (event) => {
					if (event.key === "Escape") hide();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [hide]);
			const workspaceOptions = (0, react.useMemo)(() => [{
				value: "",
				label: t("allWorkspaces")
			}, ...snapshot?.workspaces.map((item) => ({
				value: item.path,
				label: `${item.path} (${item.sessions})`
			})) ?? []], [snapshot?.workspaces, t]);
			const scopeOptions = [
				{
					value: "all",
					label: t("allTasks")
				},
				{
					value: "main",
					label: t("mainOnly")
				},
				{
					value: "subtasks",
					label: t("subtasksOnly")
				}
			];
			const body = error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("loadError") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: error })] })
			}) : snapshot === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "us-state",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: "us-spinner" }), t("loading")] })
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-cards",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "tokens",
							label: t("tokensUsage"),
							value: compact(snapshot.allTime.totals.tokens, numberLocale),
							detail: t("inputOutputDetail", {
								input: compact(snapshot.allTime.totals.input, numberLocale),
								output: compact(snapshot.allTime.totals.output, numberLocale)
							})
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "chat",
							label: t("sessions"),
							value: snapshot.allTime.totals.sessions,
							detail: snapshot.allTime.totals.subagentSessions > 0 ? t("subagentNote", { n: snapshot.allTime.totals.subagentSessions }) : void 0
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "message",
							label: t("messages"),
							value: snapshot.allTime.totals.messages
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "calendar",
							label: t("activeDays"),
							value: snapshot.allTime.totals.activeDays
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "streak",
							label: t("streak"),
							value: snapshot.allTime.totals.currentStreak
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "streak",
							label: t("longestStreak"),
							value: snapshot.allTime.totals.longestStreak
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "clock",
							label: t("peakHour"),
							value: formatHour(snapshot.allTime.totals.peakHour, t)
						}),
						snapshot.allTime.mostUsedModel ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "model",
							label: t("mostUsedModel"),
							value: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { fontSize: "18px" },
								children: snapshot.allTime.mostUsedModel.model
							}),
							detail: `${snapshot.allTime.mostUsedModel.percent.toFixed(1)}% · ${snapshot.allTime.mostUsedModel.provider}`
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Card, {
							icon: "model",
							label: t("mostUsedModel"),
							value: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: { fontSize: "18px" },
								children: t("noData")
							})
						})
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Heatmap, { snapshot: heatmap ?? snapshot }),
				range !== "all" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DailyChart, { snapshot }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ModelUsage, { snapshot }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BucketBars, { models: snapshot.models }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Breakdown, { snapshot }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CallsPanel, {
					snapshot,
					range,
					scope,
					workspace
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Footer, { snapshot })
			] });
			const toolbar = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "us-range-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "us-range-label",
					children: t("rangeLabel")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "us-segment",
					"aria-label": t("rangeLabel"),
					children: RANGE_OPTIONS.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						"aria-pressed": range === option.value,
						onClick: () => setRange(option.value),
						children: t(option.label)
					}, option.value))
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "us-toolbar us-filterbar",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
						label: t("workspace"),
						value: workspace,
						options: workspaceOptions,
						onChange: setWorkspace
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SelectControl, {
						label: t("taskScope"),
						value: scope,
						options: scopeOptions,
						onChange: (value) => setScope(value)
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "us-spacer" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: "us-export",
						href: exportUrl(range, scope, workspace, "csv"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "download",
							size: 15
						}), "CSV"]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("a", {
						className: "us-export",
						href: exportUrl(range, scope, workspace, "json"),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "download",
							size: 15
						}), "JSON"]
					})
				]
			})] });
			if (embedded) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-usage-stats": true,
				className: "us-embed",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "us-content",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: "us-panel-title",
							style: { margin: "0 0 12px" },
							children: t("title")
						}),
						toolbar,
						body
					]
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				"data-usage-stats": true,
				className: "us-shell",
				role: "dialog",
				"aria-modal": "true",
				"aria-label": t("title"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "us-top",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-heading",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "us-title",
							children: t("title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "us-tab",
							children: t("appUsage")
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						className: "us-back",
						onClick: hide,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {
							name: "back",
							size: 17
						}), t("back")]
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("main", {
					className: "us-scroll",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "us-content",
						children: [toolbar, body]
					})
				})]
			});
		}
		function Overlay({ useVisibility, hide }) {
			return useVisibility((value) => value) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dashboard, { hide }) : null;
		}
		function SettingsSection() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dashboard, { embedded: true });
		}
		function apply(ctx) {
			const uninstallLocale = installLocale(ctx.locale);
			ctx.effect(() => uninstallLocale, "usage-unified: locale dictionaries");
			const style = document.createElement("style");
			style.dataset.plugin = "dsh-usage-unified";
			style.textContent = styles;
			document.head.appendChild(style);
			ctx.effect(() => () => {
				style.remove();
			}, "usage-unified: styles");
			const visibility = new VisibilityController();
			const injected = () => ({
				hooks: { visibility },
				show: visibility.show,
				hide: visibility.hide
			});
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "usage-unified",
				order: 20,
				inject: injected
			}, FooterAction));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "usage-unified",
				order: 20,
				inject: injected
			}, Overlay));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "usage-unified",
				order: 60,
				label: () => ctx.locale.bind(NS)("nav"),
				locale: NS
			}, SettingsSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map