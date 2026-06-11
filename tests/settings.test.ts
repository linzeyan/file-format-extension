import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import {
  disabledOriginsItem,
  formatsItem,
  loadDetectOptions,
  themeItem,
} from '../utils/settings'

beforeEach(() => {
  fakeBrowser.reset()
})

describe('settings defaults', () => {
  it('theme defaults to auto', async () => {
    expect(await themeItem.getValue()).toBe('auto')
  })

  it('formats default: enabled, sniff per descriptor, defaultView per view type', async () => {
    const formats = await formatsItem.getValue()
    expect(formats.json.enabled).toBe(true)
    expect(formats.json.sniff).toBe(true) // json sniffs by default
    expect(formats.yaml.sniff).toBe(false) // yaml does not
    expect(formats.json.defaultView).toBe('tree')
    expect(formats.dockerfile.defaultView).toBe('raw')
  })
})

describe('settings persistence and watch', () => {
  it('persists writes', async () => {
    await themeItem.setValue('dark')
    expect(await themeItem.getValue()).toBe('dark')
  })

  it('notifies watchers on change', async () => {
    let seen: string | null = null
    const unwatch = themeItem.watch((value) => {
      seen = value
    })
    await themeItem.setValue('light')
    unwatch()
    expect(seen).toBe('light')
  })
})

describe('loadDetectOptions', () => {
  it('returns null for a disabled origin, options otherwise', async () => {
    await disabledOriginsItem.setValue(['https://blocked.test'])
    expect(await loadDetectOptions('https://blocked.test')).toBeNull()

    const options = await loadDetectOptions('https://allowed.test')
    expect(options).not.toBeNull()
    expect(options?.formatEnabled.json).toBe(true)
    expect(options?.sniffEnabled.yaml).toBe(false)
  })
})
