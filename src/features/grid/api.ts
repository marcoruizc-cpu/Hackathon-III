import { api, apiRequest, qs } from '../../lib/http'
import type { LumonFile, Page, RefineRequest, RefineResult, Rules, TileDto } from './dto'

export interface FileQuery {
  page: number
  size: number
  status: string
  q: string
  sort: string
}

export const getFiles = (q: FileQuery, signal?: AbortSignal) =>
  api<Page<LumonFile>>(`/files${qs({ page: q.page, size: q.size, status: q.status, q: q.q, sort: q.sort })}`, { signal })

export const getFile = (id: number, signal?: AbortSignal) => api<LumonFile>(`/files/${id}`, { signal })

export const getRules = (id: number, signal?: AbortSignal) => api<Rules>(`/files/${id}/rules`, { signal })

/** Sin reintentos automáticos: el 429/Retry-After lo maneja la cola de TileStore. */
export const getTile = (id: number, tr: number, tc: number, signal?: AbortSignal) =>
  api<TileDto>(`/files/${id}/tiles/${tr}/${tc}`, { signal, retries: 0 })

/** Un intento. Los reintentos (misma Idempotency-Key) los hace refine.ts. */
export const postRefinement = (id: number, body: RefineRequest, idempotencyKey: string) =>
  apiRequest<RefineResult>(`/files/${id}/refinements`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
    retries: 0,
  })
