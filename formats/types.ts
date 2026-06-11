export type FormatId =
  | 'json'
  | 'yaml'
  | 'toml'
  | 'xml'
  | 'ini'
  | 'dockerfile'
  | 'vagrantfile'
  | 'shell'

export type ViewType = 'tree' | 'static'

/**
 * Detection descriptor — the LIGHT layer. Pure data + a cheap sniff function,
 * with NO grammar/parser imports, so the content-script detector can import the
 * whole registry without pulling Shiki or any parser into content.js.
 */
export interface FormatDescriptor {
  readonly id: FormatId
  /** Exact MIME types (lowercased, parameters stripped). */
  readonly mimes?: readonly string[]
  /** MIME structured suffixes, e.g. '+json', '+xml'. */
  readonly mimeSuffixes?: readonly string[]
  /** Filename extensions including the leading dot, lowercased. */
  readonly extensions?: readonly string[]
  /** Exact filenames, matched case-insensitively, e.g. 'Dockerfile', '.bashrc'. */
  readonly filenames?: readonly string[]
  /** Filename prefixes, matched case-insensitively, e.g. 'Dockerfile.'. */
  readonly filenamePrefixes?: readonly string[]
  /** Cheap content sniff over a prefix; true if the text looks like this format. */
  readonly sniff?: (text: string) => boolean
  /** Whether sniffing is enabled by default (user-overridable in settings). */
  readonly sniffDefault?: boolean
  readonly view: ViewType
}
