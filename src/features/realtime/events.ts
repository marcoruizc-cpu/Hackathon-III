import { API_BASE_URL } from '../../lib/config'
import { createEmitter } from '../../lib/emitter'
import { ApiError, apiRequest, getSessionSnapshot, revokeSession } from '../../lib/session'
import { backoffMs, sleep } from '../../lib/sleep'

export const EVENT_TYPES = [
  'refiner.updated', 'refinement.created', 'file.completed',
  'contingency.activated', 'contingency.resolved', 'session.revoked',
  'stream.reset', 'stream.superseded',
] as const
export type EventType = (typeof EVENT_TYPES)[number]
export interface LumonEvent { type: EventType; id: number | null; data: unknown }
export type StreamState = 'connecting' | 'open' | 'reconnecting' | 'stopped' | 'follower'
export const lumonEvents = createEmitter<LumonEvent>()
export const streamStatus = createEmitter<StreamState>()
let state: StreamState = 'stopped'
export const currentStreamStatus = () => state
function setStatus(next: StreamState) { state = next; streamStatus.emit(next) }

const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lumon-events-v2') : null
let lastEventId: number | null = null
const seenIds = new Set<number>()
const known = new Set<string>(EVENT_TYPES)

function deliver(event: LumonEvent) {
  if (event.id !== null) {
    if (seenIds.has(event.id)) return
    seenIds.add(event.id)
    if (seenIds.size > 1200) {
      const first = seenIds.values().next().value
      if (first !== undefined) seenIds.delete(first)
    }
    lastEventId = Math.max(lastEventId ?? 0, event.id)
  }
  if (event.type === 'session.revoked') revokeSession('Sesión revocada por Lumon.')
  lumonEvents.emit(event)
}

type TabMessage = { team: string; userId: number; event: LumonEvent }
channel?.addEventListener('message', (message: MessageEvent<TabMessage>) => {
  const data = message.data
  const session = getSessionSnapshot()
  if (!data || data.team !== session.team?.code || data.userId !== session.user?.id) return
  if (data.event && known.has(data.event.type)) deliver(data.event)
})

class Superseded extends Error {}

/** SSE por fetch nativo: permite detectar los comentarios de heartbeat que EventSource oculta. */
async function readEvents(ticket: string, signal: AbortSignal): Promise<void> {
  const params = new URLSearchParams({ ticket })
  if (lastEventId !== null) params.set('lastEventId', String(lastEventId))
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal.addEventListener('abort', onAbort, { once: true })
  let lastByte = Date.now()
  const watchdog = window.setInterval(() => {
    if (Date.now() - lastByte > 45_000) controller.abort()
  }, 2000)
  try {
    // El stream se autentica SOLO con ticket: no se envía Authorization ni el access token.
    const response = await fetch(`${API_BASE_URL}/events/stream?${params}`, {
      signal: controller.signal,
      headers: { Accept: 'text/event-stream' },
      cache: 'no-store',
    })
    if (!response.ok || !response.body) throw new Error(`SSE HTTP ${response.status}`)
    setStatus('open')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (!controller.signal.aborted) {
      const { value, done } = await reader.read()
      if (done) break
      lastByte = Date.now() // incluye comentarios de heartbeat
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        const block = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)
        let type = 'message'
        let id: number | null = null
        const payload: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim()
          if (line.startsWith('id:')) {
            const v = Number(line.slice(3).trim())
            if (Number.isSafeInteger(v) && v >= 0) id = v
          }
          if (line.startsWith('data:')) payload.push(line.slice(5).trimStart())
        }
        if (known.has(type) && payload.length) {
          const raw = payload.join('\n')
          let data: unknown = raw
          try { data = JSON.parse(raw) as unknown } catch { /* texto recibido */ }
          const event = { type: type as EventType, id, data }
          deliver(event)
          const session = getSessionSnapshot()
          if (session.team?.code && session.user?.id != null) {
            channel?.postMessage({ team: session.team.code, userId: session.user.id, event } satisfies TabMessage)
          }
          if (type === 'stream.superseded' || type === 'session.revoked') throw new Superseded()
        }
        boundary = buffer.indexOf('\n\n')
      }
    }
  } finally {
    clearInterval(watchdog)
    controller.abort()
    signal.removeEventListener('abort', onAbort)
  }
}

async function runLeader(signal: AbortSignal) {
  let attempt = 0
  while (!signal.aborted) {
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting')
    try {
      const ticketResponse = await apiRequest<{ ticket: string }>('/events/tickets', { method: 'POST', signal })
      if (!ticketResponse.ticket) throw new Error('Lumon no devolvió el ticket SSE')
      await readEvents(ticketResponse.ticket, signal)
      attempt = 0
    } catch (error) {
      if (signal.aborted) break
      if (error instanceof Superseded) break
      if (error instanceof ApiError && [401, 403, 423].includes(error.status)) break
    }
    if (!signal.aborted) await sleep(backoffMs(attempt++, null), signal).catch(() => undefined)
  }
  setStatus('stopped')
}

/** Un solo stream para todas las pestañas de la misma sesión; el lock elige líder. */
export function startEventStream(): () => void {
  const controller = new AbortController()
  if (navigator.locks) {
    setStatus('follower')
    void navigator.locks.request('lumon-sse-v2', { signal: controller.signal }, () => runLeader(controller.signal))
      .catch(() => undefined)
  } else {
    void runLeader(controller.signal)
  }
  return () => { controller.abort(); setStatus('stopped') }
}
