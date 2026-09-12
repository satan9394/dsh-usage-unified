/**
 * Merged dictionaries for the unified dashboard.
 *
 * The Chinese object is the source of truth for the key set; the English one
 * is typed against it so a missing translation is a compile error.
 *
 * @module dsh-usage-unified/client/i18n
 */

import { useSyncExternalStore } from 'react'
import type { LocaleRuntime } from './runtime.d.ts'

export type Language = 'zh' | 'en'

const zh = {
  nav: '使用统计',
  title: '使用统计',
  appUsage: '全机用量',
  back: '返回对话',
  rangeLabel: '趋势范围',
  last7Days: '近 7 天',
  last30Days: '近 30 天',
  allRange: '全部',
  workspace: '工作区',
  taskScope: '任务范围',
  allWorkspaces: '全部工作区',
  allTasks: '全部任务',
  mainOnly: '仅主任务',
  subtasksOnly: '仅子任务',
  heatmap: '活跃热力图',
  less: '较少',
  more: '较多',
  mon: '一',
  wed: '三',
  fri: '五',
  callsSuffix: '轮',
  dailyTrend: '按天 Token 趋势',
  modelUsage: '模型用量',
  tokenSummary: '输入、输出与缓存合计',
  callsCount: '次调用',
  tokenComposition: 'Token 构成',
  modelBuckets: '模型 Token 明细',
  bucketInput: '输入',
  bucketCacheRead: '缓存读',
  bucketCacheWrite: '缓存写',
  bucketOutput: '输出',
  input: '输入',
  output: '输出',
  cacheRead: '缓存读取',
  cacheWrite: '缓存写入',
  tokensUsage: 'Tokens 用量',
  inputOutputDetail: '输入 {input} · 输出 {output}',
  sessions: '会话数量',
  messages: '消息数量',
  activeDays: '活跃天数',
  streak: '当前连续天数',
  longestStreak: '最长连续天数',
  peakHour: '高峰时段',
  mostUsedModel: '最常用模型',
  noData: '暂无数据',
  subagentNote: '含 {n} 个子会话',
  loadError: '统计数据暂时无法读取',
  loading: '正在建立本地增量索引…',
  callsTitle: '调用明细',
  callsNote: '每次模型调用 · 最新在前',
  callsLoadError: '调用明细暂时无法读取',
  callsLoading: '正在加载调用明细…',
  callsIndexing: '正在建立本地增量索引…',
  callsEmpty: '暂无调用数据',
  allModels: '全部模型',
  allProviders: '全部提供商',
  minInput: '输入 ≥',
  minOutput: '输出 ≥',
  tokenUnit: 'Token',
  clearFilters: '清除筛选',
  maxRecords: '明细上限 {size} 条',
  recordCount: '{size} 条',
  perPage: '{size} 条/页',
  prevPage: '上一页',
  nextPage: '下一页',
  pageInfo: '{start}–{end} / 共 {total} 条',
  colTime: '时间',
  colDuration: '响应耗时',
  colInput: '输入',
  colOutput: '输出',
  colCacheRate: '缓存率',
  colModel: '模型',
  colEffort: '思考程度',
  effortMax: '最大',
  effortHigh: '高',
  effortMedium: '中',
  effortLow: '低',
  notRecorded: '未记录',
  cacheRate: '{percent}%',
  durationSubSecond: '<1s',
  timeAm: '上午',
  timePm: '下午',
  peakHourPattern: '{period} {h12} 点',
  footHomes: '{n} 个 dsh home',
  footUpdated: '更新于{when}',
  footMemory: '内存索引',
  footCoverage: '{percent}% 的步骤有 provider 计量',
  footRetried: '{n} 个重试步骤未计入',
  footTruncated: '{n} 个会话仍在写入',
  footSkipped: '跳过 {n} 个日志',
  whenJustNow: '刚刚',
  whenMinutes: '{n} 分钟前',
  whenHours: '{n} 小时前',
  whenDays: '{n} 天前',
  whenNever: '从未',
  cacheIncludedNote: '总量含缓存读',
} as const

type Dictionary = Record<keyof typeof zh, string>

const en: Dictionary = {
  nav: 'Usage Stats',
  title: 'Usage Stats',
  appUsage: 'Machine-wide',
  back: 'Back to chat',
  rangeLabel: 'Range',
  last7Days: 'Last 7 days',
  last30Days: 'Last 30 days',
  allRange: 'All',
  workspace: 'Workspace',
  taskScope: 'Scope',
  allWorkspaces: 'All workspaces',
  allTasks: 'All tasks',
  mainOnly: 'Main tasks only',
  subtasksOnly: 'Subtasks only',
  heatmap: 'Activity Heatmap',
  less: 'Less',
  more: 'More',
  mon: 'M',
  wed: 'W',
  fri: 'F',
  callsSuffix: 'calls',
  dailyTrend: 'Daily Token Trend',
  modelUsage: 'Model Usage',
  tokenSummary: 'Input, output and cache total',
  callsCount: 'calls',
  tokenComposition: 'Token Breakdown',
  modelBuckets: 'Per-model Token Split',
  bucketInput: 'Input',
  bucketCacheRead: 'Cache read',
  bucketCacheWrite: 'Cache write',
  bucketOutput: 'Output',
  input: 'Input',
  output: 'Output',
  cacheRead: 'Cache read',
  cacheWrite: 'Cache write',
  tokensUsage: 'Tokens Used',
  inputOutputDetail: 'Input {input} · Output {output}',
  sessions: 'Sessions',
  messages: 'Messages',
  activeDays: 'Active Days',
  streak: 'Current Streak',
  longestStreak: 'Longest Streak',
  peakHour: 'Peak Hour',
  mostUsedModel: 'Most Used Model',
  noData: 'No data',
  subagentNote: '+{n} subagent',
  loadError: 'Unable to load usage stats',
  loading: 'Building local index…',
  callsTitle: 'Call Details',
  callsNote: 'Per model call · newest first',
  callsLoadError: 'Unable to load call details',
  callsLoading: 'Loading call details…',
  callsIndexing: 'Building local index…',
  callsEmpty: 'No calls yet',
  allModels: 'All models',
  allProviders: 'All providers',
  minInput: 'Input ≥',
  minOutput: 'Output ≥',
  tokenUnit: 'Token',
  clearFilters: 'Clear filters',
  maxRecords: 'Detail limit {size}',
  recordCount: '{size} records',
  perPage: '{size} / page',
  prevPage: 'Prev',
  nextPage: 'Next',
  pageInfo: '{start}–{end} / {total}',
  colTime: 'Time',
  colDuration: 'Response time',
  colInput: 'Input',
  colOutput: 'Output',
  colCacheRate: 'Cache',
  colModel: 'Model',
  colEffort: 'Thinking',
  effortMax: 'Max',
  effortHigh: 'High',
  effortMedium: 'Medium',
  effortLow: 'Low',
  notRecorded: 'Not recorded',
  cacheRate: '{percent}%',
  durationSubSecond: '<1s',
  peakHourPattern: '{h12} {period}',
  timeAm: 'AM',
  timePm: 'PM',
  footHomes: '{n} dsh homes',
  footUpdated: 'updated {when}',
  footMemory: 'in-memory index',
  footCoverage: '{percent}% of steps had provider metering',
  footRetried: '{n} retried steps not counted',
  footTruncated: '{n} sessions still being written',
  footSkipped: '{n} logs skipped',
  whenJustNow: 'just now',
  whenMinutes: '{n}m ago',
  whenHours: '{n}h ago',
  whenDays: '{n}d ago',
  whenNever: 'never',
  cacheIncludedNote: 'Totals include cache reads',
}

export type I18nKey = keyof typeof zh
export const NS = 'usage-unified'
export const dictionaries: Record<Language, Dictionary> = { zh, en }

export function languageOf(locale: string): Language {
  return /^zh(?:-|$)/i.test(locale) ? 'zh' : 'en'
}

export function translate(lang: Language, key: I18nKey, vars?: Record<string, string | number>): string {
  let text = dictionaries[lang][key]
  if (vars !== undefined) {
    for (const [name, value] of Object.entries(vars)) text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

export function formatDateLabel(date: string, lang: Language): string {
  const [, month = '', day = ''] = date.split('-')
  return lang === 'zh' ? `${Number(month)}月${Number(day)}日` : `${Number(month)}/${Number(day)}`
}

export function numberLocaleOf(lang: Language): string {
  return lang === 'zh' ? 'zh-CN' : 'en-US'
}

/** Format a 0-23 hour through the dictionary's own 12/24-hour convention. */
export function formatHour(hour: number | null, t: (key: I18nKey, vars?: Record<string, string | number>) => string): string {
  if (hour === null) return '—'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  const period = hour < 12 ? t('timeAm') : t('timePm')
  return t('peakHourPattern', { h12, h24: hour, period })
}

let localeRuntime: LocaleRuntime | null = null

export function installLocale(locale: LocaleRuntime): () => void {
  localeRuntime = locale
  const unregister = locale.register(NS, dictionaries)
  return () => {
    unregister()
    if (localeRuntime === locale) localeRuntime = null
  }
}

const FALLBACK_SNAPSHOT = { active: 'zh', revision: 0 }

export function useLocale(): {
  lang: Language
  numberLocale: string
  t: (key: I18nKey, vars?: Record<string, string | number>) => string
} {
  const snapshot = useSyncExternalStore(
    callback => localeRuntime?.subscribe(callback) ?? (() => {}),
    () => localeRuntime?.getSnapshot() ?? FALLBACK_SNAPSHOT,
  )
  const lang = languageOf(snapshot.active)
  return {
    lang,
    numberLocale: numberLocaleOf(lang),
    t: (key, vars) => translate(lang, key, vars),
  }
}
