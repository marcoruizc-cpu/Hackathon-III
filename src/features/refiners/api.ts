import { ApiError, apiRequest, apiRequestWithHeaders } from '../../lib/session'
import type { Page } from '../grid/dto'

// Contratos de Swagger — tag Expedientes (Piso de Pruebas).
export interface Department {
  id: number
  code: string
  name: string
}

export interface Refiner {
  id: number
  fullName: string
  department: Department
  title: string
  extension: string
  /** Texto del exterior: mostrar SIEMPRE como texto (React lo escapa; nunca dangerouslySetInnerHTML). */
  bio: string
  profileUrl: string | null
  badge: { url: string; width: number; height: number } | null
  version: number
  updatedAt: string
}

export interface RefinerPatch {
  title?: string
  extension?: string
  bio?: string
  departmentId?: number
  badgeMediaId?: number | null
}

export const getDepartments = (signal?: AbortSignal) => apiRequest<Department[]>('/departments', { signal })

export const getRefiners = (p: { page: number; size: number; departmentId: string; q: string }, signal?: AbortSignal) =>
  apiRequest<Page<Refiner>>(`/refiners?${new URLSearchParams({ page:String(p.page), size:String(p.size), departmentId:p.departmentId, q:p.q })}`, { signal })

/** Devuelve el expediente y su ETag (lo necesita el PATCH). */
export async function getRefiner(id: number, signal?: AbortSignal): Promise<{ refiner: Refiner; etag: string }> {
  const res = await apiRequestWithHeaders<Refiner>(`/refiners/${id}`, { signal })
  const etag = res.headers.get('ETag')
  if (!etag) throw new Error('Lumon no expuso la cabecera ETag del expediente. Comprueba la respuesta y CORS.')
  return { refiner: res.data, etag }
}

export type PatchOutcome =
  | { kind: 'ok'; refiner: Refiner; etag: string }
  | { kind: 'conflict'; current: Refiner; etag: string }

/**
 * PATCH con control de versión (Regla de Milchick). If-Match = ETag EXACTO leído.
 * 412 VERSION_CONFLICT → devuelve la versión actual para mostrar el conflicto y reintentar con el ETag nuevo.
 */
export async function patchRefiner(id: number, patch: RefinerPatch, etag: string): Promise<PatchOutcome> {
  try {
    const res = await apiRequestWithHeaders<Refiner>(`/refiners/${id}`, { method: 'PATCH', body: JSON.stringify(patch), headers: { 'If-Match': etag } })
    const nextEtag = res.headers.get('ETag')
    if (nextEtag) return { kind: 'ok', refiner: res.data, etag: nextEtag }
    const latest = await getRefiner(id)
    return { kind: 'ok', refiner: latest.refiner, etag: latest.etag }
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 412 && error.code === 'VERSION_CONFLICT') {
      const details = error.details
      if (!details || typeof details !== 'object' || !('current' in details)) throw error
      const current = (details as {current: Refiner}).current
      const updatedEtag = error.responseHeaders?.get('ETag')
      if (!updatedEtag) throw new Error('El servidor reportó conflicto sin ETag; vuelve a consultar el expediente.')
      return { kind: 'conflict', current, etag: updatedEtag }
    }
    throw error
  }
}

/** Solo se enlaza si es http(s): el texto viene del exterior. */
export function safeHttpUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch {
    return null
  }
}
