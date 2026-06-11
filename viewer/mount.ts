import { createTreeView, normalize, type TreeViewHandle } from './tree'
import { fallbackHtml, highlightToHtml } from './highlight'
import { providers } from './providers'
import type { Provider } from './providers'
import { resolveTheme, watchSystemTheme, type ResolvedTheme } from './theme'
import { disabledOriginsItem, formatsItem, perfItem, themeItem } from '../utils/settings'
import type { ThemePref } from '../utils/settings'
import { descriptorById } from '../formats'
import type { FormatId } from '../formats'
import { VIEWER_CSS } from './styles'

const HOST_ID = 'pretty-raw-root'

type View = 'tree' | 'raw'

export async function mountViewer(): Promise<void> {
  if (document.getElementById(HOST_ID)) return // idempotent

  const formatId = document.documentElement.dataset.prettyRawFormat as FormatId | undefined
  const raw = await readRawText()

  const [themePref, formats, perf] = await Promise.all([
    themeItem.getValue(),
    formatsItem.getValue(),
    perfItem.getValue(),
  ])

  const provider = formatId ? providers[formatId] : undefined
  const isTreeFormat = formatId ? descriptorById[formatId]?.view === 'tree' : false

  // Tree is available when the format is structured, has a parser, and parses.
  let parsed: unknown
  let treeAvailable = false
  let parseError = false
  if (isTreeFormat && provider?.parse) {
    try {
      parsed = provider.parse(raw)
      treeAvailable = true
    } catch {
      treeAvailable = false
      parseError = true
    }
  }

  const defaultView = formatId ? (formats[formatId]?.defaultView ?? 'raw') : 'raw'
  let view: View = treeAvailable && defaultView === 'tree' ? 'tree' : 'raw'

  // --- shadow host -----------------------------------------------------------
  const host = document.createElement('div')
  host.id = HOST_ID
  const shadow = host.attachShadow({ mode: 'closed' })
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(VIEWER_CSS)
  shadow.adoptedStyleSheets = [sheet]

  let resolvedTheme = resolveTheme(themePref)
  const applyTheme = (theme: ResolvedTheme): void => {
    resolvedTheme = theme
    host.classList.toggle('dark', theme === 'dark')
  }
  applyTheme(resolvedTheme)

  // --- content area ----------------------------------------------------------
  const content = elem('div', 'content')
  let tree: TreeViewHandle | null = null

  const ensureTree = (): void => {
    if (!tree && treeAvailable) {
      tree = createTreeView(normalize(parsed))
      tree.element.classList.add('tree')
    }
  }

  const renderRaw = (): void => {
    const rawBox = elem('div', 'raw')
    content.replaceChildren(rawBox)
    if (raw.length <= perf.highlightMaxBytes && provider) {
      // Small file: immediate full Shiki highlight.
      void highlightToHtml(raw, provider.lang, provider.grammar)
        .then((html) => {
          rawBox.innerHTML = html
          rawBox.classList.add('raw-shiki')
        })
        .catch(() => {
          rawBox.innerHTML = fallbackHtml(raw)
        })
    } else if (raw.length <= perf.hardMaxBytes && provider) {
      // Large file (1-10MB): show plain text immediately, then swap in Shiki
      // highlight progressively in idle-scheduled ~200-line chunks so the main
      // thread is never blocked for a long stretch.
      rawBox.append(plainCode(raw))
      scheduleChunkedHighlight(rawBox, raw, provider)
    } else {
      // Oversized (>10MB) or no grammar: plain monospace with a line-number gutter.
      rawBox.append(plainCode(raw))
    }
  }

  const showView = (next: View): void => {
    view = next
    if (next === 'tree') {
      ensureTree()
      if (tree) content.replaceChildren(tree.element)
    } else {
      renderRaw()
    }
    updateToolbarState()
  }

  // --- toolbar ---------------------------------------------------------------
  const toolbar = elem('div', 'toolbar')
  const title = elem('span', 'title')
  title.textContent = formatId
    ? parseError
      ? `Pretty Raw · ${formatId} · ⚠ parse error`
      : `Pretty Raw · ${formatId}`
    : 'Pretty Raw'

  const viewToggle = button('', () => showView(view === 'tree' ? 'raw' : 'tree'))
  const expandAllBtn = button('Expand all', () => tree?.expandAll())
  const collapseAllBtn = button('Collapse all', () => tree?.collapseAll())
  const copyBtn = button('Copy', () => {
    void navigator.clipboard.writeText(raw).then(
      () => flash(copyBtn, 'Copied'),
      () => flash(copyBtn, 'Copy failed'),
    )
  })
  const themeBtn = button('', () => cycleTheme())
  const disableBtn = button('Disable site', () => {
    void disabledOriginsItem.getValue().then((origins) => {
      const origin = location.origin
      if (!origins.includes(origin)) {
        void disabledOriginsItem.setValue([...origins, origin]).then(() => {
          location.reload()
        })
      }
    })
  })

  function updateToolbarState(): void {
    viewToggle.textContent = view === 'tree' ? 'Raw' : 'Parsed'
    viewToggle.style.display = treeAvailable ? '' : 'none'
    const treeControls = view === 'tree'
    expandAllBtn.style.display = treeControls ? '' : 'none'
    collapseAllBtn.style.display = treeControls ? '' : 'none'
    themeBtn.textContent = `Theme: ${currentPref}`
  }

  let currentPref: ThemePref = themePref
  const cycleTheme = (): void => {
    const order: ThemePref[] = ['auto', 'light', 'dark']
    currentPref = order[(order.indexOf(currentPref) + 1) % order.length] ?? 'auto'
    void themeItem.setValue(currentPref)
    applyTheme(resolveTheme(currentPref))
    updateToolbarState()
  }

  const spacer = elem('span', 'spacer')
  toolbar.append(title, spacer, expandAllBtn, collapseAllBtn, viewToggle, copyBtn, themeBtn, disableBtn)

  // --- assemble + live updates ----------------------------------------------
  shadow.append(toolbar, content)
  document.body.append(host)
  showView(view)

  // Live theme: follow OS while on auto, and follow settings changes elsewhere.
  watchSystemTheme((theme) => {
    if (currentPref === 'auto') applyTheme(theme)
  })
  themeItem.watch((pref) => {
    currentPref = pref
    applyTheme(resolveTheme(pref))
    updateToolbarState()
  })
}

// Raw text is the single source of truth for the Raw view and Copy.
async function readRawText(): Promise<string> {
  // For file:// URLs, fetch the raw bytes directly — another extension may have
  // already replaced the <pre> by the time we run, so DOM extraction is unreliable.
  if (location.protocol === 'file:') {
    try {
      const resp = await fetch(location.href)
      if (resp.ok) return await resp.text()
    } catch {
      // fall through to DOM extraction
    }
  }
  const pre = document.body?.querySelector(':scope > pre')
  if (pre?.textContent != null) return pre.textContent
  // Chrome XML viewer hides source in a hidden element
  const xmlSource = document.getElementById('webkit-xml-viewer-source-xml')
  if (xmlSource?.textContent) return xmlSource.textContent
  // Firefox loads XML as a live XML document (no body > pre); serialize it back
  if (document.contentType.includes('xml')) {
    try {
      return new XMLSerializer().serializeToString(document)
    } catch {
      // fall through
    }
  }
  return document.body?.textContent ?? ''
}

// Lines per idle-callback batch when progressively applying Shiki to large files.
const CHUNK_LINES = 200

// Highlight `raw` with Shiki in the background and progressively replace the
// `plainCode` content already inside `container`. Each idle callback inserts
// CHUNK_LINES lines so the main thread yields between batches.
function scheduleChunkedHighlight(container: HTMLElement, raw: string, prov: Provider): void {
  const idleOrTimeout = (fn: () => void): void => {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(fn, { timeout: 500 })
    } else {
      window.setTimeout(fn, 0)
    }
  }

  // Yield first so the browser paints plainCode before Shiki blocks the thread.
  idleOrTimeout(() => {
    void highlightToHtml(raw, prov.lang, prov.grammar)
      .then((html) => {
        const tmp = document.createElement('div')
        tmp.innerHTML = html
        const srcPre = tmp.querySelector('pre')
        const srcCode = srcPre?.querySelector('code')
        const lines = srcCode ? Array.from(srcCode.children) : []
        if (lines.length === 0) return // keep plainCode if Shiki produced nothing

        // Rebuild the shiki structure with an initially empty <code>.
        const pre = document.createElement('pre')
        pre.className = srcPre?.className ?? 'shiki'
        const codeEl = document.createElement('code')
        pre.append(codeEl)
        container.replaceChildren(pre)
        container.classList.add('raw-shiki')

        // Insert the first batch immediately (covers the visible viewport).
        let offset = 0
        const insertBatch = (): void => {
          const end = Math.min(offset + CHUNK_LINES, lines.length)
          for (let i = offset; i < end; i++) {
            codeEl.append(lines[i]!)
          }
          offset = end
        }

        insertBatch()

        // Schedule remaining batches lazily so scroll stays responsive.
        const step = (): void => {
          if (offset >= lines.length) return
          insertBatch()
          if (offset < lines.length) idleOrTimeout(step)
        }
        idleOrTimeout(step)
      })
      .catch(() => {
        // plainCode is already visible — leave it on any highlight failure.
      })
  })
}

function plainCode(raw: string): HTMLElement {
  const wrap = elem('div', 'plain')
  const lineCount = raw.length === 0 ? 1 : raw.split('\n').length
  const gutter = elem('pre', 'gutter')
  gutter.setAttribute('aria-hidden', 'true')
  gutter.textContent = Array.from({ length: lineCount }, (_, i) => String(i + 1)).join('\n')
  const code = elem('pre', 'code')
  code.textContent = raw
  wrap.append(gutter, code)
  return wrap
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.className = 'btn'
  btn.textContent = label
  btn.addEventListener('click', onClick)
  return btn
}

function flash(btn: HTMLButtonElement, label: string): void {
  const previous = 'Copy'
  btn.textContent = label
  window.setTimeout(() => {
    btn.textContent = previous
  }, 1200)
}

function elem(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}
