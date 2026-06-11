// Tree model + virtualized renderer for structured formats.
//
// The pure pieces (normalize / flattenVisible / visibleRange / pathKey) are
// exported separately from the DOM renderer so they can be unit-tested without a
// browser. The renderer only ever materializes the rows inside the scroll
// viewport (plus overscan), so render cost is independent of document size.

export type NodeKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

export type PathSegment = string | number

export interface TreeNode {
  /** Key within the parent: object property, array index, or null at the root. */
  readonly key: PathSegment | null
  readonly kind: NodeKind
  /** Present for primitive kinds (string/number/boolean/null). */
  readonly value?: string | number | boolean | null
  /** Present for container kinds (object/array). */
  readonly children?: TreeNode[]
  /** Child count; 0 for primitives. */
  readonly count: number
  readonly path: readonly PathSegment[]
}

export interface Row {
  readonly node: TreeNode
  readonly depth: number
  readonly hasChildren: boolean
  readonly expanded: boolean
}

export function isContainer(kind: NodeKind): boolean {
  return kind === 'object' || kind === 'array'
}

/** Stable string key for a node path, used as the expanded-set identity. */
export function pathKey(path: readonly PathSegment[]): string {
  // JSON-encode so string vs. number segments and keys containing separators
  // can never collide (e.g. ['a b'] must differ from ['a', 'b']).
  return JSON.stringify(path)
}

function kindOf(value: unknown): NodeKind {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  switch (typeof value) {
    case 'object':
      return 'object'
    case 'string':
      return 'string'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    default:
      // undefined / function / symbol / bigint — render as their string form.
      return 'string'
  }
}

/** Convert a parsed value into the uniform tree-node model. */
export function normalize(
  value: unknown,
  key: PathSegment | null = null,
  path: readonly PathSegment[] = [],
): TreeNode {
  const kind = kindOf(value)

  if (kind === 'array') {
    const arr = value as unknown[]
    const children = arr.map((item, i) => normalize(item, i, [...path, i]))
    return { key, kind, children, count: children.length, path }
  }

  if (kind === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    const children = entries.map(([k, v]) => normalize(v, k, [...path, k]))
    return { key, kind, children, count: children.length, path }
  }

  const primitive = kind === 'string' && typeof value !== 'string' ? String(value) : (value as string | number | boolean | null)
  return { key, kind, value: primitive, count: 0, path }
}

/**
 * Depth-first flatten of the visible rows. A container's children are included
 * only when its path is in `expanded`. The root node itself is always emitted.
 */
export function flattenVisible(root: TreeNode, expanded: ReadonlySet<string>): Row[] {
  const rows: Row[] = []
  const walk = (node: TreeNode, depth: number): void => {
    const hasChildren = isContainer(node.kind) && node.count > 0
    const isExpanded = hasChildren && expanded.has(pathKey(node.path))
    rows.push({ node, depth, hasChildren, expanded: isExpanded })
    if (isExpanded && node.children) {
      for (const child of node.children) walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return rows
}

/** Every container path in the tree (used by expand-all). */
export function allContainerPaths(root: TreeNode): Set<string> {
  const out = new Set<string>()
  const walk = (node: TreeNode): void => {
    if (isContainer(node.kind) && node.count > 0) {
      out.add(pathKey(node.path))
      if (node.children) for (const child of node.children) walk(child)
    }
  }
  walk(root)
  return out
}

/** JS-accessor representation of a node path, e.g. `nested.b[0]` (for copy-path). */
export function formatPath(path: readonly PathSegment[]): string {
  let out = ''
  for (const seg of path) {
    if (typeof seg === 'number') out += `[${seg}]`
    else if (/^[A-Za-z_$][\w$]*$/.test(seg)) out += out ? `.${seg}` : seg
    else out += `[${JSON.stringify(seg)}]`
  }
  return out || '$'
}

export interface VisibleRange {
  start: number
  end: number
}

/**
 * Index range of rows to materialize for a scroll position. `end` is exclusive.
 * Clamped to [0, total].
 */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  rowHeight: number,
  total: number,
  overscan = 4,
): VisibleRange {
  if (total === 0 || rowHeight <= 0) return { start: 0, end: 0 }
  const first = Math.floor(scrollTop / rowHeight)
  const visibleCount = Math.ceil(viewportHeight / rowHeight)
  const start = Math.max(0, first - overscan)
  const end = Math.min(total, first + visibleCount + overscan)
  return { start, end }
}

// --- Virtualized DOM renderer -------------------------------------------------

const ROW_HEIGHT = 22
const INDENT = 14
const OVERSCAN = 6
const URL_RE = /^https?:\/\/\S+$/

export interface TreeViewHandle {
  readonly element: HTMLElement
  expandAll(): void
  collapseAll(): void
}

/**
 * Render a tree into a scroll container, materializing only the rows inside the
 * viewport (plus overscan). The flattened row list is cached and only recomputed
 * on expand/collapse — scrolling just re-windows the cached list.
 */
export function createTreeView(root: TreeNode): TreeViewHandle {
  let expanded = defaultExpanded(root)
  let rows: Row[] = []
  let lastStart = -1
  let lastEnd = -1
  let focusedIndex = -1
  let lastFocused = -1

  const scroller = el('div', 'tree-scroller')
  scroller.tabIndex = 0
  const spacer = el('div', 'tree-spacer')
  const viewport = el('div', 'tree-viewport')
  spacer.append(viewport)
  scroller.append(spacer)
  scroller.addEventListener('scroll', renderWindow, { passive: true })

  function rebuild(): void {
    rows = flattenVisible(root, expanded)
    spacer.style.height = `${rows.length * ROW_HEIGHT}px`
    lastStart = -1
    lastEnd = -1
    renderWindow()
  }

  function renderWindow(): void {
    const height = scroller.clientHeight || 600
    const { start, end } = visibleRange(scroller.scrollTop, height, ROW_HEIGHT, rows.length, OVERSCAN)
    if (start === lastStart && end === lastEnd && focusedIndex === lastFocused) return
    lastStart = start
    lastEnd = end
    lastFocused = focusedIndex
    viewport.style.transform = `translateY(${start * ROW_HEIGHT}px)`
    const slice = rows.slice(start, end)
    viewport.replaceChildren(...slice.map((row, i) => renderRow(row, start + i)))
  }

  function scrollToFocused(): void {
    const top = focusedIndex * ROW_HEIGHT
    const viewportH = scroller.clientHeight || 600
    if (top < scroller.scrollTop) {
      scroller.scrollTop = top
    } else if (top + ROW_HEIGHT > scroller.scrollTop + viewportH) {
      scroller.scrollTop = top + ROW_HEIGHT - viewportH
    }
    renderWindow() // update focus indicator even when no scroll occurs
  }

  function toggle(path: readonly PathSegment[]): void {
    const key = pathKey(path)
    if (expanded.has(key)) expanded.delete(key)
    else expanded.add(key)
    rebuild()
  }

  function renderRow(row: Row, rowIndex: number): HTMLElement {
    const div = el('div', 'tree-row')
    if (rowIndex === focusedIndex) div.classList.add('is-focused')
    div.style.paddingLeft = `${8 + row.depth * INDENT}px`

    const twisty = el('span', 'tree-twisty')
    if (row.hasChildren) {
      twisty.textContent = row.expanded ? '▾' : '▸'
      div.classList.add('is-container')
    }
    div.addEventListener('click', (event) => {
      focusedIndex = rowIndex
      scroller.focus({ preventScroll: true })
      if (row.hasChildren && !(event.target as HTMLElement).closest('.tree-copy')) {
        toggle(row.node.path) // calls rebuild() → renderWindow()
      } else {
        renderWindow()
      }
    })
    div.append(twisty)

    if (row.node.key !== null) {
      const isIndex = typeof row.node.key === 'number'
      const keyEl = el('span', isIndex ? 'tree-index' : 'tok-key')
      keyEl.textContent = String(row.node.key)
      div.append(keyEl, text('tree-sep', ': '))
    }

    if (isContainer(row.node.kind)) appendSummary(div, row)
    else div.append(renderValue(row.node))

    const copy = el('button', 'tree-copy') as HTMLButtonElement
    copy.textContent = '⧉'
    copy.title = 'Copy path'
    copy.addEventListener('click', () => {
      void navigator.clipboard.writeText(formatPath(row.node.path))
    })
    div.append(copy)
    return div
  }

  function expandAll(): void {
    expanded = allContainerPaths(root)
    focusedIndex = -1
    rebuild()
  }
  function collapseAll(): void {
    expanded = new Set()
    focusedIndex = -1
    rebuild()
  }

  scroller.addEventListener('keydown', (e) => {
    if (rows.length === 0) return
    // Activate first row on first key press if nothing is focused.
    if (focusedIndex < 0 || focusedIndex >= rows.length) {
      focusedIndex = 0
      scrollToFocused()
      return
    }
    const row = rows[focusedIndex]
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (focusedIndex < rows.length - 1) { focusedIndex++; scrollToFocused() }
        break
      case 'ArrowUp':
        e.preventDefault()
        if (focusedIndex > 0) { focusedIndex--; scrollToFocused() }
        break
      case 'ArrowRight':
        if (row?.hasChildren && !row.expanded) toggle(row.node.path)
        break
      case 'ArrowLeft':
        if (row?.hasChildren && row.expanded) toggle(row.node.path)
        break
      case 'Enter':
        if (row) void navigator.clipboard.writeText(formatPath(row.node.path))
        break
    }
  })

  rebuild()
  return { element: scroller, expandAll, collapseAll }
}

// Expand-all for modest trees, root-only for large ones (keeps the first paint
// snappy; virtualization still bounds render cost either way).
function defaultExpanded(root: TreeNode): Set<string> {
  const all = allContainerPaths(root)
  if (all.size <= 500) return all
  return new Set([pathKey(root.path)])
}

function appendSummary(div: HTMLElement, row: Row): void {
  const open = row.node.kind === 'array' ? '[' : '{'
  const close = row.node.kind === 'array' ? ']' : '}'
  if (row.expanded || row.node.count === 0) {
    div.append(text('tree-bracket', row.node.count === 0 ? `${open}${close}` : open))
    return
  }
  div.append(text('tree-bracket', `${open}…${close}`))
  const label = row.node.kind === 'array'
    ? `${row.node.count} ${row.node.count === 1 ? 'item' : 'items'}`
    : `${row.node.count} ${row.node.count === 1 ? 'key' : 'keys'}`
  div.append(text('tree-count', label))
}

function renderValue(node: TreeNode): HTMLElement {
  if (node.kind === 'string' && typeof node.value === 'string' && URL_RE.test(node.value)) {
    const link = el('a', 'tok-string') as HTMLAnchorElement
    link.href = node.value
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.textContent = JSON.stringify(node.value)
    return link
  }
  switch (node.kind) {
    case 'string':
      return text('tok-string', JSON.stringify(node.value))
    case 'number':
      return text('tok-number', String(node.value))
    case 'boolean':
      return text('tok-boolean', String(node.value))
    default:
      return text('tok-null', 'null')
  }
}

function el(tag: string, className: string): HTMLElement {
  const node = document.createElement(tag)
  node.className = className
  return node
}

function text(className: string, content: string): HTMLElement {
  const node = el('span', className)
  node.textContent = content
  return node
}
