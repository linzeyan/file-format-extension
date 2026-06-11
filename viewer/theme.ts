import type { ThemePref } from '../utils/settings'

export type ResolvedTheme = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

/** Subscribe to OS theme changes (only meaningful while pref === 'auto'). */
export function watchSystemTheme(callback: (theme: ResolvedTheme) => void): () => void {
  const mq = window.matchMedia(DARK_QUERY)
  const handler = (): void => callback(mq.matches ? 'dark' : 'light')
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
