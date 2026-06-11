import type { FormatDescriptor } from './types'

// Sniffing JSON IS parsing it: the tree view needs JSON.parse anyway, and only a
// successful strict parse should claim a text/plain page as JSON. This avoids the
// classic false positive of prose that merely starts with '{' (json-formatter#275).
function looksLikeJson(text: string): boolean {
  const head = text.trimStart()[0]
  if (head !== '{' && head !== '[') return false
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

export const json: FormatDescriptor = {
  id: 'json',
  mimes: ['application/json', 'text/json'],
  mimeSuffixes: ['+json'],
  extensions: ['.json', '.jsonc', '.json5'],
  sniff: looksLikeJson,
  sniffDefault: true,
  view: 'tree',
}
