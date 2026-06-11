import type { FormatDescriptor } from './types'

// '+xml' suffix matching deliberately excludes application/xhtml+xml (handled in
// utils/detect.ts) so HTML documents are never treated as raw XML.
export const xml: FormatDescriptor = {
  id: 'xml',
  mimes: ['application/xml', 'text/xml'],
  mimeSuffixes: ['+xml'],
  extensions: ['.xml', '.xsd', '.plist', '.svg'],
  sniff: (text) => text.trimStart().startsWith('<?xml'),
  sniffDefault: true,
  view: 'tree',
}
