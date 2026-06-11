import { descriptors, descriptorById } from '../formats'
import type { FormatId } from '../formats'

export type BodyShape = 'single-pre' | 'xml-document' | 'firefox-json-viewer' | 'other'
export type Confidence = 'mime' | 'filename' | 'sniff'

/** Pure detection input — extracted from the DOM by detectFromDocument(). */
export interface DetectInput {
  /** Raw document.contentType (may include parameters / casing). */
  contentType: string
  /** Last path segment of the URL, original casing. */
  filename: string
  bodyShape: BodyShape
  /** The raw text (or a prefix large enough to sniff). */
  sampleText: string
  byteLength: number
}

export interface DetectOptions {
  hardMaxBytes: number
  sniffMaxBytes: number
  /** Per-format on/off override; missing → enabled. */
  formatEnabled: Partial<Record<FormatId, boolean>>
  /** Per-format sniff override; missing → descriptor.sniffDefault. */
  sniffEnabled: Partial<Record<FormatId, boolean>>
}

export interface DetectResult {
  formatId: FormatId
  confidence: Confidence
}

export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  hardMaxBytes: 10 * 1024 * 1024,
  sniffMaxBytes: 2 * 1024 * 1024,
  formatEnabled: {},
  sniffEnabled: {},
}

const XHTML_MIME = 'application/xhtml+xml'

function isEnabled(id: FormatId, options: DetectOptions): boolean {
  return options.formatEnabled[id] ?? true
}

function isSniffEnabled(id: FormatId, options: DetectOptions): boolean {
  return options.sniffEnabled[id] ?? descriptorById[id].sniffDefault ?? false
}

function normalizeMime(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim().toLowerCase()
}

function isGenericMime(mime: string): boolean {
  return mime === '' || mime === 'text/plain'
}

function matchByMime(mime: string, options: DetectOptions): FormatId | null {
  if (!mime) return null
  for (const d of descriptors) {
    if (!isEnabled(d.id, options)) continue
    if (d.mimes?.includes(mime)) return d.id
  }
  if (mime === XHTML_MIME) return null
  for (const d of descriptors) {
    if (!isEnabled(d.id, options)) continue
    if (d.mimeSuffixes?.some((s) => mime.endsWith(s))) return d.id
  }
  return null
}

function matchByFilename(filename: string, options: DetectOptions): FormatId | null {
  if (!filename) return null
  const lower = filename.toLowerCase()
  for (const d of descriptors) {
    if (!isEnabled(d.id, options)) continue
    if (d.filenames?.some((f) => f.toLowerCase() === lower)) return d.id
    if (d.filenamePrefixes?.some((p) => lower.startsWith(p.toLowerCase()))) return d.id
  }
  // Extension match only for real extensions, not dotfiles (leading-dot only).
  const dot = lower.lastIndexOf('.')
  if (dot > 0) {
    const ext = lower.slice(dot)
    for (const d of descriptors) {
      if (!isEnabled(d.id, options)) continue
      if (d.extensions?.includes(ext)) return d.id
    }
  }
  return null
}

function matchBySniff(text: string, options: DetectOptions): FormatId | null {
  for (const d of descriptors) {
    if (!isEnabled(d.id, options)) continue
    if (!isSniffEnabled(d.id, options)) continue
    if (d.sniff?.(text)) return d.id
  }
  return null
}

/**
 * Pure, side-effect-free detection. Ordered cheapest-first per spec §4:
 * structural gate → MIME → filename → content sniff.
 */
export function detect(
  input: DetectInput,
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): DetectResult | null {
  const { bodyShape, byteLength } = input

  if (bodyShape === 'firefox-json-viewer') return null
  if (byteLength > options.hardMaxBytes) return null

  const mime = normalizeMime(input.contentType)

  // XML document by shape: the shape itself is sufficient signal.
  if (bodyShape === 'xml-document') {
    return isEnabled('xml', options) ? { formatId: 'xml', confidence: 'mime' } : null
  }

  // Non-generic MIME (e.g. application/json): MIME alone is a reliable signal —
  // no regular HTML page uses these types — so skip the structural gate. This
  // lets us take over even when another extension has already modified the DOM.
  if (!isGenericMime(mime)) {
    const byMime = matchByMime(mime, options)
    return byMime ? { formatId: byMime, confidence: 'mime' } : null
  }

  // Generic MIME (text/plain or empty): require a clean single-pre body to avoid
  // false positives on regular web pages (e.g. error pages served as text/plain).
  if (bodyShape !== 'single-pre') return null

  const byName = matchByFilename(input.filename, options)
  if (byName) return { formatId: byName, confidence: 'filename' }

  if (byteLength <= options.sniffMaxBytes) {
    const bySniff = matchBySniff(input.sampleText, options)
    if (bySniff) return { formatId: bySniff, confidence: 'sniff' }
  }

  return null
}

// --- DOM adapter (used by content script; not unit-tested directly) -----------

function lastPathSegment(pathname: string): string {
  const clean = pathname.split(/[?#]/)[0] ?? pathname
  const segment = clean.split('/').pop() ?? ''
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function isXmlContentType(mime: string): boolean {
  const m = normalizeMime(mime)
  return m === 'application/xml' || m === 'text/xml' || (m.endsWith('+xml') && m !== XHTML_MIME)
}

function getBodyShape(doc: Document): BodyShape {
  // Firefox built-in JSON viewer renders its own app, not a raw <pre> (best-effort
  // marker; even without it the gate below rejects the non-pre body).
  if (doc.querySelector('.jsonPanelBox, .json-viewer')) return 'firefox-json-viewer'

  const body = doc.body
  if (body) {
    const children = body.children
    const only = children.length === 1 ? children[0] : null
    if (only && only.tagName.toLowerCase() === 'pre') return 'single-pre'
  }

  // Chrome keeps the original XML source in a known hidden node.
  if (doc.getElementById('webkit-xml-viewer-source-xml')) return 'xml-document'
  // Firefox/Chrome XML document with a non-HTML root element.
  if (isXmlContentType(doc.contentType) && doc.documentElement.tagName.toLowerCase() !== 'html') {
    return 'xml-document'
  }
  return 'other'
}

/** Recover the raw text for sampling/sizing from the rendered document. */
export function extractRawText(doc: Document, shape: BodyShape): string {
  if (shape === 'single-pre') {
    return doc.body?.querySelector(':scope > pre')?.textContent ?? ''
  }
  if (shape === 'xml-document') {
    const chromeSource = doc.getElementById('webkit-xml-viewer-source-xml')
    if (chromeSource?.textContent) return chromeSource.textContent
    return new XMLSerializer().serializeToString(doc)
  }
  return ''
}

export function detectFromDocument(
  doc: Document,
  loc: Location,
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): { result: DetectResult; rawText: string; bodyShape: BodyShape } | null {
  const bodyShape = getBodyShape(doc)
  const rawText = extractRawText(doc, bodyShape)
  const input: DetectInput = {
    contentType: doc.contentType,
    filename: lastPathSegment(loc.pathname),
    bodyShape,
    sampleText: rawText,
    byteLength: rawText.length,
  }
  const result = detect(input, options)
  return result ? { result, rawText, bodyShape } : null
}
