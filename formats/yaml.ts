import type { FormatDescriptor } from './types'

// Conservative line-shape heuristic over the first ~100 lines: mostly `key:` /
// `- item` / document markers. Off by default — YAML sniffing is a known source
// of false positives, so it only fires when the user opts in.
function looksLikeYaml(text: string): boolean {
  const lines = text
    .split('\n', 100)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'))
  if (lines.length === 0) return false
  let hits = 0
  for (const line of lines) {
    if (line === '---' || line === '...') hits++
    else if (/^[\w.-]+\s*:(\s|$)/.test(line)) hits++
    else if (line.startsWith('- ')) hits++
  }
  return hits / lines.length >= 0.8
}

export const yaml: FormatDescriptor = {
  id: 'yaml',
  mimes: ['application/yaml', 'text/yaml', 'text/x-yaml', 'application/x-yaml'],
  extensions: ['.yml', '.yaml'],
  sniff: looksLikeYaml,
  sniffDefault: false,
  view: 'tree',
}
