// Contratos de Swagger — tag Archivos.
export const BINS = ['WO', 'FC', 'DR', 'MA'] as const
export type Bin = (typeof BINS)[number]

export interface Progress {
  WO: number
  FC: number
  DR: number
  MA: number
  overall: number
}

export type FileStatus = 'ACTIVE' | 'COMPLETE'

export interface LumonFile {
  id: number
  name: string
  rows: number
  cols: number
  tileSize: number
  status: FileStatus
  progress: Progress
  refinedGroups: number
  totalGroups: number
  mistakes: number
  updatedAt: string
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  page: number
  size: 10 | 25 | 50
}

export interface Rules {
  tremorThreshold: number
  connectivity: 4 | 8
  minGroupSize: number
  maxGroupSize: number
  binning: { strategy: 'DIGIT_SUM_MOD' | 'MAX_DIGIT_MOD'; order: Bin[] }
}

/** GET /files/{id}/tiles/{tileRow}/{tileCol} (crudo) */
export interface TileDto {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  /** un dígito por celda, por filas */
  values: string
  /** base64, un byte (0-100) por celda */
  tremor: string
  /** '.' sin refinar; W F D M */
  bins: string
  version: number
}

export interface Cell {
  r: number
  c: number
}

export interface RefineRequest {
  bin: Bin
  cells: Cell[]
}

export interface RefineResult {
  refinementId: number
  bin: Bin
  size: number
  file: { progress: Progress; refinedGroups: number; totalGroups: number; mistakes: number; status: FileStatus }
}

export const FILE_SIZES = [10, 25, 50] as const
export const FILE_SORTS = ['progress,desc', 'name,asc', 'updatedAt,desc'] as const
export const FILE_STATUSES = ['ACTIVE', 'COMPLETE'] as const
