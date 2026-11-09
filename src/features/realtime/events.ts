import { endSession } from '../../auth/tokens'
import { API_BASE_URL } from '../../lib/config'
import { createEmitter } from '../../lib/emitter'
import { ApiError } from '../../lib/errors'
import { api } from '../../lib/http'
import { backoffMs, sleep } from '../../lib/sleep'

/** Tipos de evento del stream (Swagger, "Stream de eventos (SSE)"). */
export const EVENT_TYPES = [
  'refiner.updated',
  'refinement.created',
  'file.completed',
  'contingency.activated',
  'contingency.resolved',
  'session.revoked',
  'stream.reset',
  'stream.superseded',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

export interface LumonEvent {
  type: EventType
  /** id del evento (null en stream.superseded) */
  id: number | null
  data: unknown
}

/** Todo evento recibido (de este stream o reenviado por la pestaña líder) pasa por aquí. */
export const lumonEvents = createEmitter<LumonEvent>()
/** Estado de la conexión para la UI. */
export const streamStatus = createEmitter<'connecting' | 'open' | 'reconnecting' | 'stopped' | 'follower'>()

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('lumon-events') : null
const HEARTBEAT_TIMEOUT_MS = 45_000

let lastEventId: number | null = null
const seenIds = new Set<number>()

function deliver(ev: LumonEvent) {
  if (ev.id !== null) {
    if (seenIds.has(ev.id)) return // duplicado (mismo id)
    seenIds.add(ev.id)
    if (seenIds.size > 2000) {
      const first = seenIds.values().next().value
      if (first !== undefined) seenIds.delete(first)
    }
    lastEventId = Math.max(lastEventId ?? 0, ev.id)
  }
  if (ev.type === 'session.revoked') endSession('SESSION_REVOKED')
  lumonEvents.emit(ev)
}

channel?.addEventListener('message', (m: MessageEvent<LumonEvent>) => deliver(m.data))

/**
 * Conexión SSE de UNA pestaña (la líder). El ticket es de un solo uso, así que la reconexión
 * automática de EventSource no sirve: ante error/cierre, se cierra, se pide ticket nuevo y se
 * reconecta con espera creciente enviando lastEventId.
 * Nota: EventSource no expone los comentarios ": hb"; el vigilante de 45 s cuenta eventos y
 * reconecta si no llega nada (con lastEventId no se pierde nada).
 */
async function runStream(signal: AbortSignal): Promise<void> {
  let attempt = 0
  while (!signal.aborted) {
    streamStatus.emit(attempt === 0 ? 'connecting' : 'reconnecting')
    let ticket: string
    try {
      ticket = (await api<{ ticket: string; expiresIn: number }>('/events/tickets', { method: 'POST', retries: 2, signal })).ticket
    } catch (error: unknown) {
      if (signal.aborted) return
      if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 423)) {
        streamStatus.emit('stopped')
        return // sesión inválida o Piso de Pruebas cerrado: no insistir
      }
      await sleep(backoffMs(attempt++, null), signal).catch(() => undefined)
      continue
    }

    const reason = await new Promise<'error' | 'superseded' | 'aborted' | 'dead'>((resolve) => {
      const params = new URLSearchParams({ ticket })
      if (lastEventId !== null) params.set('lastEventId', String(lastEventId))
      const es = new EventSource(`${API_BASE_URL}/events/stream?${params.toString()}`)
      let watchdog = setTimeout(() => finish('dead'), HEARTBEAT_TIMEOUT_MS)
      const bump = () => {
        clearTimeout(watchdog)
        watchdog = setTimeout(() => finish('dead'), HEARTBEAT_TIMEOUT_MS)
      }
      function finish(r: 'error' | 'superseded' | 'aborted' | 'dead') {
        clearTimeout(watchdog)
        es.close()
        signal.removeEventListener('abort', onAbort)
        resolve(r)
      }
      const onAbort = () => finish('aborted')
      signal.addEventListener('abort', onAbort, { once: true })

      es.onopen = () => {
        attempt = 0
        bump()
        streamStatus.emit('open')
      }
      es.onerror = () => finish('error')
      for (const type of EVENT_TYPES) {
        es.addEventListener(type, (raw: MessageEvent<string>) => {
          bump()
          let data: unknown = null
          try {
            data = JSON.parse(raw.data)
          } catch {
            data = raw.data
          }
          const id = raw.lastEventId ? Number(raw.lastEventId) : null
          const ev: LumonEvent = { type, id: Number.isFinite(id) ? id : null, data }
          deliver(ev)
          channel?.postMessage(ev) // reparte a las demás pestañas
          if (type === 'stream.superseded') finish('superseded')
          if (type === 'session.revoked') finish('aborted')
        })
      }
    })

    if (reason === 'aborted' || reason === 'superseded' || signal.aborted) {
      streamStatus.emit('stopped')
      return
    }
    await sleep(backoffMs(attempt++, null), signal).catch(() => undefined)
  }
}

/**
 * Arranca el stream con elección de líder: solo la pestaña que tiene el Web Lock "lumon-sse"
 * abre la conexión (una conexión por sesión); las demás reciben por BroadcastChannel.
 * Devuelve una función para detenerlo (logout / desmontar).
 */
export function startEventStream(): () => void {
  const controller = new AbortController()
  if (typeof navigator !== 'undefined' && navigator.locks) {
    streamStatus.emit('follower')
    void navigator.locks
      .request('lumon-sse', { signal: controller.signal }, () => runStream(controller.signal))
      .catch(() => undefined)
  } else {
    void runStream(controller.signal)
  }
  return () => controller.abort()
}
