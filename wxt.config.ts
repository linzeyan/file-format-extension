import { defineConfig } from 'wxt'

// MV3-only on both Chrome and Firefox (Chrome has permanently dropped MV2;
// Firefox MV3 is GA since 109, host permissions granted at install since 127).
export default defineConfig({
  manifestVersion: 3,
  manifest: ({ browser }) => ({
    name: 'File Format Viewer',
    icons: {
      16: '/icon-16.png',
      32: '/icon-32.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
    description:
      'Pretty-print and syntax-highlight raw data and config files (JSON, YAML, XML, TOML, ini, Dockerfile, shell, ...).',
    permissions: ['storage'],
    // The heavy viewer is lazy-loaded by the tiny detector content script via
    // import(runtime.getURL('/viewer.js')); WXT does not register it automatically.
    web_accessible_resources: [
      {
        resources: ['viewer.js'],
        matches: ['<all_urls>'],
      },
    ],
    // gecko.id + strict_min_version are Firefox-only; omit them from the Chrome
    // manifest to avoid Chrome Web Store validation noise.
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'file-format-viewer@rickylin',
              strict_min_version: '127.0',
              // The extension transmits nothing; declare it explicitly for AMO.
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
})
