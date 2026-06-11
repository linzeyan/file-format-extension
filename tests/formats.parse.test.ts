import { describe, it, expect } from 'vitest'
import { providers } from '../viewer/providers'

describe('yaml provider', () => {
  const parse = providers.yaml!.parse!

  it('parses single doc', () => {
    expect(parse('key: value\nnum: 42')).toEqual({ key: 'value', num: 42 })
  })

  it('parses multi-doc as array', () => {
    expect(parse('---\na: 1\n---\nb: 2')).toEqual([{ a: 1 }, { b: 2 }])
  })

  it('returns null for empty input', () => {
    expect(parse('')).toBeNull()
  })

  it('throws on invalid YAML', () => {
    // Unclosed flow mapping is a structural error the yaml library records
    expect(() => parse('{unclosed flow mapping')).toThrow()
  })
})

describe('toml provider', () => {
  const parse = providers.toml!.parse!

  it('parses section and key', () => {
    expect(parse('[section]\nkey = "val"\n')).toEqual({ section: { key: 'val' } })
  })

  it('parses top-level keys', () => {
    const result = parse('name = "Alice"\nage = 30\n') as Record<string, unknown>
    expect(result['name']).toBe('Alice')
    expect(result['age']).toBe(30)
  })

  it('throws on invalid TOML', () => {
    expect(() => parse('= bad')).toThrow()
  })
})

describe('ini provider', () => {
  const parse = providers.ini!.parse!

  it('parses sections', () => {
    const result = parse('[section]\nkey=val\n') as Record<string, unknown>
    expect(result['section']).toEqual({ key: 'val' })
  })

  it('parses global keys with type coercion', () => {
    // ini@6 coerces true/false/numbers; plain string values stay as strings
    const result = parse('enabled=true\nname=foo\n') as Record<string, unknown>
    expect(result['enabled']).toBe(true)
    expect(result['name']).toBe('foo')
  })

  it('parses multiple sections', () => {
    const result = parse('[a]\nx=1\n[b]\ny=2\n') as Record<string, unknown>
    expect(result['a']).toEqual({ x: '1' })
    expect(result['b']).toEqual({ y: '2' })
  })
})

describe('xml provider', () => {
  const parse = providers.xml!.parse!

  it('wraps root element by tag name', () => {
    expect(parse('<root/>')).toHaveProperty('root')
  })

  it('includes attributes with @ prefix', () => {
    const result = parse('<root id="1"/>') as Record<string, unknown>
    const root = result['root'] as Record<string, unknown>
    expect(root['@id']).toBe('1')
  })

  it('text-only child becomes scalar string', () => {
    const result = parse('<root><name>Alice</name></root>') as Record<string, unknown>
    const root = result['root'] as Record<string, unknown>
    expect(root['name']).toBe('Alice')
  })

  it('groups repeated child elements into array', () => {
    const result = parse('<root><item>a</item><item>b</item></root>') as Record<string, unknown>
    const root = result['root'] as Record<string, unknown>
    expect(root['item']).toEqual(['a', 'b'])
  })

  it('element with attrs and text uses #text key', () => {
    const result = parse('<root><tag id="x">content</tag></root>') as Record<string, unknown>
    const root = result['root'] as Record<string, unknown>
    const tag = root['tag'] as Record<string, unknown>
    expect(tag['@id']).toBe('x')
    expect(tag['#text']).toBe('content')
  })

  it('throws on invalid XML', () => {
    expect(() => parse('<unclosed')).toThrow()
  })
})

describe('static providers', () => {
  it.each(['dockerfile', 'shell'] as const)(
    '%s has grammar and lang but no parse',
    (id) => {
      const p = providers[id]!
      expect(p.grammar).toBeDefined()
      expect(p.lang).toBeTruthy()
      expect(p.parse).toBeUndefined()
    },
  )

  it('vagrantfile has no provider (ruby grammar too large to bundle)', () => {
    expect(providers['vagrantfile']).toBeUndefined()
  })
})
