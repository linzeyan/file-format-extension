import type { FormatDescriptor, FormatId } from './types'
import { json } from './json'
import { yaml } from './yaml'
import { toml } from './toml'
import { xml } from './xml'
import { ini } from './ini'
import { dockerfile } from './dockerfile'
import { vagrantfile } from './vagrantfile'
import { shell } from './shell'

export type { FormatDescriptor, FormatId, ViewType } from './types'

// Order matters for sniffing precedence (e.g. JSON before the line-shape
// heuristics). MIME / filename matching is order-independent.
export const descriptors: readonly FormatDescriptor[] = [
  json,
  yaml,
  toml,
  xml,
  ini,
  dockerfile,
  vagrantfile,
  shell,
]

export const descriptorById = Object.fromEntries(
  descriptors.map((d) => [d.id, d]),
) as Record<FormatId, FormatDescriptor>
