import type { FormatDescriptor } from './types'

export const toml: FormatDescriptor = {
  id: 'toml',
  mimes: ['application/toml'],
  extensions: ['.toml'],
  view: 'tree',
}
