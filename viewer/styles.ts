// Single stylesheet for the shadow-root viewer. Light by default; `.dark` on the
// host flips every token. Shiki's dual-theme output (--shiki-light/--shiki-dark)
// is mapped here so switching theme never re-highlights.
export const VIEWER_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 13px;
  line-height: 22px;
  color-scheme: light;
  background: #ffffff;
  color: #1f2328;
  --muted: #8c959f;
  --border: #d0d7de;
  --toolbar-bg: #f6f8fa;
  --tok-key: #0550ae;
  --tok-string: #0a3069;
  --tok-number: #0969da;
  --tok-boolean: #8250df;
  --tok-null: #6e7781;
}
:host(.dark) {
  color-scheme: dark;
  background: #0d1117;
  color: #e6edf3;
  --muted: #6e7681;
  --border: #30363d;
  --toolbar-bg: #161b22;
  --tok-key: #79c0ff;
  --tok-string: #a5d6ff;
  --tok-number: #79c0ff;
  --tok-boolean: #d2a8ff;
  --tok-null: #8b949e;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--toolbar-bg);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.title { font-weight: 600; }
.spacer { flex: 1; }
.btn {
  font: inherit;
  padding: 2px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.btn:hover { background: rgba(127, 127, 127, 0.12); }

.content { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }

/* --- tree --- */
.tree-scroller { flex: 1; min-height: 0; overflow: auto; position: relative; }
.tree-spacer { position: relative; width: 100%; }
.tree-viewport { position: absolute; top: 0; left: 0; right: 0; }
.tree-row {
  height: 22px;
  display: flex;
  align-items: center;
  white-space: pre;
  padding-right: 8px;
}
.tree-row.is-container { cursor: pointer; }
.tree-row:hover { background: rgba(127, 127, 127, 0.08); }
.tree-row.is-focused { background: rgba(127, 127, 127, 0.15); }
.tree-scroller:focus { outline: none; }
.tree-twisty { display: inline-block; width: 1.2em; text-align: center; color: var(--muted); flex: 0 0 auto; }
.tok-key { color: var(--tok-key); }
.tree-index { color: var(--muted); }
.tree-sep { color: var(--muted); }
.tree-bracket { color: var(--muted); }
.tree-count { color: var(--muted); margin-left: 8px; font-size: 0.9em; }
.tok-string { color: var(--tok-string); }
.tok-number { color: var(--tok-number); }
.tok-boolean { color: var(--tok-boolean); }
.tok-null { color: var(--tok-null); }
a.tok-string { text-decoration: underline; }
.tree-copy {
  margin-left: 8px;
  border: 0;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
  font: inherit;
}
.tree-row:hover .tree-copy { opacity: 1; }

/* --- raw (Shiki) --- */
.raw { flex: 1; min-height: 0; overflow: auto; }
.raw .shiki { margin: 0; padding: 8px 0; background: var(--shiki-light-bg, transparent) !important; }
:host(.dark) .raw .shiki { background: var(--shiki-dark-bg, transparent) !important; }
.raw .shiki, .raw .shiki span { color: var(--shiki-light); }
:host(.dark) .raw .shiki, :host(.dark) .raw .shiki span { color: var(--shiki-dark); }
.raw-shiki code { counter-reset: line; display: inline-block; min-width: 100%; }
.raw-shiki .line { counter-increment: line; }
.raw-shiki .line::before {
  content: counter(line);
  display: inline-block;
  width: 3em;
  margin-right: 1em;
  padding-right: 8px;
  text-align: right;
  color: var(--muted);
  border-right: 1px solid var(--border);
}

/* --- plain (large file fallback) --- */
.plain { flex: 1; min-height: 0; overflow: auto; display: flex; }
.plain .gutter {
  margin: 0;
  padding: 8px 8px 8px 12px;
  text-align: right;
  color: var(--muted);
  user-select: none;
  border-right: 1px solid var(--border);
  white-space: pre;
}
.plain .code { margin: 0; padding: 8px 12px; white-space: pre; flex: 1; }
`
