import { WS_BASE_URL } from '../../lib/config'
import { createEmitter } from '../../lib/emitter'
import { ApiError, isRecord } from '../../lib/errors'
import { api } from '../../lib/http'
import { backoffMs, sleep } from '../../lib/sleep'
import type { Cell } from '../grid/dto'

export interface FloorMember {
  userId: number
  displayName: string
  r: number | null
  c: number | null
}

export interface FloorClaim {
  claimId: string
  userId: number
  displayName: string
  cells: Cell[]
  expiresAt: string
}

export interface FloorState {
  connected: boolean
  members: Map<number, FloorMember>
  claims: Map<string, FloorClaim>
  /** Mi reserva actual (una por conexión). */
  myClaimId: string | null
  lastSeq: number | null
  /** Motivo si la conexión se detuvo definitivamente. */
  stoppedReason: string | null
}

export type ClaimReply =
  | { type: 'granted'; claim: FloorClaim }
  | { type: 'denied'; reason: 'HELD' | 'NOT_A_GROUP'; holder: { userId: number; displayName: string } | null }

const PING_EVERY_MS = 15_000 // el contrato exige < 20 s
const RENEW_EVERY_MS = 10_000 // la reserva vence a los 15 s
const CURSOR_MIN_GAP_MS = 120 // máximo 10 por segundo

/** Cierres que NO se reconectan (son errores nuestros o permisos). */
const FATAL_CLOSES = new Set([4400, 4403, 4404, 4423])

/**
 * Cliente del piso compartido (/floor/ws). Protocolo completo en Swagger → POST /floor/tickets.
 * - Ticket nuevo por conexión (30 s, un uso). Sin cabeceras ni token en la URL.
 * - ping cada 15 s; si no, el servidor cierra con 4408.
 * - `seq` de uno en uno: si hay salto → `resync` y se reconstruye desde `snapshot`.
 * - Reserva: claim → granted/denied (correlación por requestId); renew cada 10 s; release.
 */
export class FloorClient {
  readonly fileId: number
  readonly state: FloorState = {
    connected: false,
    members: new Map(),
    claims: new Map(),
    myClaimId: null,
    lastSeq: null,
    stoppedReason: null,
  }
  readonly changed = createEmitter<FloorState>()

  private ws: WebSocket | null = null
  private stopped = false
  private attempt = 0
  private ticketFailures = 0
  private pingTimer: ReturnType<typeof setInterval> | null = null
  private renewTimer: ReturnType<typeof setInterval> | null = null
  private lastCursorAt = 0
  private pendingCursor: Cell | null = null
  private cursorTimer: ReturnType<typeof setTimeout> | null = null
  private requestSeq = 0
  private pendingClaims = new Map<string, (reply: ClaimReply) => void>()

  constructor(fileId: number) {
    this.fileId = fileId
  }

  start() {
    this.stopped = false
    void this.connect()
  }

  stop() {
    this.stopped = true
    this.clearTimers()
    this.ws?.close(1000)
    this.ws = null
  }

  /** Mueve mi cursor (con límite de 10/s; manda el último valor). */
  moveCursor(r: number, c: number) {
    this.pendingCursor = { r, c }
    const wait = this.lastCursorAt + CURSOR_MIN_GAP_MS - Date.now()
    if (wait <= 0) this.flushCursor()
    else if (!this.cursorTimer) this.cursorTimer = setTimeout(() => this.flushCursor(), wait)
  }

  /** Reserva el grupo de esa celda. Resuelve con granted/denied. */
  claim(r: number, c: number): Promise<ClaimReply> {
    const requestId = `c-${++this.requestSeq}`
    return new Promise((resolve, reject) => {
      if (!this.send({ type: 'claim', requestId, r, c })) {
        reject(new Error('Sin conexión al piso.'))
        return
      }
      this.pendingClaims.set(requestId, resolve)
      setTimeout(() => {
        if (this.pendingClaims.delete(requestId)) reject(new Error('El servidor no respondió la reserva.'))
      }, 10_000)
    })
  }

  release() {
    if (this.state.myClaimId) this.send({ type: 'release', claimId: this.state.myClaimId })
    this.setMyClaim(null)
  }

  /** La reserva ya no es mía (refiné por HTTP, venció, etc.). */
  forgetMyClaim() {
    this.setMyClaim(null)
  }

  private async connect() {
    while (!this.stopped) {
      let ticket: string
      try {
        ticket = (await api<{ ticket: string }>('/floor/tickets', { method: 'POST', body: { fileId: this.fileId }, retries: 2 })).ticket
      } catch (error: unknown) {
        if (error instanceof ApiError && [401, 403, 404, 423].includes(error.status)) return this.halt(error.error)
        await sleep(backoffMs(this.attempt++, null))
        continue
      }
      const closeCode = await this.open(ticket)
      if (this.stopped) return
      if (FATAL_CLOSES.has(closeCode)) return
      if (closeCode === 4401) {
        if (++this.ticketFailures >= 2) return this.halt('TICKET_INVALID')
      } else this.ticketFailures = 0
      const wait = closeCode === 4429 ? 10_000 + Math.random() * 2000 : backoffMs(this.attempt++, null)
      await sleep(wait)
    }
  }

  /** Abre el socket y resuelve con el código de cierre. */
  private open(ticket: string): Promise<number> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`${WS_BASE_URL}/floor/ws?ticket=${encodeURIComponent(ticket)}`)
      this.ws = ws
      ws.onopen = () => {
        this.attempt = 0
        this.state.connected = true
        this.state.stoppedReason = null
        this.emit()
        this.pingTimer = setInterval(() => this.send({ type: 'ping', t: Date.now() }), PING_EVERY_MS)
      }
      ws.onmessage = (ev: MessageEvent) => {
        if (typeof ev.data !== 'string') return
        let msg: unknown
        try {
          msg = JSON.parse(ev.data)
        } catch {
          return
        }
        if (isRecord(msg)) this.handle(msg)
      }
      ws.onclose = (ev: CloseEvent) => {
        this.clearTimers()
        this.state.connected = false
        // Al cortarse, el servidor libera mis reservas: al reconectar hay que volver a pedirlas.
        this.state.myClaimId = null
        if (FATAL_CLOSES.has(ev.code)) this.state.stoppedReason = `${ev.code} ${ev.reason}`
        this.emit()
        for (const [, resolveClaim] of this.pendingClaims) resolveClaim({ type: 'denied', reason: 'HELD', holder: null })
        this.pendingClaims.clear()
        resolve(ev.code)
      }
    })
  }

  private handle(msg: Record<string, unknown>) {
    const type = msg.type
    const seq = typeof msg.seq === 'number' ? msg.seq : null

    if (type === 'snapshot') {
      this.state.members = new Map()
      for (const m of (msg.members as FloorMember[]) ?? []) this.state.members.set(m.userId, m)
      this.state.claims = new Map()
      for (const cl of (msg.claims as FloorClaim[]) ?? []) this.state.claims.set(cl.claimId, cl)
      this.state.lastSeq = seq
      return this.emit()
    }

    // Detección de pérdida: los mensajes con seq deben ir de uno en uno.
    if (seq !== null) {
      if (this.state.lastSeq !== null && seq !== this.state.lastSeq + 1) {
        this.send({ type: 'resync' })
        return
      }
      this.state.lastSeq = seq
    }

    switch (type) {
      case 'member.joined':
        this.state.members.set(msg.userId as number, { userId: msg.userId as number, displayName: String(msg.displayName), r: null, c: null })
        break
      case 'member.left':
        this.state.members.delete(msg.userId as number)
        break
      case 'cursor': {
        const m = this.state.members.get(msg.userId as number)
        if (m) this.state.members.set(m.userId, { ...m, r: msg.r as number, c: msg.c as number })
        break
      }
      case 'claim.granted': {
        const claim = msg as unknown as FloorClaim
        this.state.claims.set(claim.claimId, claim)
        this.setMyClaim(claim.claimId)
        this.pendingClaims.get(String(msg.requestId))?.({ type: 'granted', claim })
        this.pendingClaims.delete(String(msg.requestId))
        break
      }
      case 'claim.denied':
        this.pendingClaims.get(String(msg.requestId))?.({
          type: 'denied',
          reason: msg.reason as 'HELD' | 'NOT_A_GROUP',
          holder: (msg.holder as { userId: number; displayName: string } | null) ?? null,
        })
        this.pendingClaims.delete(String(msg.requestId))
        break
      case 'claim.updated': {
        const claim = msg as unknown as FloorClaim
        this.state.claims.set(claim.claimId, claim)
        break
      }
      case 'claim.released': {
        const id = String(msg.claimId)
        this.state.claims.delete(id)
        if (this.state.myClaimId === id) this.setMyClaim(null)
        break
      }
      case 'pong':
        break
    }
    this.emit()
  }

  private setMyClaim(claimId: string | null) {
    this.state.myClaimId = claimId
    if (this.renewTimer) clearInterval(this.renewTimer)
    this.renewTimer = null
    if (claimId) {
      this.renewTimer = setInterval(() => this.send({ type: 'renew', claimId }), RENEW_EVERY_MS)
    }
    this.emit()
  }

  private flushCursor() {
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.cursorTimer = null
    if (!this.pendingCursor) return
    this.lastCursorAt = Date.now()
    this.send({ type: 'cursor', r: this.pendingCursor.r, c: this.pendingCursor.c })
    this.pendingCursor = null
  }

  private send(message: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(JSON.stringify(message))
    return true
  }

  private halt(reason: string) {
    this.stopped = true
    this.state.stoppedReason = reason
    this.state.connected = false
    this.emit()
  }

  private clearTimers() {
    if (this.pingTimer) clearInterval(this.pingTimer)
    if (this.renewTimer) clearInterval(this.renewTimer)
    if (this.cursorTimer) clearTimeout(this.cursorTimer)
    this.pingTimer = null
    this.renewTimer = null
    this.cursorTimer = null
  }

  private emit() {
    this.changed.emit(this.state)
  }
}
