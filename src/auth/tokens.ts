import { API_BASE_URL, BUILD_SHA } from '../lib/config'
import { createEmitter } from '../lib/emitter'
import { ApiError, NetworkError, isRecord } from '../lib/errors'
import type { TokenPair } from './dto'

/**
 * Tokens de la sesión.
 * - accessToken: SOLO en memoria (lo exige el contrato). Se pierde al recargar → se recupera con refresh.
 * - refreshToken: localStorage, para sobrevivir a la recarga y compartirse entre pestañas.
 *   Es de UN SOLO USO: usar uno ya usado revoca la sesión (REFRESH_REUSED). Por eso:
 *     1) en la pestaña, un solo refresh en vuelo (promesa compartida);
 *     2) entre pestañas, Web Locks (`navigator.locks`) serializa el refresh y
 *        BroadcastChannel reparte el par nuevo a las demás pestañas.
 */
const RT_KEY = 'lumon.refreshToken'
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon-auth') : null

type AuthMessage = { type: 'tokens'; accessToken: string } | { type: 'ended'; reason: SessionEndReason }

export type SessionEndReason = 'LOGOUT' | 'REFRESH_REUSED' | 'REFRESH_INVALID' | 'SESSION_REVOKED' | 'TOKEN_INVALID'

let accessToken: string | null = null
let inFlight: Promise<string> | null = null

/** Avisa a la app (SessionContext) que la sesión terminó: volver al login. */
export const sessionEnded = createEmitter<SessionEndReason>()

channel?.addEventListener('message', (ev: MessageEvent<AuthMessage>) => {
  const msg = ev.data
  if (msg.type === 'tokens') accessToken = msg.accessToken
  if (msg.type === 'ended') {
    accessToken = null
    sessionEnded.emit(msg.reason)
  }
})

export function getAccessToken(): string | null {
  return accessToken
}

export function hasRefreshToken(): boolean {
  return localStorage.getItem(RT_KEY) !== null
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(RT_KEY)
}

export function setTokens(pair: TokenPair): void {
  accessToken = pair.accessToken
  localStorage.setItem(RT_KEY, pair.refreshToken)
  channel?.postMessage({ type: 'tokens', accessToken: pair.accessToken } satisfies AuthMessage)
}

/** Borra todo y avisa a esta pestaña y a las demás. */
export function endSession(reason: SessionEndReason): void {
  accessToken = null
  localStorage.removeItem(RT_KEY)
  channel?.postMessage({ type: 'ended', reason } satisfies AuthMessage)
  sessionEnded.emit(reason)
}

async function callRefresh(refreshToken: string): Promise<TokenPair> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': BUILD_SHA },
      body: JSON.stringify({ refreshToken }),
    })
  } catch {
    throw new NetworkError()
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const data = isRecord(body) ? body : {}
    throw new ApiError({
      status: res.status,
      error: typeof data.error === 'string' ? data.error : `HTTP_${res.status}`,
      message: typeof data.message === 'string' ? data.message : 'No se pudo renovar la sesión.',
      details: data.details ?? null,
      requestId: typeof data.requestId === 'string' ? data.requestId : null,
      retryAfter: null,
      headers: res.headers,
    })
  }
  return body as TokenPair
}

/**
 * Devuelve un access token válido renovándolo UNA sola vez aunque lo pidan muchas requests/pestañas.
 * @param expired el token con el que falló la request (null si no había ninguno, p. ej. tras recargar).
 */
export function refreshAccessToken(expired: string | null): Promise<string> {
  if (inFlight) return inFlight

  const run = async (): Promise<string> => {
    // Otra pestaña (o una request anterior) ya renovó mientras esperábamos el lock.
    if (accessToken && accessToken !== expired) return accessToken
    const rt = localStorage.getItem(RT_KEY)
    if (!rt) {
      endSession('REFRESH_INVALID')
      throw new ApiError({ status: 401, error: 'REFRESH_INVALID', message: 'No hay sesión.', details: null, requestId: null, retryAfter: null, headers: null })
    }
    try {
      const pair = await callRefresh(rt)
      setTokens(pair)
      return pair.accessToken
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        const reason: SessionEndReason =
          error.error === 'REFRESH_REUSED' || error.error === 'SESSION_REVOKED' ? error.error : 'REFRESH_INVALID'
        endSession(reason)
      }
      throw error // NetworkError: no se borra nada; se puede reintentar.
    }
  }

  const locked: Promise<string> =
    typeof navigator !== 'undefined' && navigator.locks
      ? navigator.locks.request('lumon-refresh', run)
      : run()

  inFlight = locked.finally(() => {
    inFlight = null
  })
  return inFlight
}
