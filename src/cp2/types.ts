export type Bin = 'WO' | 'FC' | 'DR' | 'MA'
export type Cell = { r: number; c: number }
export type BinningStrategy = 'DIGIT_SUM_MOD' | 'MAX_DIGIT_MOD'

export interface RefinementRules {
  tremorThreshold: number
  connectivity: 4 | 8
  minGroupSize: number
  maxGroupSize: number
  binning: { strategy: BinningStrategy; order: Bin[] }
}

export interface DataFile {
  id: number
  name: string
  status: string
  rows?: number
  cols?: number
  tileSize?: number
  progress?: number
  mistakes?: number
}

export interface FileDetail extends DataFile {
  rows: number
  cols: number
  tileSize: number
}

export interface Tile {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  values: string
  tremor: string
  bins: string
  version: number
}

export interface LoadedTile extends Tile {
  tremors: Uint8Array
}

export interface SelectedGroup {
  cells: Cell[]
  bin: Bin
  noise: boolean
  reason: string | null
}

export type Page<T> = {
  items: T[]
  total?: number
  page: number
  pageSize: number
  hasNext: boolean
}

export interface ApiProblem {
  error?: string
  message?: string
  details?: unknown
  requestId?: string
}

export const tileKey = (tileRow: number, tileCol: number): string => `${tileRow}:${tileCol}`

export function decodeTremor(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function hasNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseTile(value: unknown): LoadedTile {
  if (!isRecord(value)) throw new Error('El servidor devolvió un tile inválido')
  const { tileRow, tileCol, originRow, originCol, rows, cols, values, tremor, bins, version } = value
  if (![tileRow, tileCol, originRow, originCol, rows, cols].every(hasNumber) ||
      typeof values !== 'string' || typeof tremor !== 'string' || typeof bins !== 'string') {
    throw new Error('El tile no contiene los campos esperados')
  }
  const count = (rows as number) * (cols as number)
  const tremors = decodeTremor(tremor)
  if (values.length !== count || bins.length !== count || tremors.length !== count) {
    throw new Error('Los datos del tile tienen un tamaño incorrecto')
  }
  return {
    tileRow: tileRow as number, tileCol: tileCol as number,
    originRow: originRow as number, originCol: originCol as number,
    rows: rows as number, cols: cols as number,
    values, tremor, bins, version: hasNumber(version) ? version : 0, tremors,
  }
}
