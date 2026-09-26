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

const viewer = $<FileViewerElement>('viewer')
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

viewer.options = options

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

function openFile(file: File) {
  current = file
  loadStartedAt = performance.now()
  placeholder.hidden = true
  viewer.hidden = false
  btnReload.disabled = false
  btnClear.disabled = false
  setStatus('loading', `Загрузка: ${file.name} (${formatBytes(file.size)})…`)
  appendLog(`Открываю ${file.name} · ${formatBytes(file.size)} · mime=${file.type || 'не определён'}`)
  viewer.source = { file, filename: file.name, options }
}

function clearViewer() {
  current = null
  viewer.source = undefined
  viewer.hidden = true
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
  if (!current) return
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
viewer.addEventListener('viewer-state-change', event => {
  const { state, event: viewerEvent } = (event as CustomEvent<{ state: ViewerState; event?: ViewerEvent }>).detail
  if (!viewerEvent) return

  const lifecycle = state.lifecycle
  const name = lifecycle?.filename ?? current?.name ?? ''
  const type = lifecycle?.type ? `.${lifecycle.type}` : ''

  switch (viewerEvent.type) {
    case 'load-start':
      appendLog(`load-start ${name}${type}`)
      break
    case 'load-complete': {
      const elapsed = Math.round(performance.now() - loadStartedAt)
      const inner = lifecycle?.duration != null ? `, рендер ${Math.round(lifecycle.duration)} мс` : ''
      setStatus('ready', `${name} · ${type.slice(1).toUpperCase()} · открыт за ${elapsed} мс`)
      appendLog(`load-complete ${name}${type} · ${elapsed} мс${inner}`, 'ok')
      break
    }
    case 'unload-start':
    case 'unload-complete':
      break
    default:
      appendLog(`${viewerEvent.type} ${JSON.stringify(viewerEvent.payload ?? null).slice(0, 200)}`)
  }
})

viewer.addEventListener('viewer-error', event => {
  const { error } = (event as CustomEvent<{ error: unknown }>).detail
  const message = describeError(error)
  setStatus('error', `Ошибка: ${message}`)
  appendLog(`error ${current?.name ?? ''}: ${message}`, 'err')
  console.error('[file-viewer]', error)
})

appendLog('Готов. Все рендереры загружаются лениво при открытии файла нужного типа.')
