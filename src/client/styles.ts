export const styles = String.raw`
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
.us-range-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 18px; margin: 0 0 12px; }
.us-range-label { font-size: 16px; font-weight: 520; }
.us-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
.us-filterbar { padding: 10px; border: 1px solid color-mix(in srgb, var(--us-border) 72%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--us-surface) 70%, transparent); }
.us-segment { display: inline-flex; gap: 3px; padding: 3px; border: 1px solid var(--us-border); border-radius: 11px; background: var(--us-raised); }
.us-segment button { border: 0; min-width: 98px; padding: 7px 13px; border-radius: 8px; color: var(--us-muted); background: transparent; cursor: pointer; font: inherit; white-space: nowrap; }
.us-segment button[aria-pressed="true"] { color: var(--us-text); background: var(--us-hover); box-shadow: 0 1px 3px rgba(0,0,0,.06); }
.us-custom-range { display: inline-flex; align-items: center; gap: 8px; margin: 0 0 12px; color: var(--us-muted); font-size: 13px; }
.us-window { margin: -4px 0 12px; color: var(--us-muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.us-custom-range input { height: 34px; padding: 0 10px; border: 1px solid var(--us-border); border-radius: 9px; background: var(--us-raised); color: var(--us-text); font: inherit; }
.us-custom-mode { margin-right: 2px; }
.us-custom-mode button { min-width: 0; padding: 7px 11px; }
.us-until-now { display: inline-flex; align-items: center; height: 34px; padding: 0 12px; border: 1px dashed var(--us-border); border-radius: 9px; background: var(--us-raised); }
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
.us-card { position: relative; overflow: hidden; }
.us-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--us-accent-card, var(--us-accent)); opacity: .9; }
.us-card::after { content: ''; position: absolute; right: -40px; top: -40px; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--us-accent-card, var(--us-accent)) 22%, transparent) 0%, transparent 70%); pointer-events: none; }
.us-card[data-hero] { grid-column: span 2; background: radial-gradient(130% 150% at 0% 0%, color-mix(in srgb, var(--us-accent-card, var(--us-accent)) 18%, transparent) 0%, transparent 58%), var(--us-surface); }
.us-card[data-hero] .us-card-value { font-size: clamp(38px, 4.4vw, 50px); }
.us-spark { display: block; width: 100%; height: 52px; margin-top: 12px; color: var(--us-accent-card, var(--us-accent)); opacity: .85; }
.us-sheen { position: absolute; top: 0; bottom: 0; left: 0; width: 42%; transform: translateX(-130%); background: linear-gradient(100deg, transparent, color-mix(in srgb, var(--us-accent-card, var(--us-accent)) 26%, transparent), transparent); animation: us-sheen 6s ease-in-out infinite; pointer-events: none; }
.us-card[data-hero]::after { animation: us-glow 4.6s ease-in-out infinite; }
@keyframes us-sheen { 0% { transform: translateX(-130%); } 55%, 100% { transform: translateX(260%); } }
@keyframes us-glow { 0%, 100% { opacity: .55; } 50% { opacity: .95; } }
.us-trend-chart { position: relative; z-index: 1; }
.us-trend-svg { display: block; width: 100%; height: auto; min-height: 300px; }
.us-trend-svg .us-grid { stroke: color-mix(in srgb, var(--us-border) 80%, transparent); stroke-dasharray: 4 5; }
.us-trend-svg text { fill: var(--us-muted); font-size: 11px; font-family: inherit; }
.us-trend-hover-line { stroke: color-mix(in srgb, var(--us-text) 42%, transparent); stroke-dasharray: 3 4; }
.us-trend-legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.us-trend-legend button { display: inline-flex; align-items: center; gap: 7px; padding: 5px 12px; border: 1px solid var(--us-border); border-radius: 999px; background: var(--us-raised); color: var(--us-text); font: inherit; font-size: 12px; cursor: pointer; transition: color 140ms ease, border-color 140ms ease, opacity 140ms ease; }
.us-trend-legend button[aria-pressed="false"] { opacity: .5; }
.us-trend-legend i { width: 9px; height: 9px; border-radius: 3px; background: var(--us-series); flex: none; }
.us-trend-tip { position: fixed; z-index: 30; min-width: 172px; padding: 9px 11px; border: 1px solid var(--us-border); border-radius: 10px; background: color-mix(in srgb, var(--us-raised) 96%, transparent); box-shadow: 0 14px 38px rgba(0,0,0,.16); color: var(--us-text); font-size: 12px; backdrop-filter: blur(12px); pointer-events: none; transform: translate(-50%, -108%); }
.us-trend-tip b { display: block; margin-bottom: 5px; }
.us-trend-tip div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 18px; }
.us-trend-tip i { width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
.us-panel { margin-top: 14px; padding: 18px 20px; overflow: hidden; animation: us-panel-in 380ms 90ms both; }
.us-panel-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 14px; margin-bottom: 14px; }
.us-panel[data-collapsed] .us-panel-head { margin-bottom: 0; }
.us-panel-toggle { display: inline-flex; align-items: center; gap: 9px; padding: 0; border: 0; border-radius: 8px; color: inherit; background: transparent; font: inherit; cursor: pointer; }
.us-panel-toggle:hover .us-panel-title, .us-panel-toggle:focus-visible .us-panel-title { color: var(--us-accent); }
.us-panel-toggle:focus-visible { outline: 2px solid color-mix(in srgb, var(--us-accent) 55%, transparent); outline-offset: 3px; }
.us-chevron { width: 13px; height: 13px; flex: none; fill: none; stroke: var(--us-muted); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transform: rotate(90deg); transition: transform 150ms ease; }
.us-panel[data-collapsed] .us-chevron { transform: rotate(0deg); }
.us-panel-title { font-size: 16px; font-weight: 620; }
.us-panel-note { color: var(--us-muted); font-size: 12px; }
.us-trend { padding: 22px 22px 18px; }
.us-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--us-accent); display: inline-block; margin-right: 6px; }
.us-model-layout { display: grid; grid-template-columns: 230px 1fr; align-items: start; gap: 28px; }
.us-model-list { min-width: 0; }
.us-model-line { display: grid; grid-template-columns: minmax(0,1fr) auto auto; align-items: baseline; gap: 12px; }
.us-model-total { color: var(--us-text); font-size: 12px; font-variant-numeric: tabular-nums; min-width: 62px; text-align: right; }
.us-model-more { margin-top: 12px; padding: 6px 13px; border: 1px solid var(--us-border); border-radius: 999px; color: var(--us-muted); background: var(--us-raised); font: inherit; font-size: 12px; cursor: pointer; transition: color 140ms ease, border-color 140ms ease; }
.us-model-more:hover { color: var(--us-text); border-color: color-mix(in srgb, var(--us-border) 60%, var(--us-text)); }
.us-donut { width: 190px; aspect-ratio: 1; margin: auto; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(var(--us-accent) 0 var(--us-p1), var(--us-green) var(--us-p1) var(--us-p2), var(--us-blue-3) var(--us-p2)); position: relative; }
.us-donut::after { content: ''; position: absolute; inset: 28px; border-radius: 50%; background: var(--us-surface); }
.us-donut-center { z-index: 1; text-align: center; font-weight: 700; font-size: 23px; }
.us-donut-center small { display: block; margin-top: 3px; color: var(--us-muted); font-weight: 400; font-size: 11px; }
.us-model-row { display: grid; gap: 7px; padding: 11px 0; border-bottom: 1px solid var(--us-border); }
.us-model-row:last-of-type { border-bottom: 0; }
.us-model-name { font-weight: 580; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.us-model-meta, .us-model-percent { color: var(--us-muted); font-size: 12px; }
.us-model-percent { font-variant-numeric: tabular-nums; }
.us-bucket-stack { display: flex; height: 9px; overflow: hidden; border-radius: 5px; background: color-mix(in srgb, var(--us-border) 55%, transparent); }
.us-bucket-key { width: 8px; height: 8px; display: inline-block; border-radius: 2px; margin-right: 6px; }
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
@keyframes us-tip-in { from { opacity: 0; transform: translate(-50%, calc(-100% + 4px)); } }
@keyframes us-select-in { from { opacity: 0; transform: translateY(-4px) scale(.985); } }
@media (max-width: 760px) { .us-top { min-height: 88px; } .us-heading { gap: 12px; } .us-tab { display: none; } .us-cards { grid-template-columns: repeat(2,minmax(0,1fr)); } .us-model-layout { grid-template-columns: 1fr; } .us-breakdown { grid-template-columns: repeat(2,1fr); } }
@media (max-width: 480px) { .us-cards { grid-template-columns: 1fr; } .us-card[data-hero] { grid-column: auto; } .us-toolbar { align-items: stretch; } .us-field, .us-select { max-width:none; flex:1; } }
@media (prefers-reduced-motion: reduce) { .us-shell, .us-spinner, .us-card, .us-panel, .us-sheen, .us-card[data-hero]::after { animation: none; transition: none; } }
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
.us-bucket-seg { height: 100%; min-width: 0; transition: filter 140ms ease; }
.us-bucket-seg[data-bucket="input"], .us-bucket-key[data-bucket="input"] { background: #1684ff; }
.us-bucket-seg[data-bucket="cacheRead"], .us-bucket-key[data-bucket="cacheRead"] { background: #22b8b5; }
.us-bucket-seg[data-bucket="cacheWrite"], .us-bucket-key[data-bucket="cacheWrite"] { background: #f59e0b; }
.us-bucket-seg[data-bucket="output"], .us-bucket-key[data-bucket="output"] { background: #219653; }
.us-bucket-legend { display: flex; flex-wrap: wrap; gap: 4px 16px; }
.us-calls-chip { height: 34px; display: inline-flex; align-items: center; gap: 8px; padding: 0 11px; border: 1px solid color-mix(in srgb, var(--us-accent) 42%, var(--us-border)); border-radius: 9px; color: var(--us-accent); background: color-mix(in srgb, var(--us-accent) 10%, transparent); font: inherit; font-size: 12px; cursor: pointer; }
.us-calls-chip span { font-size: 14px; line-height: 1; }
.us-calls-chip:hover { background: color-mix(in srgb, var(--us-accent) 18%, transparent); }
.us-session-wrap { overflow-x: auto; }
.us-session-table { width: 100%; table-layout: fixed; border-collapse: separate; border-spacing: 0 2px; font-size: 13px; }
.us-session-table th:nth-child(1) { width: 24%; }
.us-session-table th:nth-child(2) { width: 16%; }
.us-session-table th:nth-child(3) { width: 12%; }
.us-session-table th:nth-child(4) { width: 13%; }
.us-session-table th:nth-child(5) { width: 10%; }
.us-session-table th { padding: 9px 10px; text-align: left; color: var(--us-muted); font-size: 12px; font-weight: 560; border-bottom: 1px solid var(--us-border); white-space: nowrap; }
.us-session-table td { padding: 9px 10px; box-shadow: inset 0 -1px color-mix(in srgb, var(--us-border) 48%, transparent); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.us-session-table tbody tr { cursor: pointer; transition: background 120ms ease; }
.us-session-table tbody td:first-child { border-radius: 10px 0 0 10px; }
.us-session-table tbody td:last-child { border-radius: 0 10px 10px 0; }
.us-session-table tbody tr:hover td, .us-session-table tbody tr:focus-visible td { background: color-mix(in srgb, var(--us-hover) 76%, transparent); box-shadow: none; }
.us-session-table tbody tr:focus-visible { outline: 2px solid color-mix(in srgb, var(--us-accent) 55%, transparent); outline-offset: 1px; }
.us-session-table .us-number { text-align: left; }
.us-session-name { font-weight: 560; }
.us-session-span, .us-session-model { color: var(--us-muted); }
.us-session-foot { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; }
.us-foot { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 16px; padding: 12px 15px; border: 1px solid color-mix(in srgb, var(--us-border) 55%, transparent); border-radius: 14px; background: color-mix(in srgb, var(--us-surface) 70%, transparent); color: var(--us-muted); font-size: 12px; }
.us-foot-item { white-space: nowrap; }
.us-embed { padding: 4px 0 24px; }
.us-embed .us-content { width: min(1180px, 100%); margin: 0 auto; }
`
