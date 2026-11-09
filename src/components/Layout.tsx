import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { Can } from '../auth/guards'
import { useSession } from '../auth/SessionContext'
import { startEventStream, streamStatus } from '../features/realtime/events'
import { Button } from './ui'

const link = ({ isActive }: { isActive: boolean }) => (isActive ? 'text-emerald-400' : 'text-slate-300 hover:text-white')

export function Layout() {
  const { me, signOut } = useSession()
  const [stream, setStream] = useState<string>('stopped')
  const granted = me?.clearance.granted ?? false

  // Stream de eventos solo con el Piso de Pruebas abierto (antes responde 423).
  useEffect(() => {
    if (!granted) return
    const offStatus = streamStatus.subscribe(setStream)
    const stop = startEventStream()
    return () => {
      stop()
      offStatus()
    }
  }, [granted])

  return (
    <div className="min-h-screen">
      <header className="flex flex-wrap items-center gap-4 border-b border-slate-800 px-4 py-3">
        <span className="font-bold">Lumon MDR</span>
        <nav className="flex gap-4 text-sm">
          <NavLink to="/" end className={link}>
            Inicio
          </NavLink>
          <NavLink to="/estado" className={link}>
            Estado
          </NavLink>
          <Can permission="files:read">
            <NavLink to="/files" className={link}>
              Archivos
            </NavLink>
          </Can>
        </nav>
        <span className="ml-auto text-xs text-slate-400">
          {me?.displayName} · {me?.team.code} · Piso {granted ? 'abierto' : 'cerrado'} · stream {stream}
        </span>
        <Button variant="secondary" onClick={() => void signOut()}>
          Salir
        </Button>
      </header>
      <Outlet />
    </div>
  )
}
