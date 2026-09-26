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
const log = $<HTMLPreElement>('log')
const btnReload = $<HTMLButtonElement>('btn-reload')
const btnClear = $<HTMLButtonElement>('btn-clear')
const btnLogClear = $<HTMLButtonElement>('btn-log-clear')

const options: ViewerOptions = {
  rendererMode: 'replace',
  locale: 'en-US',
  theme: 'light',
  toolbar: { position: 'bottom-right' },
  search: { enabled: true }
}

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
  placeholder.hidden = false
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

appendLog('Готов. Все рендереры загружаются лениво при открытии файла нужного типа.')
