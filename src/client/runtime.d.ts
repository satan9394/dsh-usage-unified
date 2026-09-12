/**
 * Minimal structural types for the browser runtime the harness injects.
 *
 * Declared locally rather than imported: the plugin ships against a harness
 * whose client packages have moved between releases, and these shapes are the
 * stable seam the plugin actually uses. Nothing here executes at runtime — the
 * `@deepseek-ai/*` client modules stay `import type`-free so the bundle is
 * hermetic.
 *
 * @module dsh-usage-unified/client/runtime
 */

/** A dictionary-bound translate function. */
export interface Translate {
  (key: string, vars?: Record<string, string | number>): string
}

/** The active-locale snapshot the host locale service exposes. */
export interface LocaleSnapshot {
  active: string
  revision: number
}

/** The browser locale service. */
export interface LocaleRuntime {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind(namespace: string): Translate
  subscribe(callback: () => void): () => void
  getSnapshot(): LocaleSnapshot
}

/** One slot registration. */
export interface SlotRegistration {
  name: string
  id: string
  order?: number
  inject?: unknown
  label?: () => string
  locale?: string
}

/** The browser slot registry. */
export interface SlotRegistry {
  inject(slot: string, callback: () => unknown): void
  register(registration: SlotRegistration, component: unknown): unknown
}

/** The browser plugin context this plugin consumes. */
export interface ClientContextLike {
  effect(callback: () => void | (() => void), name?: string): void
  locale: LocaleRuntime
  slots: SlotRegistry
}
