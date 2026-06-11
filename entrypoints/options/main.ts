import { descriptors } from '../../formats'
import { disabledOriginsItem, formatsItem, themeItem } from '../../utils/settings'
import type { FormatSetting, ThemePref } from '../../utils/settings'

const THEMES: ThemePref[] = ['auto', 'light', 'dark']

async function main(): Promise<void> {
  const app = document.getElementById('app')
  if (!app) return

  const heading = document.createElement('h1')
  heading.textContent = 'File Format Viewer'
  app.append(heading)

  // Firefox pre-empts extensions for application/json with its built-in JSON
  // viewer; we can't override about:config, so we explain how the user can.
  if (import.meta.env.FIREFOX) {
    app.append(buildFirefoxCallout())
  }

  if (!import.meta.env.FIREFOX) {
    app.append(buildFileAccessCallout())
  }

  app.append(await buildThemeSection(), await buildFormatSection(), await buildDisabledSitesSection())
}

function buildFirefoxCallout(): HTMLElement {
  const aside = document.createElement('aside')
  aside.style.cssText =
    'border:1px solid #d0a; border-radius:8px; padding:0.6rem 0.9rem; margin:1rem 0; background:#d0a1;'
  const title = document.createElement('strong')
  title.textContent = 'Using JSON on Firefox?'
  const body = document.createElement('p')
  body.style.margin = '0.4rem 0 0'
  body.textContent =
    'Firefox has a built-in JSON viewer that takes over before this extension can. ' +
    'To use this viewer for JSON instead, open about:config and set ' +
    'devtools.jsonview.enabled to false. All other formats work normally.'
  aside.append(title, body)
  return aside
}

async function buildThemeSection(): Promise<HTMLElement> {
  const current = await themeItem.getValue()
  const fieldset = section('Theme')

  const select = document.createElement('select')
  for (const theme of THEMES) {
    const option = document.createElement('option')
    option.value = theme
    option.textContent = theme
    option.selected = theme === current
    select.append(option)
  }
  select.addEventListener('change', () => {
    void themeItem.setValue(select.value as ThemePref)
  })

  const row = document.createElement('div')
  row.className = 'row'
  const label = document.createElement('label')
  label.textContent = 'Color theme'
  row.append(label, select)
  fieldset.append(row)
  return fieldset
}

async function buildFormatSection(): Promise<HTMLElement> {
  const formats = await formatsItem.getValue()
  const fieldset = section('Formats')

  for (const descriptor of descriptors) {
    const setting: FormatSetting | undefined = formats[descriptor.id]
    const row = document.createElement('label')
    row.className = 'row'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = setting?.enabled ?? true
    checkbox.addEventListener('change', () => {
      void toggleFormat(descriptor.id, checkbox.checked)
    })

    const name = document.createElement('span')
    name.textContent = `${descriptor.id} (${descriptor.view})`

    row.append(checkbox, name)
    fieldset.append(row)
  }
  return fieldset
}

async function toggleFormat(id: string, enabled: boolean): Promise<void> {
  const formats = await formatsItem.getValue()
  const existing = formats[id as keyof typeof formats]
  if (!existing) return
  await formatsItem.setValue({ ...formats, [id]: { ...existing, enabled } })
}

function buildFileAccessCallout(): HTMLElement {
  const aside = document.createElement('aside')
  aside.style.cssText =
    'border:1px solid #a0a; border-radius:8px; padding:0.6rem 0.9rem; margin:1rem 0; background:rgba(170,0,170,0.06);'
  const title = document.createElement('strong')
  title.textContent = 'Local files (file:///)?'
  const body = document.createElement('p')
  body.style.margin = '0.4rem 0 0'
  body.textContent =
    'Chrome blocks extensions from accessing local files by default. ' +
    'To format files opened from your disk, go to chrome://extensions, ' +
    'click "Details" on this extension, and enable "Allow access to file URLs".'
  aside.append(title, body)
  return aside
}

async function buildDisabledSitesSection(): Promise<HTMLElement> {
  const fieldset = section('Disabled Sites')

  const origins = await disabledOriginsItem.getValue()

  if (origins.length === 0) {
    const note = document.createElement('p')
    note.style.cssText = 'margin:0.4rem 0; color:#666; font-size:0.9em;'
    note.textContent =
      'No sites disabled. Use the "Disable site" button in the viewer toolbar to stop formatting on a specific site.'
    fieldset.append(note)
    return fieldset
  }

  for (const origin of origins) {
    const row = document.createElement('div')
    row.className = 'row'

    const label = document.createElement('span')
    label.textContent = origin

    const btn = document.createElement('button')
    btn.textContent = 'Re-enable'
    btn.addEventListener('click', () => {
      void disabledOriginsItem.getValue().then((current) => {
        void disabledOriginsItem.setValue(current.filter((o) => o !== origin)).then(() => {
          row.remove()
        })
      })
    })

    row.append(label, btn)
    fieldset.append(row)
  }

  return fieldset
}

function section(title: string): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset')
  const legend = document.createElement('legend')
  legend.textContent = title
  fieldset.append(legend)
  return fieldset
}

void main()
