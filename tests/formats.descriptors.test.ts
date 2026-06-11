import { describe, expect, it } from 'vitest'
import { descriptors, descriptorById } from '../formats'
import type { FormatId } from '../formats'

describe('format descriptors', () => {
  it('has 8 unique ids', () => {
    expect(descriptors).toHaveLength(8)
    const ids = descriptors.map((d) => d.id)
    expect(new Set(ids).size).toBe(8)
  })

  it('every view is tree or static', () => {
    for (const d of descriptors) {
      expect(['tree', 'static']).toContain(d.view)
    }
  })

  it('structured formats are tree, script formats are static', () => {
    const tree: FormatId[] = ['json', 'yaml', 'toml', 'xml', 'ini']
    const stat: FormatId[] = ['dockerfile', 'vagrantfile', 'shell']
    for (const id of tree) expect(descriptorById[id].view).toBe('tree')
    for (const id of stat) expect(descriptorById[id].view).toBe('static')
  })
})
