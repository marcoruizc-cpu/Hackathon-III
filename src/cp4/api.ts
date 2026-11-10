import { ApiError, apiRequest } from '../lib/session'
import type { Department, Refiner, RefinerPatch } from '../features/refiners/api'
import type { Page } from '../features/grid/dto'

export type { Department, Refiner, RefinerPatch }
export function safeHttpUrl(value: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export interface RefinerSnapshot {
  refiner: Refiner
  etag: string
}

export const getDepartments = (signal: AbortSignal) => apiRequest<Department[]>('/departments', { signal })

export function getRefiners(page: number, size: number, department: string, query: string, signal: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: String(size) })
  if (department) params.set('departmentId', department)
  if (query.trim()) params.set('q', query.trim())
  return apiRequest<Page<Refiner>>('/refiners?' + params, { signal })
}

export async function getRefiner(id: number, signal: AbortSignal): Promise<RefinerSnapshot> {
  let etag: string | null = null
  const refiner = await apiRequest<Refiner>('/refiners/' + id, { signal }, headers => { etag = headers.get('ETag') })
  if (!etag) throw new Error('Lumon no expuso la cabecera ETag del expediente.')
  return { refiner, etag }
}

export async function patchRefiner(id: number, patch: RefinerPatch, etag: string, signal: AbortSignal) {
  let responseTag: string | null = null
  try {
    const refiner = await apiRequest<Refiner>('/refiners/' + id, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: { 'If-Match': etag },
      signal,
    }, headers => { responseTag = headers.get('ETag') })
    return { kind: 'saved' as const, snapshot: { refiner, etag: responseTag ?? '' } }
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 412 || error.code !== 'VERSION_CONFLICT') throw error
    const current = (error.details as { current?: Refiner } | null)?.current
    const snapshot = current && responseTag ? { refiner: current, etag: responseTag } : await getRefiner(id, signal)
    return { kind: 'conflict' as const, snapshot }
  }
}

export function describeError(error: unknown) {
  if (!(error instanceof ApiError)) return error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
  const fields = (error.details as { fields?: Record<string, string> } | null)?.fields
  const validation = fields ? ' ' + Object.values(fields).join(' ') : ''
  if (error.code === 'CLEARANCE_REQUIRED') return 'El Piso de Pruebas está cerrado. Revisa el clearance en Estado.'
  if (error.code === 'STORAGE_NOT_VERIFIED') return 'Lumon aún no ha verificado Supabase para este equipo.'
  const wait = error.retryAfter === null ? '' : ' Reintenta en ' + error.retryAfter + ' s.'
  return error.message + validation + wait
}
