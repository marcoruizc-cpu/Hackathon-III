/** Formato de error de Lumon: { error, message, details, timestamp, path, requestId }. Se decide por `error`. */
export class ApiError extends Error {
  readonly status: number
  readonly error: string
  readonly details: unknown
  readonly requestId: string | null
  /** Segundos de Retry-After (429/503), si vino. */
  readonly retryAfter: number | null
  readonly headers: Headers | null

  constructor(init: {
    status: number
    error: string
    message: string
    details: unknown
    requestId: string | null
    retryAfter: number | null
    headers: Headers | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.error = init.error
    this.details = init.details
    this.requestId = init.requestId
    this.retryAfter = init.retryAfter
    this.headers = init.headers
  }
}

/** Error de red (sin respuesta HTTP). */
export class NetworkError extends Error {
  constructor(message = 'Sin conexión con la API.') {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function errorMessage(error: unknown, fallback = 'Ocurrió un error.'): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

/** details.fields de VALIDATION_ERROR → { campo: mensaje } */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !isRecord(error.details)) return {}
  const out: Record<string, string> = {}
  const fields = error.details.fields
  if (isRecord(fields)) {
    for (const [k, v] of Object.entries(fields)) if (typeof v === 'string') out[k] = v
  }
  // 409 EMAIL_TAKEN / TEAM_NAME_TAKEN traen { field }
  if (typeof error.details.field === 'string') out[error.details.field] = error.message
  return out
}

export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}
