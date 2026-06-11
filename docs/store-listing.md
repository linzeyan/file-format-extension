# Store Listing Copy

## Extension Name
File Format Viewer

## Short Description (≤132 chars)
Pretty-print and syntax-highlight raw files: JSON, YAML, XML, TOML, ini, Dockerfile, shell scripts, and more.

---

## Chrome Web Store — Full Description

**File Format Viewer** replaces the browser's plain-text display of raw data and config files with a
clean, readable layout. No server involved — everything runs locally in your browser.

**Supported formats**

| Format | View |
|--------|------|
| JSON, YAML, XML, TOML, ini | Interactive collapsible tree + Raw toggle |
| Dockerfile, shell scripts | Syntax-highlighted code with line numbers |

**Features**

- **Interactive tree view** — expand/collapse nodes, item counts, copy value or path with one click
- **Syntax highlighting** — dual light/dark theme via GitHub's color scheme; no WASM, no CSP issues
- **Keyboard navigation** — ↑↓ move, ←→ expand/collapse, Enter copies the path
- **Parse error fallback** — malformed files still show highlighted raw text, never a blank page
- **Large file support** — files up to 10 MB progressively highlighted; files over 10 MB shown as plain monospace
- **Per-site disable** — stop the extension on specific sites from the viewer toolbar
- **Theme control** — auto (follows OS), light, or dark; synced across tabs via storage
- **Local files** — works on `file://` URLs after enabling "Allow access to file URLs" in the extension settings

**Privacy**

This extension stores only your preferences (theme, format settings) locally via browser storage.
It never reads, transmits, or shares any file content. No analytics, no remote requests.

---

## Firefox AMO — Full Description

(Same as Chrome, with the following addition after the feature list)

> **Note for JSON on Firefox:** Firefox has a built-in JSON viewer that runs before extensions can.
> To use File Format Viewer for JSON, open `about:config` and set `devtools.jsonview.enabled` to `false`.
> All other formats (YAML, XML, TOML, ini, Dockerfile, shell) work without any configuration change.

---

## Chrome Web Store — `<all_urls>` Permission Justification

> Required for CWS review when submitting an extension that requests `<all_urls>` host permission.

**Justification text (submit in the "Single purpose" and "Permission justification" fields):**

This extension requires `<all_urls>` because raw data files can be served from any domain or from
`file://` URLs. The content script only activates on pages where the browser is displaying a raw
file directly — specifically, pages whose `Content-Type` is a data format (e.g. `application/json`,
`application/yaml`, `text/xml`) and whose page body contains only the raw content in a single `<pre>`
element. It never activates on regular web pages.

The extension reads no user data, makes no network requests, and stores only UI preferences
(theme choice, per-format settings) in local browser storage. No data leaves the user's machine.

---

## Firefox AMO — Reviewer Notes

This extension:
- Uses only the `storage` permission (for UI preferences: theme, per-format on/off settings)
- Makes no external network requests; all processing is local
- Does not collect, transmit, or store any file content
- The `<all_urls>` content script match is required because formatted files can come from any domain
- The content script is intentionally tiny (~19 KB, no Shiki/grammar) and only loads the heavy
  viewer (~417 KB) when a supported file type is detected
- Firefox JSON (`application/json`) pages are explicitly detected and left alone (the extension
  defers to Firefox's built-in viewer); the options page explains how to opt into our viewer

Source code is available for review. Build is reproducible: `npm ci && pnpm zip -b firefox`
produces the same output as the submitted zip.
