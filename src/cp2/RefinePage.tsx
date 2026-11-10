import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { LumonApi, LumonError } from './api'
import { findGroup } from './selection'
import { TileStore } from './tiles'
import type { Bin, Cell, FileDetail, RefinementRules, SelectedGroup } from './types'
import { isRecord, tileKey } from './types'
import './cp2.css'

const CELL = 42
const OVERSCAN = 3
const BINS: Bin[] = ['WO', 'FC', 'DR', 'MA']
const BIN_NAMES: Record<Bin, string> = { WO: 'Woe', FC: 'Frolic', DR: 'Dread', MA: 'Malice' }

interface Props { api: LumonApi }

function validPosition(value: string | null, max: number): number {
  const parsed = Number(value)
  return value !== null && Number.isInteger(parsed) && parsed >= 0 && parsed < max ? parsed : 0
}

export default function RefinePage({ api }: Props) {
  const { id } = useParams()
  const fileId = Number(id)
  const [params, setParams] = useSearchParams()
  const [file, setFile] = useState<FileDetail | null>(null)
  const [rules, setRules] = useState<RefinementRules | null>(null)
  const [store, setStore] = useState<TileStore | null>(null)
  const [version, setVersion] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<SelectedGroup | null>(null)
  const [saving, setSaving] = useState(false)
  const [progress, setProgress] = useState<number | undefined>()
  const [scroll, setScroll] = useState({ top: 0, left: 0, width: 950, height: 500 })
  const [focus, setFocus] = useState<Cell>({ r: 0, c: 0 })
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)
  const requestIdRef = useRef<string | null>(null)
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const cellRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!Number.isSafeInteger(fileId) || fileId <= 0) { setError('ID de archivo inválido'); setLoading(false); return }
    const controller = new AbortController()
    setLoading(true)
    setError('')
    Promise.all([api.file(fileId, controller.signal), api.rules(fileId, controller.signal)]).then(([detail, requirements]) => {
      if (controller.signal.aborted) return
      setFile(detail)
      setRules(requirements)
      setStore(new TileStore(api, detail))
      setProgress(detail.progress)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : 'No se pudo abrir el archivo'); setLoading(false) }
    })
    return () => { controller.abort(); activeRef.current?.abort() }
  }, [api, fileId])

  useEffect(() => {
    if (!store) return
    return store.subscribe(() => setVersion(value => value + 1))
  }, [store])

  useEffect(() => {
    if (!file || !scrollRef.current) return
    const initialRow = validPosition(params.get('r'), file.rows)
    const initialCol = validPosition(params.get('c'), file.cols)
    scrollRef.current.scrollTo({ top: initialRow * CELL, left: initialCol * CELL })
    setFocus({ r: initialRow, c: initialCol })
  }, [file])

  useEffect(() => {
    const target = scrollRef.current
    if (!target) return
    const resize = () => setScroll(previous => ({ ...previous, width: target.clientWidth, height: target.clientHeight }))
    resize()
    const observer = new ResizeObserver(resize)
    observer.observe(target)
    return () => observer.disconnect()
  }, [file])

  const bounds = useMemo(() => {
    if (!file) return null
    const firstRow = Math.max(0, Math.floor(scroll.top / CELL) - OVERSCAN)
    const firstCol = Math.max(0, Math.floor(scroll.left / CELL) - OVERSCAN)
    const rows = Math.min(49, Math.ceil(scroll.height / CELL) + 2 * OVERSCAN)
    const cols = Math.min(49, Math.ceil(scroll.width / CELL) + 2 * OVERSCAN)
    return {
      rowStart: firstRow, rowEnd: Math.min(file.rows, firstRow + rows),
      colStart: firstCol, colEnd: Math.min(file.cols, firstCol + cols),
    }
  }, [file, scroll])

  const visibleTileKeys = useMemo(() => {
    const result: { row: number; col: number; key: string }[] = []
    if (!bounds || !file) return result
    for (let tr = Math.floor(bounds.rowStart / file.tileSize); tr <= Math.floor((bounds.rowEnd - 1) / file.tileSize); tr++) {
      for (let tc = Math.floor(bounds.colStart / file.tileSize); tc <= Math.floor((bounds.colEnd - 1) / file.tileSize); tc++) {
        result.push({ row: tr, col: tc, key: tileKey(tr, tc) })
      }
    }
    return result
  }, [bounds, file])
  const visibleKey = visibleTileKeys.map(item => item.key).join(',')

  useEffect(() => {
    if (!store) return
    let cancelled = false
    const wanted = new Set(visibleTileKeys.map(item => item.key))
    store.cancelOutOfView(wanted)
    const missing = visibleTileKeys.filter(({ row, col }) => !store.cached(row, col))
    let cursor = 0
    const worker = async () => {
      while (!cancelled && cursor < missing.length) {
        const next = missing[cursor++]
        try { await store.load(next.row, next.col) }
        catch (reason: unknown) {
          if (!cancelled && !(reason instanceof DOMException && reason.name === 'AbortError')) {
            setError(reason instanceof Error ? reason.message : 'Error de carga de bloque')
          }
        }
      }
    }
    void Promise.all(Array.from({ length: Math.min(3, missing.length) }, () => worker()))
    return () => { cancelled = true }
  }, [store, visibleKey])

  useEffect(() => () => { store?.clear() }, [store])

  const updateUrl = (r: number, c: number) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      next.set('r', String(r)); next.set('c', String(c))
      return next
    }, { replace: true })
  }

  const goTo = (r: number, c: number, focusCell = true) => {
    if (!file || !scrollRef.current) return
    const row = Math.min(file.rows - 1, Math.max(0, r))
    const col = Math.min(file.cols - 1, Math.max(0, c))
    const element = scrollRef.current
    const top = row * CELL
    const left = col * CELL
    if (top < element.scrollTop) element.scrollTop = top
    else if (top + CELL > element.scrollTop + element.clientHeight) element.scrollTop = top + CELL - element.clientHeight
    if (left < element.scrollLeft) element.scrollLeft = left
    else if (left + CELL > element.scrollLeft + element.clientWidth) element.scrollLeft = left + CELL - element.clientWidth
    setFocus({ r: row, c: col }); updateUrl(row, col)
    if (focusCell) window.requestAnimationFrame(() => cellRef.current?.focus())
  }

  const chooseCell = useCallback(async (cell: Cell) => {
    if (!file || !rules || !store) return
    activeRef.current?.abort()
    const controller = new AbortController()
    activeRef.current = controller
    const unprotect = store.beginSelection()
    setNotice('')
    setError('')
    setSelected(null)
    setSelecting(true)
    requestIdRef.current = null
    try {
      const result = await findGroup(cell, file, rules, (r, c, signal) => store.load(r, c, signal), controller.signal)
      if (!controller.signal.aborted) setSelected(result)
    } catch (reason: unknown) {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudo seleccionar el grupo')
    } finally {
      unprotect()
      if (!controller.signal.aborted) setSelecting(false)
    }
  }, [file, rules, store])

  const refine = useCallback(async (bin: Bin) => {
    if (!selected || selected.noise || !file || !store || busyRef.current) return
    busyRef.current = true
    setSaving(true)
    setError('')
    const key = requestIdRef.current ?? crypto.randomUUID()
    requestIdRef.current = key
    try {
      const result = await api.refine(file.id, bin, selected.cells, key)
      store.updateBin(selected.cells, bin)
      setNotice(`Grupo refinado en ${BIN_NAMES[bin]} correctamente`)
      if (isRecord(result)) {
        const raw = isRecord(result.data) ? result.data : result
        const nextProgress = typeof raw.progress === 'number' ? raw.progress :
          (isRecord(raw.file) && typeof raw.file.progress === 'number' ? raw.file.progress : undefined)
        if (nextProgress !== undefined) setProgress(nextProgress)
      }
      setSelected(null)
      requestIdRef.current = null
    } catch (reason: unknown) {
      if (reason instanceof LumonError && reason.status === 409) store.invalidateCells(selected.cells)
      const message = reason instanceof Error ? reason.message : 'Error al refinar'
      setError(`${message}. Puedes volver a intentarlo sin duplicar la acción.`)
    } finally {
      busyRef.current = false
      setSaving(false)
    }
  }, [api, file, selected, store])

  const onKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!file) return
    const { r, c } = focus
    let next: Cell | null = null
    switch (event.key) {
      case 'ArrowUp': next = { r: r - 1, c }; break
      case 'ArrowDown': next = { r: r + 1, c }; break
      case 'ArrowLeft': next = { r, c: c - 1 }; break
      case 'ArrowRight': next = { r, c: c + 1 }; break
      case 'PageUp': next = { r: r - Math.max(1, Math.floor(scroll.height / CELL)), c }; break
      case 'PageDown': next = { r: r + Math.max(1, Math.floor(scroll.height / CELL)), c }; break
      case 'Home': next = { r, c: 0 }; break
      case 'End': next = { r, c: file.cols - 1 }; break
      case 'Enter': event.preventDefault(); if (!event.repeat) void chooseCell(focus); return
      default: return
    }
    event.preventDefault()
    goTo(next.r, next.c)
  }

  useEffect(() => {
    const onUp = (event: PointerEvent) => {
      if (!pointerRef.current) return
      const distance = Math.hypot(event.clientX - pointerRef.current.x, event.clientY - pointerRef.current.y)
      pointerRef.current = null
      if (distance < 8) return
      const target = document.elementFromPoint(event.clientX, event.clientY)
      const name = target?.closest<HTMLElement>('[data-bin]')?.dataset.bin
      if (name && BINS.includes(name as Bin)) void refine(name as Bin)
    }
    window.addEventListener('pointerup', onUp)
    return () => window.removeEventListener('pointerup', onUp)
  }, [refine])

  const selectedKeys = useMemo(() => new Set(selected?.cells.map(cell => cell.r * (file?.cols ?? 1) + cell.c) ?? []), [selected, file])
  const rows = bounds ? Array.from({ length: bounds.rowEnd - bounds.rowStart }, (_, index) => bounds.rowStart + index) : []
  const cols = bounds ? Array.from({ length: bounds.colEnd - bounds.colStart }, (_, index) => bounds.colStart + index) : []
  void version

  return (
    <main className="cp2-page cp2-refiner">
      <nav><Link to="/files">← Volver a archivos</Link></nav>
      <div className="cp2-heading">
        <div><p className="cp2-eyebrow">MACRODATA REFINEMENT</p><h1>{file?.name ?? `Archivo ${id}`}</h1>
          <p>{file ? `${file.rows} × ${file.cols} celdas · bloques de ${file.tileSize}` : 'Cargando reglas y dimensiones...'}</p>
        </div>
        {progress !== undefined && <div className="cp2-progress"><strong>{progress.toFixed(1)}%</strong><span>Refinado</span></div>}
      </div>
      {loading && <div className="cp2-panel" role="status">Cargando archivo...</div>}
      {error && <div className="cp2-error" role="alert">{error}</div>}
      {notice && <div className="cp2-notice" role="status">{notice}</div>}
      {progress !== undefined && progress >= 100 && <div className="cp2-notice" role="status">Archivo completado al 100 %. ¡Buen trabajo!</div>}
      {file && rules && store && <div className="cp2-layout">
        <section className="cp2-panel cp2-grid-panel" aria-label="Grilla de números">
          <p className="cp2-hint">Desplázate para cargar bloques. Usa flechas, Inicio, Fin, RePág, AvPág y Enter.</p>
          <div ref={scrollRef} className="cp2-grid-viewport" role="grid" aria-label="Grilla de macrodatos"
            aria-rowcount={file.rows} aria-colcount={file.cols} onKeyDown={onKey}
            onScroll={event => {
              const target = event.currentTarget
              setScroll(previous => ({ ...previous, top: target.scrollTop, left: target.scrollLeft }))
            }}>
            <div style={{ width: file.cols * CELL, height: file.rows * CELL, position: 'relative' }}>
              {rows.map(r => <div className="cp2-grid-row" role="row" aria-rowindex={r + 1}
                key={r} style={{ top: r * CELL, left: (bounds?.colStart ?? 0) * CELL, width: cols.length * CELL }}>
                {cols.map(c => {
                  const value = store.getCell(r, c)
                  const scary = value ? value.tremor >= rules.tremorThreshold : false
                  const refined = value ? value.bin !== '.' : false
                  const highlighted = selectedKeys.has(r * file.cols + c)
                  const active = focus.r === r && focus.c === c
                  return <button
                    key={c} ref={active ? cellRef : undefined}
                    className={`cp2-cell ${scary ? 'is-scary' : ''} ${refined ? 'is-refined' : ''} ${highlighted ? 'is-selected' : ''}`}
                    style={{ '--tremor': `${value?.tremor ?? 0}` } as React.CSSProperties}
                    type="button" role="gridcell" aria-rowindex={r + 1} aria-colindex={c + 1}
                    aria-selected={highlighted} tabIndex={active ? 0 : -1}
                    aria-label={`Fila ${r + 1}, columna ${c + 1}, ${value ? `dígito ${value.digit}, temblor ${value.tremor}` : 'cargando'}${refined ? ', refinada' : ''}`}
                    onFocus={() => setFocus({ r, c })}
                    onClick={() => { goTo(r, c, false); if (value) void chooseCell({ r, c }) }}>
                    {value?.digit ?? '·'}
                  </button>
                })}
              </div>)}
            </div>
          </div>
          <p className="cp2-hint">Celdas montadas: {rows.length * cols.length} de {file.rows * file.cols}. Umbral: {rules.tremorThreshold}. Conectividad: {rules.connectivity}.</p>
        </section>
        <aside className="cp2-panel cp2-sidebar">
          <h2>Grupo seleccionado</h2>
          {selecting && <p role="status">Buscando el grupo completo...</p>}
          {!selecting && !selected && <p className="cp2-hint">Selecciona un número que dé miedo para encontrar su grupo.</p>}
          {selected && <>
            <p><strong>{selected.cells.length}</strong> celdas</p>
            {selected.noise ? <p className="cp2-error" role="status">{selected.reason}</p> :
              <p>Destino correcto: <strong>{BIN_NAMES[selected.bin]}</strong></p>}
            {!selected.noise && <div className="cp2-drag" onPointerDown={event => {
              pointerRef.current = { x: event.clientX, y: event.clientY }
            }}>Arrastra este grupo a una caja ↓</div>}
          </>}
          <h2>Cajas</h2>
          <div className="cp2-bins">
            {BINS.map(bin => <button key={bin} type="button" data-bin={bin}
              className={`cp2-bin ${selected?.bin === bin ? 'is-target' : ''}`}
              disabled={!selected || selected.noise || saving || selecting}
              onClick={() => void refine(bin)}>
              <strong>{bin}</strong><span>{BIN_NAMES[bin]}</span>
            </button>)}
          </div>
          {saving && <p role="status">Guardando refinamiento...</p>}
          <p className="cp2-hint">También puedes seleccionar una caja con clic o teclado. La misma intención reutiliza su clave de idempotencia.</p>
        </aside>
      </div>}
    </main>
  )
}
