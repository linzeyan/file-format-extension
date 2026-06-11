import { storage } from '#imports'
import { descriptors } from '../formats'
import type { FormatId } from '../formats'
import type { DetectOptions } from './detect'

export type ThemePref = 'auto' | 'light' | 'dark'
export type ViewPref = 'tree' | 'raw'

export interface FormatSetting {
  enabled: boolean
  sniff: boolean
  defaultView: ViewPref
}

export interface PerfSetting {
  highlightMaxBytes: number
  hardMaxBytes: number
  sniffMaxBytes: number
}

function defaultFormats(): Record<FormatId, FormatSetting> {
  const out = {} as Record<FormatId, FormatSetting>
  for (const d of descriptors) {
    out[d.id] = {
      enabled: true,
      sniff: d.sniffDefault ?? false,
      defaultView: d.view === 'tree' ? 'tree' : 'raw',
    }
  }
  return out
}

const DEFAULT_PERF: PerfSetting = {
  highlightMaxBytes: 1 * 1024 * 1024,
  hardMaxBytes: 10 * 1024 * 1024,
  sniffMaxBytes: 2 * 1024 * 1024,
}

export const themeItem = storage.defineItem<ThemePref>('sync:theme', {
  fallback: 'auto',
  version: 1,
})

export const formatsItem = storage.defineItem<Record<FormatId, FormatSetting>>('sync:formats', {
  fallback: defaultFormats(),
  version: 1,
})

export const perfItem = storage.defineItem<PerfSetting>('sync:perf', {
  fallback: DEFAULT_PERF,
  version: 1,
})

export const disabledOriginsItem = storage.defineItem<string[]>('sync:disabledOrigins', {
  fallback: [],
  version: 1,
})

/**
 * Resolve the detection options for the current origin. Returns null when the
 * extension is disabled for this origin (per-site kill switch).
 */
export async function loadDetectOptions(origin: string): Promise<DetectOptions | null> {
  const [formats, perf, disabled] = await Promise.all([
    formatsItem.getValue(),
    perfItem.getValue(),
    disabledOriginsItem.getValue(),
  ])
  if (disabled.includes(origin)) return null

  const formatEnabled: Partial<Record<FormatId, boolean>> = {}
  const sniffEnabled: Partial<Record<FormatId, boolean>> = {}
  for (const d of descriptors) {
    const s = formats[d.id]
    if (s) {
      formatEnabled[d.id] = s.enabled
      sniffEnabled[d.id] = s.sniff
    }
  }

  return {
    hardMaxBytes: perf.hardMaxBytes,
    sniffMaxBytes: perf.sniffMaxBytes,
    formatEnabled,
    sniffEnabled,
  }
}
