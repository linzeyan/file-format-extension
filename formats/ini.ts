import type { FormatDescriptor } from './types'

// `[section]` headers and/or a majority of `key = value` lines. Off by default
// (like YAML) to keep text/plain false positives low.
function looksLikeIni(text: string): boolean {
  const lines = text
    .split('\n', 100)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith(';'))
  if (lines.length === 0) return false
  let hits = 0
  for (const line of lines) {
    if (/^\[.+\]$/.test(line)) hits++
    else if (/^[\w.-]+\s*=/.test(line)) hits++
  }
  return hits / lines.length >= 0.8
}

export const ini: FormatDescriptor = {
  id: 'ini',
  extensions: ['.ini', '.cfg', '.conf', '.properties'],
  // .editorconfig / .gitconfig are dotfiles (whole filename), not extensions.
  filenames: ['.editorconfig', '.gitconfig'],
  sniff: looksLikeIni,
  sniffDefault: false,
  view: 'tree',
}
