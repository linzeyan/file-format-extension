import { defineContentScript, browser } from '#imports'
import { detectFromDocument } from '../utils/detect'
import { loadDetectOptions } from '../utils/settings'
import '../assets/content.css'

// The detector must stay tiny: it imports ONLY the light detection layer
// (formats descriptors + settings), never grammars/parsers. The heavy viewer is
// lazy-loaded as a separate IIFE only after a format is detected.
export default defineContentScript({
  matches: ['*://*/*', 'file:///*'],
  runAt: 'document_end',
  cssInjectionMode: 'manifest',
  async main() {
    // Top frame only in v1.
    if (window.top !== window.self) return

    const options = await loadDetectOptions(location.origin)
    if (!options) return // disabled for this origin

    const found = detectFromDocument(document, location, options)
    if (!found) return

    const root = document.documentElement
    root.dataset.prettyRaw = 'active' // triggers the flicker-suppression CSS
    root.dataset.prettyRawFormat = found.result.formatId // handed to the viewer

    await import(/* @vite-ignore */ browser.runtime.getURL('/viewer.js'))
  },
})
