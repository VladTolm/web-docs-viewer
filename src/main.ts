import {
  defineFileViewerElement,
  type FileViewerElement,
  type ViewerOptions,
  type ViewerState,
  type ViewerEvent
} from '@file-viewer/web-full'

defineFileViewerElement()

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Element #${id} not found`)
  return el as T
}

const fileInput = $<HTMLInputElement>('file-input')
const dropZone = $<HTMLElement>('drop-zone')
const placeholder = $<HTMLElement>('placeholder')
const status = $<HTMLElement>('status')
const statusText = $<HTMLElement>('status-text')
const logWrap = $<HTMLElement>('log-wrap')
const log = $<HTMLPreElement>('log')
const btnReload = $<HTMLButtonElement>('btn-reload')
const btnClear = $<HTMLButtonElement>('btn-clear')
const btnLogClear = $<HTMLButtonElement>('btn-log-clear')
const btnLogHide = $<HTMLButtonElement>('btn-log-hide')
const btnSettings = $<HTMLButtonElement>('btn-settings')
const btnSettingsClose = $<HTMLButtonElement>('btn-settings-close')
const btnSettingsReset = $<HTMLButtonElement>('btn-settings-reset')
const settingsPanel = $<HTMLElement>('settings')

// ---------------------------------------------------------------------------
// UI settings: which page elements and which viewer chrome are visible.
// Keys match `data-key` attributes on the checkboxes in index.html.
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS = {
  'page.status': true,
  'page.placeholder': true,
  'page.log': true,
  'viewer.toolbar': true,
  'viewer.zoom': true,
  'viewer.search': true,
  'viewer.download': true,
  'viewer.print': true,
  'viewer.exportHtml': true,
  'viewer.theme': true,
  'viewer.compact': false,
  'viewer.watermark': false,
  'pdf.toolbar': true,
  'pdf.navigation': true,
  'pdf.thumbnails': true,
  'text.toolbar': true,
  'text.lineNumbers': false,
  'image.rotation': true,
  'cad.colorMode': true,
  'cad.imageExport': true,
  'archive.download': true
} as const

type SettingKey = keyof typeof DEFAULT_SETTINGS
type Settings = Record<SettingKey, boolean>

const STORAGE_KEY = 'web-docs.ui-settings'

function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)
}

function loadSettings(): Settings {
  const result: Settings = { ...DEFAULT_SETTINGS }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return result
    const parsed = JSON.parse(raw) as Record<string, unknown>
    for (const [key, value] of Object.entries(parsed)) {
      if (isSettingKey(key) && typeof value === 'boolean') result[key] = value
    }
  } catch {
    // Private mode or blocked storage: fall back to defaults.
  }
  return result
}

function saveSettings(value: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore: settings still work for this page session.
  }
}

let settings: Settings = loadSettings()

const checkboxes = Array.from(
  settingsPanel.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-key]')
)
const subGroups = Array.from(settingsPanel.querySelectorAll<HTMLElement>('[data-sub-of]'))

function buildViewerOptions(s: Settings): ViewerOptions {
  return {
    rendererMode: 'replace',
    locale: 'en-US',
    theme: 'light',
    toolbar: s['viewer.toolbar']
      ? {
          position: 'bottom-right',
          zoom: s['viewer.zoom'],
          search: s['viewer.search'],
          download: s['viewer.download'],
          print: s['viewer.print'],
          exportHtml: s['viewer.exportHtml'],
          theme: s['viewer.theme']
        }
      : false,
    search: { enabled: s['viewer.search'] },
    ui: { density: s['viewer.compact'] ? 'compact' : 'comfortable' },
    watermark: s['viewer.watermark'] ? { enabled: true, text: 'Прототип' } : false,
    pdf: {
      toolbar: s['pdf.toolbar'],
      navigation: s['pdf.navigation'],
      thumbnails: s['pdf.thumbnails']
    },
    text: {
      toolbar: s['text.toolbar'],
      lineNumbers: s['text.lineNumbers']
    },
    image: { rotation: s['image.rotation'] },
    cad: {
      showColorModeToggle: s['cad.colorMode'],
      showImageExport: s['cad.imageExport']
    },
    archive: { entryActions: { download: s['archive.download'] } }
  }
}

let options: ViewerOptions = buildViewerOptions(settings)

// The element is created lazily: when connected without a source it mounts an
// empty placeholder document and shows its own message on top of our hint.
let viewer: FileViewerElement | null = null
let current: File | null = null
let loadStartedAt = 0

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function appendLog(message: string, cls?: 'ok' | 'err') {
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false })
  const line = document.createElement('span')
  if (cls) line.className = cls
  line.textContent = `[${time}] ${message}\n`
  log.appendChild(line)
  log.scrollTop = log.scrollHeight
}

function setStatus(state: 'idle' | 'loading' | 'ready' | 'error', text: string) {
  status.dataset.state = state
  statusText.textContent = text
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

// ---------------------------------------------------------------------------
// Settings panel wiring.
// ---------------------------------------------------------------------------

function syncCheckboxes() {
  for (const box of checkboxes) {
    const key = box.dataset.key
    if (key && isSettingKey(key)) box.checked = settings[key]
  }
  for (const group of subGroups) {
    const parent = group.dataset.subOf
    const enabled = parent && isSettingKey(parent) ? settings[parent] : true
    group.classList.toggle('is-disabled', !enabled)
    for (const box of group.querySelectorAll<HTMLInputElement>('input')) box.disabled = !enabled
  }
}

function applyPageSettings() {
  status.hidden = !settings['page.status']
  placeholder.hidden = !settings['page.placeholder'] || current !== null
  logWrap.hidden = !settings['page.log']
}

function applyViewerSettings(changedKey?: string) {
  options = buildViewerOptions(settings)
  if (viewer) {
    viewer.options = options
    if (changedKey) appendLog(`Опции просмотрщика обновлены: ${changedKey} = ${settings[changedKey as SettingKey]}`)
  }
}

function applySettings(changedKey?: string) {
  syncCheckboxes()
  applyPageSettings()
  if (!changedKey || !changedKey.startsWith('page.')) applyViewerSettings(changedKey)
}

function openSettings(open: boolean) {
  settingsPanel.hidden = !open
  btnSettings.setAttribute('aria-expanded', String(open))
}

settingsPanel.addEventListener('change', event => {
  const box = event.target as HTMLInputElement
  const key = box.dataset.key
  if (!key || !isSettingKey(key)) return
  settings[key] = box.checked
  saveSettings(settings)
  applySettings(key)
})

btnSettings.addEventListener('click', () => openSettings(settingsPanel.hidden))
btnSettingsClose.addEventListener('click', () => openSettings(false))
btnSettingsReset.addEventListener('click', () => {
  settings = { ...DEFAULT_SETTINGS }
  saveSettings(settings)
  applySettings()
  applyViewerSettings('reset')
})
btnLogHide.addEventListener('click', () => {
  settings['page.log'] = false
  saveSettings(settings)
  applySettings('page.log')
})

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !settingsPanel.hidden) openSettings(false)
})
document.addEventListener('pointerdown', event => {
  if (settingsPanel.hidden) return
  const target = event.target as Node
  if (settingsPanel.contains(target) || btnSettings.contains(target)) return
  openSettings(false)
})

// ---------------------------------------------------------------------------
// Viewer lifecycle.
// ---------------------------------------------------------------------------

function ensureViewer(): FileViewerElement {
  if (viewer) return viewer
  const el = document.createElement('flyfish-file-viewer') as FileViewerElement
  el.className = 'viewer'
  el.options = options
  el.addEventListener('viewer-state-change', onStateChange)
  el.addEventListener('viewer-error', onViewerError)
  dropZone.appendChild(el)
  viewer = el
  return el
}

function openFile(file: File) {
  current = file
  loadStartedAt = performance.now()
  placeholder.hidden = true
  const el = ensureViewer()
  btnReload.disabled = false
  btnClear.disabled = false
  setStatus('loading', `Загрузка: ${file.name} (${formatBytes(file.size)})…`)
  appendLog(`Открываю ${file.name} · ${formatBytes(file.size)} · mime=${file.type || 'не определён'}`)
  el.source = { file, filename: file.name, options }
}

function clearViewer() {
  current = null
  if (viewer) {
    viewer.destroy()
    viewer.remove()
    viewer = null
  }
  applyPageSettings()
  btnReload.disabled = true
  btnClear.disabled = true
  fileInput.value = ''
  setStatus('idle', 'Файл не выбран. Нажмите «Выбрать файл» или перетащите документ в окно.')
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (file) openFile(file)
})

btnReload.addEventListener('click', () => {
  if (!current || !viewer) return
  loadStartedAt = performance.now()
  setStatus('loading', `Перезагрузка: ${current.name}…`)
  void viewer.reload()
})

btnClear.addEventListener('click', clearViewer)
btnLogClear.addEventListener('click', () => {
  log.textContent = ''
})

// Drag and drop over the whole viewer area.
;['dragenter', 'dragover'].forEach(name => {
  dropZone.addEventListener(name, event => {
    event.preventDefault()
    dropZone.classList.add('dragover')
  })
})
;['dragleave', 'drop'].forEach(name => {
  dropZone.addEventListener(name, event => {
    event.preventDefault()
    dropZone.classList.remove('dragover')
  })
})
dropZone.addEventListener('drop', event => {
  const file = (event as DragEvent).dataTransfer?.files?.[0]
  if (file) openFile(file)
})

// Viewer lifecycle -> status + log.
function onStateChange(event: Event) {
  const { state, event: viewerEvent } = (event as CustomEvent<{ state: ViewerState; event?: ViewerEvent }>).detail
  if (!viewerEvent || !current) return

  const lifecycle = state.lifecycle
  const name = lifecycle?.filename ?? current.name
  const ext = (lifecycle?.type ?? name.split('.').pop() ?? '').toUpperCase()

  switch (viewerEvent.type) {
    case 'load-start':
      appendLog(`load-start ${name}`)
      break
    case 'load-complete': {
      const elapsed = Math.round(performance.now() - loadStartedAt)
      const inner = lifecycle?.duration != null ? `, рендер ${Math.round(lifecycle.duration)} мс` : ''
      const renderer = state.viewState?.renderer ? `, рендерер ${state.viewState.renderer}` : ''
      setStatus('ready', `${name} · ${ext} · открыт за ${elapsed} мс`)
      appendLog(`load-complete ${name} · ${elapsed} мс${inner}${renderer}`, 'ok')
      break
    }
    // Frequent UI chatter that is not useful for format evaluation.
    case 'unload-start':
    case 'unload-complete':
    case 'zoom-change':
    case 'view-state-change':
    case 'operation-availability-change':
      break
    default:
      appendLog(`${viewerEvent.type} ${JSON.stringify(viewerEvent.payload ?? null).slice(0, 200)}`)
  }
}

function onViewerError(event: Event) {
  if (!current) return
  const { error } = (event as CustomEvent<{ error: unknown }>).detail
  const message = describeError(error)
  setStatus('error', `Ошибка: ${message}`)
  appendLog(`error ${current.name}: ${message}`, 'err')
  console.error('[file-viewer]', error)
}

applySettings()
appendLog('Готов. Все рендереры загружаются лениво при открытии файла нужного типа.')
