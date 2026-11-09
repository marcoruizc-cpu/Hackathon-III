import { ApiError } from '../../lib/errors'
import { api, apiRequest, qs } from '../../lib/http'
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

export const getDepartments = (signal?: AbortSignal) => api<Department[]>('/departments', { signal })

export const getRefiners = (p: { page: number; size: number; departmentId: string; q: string }, signal?: AbortSignal) =>
  api<Page<Refiner>>(`/refiners${qs({ page: p.page, size: p.size, departmentId: p.departmentId, q: p.q })}`, { signal })

/** Devuelve el expediente y su ETag (lo necesita el PATCH). */
export async function getRefiner(id: number, signal?: AbortSignal): Promise<{ refiner: Refiner; etag: string }> {
  const res = await apiRequest<Refiner>(`/refiners/${id}`, { signal })
  return { refiner: res.data, etag: res.headers.get('ETag') ?? `"${res.data.version}"` }
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
    const res = await apiRequest<Refiner>(`/refiners/${id}`, { method: 'PATCH', body: patch, headers: { 'If-Match': etag } })
    return { kind: 'ok', refiner: res.data, etag: res.headers.get('ETag') ?? `"${res.data.version}"` }
  } catch (error: unknown) {
    if (error instanceof ApiError && error.status === 412 && error.error === 'VERSION_CONFLICT') {
      const current = (error.details as { current: Refiner }).current
      return { kind: 'conflict', current, etag: error.headers?.get('ETag') ?? `"${current.version}"` }
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
