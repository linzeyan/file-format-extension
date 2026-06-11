import { createHighlighterCore, type HighlighterCore, type LanguageInput } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import githubLight from '@shikijs/themes/github-light'
import githubDark from '@shikijs/themes/github-dark'

// Shared singleton highlighter using the JS regex engine (no WASM → no
// wasm-unsafe-eval CSP directive, no .wasm asset). Dual themes are emitted as CSS
// variables so switching light/dark is a class flip with no re-highlight.
let highlighterPromise: Promise<HighlighterCore> | null = null
const loadedLangs = new Set<string>()

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [githubLight, githubDark],
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  }
  return highlighterPromise
}

/**
 * Highlight code to HTML. Returns Shiki's dual-theme output (CSS vars
 * --shiki-light / --shiki-dark). On any engine error, falls back to a safe,
 * escaped <pre> so a single bad grammar can never break the whole page.
 */
export async function highlightToHtml(code: string, lang: string, grammar: LanguageInput): Promise<string> {
  try {
    const highlighter = await getHighlighter()
    if (!loadedLangs.has(lang)) {
      await highlighter.loadLanguage(grammar)
      loadedLangs.add(lang)
    }
    return highlighter.codeToHtml(code, {
      lang,
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    })
  } catch {
    return fallbackHtml(code)
  }
}

export function fallbackHtml(code: string): string {
  return `<pre class="shiki-fallback"><code>${escapeHtml(code)}</code></pre>`
}

export function escapeHtml(input: string): string {
  return input.replace(/[&<>]/g, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;'))
}
