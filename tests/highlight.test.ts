import { describe, expect, it } from 'vitest'
import { escapeHtml, fallbackHtml, highlightToHtml } from '../viewer/highlight'
import { providers } from '../viewer/providers'

describe('highlight', () => {
  it('emits Shiki line spans and dual-theme CSS variables for JSON', async () => {
    const provider = providers.json
    expect(provider).toBeDefined()
    const html = await highlightToHtml('{"a":1,"b":[1,2]}', provider!.lang, provider!.grammar)
    expect(html).toContain('class="line"')
    expect(html).toContain('--shiki-dark')
  })

  it('fallback escapes HTML metacharacters', () => {
    expect(fallbackHtml('<script>&')).toContain('&lt;script&gt;&amp;')
  })

  it('escapeHtml escapes & < >', () => {
    expect(escapeHtml('<a> & </a>')).toBe('&lt;a&gt; &amp; &lt;/a&gt;')
  })
})
