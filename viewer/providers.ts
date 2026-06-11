import type { LanguageInput } from 'shiki/core'
import type { FormatId } from '../formats'
import jsonGrammar from '@shikijs/langs/json'
import yamlGrammar from '@shikijs/langs/yaml'
import tomlGrammar from '@shikijs/langs/toml'
import xmlGrammar from '@shikijs/langs/xml'
import iniGrammar from '@shikijs/langs/ini'
import dockerfileGrammar from '@shikijs/langs/dockerfile'
import shellscriptGrammar from '@shikijs/langs/shellscript'
import { parseAllDocuments } from 'yaml'
import { parse as parseToml } from 'smol-toml'
import { parse as parseIni } from 'ini'

// The HEAVY layer: grammars + parsers, statically imported so they inline into
// the single viewer.js IIFE. Only viewer.js ever imports this module — never the
// content-script detector. Grows one entry per format across milestones.
export interface Provider {
  /** Shiki grammar (TextMate), loaded lazily into the shared highlighter. */
  readonly grammar: LanguageInput
  /** Shiki language id used by codeToHtml. */
  readonly lang: string
  /** Parser for tree formats; absent for static-highlight-only formats. */
  readonly parse?: (text: string) => unknown
}

function parseYaml(text: string): unknown {
  const docs = parseAllDocuments(text, { logLevel: 'silent' })
  if (docs.length === 0) return null
  if (docs.length === 1) {
    const doc = docs[0]!
    if (doc.errors.length > 0) throw doc.errors[0]
    return doc.toJS() as unknown
  }
  return docs.map((d) => {
    if (d.errors.length > 0) throw d.errors[0]
    return d.toJS() as unknown
  })
}

// Converts an XML Element to a plain JS value for normalize().
// Text-only elements with no attributes become scalar strings;
// elements with children or attributes become objects with @attr keys.
function xmlElToJs(el: Element): unknown {
  const childEls = Array.from(el.children)
  const hasAttrs = el.attributes.length > 0

  if (childEls.length === 0 && !hasAttrs) {
    return el.textContent?.trim() ?? ''
  }

  const result: Record<string, unknown> = {}
  for (const attr of Array.from(el.attributes)) {
    result[`@${attr.name}`] = attr.value
  }

  if (childEls.length > 0) {
    const groups = new Map<string, unknown[]>()
    for (const child of childEls) {
      const tag = child.localName
      const bucket = groups.get(tag)
      if (bucket) bucket.push(xmlElToJs(child))
      else groups.set(tag, [xmlElToJs(child)])
    }
    for (const [tag, items] of groups) {
      result[tag] = items.length === 1 ? items[0]! : items
    }
  } else {
    const textContent = el.textContent?.trim()
    if (textContent) result['#text'] = textContent
  }
  return result
}

function parseXml(text: string): unknown {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(err.textContent ?? 'XML parse error')
  return { [doc.documentElement.localName]: xmlElToJs(doc.documentElement) }
}

export const providers: Partial<Record<FormatId, Provider>> = {
  json: { grammar: jsonGrammar, lang: 'json', parse: (text) => JSON.parse(text) },
  yaml: { grammar: yamlGrammar, lang: 'yaml', parse: parseYaml },
  toml: { grammar: tomlGrammar, lang: 'toml', parse: (text) => parseToml(text) },
  xml: { grammar: xmlGrammar, lang: 'xml', parse: parseXml },
  ini: { grammar: iniGrammar, lang: 'ini', parse: (text) => parseIni(text) },
  // Static highlight only — no parse fn, no tree view.
  dockerfile: { grammar: dockerfileGrammar, lang: 'docker' },
  // Vagrantfile: ruby grammar bundles 2.4 MB of embedded-language deps; plain
  // monospace is better than a 10x bundle size increase. Revisit when Shiki
  // supports scoped grammar loading.
  shell: { grammar: shellscriptGrammar, lang: 'shellscript' },
}
