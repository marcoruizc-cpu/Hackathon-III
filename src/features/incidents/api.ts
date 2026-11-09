import { api, qs } from '../../lib/http'
import type { Page } from '../grid/dto'

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type Severity = (typeof SEVERITIES)[number]

export interface Incident {
  id: number
  title: string
  description: string
  severity: Severity
  fileId: number | null
  file: { id: number; name: string } | null
  photos: { mediaId: number; url: string; width: number; height: number }[]
  createdBy: { id: number; displayName: string }
  createdAt: string
}

export interface IncidentCreate {
  title: string
  description: string
  severity: Severity
  fileId?: number | null
  /** 1 a 3 imágenes INCIDENT confirmadas y sin usar */
  mediaIds: number[]
}

export const getIncidents = (page: number, size: number, signal?: AbortSignal) =>
  api<Page<Incident>>(`/incidents${qs({ page, size })}`, { signal })

/** Con caos puede dar 503 SIN guardar: el formulario y las fotos confirmadas sirven para reintentar. */
export const createIncident = (body: IncidentCreate) => api<Incident>('/incidents', { method: 'POST', body, retries: 2 })
