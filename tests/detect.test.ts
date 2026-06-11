import { describe, expect, it } from 'vitest'
import { DEFAULT_DETECT_OPTIONS, detect } from '../utils/detect'
import type { BodyShape, DetectInput, DetectOptions, DetectResult } from '../utils/detect'
import type { FormatId } from '../formats'

function input(partial: Partial<DetectInput>): DetectInput {
  const sampleText = partial.sampleText ?? ''
  return {
    contentType: '',
    filename: '',
    bodyShape: 'single-pre',
    sampleText,
    byteLength: partial.byteLength ?? sampleText.length,
    ...partial,
  }
}

function withSniff(ids: FormatId[]): DetectOptions {
  const sniffEnabled: Partial<Record<FormatId, boolean>> = {}
  for (const id of ids) sniffEnabled[id] = true
  return { ...DEFAULT_DETECT_OPTIONS, sniffEnabled }
}

function expectFormat(result: DetectResult | null, id: FormatId, confidence?: string): void {
  expect(result).not.toBeNull()
  expect(result?.formatId).toBe(id)
  if (confidence) expect(result?.confidence).toBe(confidence)
}

describe('detect — MIME matching', () => {
  const cases: Array<[string, FormatId]> = [
    ['application/json', 'json'],
    ['application/ld+json', 'json'],
    ['application/manifest+json', 'json'],
    ['text/json', 'json'],
    ['application/yaml', 'yaml'],
    ['text/x-yaml', 'yaml'],
    ['application/xml', 'xml'],
    ['image/svg+xml', 'xml'],
    ['application/toml', 'toml'],
    ['application/x-shellscript', 'shell'],
    ['text/x-sh', 'shell'],
  ]
  for (const [contentType, id] of cases) {
    it(`${contentType} → ${id}`, () => {
      expectFormat(detect(input({ contentType })), id, 'mime')
    })
  }

  it('respects MIME parameters and casing', () => {
    expectFormat(detect(input({ contentType: 'Application/JSON; charset=utf-8' })), 'json', 'mime')
  })
})

describe('detect — filename matching (generic content type)', () => {
  const cases: Array<[string, FormatId]> = [
    ['config.json', 'json'],
    ['data.yaml', 'yaml'],
    ['app.yml', 'yaml'],
    ['pyproject.toml', 'toml'],
    ['feed.xml', 'xml'],
    ['Info.plist', 'xml'],
    ['settings.ini', 'ini'],
    ['.editorconfig', 'ini'],
    ['Dockerfile', 'dockerfile'],
    ['Dockerfile.dev', 'dockerfile'],
    ['Containerfile', 'dockerfile'],
    ['Vagrantfile', 'vagrantfile'],
    ['deploy.sh', 'shell'],
    ['.bashrc', 'shell'],
  ]
  for (const [filename, id] of cases) {
    it(`${filename} → ${id}`, () => {
      expectFormat(detect(input({ contentType: 'text/plain', filename })), id, 'filename')
    })
  }

  it('does not match filenames when the server gave a specific type', () => {
    // application/octet-stream is not generic → no filename fallback.
    expect(detect(input({ contentType: 'application/octet-stream', filename: 'a.json' }))).toBeNull()
  })
})

describe('detect — content sniffing', () => {
  it('JSON object/array sniffs by default', () => {
    expectFormat(detect(input({ contentType: 'text/plain', filename: 'data', sampleText: '{"a":1}' })), 'json', 'sniff')
    expectFormat(detect(input({ contentType: 'text/plain', filename: 'data', sampleText: '[1,2,3]' })), 'json', 'sniff')
  })

  it('shebang sniffs to shell by default', () => {
    expectFormat(
      detect(input({ contentType: 'text/plain', filename: 'run', sampleText: '#!/usr/bin/env bash\necho hi\n' })),
      'shell',
      'sniff',
    )
  })

  it('<?xml prolog sniffs to xml by default', () => {
    expectFormat(
      detect(input({ contentType: 'text/plain', filename: 'feed', sampleText: '<?xml version="1.0"?><a/>' })),
      'xml',
      'sniff',
    )
  })

  it('YAML/ini do NOT sniff unless enabled', () => {
    const yamlText = 'name: test\nversion: 1\nitems:\n  - a\n  - b\n'
    expect(detect(input({ contentType: 'text/plain', filename: 'x', sampleText: yamlText }))).toBeNull()
    expectFormat(
      detect(input({ contentType: 'text/plain', filename: 'x', sampleText: yamlText }), withSniff(['yaml'])),
      'yaml',
      'sniff',
    )

    const iniText = '[server]\nhost = localhost\nport = 8080\n'
    expect(detect(input({ contentType: 'text/plain', filename: 'x', sampleText: iniText }))).toBeNull()
    expectFormat(
      detect(input({ contentType: 'text/plain', filename: 'x', sampleText: iniText }), withSniff(['ini'])),
      'ini',
      'sniff',
    )
  })
})

describe('detect — false positives return null', () => {
  it('a normal HTML page (body not a single pre)', () => {
    expect(detect(input({ contentType: 'text/html', bodyShape: 'other' }))).toBeNull()
  })

  it('single <pre> of prose that merely starts with { (json-formatter#275)', () => {
    expect(
      detect(input({ contentType: 'text/plain', filename: 'notes.txt', sampleText: '{ this is prose, not json' })),
    ).toBeNull()
  })

  it('application/xhtml+xml is excluded from the +xml rule', () => {
    expect(detect(input({ contentType: 'application/xhtml+xml' }))).toBeNull()
  })

  it('Firefox built-in JSON viewer is left alone', () => {
    const shape: BodyShape = 'firefox-json-viewer'
    expect(detect(input({ contentType: 'application/json', bodyShape: shape }))).toBeNull()
  })

  it('files over the hard size cap', () => {
    expect(
      detect(input({ contentType: 'application/json', byteLength: DEFAULT_DETECT_OPTIONS.hardMaxBytes + 1 })),
    ).toBeNull()
  })

  it('plain text with no extension and no sniff match', () => {
    expect(detect(input({ contentType: 'text/plain', filename: 'notes', sampleText: 'just some words\n' }))).toBeNull()
  })

  it('a disabled format is not detected', () => {
    const options: DetectOptions = { ...DEFAULT_DETECT_OPTIONS, formatEnabled: { json: false } }
    expect(detect(input({ contentType: 'application/json' }), options)).toBeNull()
  })
})

describe('detect — XML document shape', () => {
  it('an XML-rendered document is detected as xml', () => {
    expectFormat(detect(input({ contentType: 'application/xml', bodyShape: 'xml-document' })), 'xml', 'mime')
  })
})

describe('detect — non-generic MIME bypasses structural gate', () => {
  it('application/json with bodyShape other (another extension modified the DOM) still detects', () => {
    // Regression: the structural gate must not run when MIME is specific enough.
    expectFormat(detect(input({ contentType: 'application/json', bodyShape: 'other' })), 'json', 'mime')
  })

  it('application/yaml with bodyShape other still detects', () => {
    expectFormat(detect(input({ contentType: 'application/yaml', bodyShape: 'other' })), 'yaml', 'mime')
  })

  it('text/html with bodyShape other is still null (not in our format list)', () => {
    expect(detect(input({ contentType: 'text/html', bodyShape: 'other' }))).toBeNull()
  })

  it('unknown non-generic MIME with bodyShape other is null', () => {
    expect(detect(input({ contentType: 'application/octet-stream', bodyShape: 'other' }))).toBeNull()
  })
})
