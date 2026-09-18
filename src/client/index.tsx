import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Ambient: augment the slot-name and locale maps this plugin registers into.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { CallRecord, CallsPage, ModelStats, RangeId, SessionStats, Snapshot, TaskScope } from '../types.ts'
import type { ClientContextLike } from './runtime.d.ts'
import { formatDateLabel, formatHour, installLocale, NS, useLocale, type I18nKey } from './i18n.ts'
import { exportUrl, fetchCalls, fetchSnapshot, type CustomRange } from './source.ts'
import { styles } from './styles.ts'

export const inject = ['slots', 'locale']

type IconName = 'chart' | 'close' | 'back' | 'download' | 'tokens' | 'chat' | 'message' | 'calendar' | 'streak' | 'model' | 'clock'

function Icon({ name, size = 18 }: { name: IconName; size?: number }): ReactNode {
  const paths: Record<IconName, ReactNode> = {
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
    download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14" /></>,
    tokens: <><path d="M13 2 5 14h7l-1 8 8-12h-7z" /></>,
    chat: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /></>,
    message: <><path d="M4 5h16v12H8l-4 3z" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4m8-4v4M3 10h18" /></>,
    streak: <><path d="M12 22c4 0 7-3 7-7 0-5-4-8-6-12 0 4-3 6-4 8-1-2-2-3-2-5-2 2-3 5-3 8 0 5 3 8 8 8z" /></>,
    model: <><path d="M4 17 12 3l8 14-8 4zM8 17h8" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>
}

class VisibilityController {
  private open = false
  private listeners = new Set<() => void>()
  getSnapshot = (): boolean => this.open
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  show = (): void => { this.set(true) }
  hide = (): void => { this.set(false) }
  private set(value: boolean): void { if (value === this.open) return; this.open = value; for (const listener of this.listeners) listener() }
}

interface Injected {
  useVisibility: <T>(selector: (open: boolean) => T) => T
  show: () => void
  hide: () => void
}

type BoundInjected = Omit<Injected, 'useVisibility'> & {
  useVisibility: <T>(selector: (open: boolean) => T) => T
}
type FooterProps = PropsRuntime<'sidebar.footer.action'> & BoundInjected
type OverlayProps = PropsRuntime<'shell.overlay'> & BoundInjected

function FooterAction({ wide, show }: FooterProps): ReactNode {
  const { t } = useLocale()
  return <button data-usage-stats className="us-nav" data-rail={!wide} onClick={show} title={wide ? undefined : t('nav')} aria-label={t('nav')}>
    <Icon name="chart" />{wide && <span>{t('nav')}</span>}
  </button>
}

function compact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

/** Local 'YYYY-MM-DD' shifted by whole days — the custom-range defaults. */
function localDate(offset = 0): string {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function Card({ icon, label, value, detail, accent, hero, spark }: { icon: IconName; label: string; value: ReactNode; detail?: string | undefined; accent?: string; hero?: boolean; spark?: ReactNode }): ReactNode {
  return <article className="us-card" data-hero={hero ? 'true' : undefined} style={accent === undefined ? undefined : ({ '--us-accent-card': accent } as React.CSSProperties)}>{hero && <span className="us-sheen" aria-hidden="true" />}<div className="us-card-label"><Icon name={icon} size={16} />{label}</div><div className="us-card-value">{value}</div>{detail && <div className="us-card-detail" title={detail}>{detail}</div>}{spark}</article>
}

/** Compact USD, with the precision the magnitude actually deserves. */
function formatCost(value: number, numberLocale: string): string {
  const digits = value >= 1_000 ? 0 : value >= 10 ? 1 : 2
  return new Intl.NumberFormat(numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/** Panel open/closed memory, keyed by panel id. */
class PanelStore {
  private readonly state = new Map<string, boolean>()
  private readonly listeners = new Set<() => void>()
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  isOpen = (id: string, fallback: boolean): boolean => this.state.get(id) ?? fallback
  toggle = (id: string, fallback: boolean): void => { this.state.set(id, !this.isOpen(id, fallback)); this.emit() }
  open = (id: string): void => { this.state.set(id, true); this.emit() }
  private emit(): void { for (const listener of this.listeners) listener() }
}

const panels = new PanelStore()

/**
 * A dashboard panel whose header toggles its body.
 *
 * The open/closed flag lives in a module store rather than component state so
 * a collapse survives the overlay unmounting between sidebar clicks, and so
 * one panel can reveal another (the session drill-down opens the call table).
 */
function Panel({ id, title, note, className, children, defaultOpen = true }: {
  id: string
  title: string
  note?: ReactNode
  className?: string
  children: ReactNode
  defaultOpen?: boolean
}): ReactNode {
  const { t } = useLocale()
  const open = useSyncExternalStore(panels.subscribe, () => panels.isOpen(id, defaultOpen))
  return <section className={className === undefined ? 'us-panel' : `us-panel ${className}`} data-collapsed={open ? undefined : 'true'}>
    <div className="us-panel-head">
      <button type="button" className="us-panel-toggle" aria-expanded={open} aria-controls={`us-panel-${id}`} title={open ? t('collapsePanel') : t('expandPanel')} onClick={() => panels.toggle(id, defaultOpen)}>
        <svg className="us-chevron" viewBox="0 0 16 16" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
        <span className="us-panel-title">{title}</span>
      </button>
      {note !== undefined && <span className="us-panel-note">{note}</span>}
    </div>
    {open && <div className="us-panel-body" id={`us-panel-${id}`}>{children}</div>}
  </section>
}

interface SelectOption {
  value: string
  label: string
}

function SelectControl({ label, triggerLabel, value, options, onChange, className = '' }: { label: string; triggerLabel?: string | undefined; value: string; options: readonly SelectOption[]; onChange: (value: string) => void; className?: string }): ReactNode {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const selected = options.find(option => option.value === value) ?? options[0]
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent): void => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => { window.removeEventListener('pointerdown', close) }
  }, [open])
  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const current = Math.max(0, options.findIndex(option => option.value === value))
    const direction = event.key === 'ArrowDown' ? 1 : -1
    const next = (current + direction + options.length) % options.length
    const option = options[next]
    if (option !== undefined) onChange(option.value)
  }
  return <div className={`us-select ${className}`.trim()} ref={root} data-open={open || undefined}>
    <button type="button" className="us-select-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(current => !current)} onKeyDown={onKeyDown}><span>{triggerLabel ?? selected?.label ?? ''}</span><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6.5 3.5 3 3.5-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
    {open && <div className="us-select-menu" role="listbox" aria-label={label}>{options.map(option => <button type="button" role="option" aria-selected={option.value === value} key={option.value} onClick={() => { onChange(option.value); setOpen(false) }}>{option.label}</button>)}</div>}
  </div>
}


/** A zeroed day, used to gap-fill sparse all-time series before charting. */
function emptyDay(date: string): Snapshot['days'][number] {
  return { date, tokens: 0, calls: 0, messages: 0, sessions: 0, models: {}, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 }
}

/**
 * Gap-fill a sparse day list (the all-time range returns only active days) so
 * the trend chart has one point per calendar day; falls back to the raw list
 * when the span would exceed `max` points.
 */
function gapFillDays(raw: Snapshot['days'], max = 400): Snapshot['days'] {
  if (raw.length < 2) return raw
  const first = raw[0]!.date
  const last = raw[raw.length - 1]!.date
  const byDate = new Map(raw.map(day => [day.date, day]))
  const out: Snapshot['days'] = []
  const cursor = new Date(`${first}T00:00:00Z`)
  const end = new Date(`${last}T00:00:00Z`)
  while (cursor <= end && out.length <= max) {
    const key = cursor.toISOString().slice(0, 10)
    out.push(byDate.get(key) ?? emptyDay(key))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return out.length > max ? raw : out
}

interface TrendSeries {
  id: 'total' | 'input' | 'output' | 'cache'
  label: string
  color: string
  get: (day: Snapshot['days'][number]) => number
}

/** Smooth multi-series area/line trend — the multi-line treatment the bar chart lacked. */
function SmoothTrend({ snapshot, note }: { snapshot: Snapshot; note?: ReactNode }): ReactNode {
  const { t, lang, numberLocale } = useLocale()
  const [off, setOff] = useState<Record<string, boolean>>({})
  const [hover, setHover] = useState<number | null>(null)
  const [tipAt, setTipAt] = useState<{ x: number; y: number } | null>(null)
  const days = useMemo(() => gapFillDays(snapshot.days), [snapshot.days])
  const W = 1000
  const H = 380
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 30
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const series: TrendSeries[] = [
    { id: 'total', label: t('trendTotal'), color: '#922bff', get: day => day.tokens },
    { id: 'input', label: t('input'), color: '#1684ff', get: day => day.input },
    { id: 'output', label: t('output'), color: '#219653', get: day => day.output },
    { id: 'cache', label: t('cacheRead'), color: '#f59e0b', get: day => day.cacheRead },
  ]
  const max = Math.max(1, ...days.map(day => day.tokens))
  const xAt = (index: number): number => padL + (days.length <= 1 ? plotW / 2 : index / (days.length - 1) * plotW)
  const yAt = (value: number): number => padT + plotH - value / max * plotH
  const smooth = (get: (day: Snapshot['days'][number]) => number): string => {
    if (days.length === 0) return ''
    const pts = days.map((day, index) => [xAt(index), yAt(get(day))] as const)
    let d = `M ${pts[0]![0].toFixed(1)} ${pts[0]![1].toFixed(1)}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i]!
      const p1 = pts[i]!
      const p2 = pts[i + 1]!
      const p3 = pts[i + 2] ?? p2
      d += ` C ${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
    }
    return d
  }
  const totalPath = smooth(item => item.tokens)
  const areaPath = totalPath === '' ? '' : `${totalPath} L ${xAt(days.length - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L ${xAt(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
  const tickCount = Math.min(days.length, days.length <= 8 ? days.length : 7)
  const ticks = Array.from({ length: tickCount }, (_, i) => days.length <= 1 ? 0 : Math.round(i / (tickCount - 1) * (days.length - 1)))
  const hoverDay = hover === null ? undefined : days[hover]
  const onMove = (event: React.MouseEvent<SVGRectElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0 || days.length === 0 || plotW === 0 || plotH === 0) return
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    const index = Math.round(frac * (days.length - 1))
    const value = days[index]?.tokens ?? 0
    setHover(index)
    setTipAt({ x: rect.left + (xAt(index) - padL) / plotW * rect.width, y: rect.top + (yAt(value) - padT) / plotH * rect.height })
  }
  return <Panel id="trend" title={t('dailyTrend')} note={note} className="us-trend">
    <div className="us-trend-chart">
      <svg className="us-trend-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('dailyTrend')}>
        <defs><linearGradient id="us-total-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#922bff" stopOpacity="0.3" /><stop offset="100%" stopColor="#922bff" stopOpacity="0.02" /></linearGradient></defs>
        {[0, 1, 2, 3, 4].map(i => { const y = padT + plotH * i / 4; return <g key={i}><line className="us-grid" x1={padL} y1={y} x2={W - padR} y2={y} /><text x={padL - 10} y={y + 4} textAnchor="end">{compact(max * (4 - i) / 4, numberLocale)}</text></g> })}
        {ticks.map(index => { const day = days[index]; if (day === undefined) return null; return <text key={index} x={xAt(index)} y={H - 10} textAnchor={index === 0 ? 'start' : index === days.length - 1 ? 'end' : 'middle'}>{formatDateLabel(day.date, lang)}</text> })}
        {areaPath !== '' && !off.total && <path d={areaPath} fill="url(#us-total-fill)" />}
        {series.map(item => off[item.id] ? null : <path key={item.id} d={smooth(item.get)} fill="none" stroke={item.color} strokeWidth={item.id === 'total' ? 2.4 : 1.7} strokeLinecap="round" strokeLinejoin="round" />)}
        {hover !== null && hoverDay !== undefined && <>
          <line className="us-trend-hover-line" x1={xAt(hover)} y1={padT} x2={xAt(hover)} y2={padT + plotH} />
          {series.map(item => off[item.id] ? null : <circle key={item.id} cx={xAt(hover)} cy={yAt(item.get(hoverDay))} r={3.4} fill={item.color} />)}
        </>}
        <rect x={padL} y={padT} width={plotW} height={plotH} fill="transparent" onMouseMove={onMove} onMouseLeave={() => { setHover(null); setTipAt(null) }} />
      </svg>
      {hover !== null && hoverDay !== undefined && tipAt !== null && createPortal(<div data-usage-stats className="us-trend-tip" style={{ position: 'fixed', left: Math.min(window.innerWidth - 96, Math.max(96, tipAt.x)), top: tipAt.y, transform: tipAt.y > 180 ? 'translate(-50%, -112%)' : 'translate(-50%, 16%)' }}>
        <b>{formatDateLabel(hoverDay.date, lang)}</b>
        {series.map(item => off[item.id] ? null : <div key={item.id}><span><i style={{ background: item.color }} />{item.label}</span><b>{compact(item.get(hoverDay!), numberLocale)}</b></div>)}
      </div>, document.body)}
    </div>
    <div className="us-trend-legend">{series.map(item => <button key={item.id} type="button" style={{ '--us-series': item.color } as React.CSSProperties} aria-pressed={!off[item.id]} onClick={() => setOff(current => ({ ...current, [item.id]: !current[item.id] }))}><i />{item.label}</button>)}</div>
  </Panel>
}


const BUCKETS = ['input', 'cacheRead', 'cacheWrite', 'output'] as const
const BUCKET_LABEL: Record<(typeof BUCKETS)[number], I18nKey> = {
  input: 'bucketInput',
  cacheRead: 'bucketCacheRead',
  cacheWrite: 'bucketCacheWrite',
  output: 'bucketOutput',
}

/** Models listed before the panel asks whether you want the rest. */
const MODEL_ROW_LIMIT = 6

/**
 * Usage and composition of every model, in one panel.
 *
 * The share of the total, the four-bucket split and the call count all answer
 * "what did this model cost me", so they belong on one row; the previous
 * separate "per-model token split" panel repeated the same model list under a
 * second heading. Long tails are hidden behind a toggle — a machine that has
 * seen thirty model ids does not need thirty rows by default.
 */
function ModelPanel({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { t, numberLocale } = useLocale()
  const [expanded, setExpanded] = useState(false)
  const models = snapshot.models
  const p1 = Math.min(100, models[0]?.percent ?? 0)
  const p2 = Math.min(100, p1 + (models[1]?.percent ?? 0))
  const rows = expanded ? models : models.slice(0, MODEL_ROW_LIMIT)
  const legend = <span className="us-bucket-legend">{BUCKETS.map(bucket => <span key={bucket}><i className="us-bucket-key" data-bucket={bucket} />{t(BUCKET_LABEL[bucket])}</span>)}</span>
  return <Panel id="models" title={t('modelUsage')} note={legend}>
    <div className="us-model-layout">
      <div className="us-donut" style={{ '--us-p1': `${p1}%`, '--us-p2': `${p2}%` } as React.CSSProperties}>
        <div className="us-donut-center">{compact(snapshot.totals.tokens, numberLocale)}<small>tokens</small></div>
      </div>
      <div className="us-model-list">
        {models.length === 0 && <div className="us-model-meta">{t('noData')}</div>}
        {rows.map(model => <div className="us-model-row" key={model.key}>
          <div className="us-model-line">
            <span className="us-model-name" title={model.key}>{model.model}</span>
            <span className="us-model-percent">{model.percent.toFixed(model.percent < 10 ? 1 : 0)}%</span>
            <span className="us-model-total">{compact(model.tokens, numberLocale)}</span>
          </div>
          <div className="us-bucket-stack">{BUCKETS.map(bucket => {
            const value = model[bucket]
            if (value <= 0 || model.tokens <= 0) return null
            return <span key={bucket} className="us-bucket-seg" data-bucket={bucket} style={{ width: `${value / model.tokens * 100}%` }} title={`${t(BUCKET_LABEL[bucket])}: ${new Intl.NumberFormat(numberLocale).format(value)}`} />
          })}</div>
          <div className="us-model-meta">
            {model.provider} · {model.calls} {t('callsCount')}
            {model.costUsd !== undefined && ` · ≈$${formatCost(model.costUsd, numberLocale)}`}
          </div>
        </div>)}
        {models.length > MODEL_ROW_LIMIT && <button type="button" className="us-model-more" onClick={() => setExpanded(current => !current)}>
          {expanded ? t('showLess') : t('showAllModels', { n: models.length })}
        </button>}
      </div>
    </div>
  </Panel>
}

/** Sessions listed before the panel asks whether you want the rest. */
const SESSION_ROW_LIMIT = 8

/** A session's working-directory leaf, falling back to a clipped id. */
function sessionLabel(row: SessionStats): string {
  if (row.cwd !== undefined) {
    const parts = row.cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
    const leaf = parts[parts.length - 1]
    if (leaf !== undefined && leaf.length > 0) return leaf
  }
  return row.sessionId.length > 16 ? `${row.sessionId.slice(0, 16)}…` : row.sessionId
}

/**
 * Sessions ranked by tokens, with a click-through into their call rows.
 *
 * Ranking is a ranking, not a chart, so it is a table: the drill-down reuses
 * the existing call-detail route with a session filter rather than adding a
 * second detail view that could disagree with the first.
 */
function SessionRanking({ snapshot, onSelect }: { snapshot: Snapshot; onSelect: (sessionId: string) => void }): ReactNode {
  const { t, numberLocale } = useLocale()
  const [expanded, setExpanded] = useState(false)
  const rows = expanded ? snapshot.sessions : snapshot.sessions.slice(0, SESSION_ROW_LIMIT)
  return <Panel id="sessions" title={t('sessionRanking')} note={t('sessionNote')}>
    {snapshot.sessions.length === 0 ? <div className="us-model-meta">{t('sessionEmpty')}</div> : <>
      <div className="us-session-wrap">
        <table className="us-session-table" aria-label={t('sessionRanking')}>
          <thead><tr>
            <th>{t('sessionColName')}</th>
            <th>{t('sessionColSpan')}</th>
            <th className="us-number">{t('sessionColDuration')}</th>
            <th className="us-number">{t('sessionColTokens')}</th>
            <th className="us-number">{t('sessionColMessages')}</th>
            <th>{t('sessionColModel')}</th>
          </tr></thead>
          <tbody>{rows.map(row => <tr
            key={row.sessionId}
            tabIndex={0}
            role="button"
            aria-label={`${sessionLabel(row)} → ${t('callsTitle')}`}
            onClick={() => onSelect(row.sessionId)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row.sessionId) } }}
          >
            <td className="us-session-name" title={row.cwd ?? row.sessionId}>{sessionLabel(row)}{row.subtask && <span className="us-subnote">{t('sessionSubtask')}</span>}</td>
            <td className="us-session-span" title={formatExactTime(row.startTime ?? row.createdAt, numberLocale)}>{formatCallTime(row.startTime ?? row.createdAt)}</td>
            <td className="us-number">{formatCallDuration(row.startTime === null || row.endTime === null ? null : row.endTime - row.startTime, t)}</td>
            <td className="us-number" title={formatExactTokens(row.tokens, numberLocale)}>{compact(row.tokens, numberLocale)}</td>
            <td className="us-number">{row.messages}</td>
            <td className="us-session-model" title={row.topModel}>{row.topModel.slice(row.topModel.indexOf('/') + 1)}{row.modelCount > 1 && <span className="us-subnote">+{row.modelCount - 1}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="us-session-foot">
        <span className="us-model-meta">{t('sessionCount', { n: snapshot.sessionTotal })}</span>
        {snapshot.sessions.length > SESSION_ROW_LIMIT && <button type="button" className="us-model-more" onClick={() => setExpanded(current => !current)}>
          {expanded ? t('showLess') : t('showAllSessions', { n: snapshot.sessions.length })}
        </button>}
      </div>
    </>}
  </Panel>
}

function Breakdown({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { t, numberLocale } = useLocale()
  const rows = [[t('input'), snapshot.totals.input], [t('output'), snapshot.totals.output], [t('cacheRead'), snapshot.totals.cacheRead], [t('cacheWrite'), snapshot.totals.cacheWrite]] as const
  return <Panel id="breakdown" title={t('tokenComposition')} note={t('cacheIncludedNote')}>
    <div className="us-breakdown">{rows.map(([label, value]) => <div className="us-break-item" key={label}><span>{label}</span><strong>{compact(value, numberLocale)}</strong></div>)}</div>
  </Panel>
}

function formatCallTime(value: number): string {
  const d = new Date(value)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function formatCallTokens(n: number, numberLocale: string): string {
  if (n < 1_000) return `${n} token`
  return `${new Intl.NumberFormat(numberLocale, { maximumFractionDigits: 1 }).format(n / 1_000)}k token`
}

function formatExactTokens(n: number, numberLocale: string): string {
  return `${new Intl.NumberFormat(numberLocale).format(n)} tokens`
}

function formatExactTime(value: number, numberLocale: string): string {
  return new Intl.DateTimeFormat(numberLocale, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(value)
}

function formatCallDuration(ms: number | null, t: (key: I18nKey) => string): string {
  if (ms === null || ms === undefined) return '—'
  if (ms < 1_000) return t('durationSubSecond')
  const s = ms / 1_000
  if (s < 60) return `${Math.round(s * 10) / 10}s`
  const m = Math.floor(s / 60)
  return `${m}m${Math.round(s % 60)}s`
}

function callCachePercent(tokens: CallRecord['tokens'], t: (key: I18nKey, vars?: Record<string, string | number>) => string): string {
  const denominator = tokens.input + tokens.cacheRead + tokens.cacheWrite
  return denominator === 0 ? '—' : t('cacheRate', { percent: Math.round(tokens.cacheRead / denominator * 100) })
}

function formatEffort(value: string | null, t: (key: I18nKey) => string): string {
  if (value === null || value === '') return t('notRecorded')
  const labels: Partial<Record<string, I18nKey>> = { max: 'effortMax', high: 'effortHigh', medium: 'effortMedium', low: 'effortLow' }
  const key = labels[value.toLowerCase()]
  return key === undefined ? value : t(key)
}

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50]
const PAGE_SIZE_STORAGE_KEY = 'dsh-usage-unified:calls-page-size'
const MAX_RECORD_OPTIONS = [100, 500, 1_000, 2_000, 5_000, 10_000]
const MAX_RECORD_STORAGE_KEY = 'dsh-usage-unified:calls-max-records'

function initialPageSize(): number {
  if (typeof window === 'undefined') return 5
  try {
    const saved = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY))
    return PAGE_SIZE_OPTIONS.includes(saved) ? saved : 5
  } catch {
    return 5
  }
}

function initialMaxRecords(): number {
  if (typeof window === 'undefined') return 1_000
  try {
    const saved = Number(window.localStorage.getItem(MAX_RECORD_STORAGE_KEY))
    return MAX_RECORD_OPTIONS.includes(saved) ? saved : 1_000
  } catch {
    return 1_000
  }
}

function CallsPanel({ snapshot, range, scope, workspace, session, onClearSession, custom }: { snapshot: Snapshot; range: RangeId; scope: TaskScope; workspace: string; session: string; onClearSession: () => void; custom?: CustomRange | undefined }): ReactNode {
  const { t, numberLocale } = useLocale()
  const [page, setPage] = useState(1)
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('')
  const [minInput, setMinInput] = useState('')
  const [minOutput, setMinOutput] = useState('')
  const [debouncedMinInput, setDebouncedMinInput] = useState('')
  const [debouncedMinOutput, setDebouncedMinOutput] = useState('')
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [maxRecords, setMaxRecords] = useState(initialMaxRecords)
  const [data, setData] = useState<CallsPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { setPage(1) }, [range, scope, workspace, session])
  useEffect(() => {
    const timer = window.setTimeout(() => { setDebouncedMinInput(minInput); setDebouncedMinOutput(minOutput) }, 250)
    return () => { window.clearTimeout(timer) }
  }, [minInput, minOutput])
  useEffect(() => {
    try { window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(pageSize)) } catch { /* Storage may be disabled. */ }
  }, [pageSize])
  useEffect(() => {
    try { window.localStorage.setItem(MAX_RECORD_STORAGE_KEY, String(maxRecords)) } catch { /* Storage may be disabled. */ }
  }, [maxRecords])
  useEffect(() => {
    const abort = new AbortController()
    setError(null)
    fetchCalls({ range, scope, workspace, model, provider, session, minInputTokens: debouncedMinInput, minOutputTokens: debouncedMinOutput, page, pageSize, maxRecords, ...(custom === undefined ? {} : { custom }) }, abort.signal)
      .then(setData)
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== 'AbortError') setError(reason instanceof Error ? reason.message : String(reason)) })
    return () => { abort.abort() }
  }, [range, scope, workspace, model, provider, session, debouncedMinInput, debouncedMinOutput, page, pageSize, maxRecords, custom])
  const modelOptions = useMemo(() => ['', ...new Set((snapshot.models ?? []).map(item => item.model))], [snapshot.models])
  const providerOptions = useMemo(() => ['', ...new Set((snapshot.models ?? []).map(item => item.provider))], [snapshot.models])
  const hasFilters = model !== '' || provider !== '' || minInput !== '' || minOutput !== ''
  const clearFilters = (): void => {
    setModel(''); setProvider(''); setMinInput(''); setMinOutput(''); setDebouncedMinInput(''); setDebouncedMinOutput(''); setPage(1)
  }
  const content: ReactNode = error ? <div className="us-state"><div><p>{t('callsLoadError')}</p><small>{error}</small></div></div>
    : data === null ? <div className="us-state"><div><div className="us-spinner" />{t('callsLoading')}</div></div>
    : !data.indexReady ? <div className="us-state">{t('callsIndexing')}</div>
    : data.items.length === 0 ? <div className="us-state">{t('callsEmpty')}</div>
    : <div className="us-calls-wrap"><table className="us-calls-table" aria-label={t('callsTitle')}><colgroup><col className="us-col-time" /><col className="us-col-duration" /><col className="us-col-token" /><col className="us-col-token" /><col className="us-col-cache" /><col className="us-col-model" /><col className="us-col-effort" /></colgroup><thead><tr><th>{t('colTime')}</th><th className="us-number">{t('colDuration')}</th><th className="us-number">{t('colInput')}</th><th className="us-number">{t('colOutput')}</th><th className="us-number">{t('colCacheRate')}</th><th>{t('colModel')}</th><th className="us-center">{t('colEffort')}</th></tr></thead><tbody>{data.items.map(item => <tr key={item.key}><td className="us-calls-time" title={formatExactTime(item.time, numberLocale)}>{formatCallTime(item.time)}</td><td className="us-number">{formatCallDuration(item.durationMs, t)}</td><td className="us-number" title={formatExactTokens(item.tokens.input, numberLocale)}>{formatCallTokens(item.tokens.input, numberLocale)}</td><td className="us-number" title={formatExactTokens(item.tokens.output, numberLocale)}>{formatCallTokens(item.tokens.output, numberLocale)}</td><td className="us-number">{callCachePercent(item.tokens, t)}</td><td className="us-calls-model" title={`${item.provider}/${item.model}`}>{item.model}{item.subtask && <span className="us-subnote">sub</span>}</td><td className={item.effort === null ? 'us-calls-effort us-center is-empty' : 'us-calls-effort us-center'}>{formatEffort(item.effort, t)}</td></tr>)}</tbody></table><div className="us-calls-pager"><span>{t('pageInfo', { start: (page - 1) * pageSize + 1, end: Math.min(page * pageSize, data.total), total: data.total })}</span><div className="us-calls-page-buttons"><button type="button" aria-label={t('prevPage')} title={t('prevPage')} disabled={page <= 1} onClick={() => setPage(page - 1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m9.5 4-4 4 4 4" /></svg></button><button type="button" aria-label={t('nextPage')} title={t('nextPage')} disabled={!data.hasMore} onClick={() => setPage(page + 1)}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6.5 4 4 4-4 4" /></svg></button></div></div></div>
  return <Panel id="calls" title={t('callsTitle')} note={t('callsNote')} className="us-panel-calls">
    <div className="us-calls-toolbar">
    {session !== '' && <button type="button" className="us-calls-chip" title={t('clearSessionFilter')} onClick={onClearSession}>{t('filteringSession', { id: session.length > 18 ? `${session.slice(0, 18)}…` : session })}<span aria-hidden="true">×</span></button>}
    <SelectControl className="us-calls-select" label={t('colModel')} value={model} options={modelOptions.map(value => ({ value, label: value === '' ? t('allModels') : value }))} onChange={value => { setModel(value); setPage(1) }} />
    <SelectControl className="us-calls-select" label={t('allProviders')} value={provider} options={providerOptions.map(value => ({ value, label: value === '' ? t('allProviders') : value }))} onChange={value => { setProvider(value); setPage(1) }} />
    <label className="us-calls-number-field"><input className="us-calls-number-input" type="text" inputMode="numeric" value={minInput} aria-label={t('minInput')} placeholder={t('minInput')} onChange={event => { setMinInput(event.target.value.replace(/\D/g, '')); setPage(1) }} /><span>{t('tokenUnit')}</span></label>
    <label className="us-calls-number-field"><input className="us-calls-number-input" type="text" inputMode="numeric" value={minOutput} aria-label={t('minOutput')} placeholder={t('minOutput')} onChange={event => { setMinOutput(event.target.value.replace(/\D/g, '')); setPage(1) }} /><span>{t('tokenUnit')}</span></label>
    {hasFilters && <button type="button" className="us-calls-clear" onClick={clearFilters}>{t('clearFilters')}</button>}
    <span className="us-spacer" />
    <SelectControl className="us-calls-select us-calls-max-records" label={t('maxRecords', { size: maxRecords.toLocaleString(numberLocale) })} triggerLabel={t('maxRecords', { size: maxRecords.toLocaleString(numberLocale) })} value={String(maxRecords)} options={MAX_RECORD_OPTIONS.map(value => ({ value: String(value), label: t('recordCount', { size: value.toLocaleString(numberLocale) }) }))} onChange={value => { setMaxRecords(Number(value)); setPage(1) }} />
    <SelectControl className="us-calls-select us-calls-page-size" label={t('perPage', { size: pageSize })} value={String(pageSize)} options={PAGE_SIZE_OPTIONS.map(value => ({ value: String(value), label: t('perPage', { size: value }) }))} onChange={value => { setPageSize(Number(value)); setPage(1) }} />
  </div>{content}</Panel>
}

function relativeWhen(t: (key: I18nKey, vars?: Record<string, string | number>) => string, at: number | null, now: number): string {
  if (at === null) return t('whenNever')
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return t('whenJustNow')
  if (minutes < 60) return t('whenMinutes', { n: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('whenHours', { n: hours })
  return t('whenDays', { n: Math.floor(hours / 24) })
}

function Footer({ snapshot }: { snapshot: Snapshot }): ReactNode {
  const { t } = useLocale()
  const items: string[] = []
  const homes = snapshot.homes.filter(home => home.error === undefined).length
  items.push(t('footHomes', { n: homes }))
  items.push(t('footUpdated', { when: relativeWhen(t, snapshot.status.updatedAt, snapshot.generatedAt) }))
  if (!snapshot.status.durable) items.push(t('footMemory'))
  const coverage = snapshot.coverage
  if (coverage.steps > 0 && coverage.stepsWithoutUsage > 0) {
    items.push(t('footCoverage', { percent: Math.round((coverage.steps - coverage.stepsWithoutUsage) / coverage.steps * 100) }))
  }
  if (coverage.retriedSteps > 0) items.push(t('footRetried', { n: coverage.retriedSteps }))
  if (coverage.truncatedSessions > 0) items.push(t('footTruncated', { n: coverage.truncatedSessions }))
  if (coverage.skippedArtifacts > 0) items.push(t('footSkipped', { n: coverage.skippedArtifacts }))
  items.push(snapshot.cost === null ? t('costUnavailable') : t('costNote'))
  return <div className="us-foot">{items.map(item => <span className="us-foot-item" key={item}>{item}</span>)}</div>
}

const RANGE_OPTIONS: readonly { value: RangeId; label: I18nKey }[] = [
  { value: '7d', label: 'last7Days' },
  { value: '30d', label: 'last30Days' },
  { value: 'all', label: 'allRange' },
]

function Dashboard({ hide, embedded = false }: { hide?: () => void; embedded?: boolean }): ReactNode {
  const { t, numberLocale } = useLocale()
  const [range, setRange] = useState<RangeId>('30d')
  const [custom, setCustom] = useState<CustomRange | null>(null)
  const [scope, setScope] = useState<TaskScope>('all')
  const [workspace, setWorkspace] = useState('')
  const [session, setSession] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback((signal: AbortSignal) => {
    setError(null)
    fetchSnapshot(range, scope, workspace, signal, custom ?? undefined)
      .then(setSnapshot)
      .catch((reason: unknown) => { if ((reason as { name?: string }).name !== 'AbortError') setError(reason instanceof Error ? reason.message : String(reason)) })
  }, [range, scope, workspace, custom])
  useEffect(() => { const abort = new AbortController(); refresh(abort.signal); return () => { abort.abort() } }, [refresh])
  useEffect(() => {
    if (hide === undefined) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') hide() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [hide])
  // A drill-down is scoped to the window it was made in, so switching the
  // window drops it rather than showing an empty table with no explanation.
  useEffect(() => { setSession('') }, [range, scope, workspace, custom])
  const drillInto = useCallback((sessionId: string) => {
    setSession(sessionId)
    panels.open('calls')
    window.setTimeout(() => { document.querySelector('.us-panel-calls')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, 90)
  }, [])
  const workspaceOptions = useMemo<SelectOption[]>(() => [{ value: '', label: t('allWorkspaces') }, ...(snapshot?.workspaces.map(item => ({ value: item.path, label: `${item.path} (${item.sessions})` })) ?? [])], [snapshot?.workspaces, t])
  const scopeOptions: readonly SelectOption[] = [{ value: 'all', label: t('allTasks') }, { value: 'main', label: t('mainOnly') }, { value: 'subtasks', label: t('subtasksOnly') }]
  const sparkline = useMemo(() => {
    const days = snapshot?.days ?? []
    if (days.length < 2) return undefined
    const slice = days.slice(-60)
    const max = Math.max(1, ...slice.map(day => day.tokens))
    const points = slice.map((day, index) => `${(index / (slice.length - 1) * 260).toFixed(1)},${(50 - day.tokens / max * 44 - 3).toFixed(1)}`).join(' ')
    return <svg className="us-spark" viewBox="0 0 260 52" preserveAspectRatio="none" aria-hidden="true"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  }, [snapshot])
  // The range the cards and the trend describe, spelled out: the picked label
  // plus the exact day bounds the host resolved (all-time has no lower bound).
  const rangeLabel = custom !== null ? t('customRange') : t((RANGE_OPTIONS.find(option => option.value === range) ?? RANGE_OPTIONS[0]!).label)
  const windowNote: ReactNode = snapshot === null
    ? t('windowRange', { label: rangeLabel, from: '…', to: '…' })
    : snapshot.range.from === ''
      ? t('windowAll')
      : t('windowRange', { label: rangeLabel, from: snapshot.range.from, to: snapshot.range.to })
  const body: ReactNode = error ? <div className="us-state"><div><p>{t('loadError')}</p><small>{error}</small></div></div>
    : snapshot === null ? <div className="us-state"><div><div className="us-spinner" />{t('loading')}</div></div>
    : <>
      <div className="us-cards">
        <Card icon="tokens" label={t('tokensUsage')} value={compact(snapshot.totals.tokens, numberLocale)} detail={t('inputOutputDetail', { input: compact(snapshot.totals.input, numberLocale), output: compact(snapshot.totals.output, numberLocale) })} accent="#1684ff" hero spark={sparkline} />
        <Card icon="chat" label={t('sessions')} value={snapshot.totals.sessions} detail={snapshot.totals.subagentSessions > 0 ? t('subagentNote', { n: snapshot.totals.subagentSessions }) : undefined} accent="#9368ef" />
        <Card icon="message" label={t('messages')} value={snapshot.totals.messages} accent="#219653" />
        <Card icon="chart" label={t('calls')} value={compact(snapshot.models.reduce((sum, model) => sum + model.calls, 0), numberLocale)} accent="#22b8b5" />
        <Card icon="tokens" label={t('cacheHitRate')} value={(() => { const denom = snapshot.totals.input + snapshot.totals.cacheRead + snapshot.totals.cacheWrite; return denom > 0 ? `${(snapshot.totals.cacheRead / denom * 100).toFixed(1)}%` : '—' })()} accent="#2da2bb" />
        {snapshot.cost !== null && <Card icon="chart" label={t('cost')} value={`≈$${formatCost(snapshot.cost.total, numberLocale)}`} detail={snapshot.cost.peakShare === undefined ? t('costCoverage', { percent: Math.round(snapshot.cost.pricedTokens / Math.max(1, snapshot.cost.pricedTokens + snapshot.cost.unpricedTokens) * 100), unpriced: compact(snapshot.cost.unpricedTokens, numberLocale) }) : `${t('costCoverage', { percent: Math.round(snapshot.cost.pricedTokens / Math.max(1, snapshot.cost.pricedTokens + snapshot.cost.unpricedTokens) * 100), unpriced: compact(snapshot.cost.unpricedTokens, numberLocale) })} · ${t('costPeakBlend', { percent: Math.round(snapshot.cost.peakShare * 100) })}`} accent="#f59e0b" />}
        <Card icon="calendar" label={t('activeDays')} value={snapshot.totals.activeDays} accent="#f59e0b" />
        <Card icon="streak" label={`${t('streak')} · ${t('allTimeTag')}`} value={snapshot.totals.currentStreak} accent="#ef5da8" />
        <Card icon="streak" label={`${t('longestStreak')} · ${t('allTimeTag')}`} value={snapshot.totals.longestStreak} accent="#a479e2" />
        <Card icon="clock" label={t('peakHour')} value={formatHour(snapshot.totals.peakHour, t)} accent="#2da2bb" />
        {snapshot.mostUsedModel
          ? <Card icon="model" label={t('mostUsedModel')} value={<span style={{ fontSize: '18px' }}>{snapshot.mostUsedModel.model}</span>} detail={`${snapshot.mostUsedModel.percent.toFixed(1)}% · ${snapshot.mostUsedModel.provider}`} accent="#65a9ff" />
          : <Card icon="model" label={t('mostUsedModel')} value={<span style={{ fontSize: '18px' }}>{t('noData')}</span>} accent="#65a9ff" />}
      </div>
      <SmoothTrend snapshot={snapshot} note={windowNote} />
      <ModelPanel snapshot={snapshot} />
      <Breakdown snapshot={snapshot} />
      <SessionRanking snapshot={snapshot} onSelect={drillInto} />
      <CallsPanel snapshot={snapshot} range={range} scope={scope} workspace={workspace} session={session} onClearSession={() => setSession('')} custom={custom ?? undefined} />
      <Footer snapshot={snapshot} />
    </>
  const toolbar: ReactNode = <>
    <div className="us-range-row"><span className="us-range-label">{t('rangeLabel')}</span><div className="us-segment" aria-label={t('rangeLabel')}>{RANGE_OPTIONS.map(option => <button key={option.value} aria-pressed={custom === null && range === option.value} onClick={() => { setCustom(null); setRange(option.value) }}>{t(option.label)}</button>)}<button aria-pressed={custom !== null} onClick={() => setCustom(current => current ?? { from: localDate(-29), to: localDate() })}>{t('customRange')}</button></div></div>
    {custom !== null && <div className="us-custom-range"><input type="date" value={custom.from} max={custom.to} aria-label={t('customRange')} onChange={event => { const value = event.target.value; if (value !== '') setCustom(current => current === null ? current : { ...current, from: value }) }} /><span>→</span><input type="date" value={custom.to} min={custom.from} aria-label={t('customRange')} onChange={event => { const value = event.target.value; if (value !== '') setCustom(current => current === null ? current : { ...current, to: value }) }} /></div>}
    <div className="us-window" aria-live="polite">{windowNote}</div>
    <div className="us-toolbar us-filterbar">
      <SelectControl label={t('workspace')} value={workspace} options={workspaceOptions} onChange={setWorkspace} />
      <SelectControl label={t('taskScope')} value={scope} options={scopeOptions} onChange={value => setScope(value as TaskScope)} />
      <span className="us-spacer" /><a className="us-export" href={exportUrl(range, scope, workspace, 'csv', custom ?? undefined)}><Icon name="download" size={15} />CSV</a><a className="us-export" href={exportUrl(range, scope, workspace, 'json', custom ?? undefined)}><Icon name="download" size={15} />JSON</a>
    </div>
  </>
  if (embedded) {
    return <div data-usage-stats className="us-embed"><div className="us-content"><h2 className="us-panel-title" style={{ margin: '0 0 12px' }}>{t('title')}</h2>{toolbar}{body}</div></div>
  }
  return <div data-usage-stats className="us-shell" role="dialog" aria-modal="true" aria-label={t('title')}>
    <header className="us-top"><div className="us-heading"><div className="us-title">{t('title')}</div><span className="us-tab">{t('appUsage')}</span></div><button className="us-back" onClick={hide}><Icon name="back" size={17} />{t('back')}</button></header>
    <main className="us-scroll"><div className="us-content">{toolbar}{body}</div></main>
  </div>
}

function Overlay({ useVisibility, hide }: OverlayProps): ReactNode {
  const open = useVisibility(value => value)
  return open ? <Dashboard hide={hide} /> : null
}

function SettingsSection(): ReactNode {
  return <Dashboard embedded />
}

export function apply(ctx: ClientContextLike): void {
  const uninstallLocale = installLocale(ctx.locale)
  ctx.effect(() => uninstallLocale, 'usage-unified: locale dictionaries')
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-usage-unified'
  style.textContent = styles
  document.head.appendChild(style)
  ctx.effect(() => () => { style.remove() }, 'usage-unified: styles')
  const visibility = new VisibilityController()
  const injected = (): { hooks: { visibility: VisibilityController }; show: () => void; hide: () => void } => ({ hooks: { visibility }, show: visibility.show, hide: visibility.hide })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({ name: 'sidebar.footer.action', id: 'usage-unified', order: 20, inject: injected }, FooterAction))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'usage-unified', order: 20, inject: injected }, Overlay))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'usage-unified', order: 60, label: () => ctx.locale.bind(NS)('nav'), locale: NS }, SettingsSection))
}
