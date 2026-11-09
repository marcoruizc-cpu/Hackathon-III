import { ApiError, isAbortError } from '../../lib/errors'
import { createEmitter } from '../../lib/emitter'
import { backoffMs, sleep } from '../../lib/sleep'
import { getTile } from './api'
import type { TileDto } from './dto'

export interface DecodedTile {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  values: Uint8Array // 0-9
  tremor: Uint8Array // 0-100
  bins: string
  version: number
}

export function decodeTile(dto: TileDto): DecodedTile {
  const n = dto.rows * dto.cols
  const values = new Uint8Array(n)
  for (let i = 0; i < n; i++) values[i] = dto.values.charCodeAt(i) - 48
  const raw = atob(dto.tremor)
  const tremor = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) tremor[i] = raw.charCodeAt(i)
  return { ...dto, values, tremor }
}

export const tileKey = (tr: number, tc: number) => `${tr}:${tc}`

/** Límite del contrato: 40 bloques cada 10 s por sesión. Dejamos margen. */
const WINDOW_MS = 10_000
const MAX_PER_WINDOW = 36
const CONCURRENCY = 4

/**
 * Bloques de UN archivo (servicio). Reglas que cumple (son las que mide la revisión GRID):
 * - Nunca pide dos veces el mismo bloque a la vez (mapa `inFlight`).
 * - Ventana deslizante: como máximo 36 requests cada 10 s.
 * - Ante 429: pausa GLOBAL hasta que pase Retry-After; ninguna request sale mientras tanto.
 * - Ante 503 / red: reintenta ese bloque con espera creciente.
 */
export class TileStore {
  readonly fileId: number
  readonly rows: number
  readonly cols: number
  readonly tileSize: number
  readonly tileRows: number
  readonly tileCols: number

  private tiles = new Map<string, DecodedTile>()
  private inFlight = new Map<string, Promise<DecodedTile>>()
  private sentAt: number[] = []
  private pausedUntil = 0
  private active = 0
  private waiters: (() => void)[] = []
  private controller = new AbortController()
  /** Se emite cada vez que llega o cambia un bloque (la vista se redibuja). */
  readonly changed = createEmitter<string>()
  /** Estado para mostrar en la UI ("esperando Retry-After…"). */
  readonly status = createEmitter<{ pausedUntil: number; inFlight: number }>()

  constructor(file: { id: number; rows: number; cols: number; tileSize: number }) {
    this.fileId = file.id
    this.rows = file.rows
    this.cols = file.cols
    this.tileSize = file.tileSize
    this.tileRows = Math.ceil(file.rows / file.tileSize)
    this.tileCols = Math.ceil(file.cols / file.tileSize)
  }

  dispose() {
    this.controller.abort()
  }

  get(tr: number, tc: number): DecodedTile | undefined {
    return this.tiles.get(tileKey(tr, tc))
  }

  isLoading(tr: number, tc: number): boolean {
    return this.inFlight.has(tileKey(tr, tc))
  }

  /** Bloque que contiene la celda global (r, c). */
  tileOf(r: number, c: number): [number, number] {
    return [Math.floor(r / this.tileSize), Math.floor(c / this.tileSize)]
  }

  /** Datos de una celda global, o undefined si su bloque no está cargado. */
  cell(r: number, c: number): { value: number; tremor: number; bin: string } | undefined {
    if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) return undefined
    const [tr, tc] = this.tileOf(r, c)
    const tile = this.tiles.get(tileKey(tr, tc))
    if (!tile) return undefined
    const i = (r - tile.originRow) * tile.cols + (c - tile.originCol)
    return { value: tile.values[i] ?? 0, tremor: tile.tremor[i] ?? 0, bin: tile.bins[i] ?? '.' }
  }

  /** Pide un bloque (o devuelve el que ya está en caché / en vuelo). */
  load(tr: number, tc: number, force = false): Promise<DecodedTile> {
    if (tr < 0 || tc < 0 || tr >= this.tileRows || tc >= this.tileCols) {
      return Promise.reject(new RangeError(`Bloque fuera de rango ${tr},${tc}`))
    }
    const key = tileKey(tr, tc)
    const pending = this.inFlight.get(key)
    if (pending) return pending
    const cached = this.tiles.get(key)
    if (cached && !force) return Promise.resolve(cached)

    const promise = this.fetchWithRetry(tr, tc).finally(() => {
      this.inFlight.delete(key)
      this.emitStatus()
    })
    this.inFlight.set(key, promise)
    this.emitStatus()
    return promise
  }

  /** Vuelve a pedir bloques (409 ALREADY_REFINED trae `details.tiles`, o llegó refinement.created). */
  invalidate(tiles: [number, number][]) {
    for (const [tr, tc] of tiles) void this.load(tr, tc, true).catch(() => undefined)
  }

  /** Bloques que cubren un rango de celdas (para pedir solo lo visible). */
  tilesInRange(r0: number, c0: number, r1: number, c1: number): [number, number][] {
    const out: [number, number][] = []
    const [tr0, tc0] = this.tileOf(Math.max(0, r0), Math.max(0, c0))
    const [tr1, tc1] = this.tileOf(Math.min(this.rows - 1, r1), Math.min(this.cols - 1, c1))
    for (let tr = tr0; tr <= tr1; tr++) for (let tc = tc0; tc <= tc1; tc++) out.push([tr, tc])
    return out
  }

  private emitStatus() {
    this.status.emit({ pausedUntil: this.pausedUntil, inFlight: this.inFlight.size })
  }

  private async fetchWithRetry(tr: number, tc: number): Promise<DecodedTile> {
    const signal = this.controller.signal
    for (let attempt = 0; ; attempt++) {
      await this.acquireSlot(signal)
      try {
        const dto = await getTile(this.fileId, tr, tc, signal)
        const tile = decodeTile(dto)
        const key = tileKey(tr, tc)
        const prev = this.tiles.get(key)
        // Con caos las respuestas llegan desordenadas: nunca reemplazar por una versión más vieja.
        if (!prev || tile.version >= prev.version) {
          this.tiles.set(key, tile)
          this.changed.emit(key)
        }
        return this.tiles.get(key) ?? tile
      } catch (error: unknown) {
        if (isAbortError(error) || signal.aborted) throw error
        if (error instanceof ApiError && error.status === 429) {
          this.pausedUntil = Math.max(this.pausedUntil, Date.now() + (error.retryAfter ?? 2) * 1000)
          this.emitStatus()
          continue // acquireSlot espera la pausa
        }
        const transient = !(error instanceof ApiError) || error.status === 503
        if (transient && attempt < 5) {
          await sleep(backoffMs(attempt, error instanceof ApiError ? error.retryAfter : null), signal)
          continue
        }
        throw error
      } finally {
        this.releaseSlot()
      }
    }
  }

  /** Espera: (1) fin de la pausa por 429, (2) cupo en la ventana de 10 s, (3) cupo de concurrencia. */
  private async acquireSlot(signal: AbortSignal): Promise<void> {
    while (this.active >= CONCURRENCY) {
      await new Promise<void>((resolve) => this.waiters.push(resolve))
    }
    this.active++
    for (;;) {
      const now = Date.now()
      if (now < this.pausedUntil) {
        await sleep(this.pausedUntil - now + 50, signal)
        continue
      }
      this.sentAt = this.sentAt.filter((t) => now - t < WINDOW_MS)
      if (this.sentAt.length >= MAX_PER_WINDOW) {
        const oldest = this.sentAt[0] ?? now
        await sleep(WINDOW_MS - (now - oldest) + 50, signal)
        continue
      }
      this.sentAt.push(now)
      return
    }
  }

  private releaseSlot() {
    this.active = Math.max(0, this.active - 1)
    this.waiters.shift()?.()
  }
}
