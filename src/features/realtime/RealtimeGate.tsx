import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ApiError, apiRequest } from '../../lib/session'
import { currentStreamStatus, lumonEvents, startEventStream, streamStatus, type StreamState } from './events'

interface Incident { id: number; description: string }
const resolvedChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('lumon-contingency-resolved') : null

function ContingencyDialog({ event }: { event: Incident }) {
  const button = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    const old = document.activeElement instanceof HTMLElement ? document.activeElement : null
    button.current?.focus()
    return () => old?.focus()
  }, [])
  async function acknowledge() {
    setBusy(true)
    setError('')
    try {
      await apiRequest<unknown>(`/contingency/${event.id}/ack`, { method: 'POST' })
      resolvedChannel?.postMessage(event.id)
      setFinished(true)
    } catch (err) {
      setError(err instanceof ApiError ? `${err.code}: ${err.message}` : 'No se pudo confirmar la contingencia.')
    } finally { setBusy(false) }
  }
  // El cierre solo ocurre después de una confirmación exitosa ante Lumon.
  if (finished) return null
  const trap = (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key === 'Escape') ev.preventDefault()
    if (ev.key === 'Tab') { ev.preventDefault(); button.current?.focus() }
  }
  return <div role="presentation" className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-4">
    <div role="alertdialog" aria-modal="true" aria-labelledby="contingency-title" aria-describedby="contingency-description"
      onKeyDown={trap} className="w-full max-w-xl rounded-2xl border-2 border-amber-500 bg-slate-900 p-7 shadow-2xl">
      <p className="text-sm font-bold uppercase text-amber-300">Atención · Lumon</p>
      <h2 id="contingency-title" className="mt-2 text-2xl font-bold text-white">Contingencia activada</h2>
      <p id="contingency-description" className="mt-4 text-slate-100">{event.description}</p>
      <p className="mt-2 text-xs text-slate-300">Debes confirmar este aviso para continuar trabajando.</p>
      {error && <p role="alert" className="mt-3 text-red-300">{error}</p>}
      <button ref={button} type="button" disabled={busy} onClick={() => void acknowledge()}
        className="mt-6 rounded-lg bg-amber-500 px-5 py-3 font-bold text-black disabled:opacity-60">
        {busy ? 'Confirmando…' : 'Confirmar contingencia'}
      </button>
    </div>
  </div>
}

/** Se monta una vez dentro de AuthProvider, no en cada pantalla. */
export function RealtimeGate() {
  const auth = useAuth()
  const [stream, setStream] = useState<StreamState>(currentStreamStatus())
  const [incident, setIncident] = useState<Incident | null>(null)
  useEffect(() => streamStatus.subscribe(setStream), [])
  useEffect(() => {
    if (auth.status !== 'authenticated') { setIncident(null); return }
    return startEventStream()
  }, [auth.status])
  useEffect(() => lumonEvents.subscribe(event => {
    if (event.type === 'contingency.activated') {
      const data = event.data
      if (!data || typeof data !== 'object' || Array.isArray(data)) return
      const row = data as Record<string, unknown>
      // Si Lumon incluye userId, nunca mostramos una alerta destinada a otro refinador.
      if (typeof row.userId === 'number' && row.userId !== auth.user?.id) return
      const rawId = row.id ?? row.contingencyId
      const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && rawId.trim() ? Number(rawId) : NaN
      if (!Number.isSafeInteger(id)) return
      const description = typeof row.message === 'string' ? row.message : 'Horas extra asignadas. Confirma la notificación.'
      setIncident({ id, description })
    }
    if (event.type === 'contingency.resolved') {
      const data = event.data
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        const row = data as Record<string, unknown>
        const rawId = row.id ?? row.contingencyId
        const id = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && rawId.trim() ? Number(rawId) : NaN
        if (Number.isSafeInteger(id)) setIncident(old => old?.id === id ? null : old)
      }
    }
  }), [auth.user?.id])
  useEffect(() => {
    const handler = (ev: MessageEvent<number>) => setIncident(old => old?.id === ev.data ? null : old)
    resolvedChannel?.addEventListener('message', handler)
    return () => resolvedChannel?.removeEventListener('message', handler)
  }, [])
  if (auth.status !== 'authenticated') return null
  return <>
    <div className="fixed bottom-2 right-2 z-20 rounded-md bg-slate-900/90 px-2 py-1 text-xs text-slate-300" role="status">
      Eventos: {stream}
    </div>
    {incident && <ContingencyDialog key={incident.id} event={incident} />}
  </>
}
