import { endSession, getAccessToken, refreshAccessToken } from '../auth/tokens'
import { API_BASE_URL, BUILD_SHA } from './config'
import { ApiError, NetworkError, isRecord, parseRetryAfter } from './errors'
import { backoffMs, sleep } from './sleep'

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  method?: Method
  body?: unknown
  signal?: AbortSignal
  /** Cabeceras extra (Idempotency-Key, If-Match). */
  headers?: Record<string, string>
  /** false en rutas públicas (register/login). Default true. */
  auth?: boolean
  /**
   * Reintentos automáticos ante 503/429/red con Retry-After + espera creciente.
   * Default: 3 para GET, 0 para el resto (un POST/PATCH solo se reintenta si es seguro: lo decide quien llama).
   */
  retries?: number
}

export interface ApiResponse<T> {
  data: T
  status: number
  headers: Headers
}

/** Cliente HTTP único. Toda request lleva X-Lumon-Build. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = options.method ?? 'GET'
  const auth = options.auth ?? true
  const maxRetries = options.retries ?? (method === 'GET' ? 3 : 0)
  let refreshed = false

  for (let attempt = 0; ; attempt++) {
    const headers: Record<string, string> = { 'X-Lumon-Build': BUILD_SHA, ...options.headers }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'

    let tokenUsed: string | null = null
    if (auth) {
      tokenUsed = getAccessToken() ?? (await refreshAccessToken(null))
      headers.Authorization = `Bearer ${tokenUsed}`
    }

    let res: Response
    try {
      res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
      })
    } catch (error: unknown) {
      if (options.signal?.aborted) throw error
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt, null), options.signal)
        continue
      }
      throw new NetworkError()
    }

    if (res.ok) {
      const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T)
      return { data, status: res.status, headers: res.headers }
    }

    const parsed: unknown = await res.json().catch(() => null)
    const body = isRecord(parsed) ? parsed : {}
    const apiError = new ApiError({
      status: res.status,
      error: typeof body.error === 'string' ? body.error : `HTTP_${res.status}`,
      message: typeof body.message === 'string' ? body.message : `Error ${res.status}`,
      details: body.details ?? null,
      requestId: typeof body.requestId === 'string' ? body.requestId : res.headers.get('X-Request-Id'),
      retryAfter: parseRetryAfter(res.headers.get('Retry-After')),
      headers: res.headers,
    })

    if (res.status === 401 && auth) {
      // ÚNICO caso que justifica refresh: TOKEN_EXPIRED, y solo una vez por request.
      if (apiError.error === 'TOKEN_EXPIRED' && !refreshed) {
        refreshed = true
        await refreshAccessToken(tokenUsed)
        attempt-- // el reintento por refresh no consume reintentos de 503
        continue
      }
      if (apiError.error === 'TOKEN_INVALID' || apiError.error === 'SESSION_REVOKED') {
        endSession(apiError.error)
      }
      throw apiError
    }

    if ((res.status === 503 || res.status === 429) && attempt < maxRetries) {
      await sleep(backoffMs(attempt, apiError.retryAfter), options.signal)
      continue
    }

    throw apiError
  }
}

/** Atajo cuando solo interesa el cuerpo. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequest<T>(path, options)).data
}

/** Construye una query string omitiendo vacíos (la API ignora vacíos, pero así la URL queda limpia). */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  const s = sp.toString()
  return s ? `?${s}` : ''
}
