import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { checkHealth } from '../lib/session'

export function HealthGate({ children }: {children: ReactNode}) {
  const [state, setState] = useState<'checking'|'ready'|'offline'>('checking')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    void checkHealth(controller.signal).then(() => setState('ready')).catch(() => {
      if (controller.signal.aborted) return
      setState('offline')
      timer = setTimeout(() => setAttempt(v => v+1), Math.min(1000 * 2 ** Math.min(attempt,5),30000))
    })
    return () => {controller.abort();if (timer) clearTimeout(timer)}
  },[attempt])
  if (state === 'ready') return <>{children}</>
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-100">
    <section role="status" aria-live="polite" className="max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 text-center">
      <h1 className="text-2xl font-bold">Conectando con Lumon…</h1>
      <p className="mt-3 text-slate-300">{state === 'checking' ? 'Verificando el servicio.' : 'La API no responde. Reintentaremos automáticamente.'}</p>
      {state === 'offline' && <button className="mt-6 rounded-lg bg-cyan-600 px-5 py-2 font-medium hover:bg-cyan-500" onClick={() => {setState('checking');setAttempt(v=>v+1)}}>Reintentar ahora</button>}
    </section>
  </main>
}
