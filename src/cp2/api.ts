import {
  type Bin, type Cell, type DataFile, type FileDetail, type Page,
  type RefinementRules, type LoadedTile, hasNumber, isRecord, parseTile,
} from './types'
import { apiRequest as authenticatedRequest, ApiError as SessionError } from '../lib/session'

export class LumonError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(message: string, status: number, code: string, details: unknown = null) {
    super(message)
    this.name = 'LumonError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export interface FilesQuery {
  page: number
  pageSize: number
  q?: string
  status?: string
  sort?: string
}

export class LumonApi {
  private readonly inFlight = new Map<string, Promise<LoadedTile>>()
  private cooldownUntil = 0

  private async request<T>(path: string, init: RequestInit = {}, idempotencyKey?: string, retries = 3): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      if (init.signal?.aborted) throw new DOMException('Cancelado', 'AbortError')
      const remaining = this.cooldownUntil - Date.now()
      if (remaining > 0) await sleep(remaining, init.signal ?? undefined)
      const headers = new Headers(init.headers)
      if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey)
      try {
        return await authenticatedRequest<T>(path, { ...init, headers })
      } catch (error: unknown) {
        if (init.signal?.aborted) throw error
        if (!(error instanceof SessionError)) throw error
        const recoverable = error.status === 0 || error.status === 429 || error.status === 503
        if (recoverable && attempt < retries) {
          const wait = Math.min(800 * 2 ** attempt, 7000)
          if (error.status === 429) this.cooldownUntil = Math.max(this.cooldownUntil, Date.now() + wait)
          await sleep(wait, init.signal ?? undefined)
          continue
        }
        throw new LumonError(error.message, error.status, error.code, error.details)
      }
    }
  }

  async files(query: FilesQuery, signal?: AbortSignal): Promise<Page<DataFile>> {
    const params = new URLSearchParams({ page: String(Math.max(0, query.page - 1)), size: String(query.pageSize) })
    if (query.q) params.set('q', query.q)
    if (query.status) params.set('status', query.status)
    if (query.sort) params.set('sort', query.sort)
    const raw = await this.request<unknown>(`/files?${params}`, { signal: signal ?? undefined })
    const outer = isRecord(raw) ? raw : {}
    const response = isRecord(outer.data) ? outer.data : outer
    const possible = Array.isArray(raw) ? raw : response.content ?? response.items ?? response.files ?? response.results
    if (!Array.isArray(possible)) throw new Error('La API no devolvió una lista de archivos válida')
    const items = possible.map(normalizeFile)
    const pagination = isRecord(response.pagination) ? response.pagination : response
    const total = hasNumber(pagination.totalElements) ? pagination.totalElements :
      hasNumber(pagination.total) ? pagination.total : undefined
    const hasNext = hasNumber(pagination.totalPages) ? query.page < pagination.totalPages :
      typeof pagination.hasNext === 'boolean' ? pagination.hasNext :
      (total === undefined ? items.length >= query.pageSize : query.page * query.pageSize < total)
    return { items, total, page: query.page, pageSize: query.pageSize, hasNext }
  }

  async file(fileId: number, signal?: AbortSignal): Promise<FileDetail> {
    const raw = await this.request<unknown>(`/files/${fileId}`, { signal: signal ?? undefined })
    const data = unwrap(raw)
    const file = normalizeFile(data)
    if (!hasNumber(data.rows) || !hasNumber(data.cols) || !hasNumber(data.tileSize) || data.tileSize <= 0) {
      throw new Error('La API no devolvió las dimensiones de la grilla')
    }
    return { ...file, rows: data.rows, cols: data.cols, tileSize: data.tileSize }
  }

  async rules(fileId: number, signal?: AbortSignal): Promise<RefinementRules> {
    const raw = await this.request<unknown>(`/files/${fileId}/rules`, { signal: signal ?? undefined })
    const data = unwrap(raw)
    const binning = isRecord(data.binning) ? data.binning : {}
    const order = binning.order
    if (!hasNumber(data.tremorThreshold) || (data.connectivity !== 4 && data.connectivity !== 8) ||
        !hasNumber(data.minGroupSize) || !hasNumber(data.maxGroupSize) ||
        (binning.strategy !== 'DIGIT_SUM_MOD' && binning.strategy !== 'MAX_DIGIT_MOD') ||
        !Array.isArray(order) || order.length !== 4 ||
        !order.every(value => ['WO', 'FC', 'DR', 'MA'].includes(value))) {
      throw new Error('Reglas del archivo inválidas')
    }
    return {
      tremorThreshold: data.tremorThreshold, connectivity: data.connectivity,
      minGroupSize: data.minGroupSize, maxGroupSize: data.maxGroupSize,
      binning: { strategy: binning.strategy, order: order as Bin[] },
    }
  }

  tile(fileId: number, tileRow: number, tileCol: number, signal?: AbortSignal): Promise<LoadedTile> {
    const key = `${fileId}:${tileRow}:${tileCol}`
    const existing = this.inFlight.get(key)
    if (existing) return existing
    const promise = this.request<unknown>(`/files/${fileId}/tiles/${tileRow}/${tileCol}`, { signal: signal ?? undefined })
      .then(raw => parseTile(unwrap(raw)))
      .finally(() => { this.inFlight.delete(key) })
    this.inFlight.set(key, promise)
    return promise
  }

  async refine(fileId: number, bin: Bin, cells: Cell[], idempotencyKey: string): Promise<unknown> {
    const raw = await this.request<unknown>(`/files/${fileId}/refinements`, {
      method: 'POST', body: JSON.stringify({ bin, cells }),
    }, idempotencyKey, 5)
    if (!isRecord(raw)) return raw
    const response = isRecord(raw.data) ? raw.data : raw
    const file = isRecord(response.file) ? response.file : {}
    const progress = isRecord(file.progress) ? file.progress : {}
    return { ...response, progress: hasNumber(progress.overall) ? progress.overall * 100 : undefined }
  }
}

function unwrap(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Respuesta inválida de la API')
  return isRecord(value.data) ? value.data : value
}

function normalizeFile(value: unknown): DataFile {
  if (!isRecord(value)) throw new Error('Archivo inválido')
  const id = typeof value.id === 'string' ? Number(value.id) : value.id
  if (!hasNumber(id)) throw new Error('Archivo sin identificador')
  const progress = isRecord(value.progress) ? value.progress : {}
  return {
    id,
    name: typeof value.name === 'string' ? value.name :
      (typeof value.title === 'string' ? value.title : `Archivo ${id}`),
    status: typeof value.status === 'string' ? value.status : 'UNKNOWN',
    rows: hasNumber(value.rows) ? value.rows : undefined,
    cols: hasNumber(value.cols) ? value.cols : undefined,
    tileSize: hasNumber(value.tileSize) ? value.tileSize : undefined,
    progress: hasNumber(value.progress) ? value.progress :
      hasNumber(progress.overall) ? progress.overall * 100 : undefined,
    mistakes: hasNumber(value.mistakes) ? value.mistakes : undefined,
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Cancelado', 'AbortError')); return }
    const timer = setTimeout(done, ms)
    function done() { signal?.removeEventListener('abort', abort); resolve() }
    function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('Cancelado', 'AbortError')) }
    signal?.addEventListener('abort', abort, { once: true })
  })
}
