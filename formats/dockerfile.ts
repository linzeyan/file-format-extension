import type { FormatDescriptor } from './types'

export const dockerfile: FormatDescriptor = {
  id: 'dockerfile',
  filenames: ['Dockerfile', 'Containerfile'],
  filenamePrefixes: ['Dockerfile.'],
  view: 'static',
}
