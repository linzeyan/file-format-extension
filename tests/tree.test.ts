import { describe, expect, it } from 'vitest'
import {
  allContainerPaths,
  flattenVisible,
  normalize,
  pathKey,
  visibleRange,
} from '../viewer/tree'

const SAMPLE = {
  name: 'demo',
  version: 1,
  nested: { a: true, b: [10, 20, 30] },
  list: ['x', 'y'],
  empty: {},
}

describe('normalize', () => {
  it('captures kind and count for containers and primitives', () => {
    const root = normalize(SAMPLE)
    expect(root.kind).toBe('object')
    expect(root.count).toBe(5)

    const byKey = Object.fromEntries((root.children ?? []).map((c) => [c.key, c]))
    expect(byKey.name.kind).toBe('string')
    expect(byKey.name.value).toBe('demo')
    expect(byKey.version.kind).toBe('number')
    expect(byKey.nested.kind).toBe('object')
    expect(byKey.nested.count).toBe(2)
    expect(byKey.list.kind).toBe('array')
    expect(byKey.list.count).toBe(2)
    expect(byKey.empty.kind).toBe('object')
    expect(byKey.empty.count).toBe(0)
  })

  it('records paths and handles array indices and null', () => {
    const root = normalize({ a: [null, { b: 1 }] })
    const a = root.children?.[0]
    expect(a?.path).toEqual(['a'])
    const first = a?.children?.[0]
    expect(first?.kind).toBe('null')
    expect(first?.path).toEqual(['a', 0])
    const second = a?.children?.[1]
    expect(second?.path).toEqual(['a', 1])
    expect(second?.children?.[0]?.path).toEqual(['a', 1, 'b'])
  })
})

describe('flattenVisible / expand / collapse', () => {
  const root = normalize(SAMPLE)

  it('collapse-all shows only the root row', () => {
    const rows = flattenVisible(root, new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0]?.depth).toBe(0)
    expect(rows[0]?.hasChildren).toBe(true)
    expect(rows[0]?.expanded).toBe(false)
  })

  it('expanding the root shows its direct children', () => {
    const rows = flattenVisible(root, new Set([pathKey([])]))
    // root + 5 top-level keys
    expect(rows).toHaveLength(6)
  })

  it('expand-all shows every node', () => {
    const expanded = allContainerPaths(root)
    const rows = flattenVisible(root, expanded)
    // 1 root + 5 top keys + nested(a,b) 2 + b items 3 + list items 2 = 13
    expect(rows).toHaveLength(13)
  })

  it('expanding a child reveals only that subtree', () => {
    const expanded = new Set([pathKey([]), pathKey(['nested'])])
    const rows = flattenVisible(root, expanded)
    // root + 5 top + nested's 2 children = 8 (b not expanded, list not expanded)
    expect(rows).toHaveLength(8)
  })
})

describe('visibleRange', () => {
  it('windows around the scroll position with overscan', () => {
    const r = visibleRange(0, 100, 20, 1000, 2)
    expect(r.start).toBe(0)
    expect(r.end).toBe(7) // ceil(100/20)=5 + overscan 2
  })

  it('clamps to bounds', () => {
    expect(visibleRange(0, 100, 20, 0)).toEqual({ start: 0, end: 0 })
    const r = visibleRange(19_980, 100, 20, 1000, 2)
    expect(r.end).toBe(1000)
    expect(r.start).toBeLessThan(1000)
  })

  it('only materializes a viewport-sized window for a huge tree', () => {
    const r = visibleRange(5000, 400, 20, 100_000, 4)
    expect(r.end - r.start).toBeLessThanOrEqual(20 + 8) // viewport rows + 2*overscan
  })
})
