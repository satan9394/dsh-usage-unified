import { describe, expect, it } from 'vitest'
import { dictionaries, formatHour, languageOf, NS, translate } from '../src/client/i18n.ts'

describe('i18n dictionaries', () => {
  it('declares the same key set in every language', () => {
    const zh = Object.keys(dictionaries.zh).sort()
    const en = Object.keys(dictionaries.en).sort()
    expect(en).toEqual(zh)
  })

  it('has no empty translations', () => {
    for (const lang of ['zh', 'en'] as const) {
      for (const [key, value] of Object.entries(dictionaries[lang])) {
        expect(value.length, `${lang}.${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('namespaces the plugin dictionary', () => {
    expect(NS).toBe('usage-unified')
  })

  it('picks a language from a locale tag', () => {
    expect(languageOf('zh-CN')).toBe('zh')
    expect(languageOf('zh')).toBe('zh')
    expect(languageOf('en-US')).toBe('en')
    expect(languageOf('fr')).toBe('en')
  })

  it('substitutes placeholders and honours the 12/24-hour convention', () => {
    expect(translate('en', 'pageInfo', { start: 1, end: 5, total: 9 })).toBe('1–5 / 9')
    expect(formatHour(13, (key, vars) => translate('en', key, vars))).toBe('1 PM')
    expect(formatHour(13, (key, vars) => translate('zh', key, vars))).toBe('下午 1 点')
  })
})
