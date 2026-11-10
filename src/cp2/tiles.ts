import type { Bin, Cell, FileDetail, LoadedTile } from './types'
import { tileKey } from './types'
import { LumonApi } from './api'

type Pending = { controller: AbortController; promise: Promise<LoadedTile> }

export class TileStore {
  private tiles = new Map<string, LoadedTile>()
  private pending = new Map<string, Pending>()
  private listeners = new Set<() => void>()
  private protectedRequests = 0
  readonly limit = 120

  private readonly api: LumonApi
  readonly file: FileDetail

  constructor(api: LumonApi, file: FileDetail) {
    this.api = api
    this.file = file
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  private notify() { for (const listener of this.listeners) listener() }

  cached(tileRow: number, tileCol: number): LoadedTile | undefined {
    const key = tileKey(tileRow, tileCol)
    const tile = this.tiles.get(key)
    if (tile) { this.tiles.delete(key); this.tiles.set(key, tile) }
    return tile
  }

  async load(tileRow: number, tileCol: number, signal?: AbortSignal): Promise<LoadedTile> {
    if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
    const cached = this.cached(tileRow, tileCol)
    if (cached) return cached
    const key = tileKey(tileRow, tileCol)
    const existing = this.pending.get(key)
    if (existing) return existing.promise

    const controller = new AbortController()
    const promise = this.api.tile(this.file.id, tileRow, tileCol, controller.signal)
      .then(tile => {
        this.tiles.set(key, tile)
        while (this.tiles.size > this.limit) {
          const oldest = this.tiles.keys().next().value
          if (oldest === undefined) break
          this.tiles.delete(oldest)
        }
        this.notify()
        return tile
      })
      .finally(() => this.pending.delete(key))
    this.pending.set(key, { controller, promise })
    return promise
  }

  getCell(r: number, c: number): { digit: string; tremor: number; bin: string } | undefined {
    const tr = Math.floor(r / this.file.tileSize)
    const tc = Math.floor(c / this.file.tileSize)
    const tile = this.cached(tr, tc)
    if (!tile) return undefined
    const row = r - tile.originRow
    const col = c - tile.originCol
    if (row < 0 || col < 0 || row >= tile.rows || col >= tile.cols) return undefined
    const index = row * tile.cols + col
    return { digit: tile.values[index], tremor: tile.tremors[index], bin: tile.bins[index] }
  }

  beginSelection(): () => void {
    this.protectedRequests++
    return () => { this.protectedRequests = Math.max(0, this.protectedRequests - 1) }
  }

  cancelOutOfView(visibleKeys: Set<string>) {
    if (this.protectedRequests > 0) return
    for (const [key, request] of this.pending) {
      if (!visibleKeys.has(key)) request.controller.abort()
    }
  }

  updateBin(cells: Cell[], bin: Bin) {
    const letter = ({ WO: 'W', FC: 'F', DR: 'D', MA: 'M' } as const)[bin]
    const updates = new Map<string, Cell[]>()
    for (const cell of cells) {
      const key = tileKey(Math.floor(cell.r / this.file.tileSize), Math.floor(cell.c / this.file.tileSize))
      updates.set(key, [...(updates.get(key) ?? []), cell])
    }
    for (const [key, group] of updates) {
      const tile = this.tiles.get(key)
      if (!tile) continue
      const chars = tile.bins.split('')
      for (const cell of group) {
        const index = (cell.r - tile.originRow) * tile.cols + (cell.c - tile.originCol)
        if (index >= 0 && index < chars.length) chars[index] = letter
      }
      this.tiles.set(key, { ...tile, bins: chars.join('') })
    }
    this.notify()
  }

  invalidateCells(cells: Cell[]) {
    for (const cell of cells) {
      this.tiles.delete(tileKey(Math.floor(cell.r / this.file.tileSize), Math.floor(cell.c / this.file.tileSize)))
    }
    this.notify()
  }

  clear() {
    for (const pending of this.pending.values()) pending.controller.abort()
    this.pending.clear()
    this.tiles.clear()
    this.notify()
  }
}
