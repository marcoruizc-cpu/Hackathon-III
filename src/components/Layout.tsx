import type {ReactNode} from 'react'
import {Link,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {ApiError} from '../lib/session'
import {useState} from 'react'

export function Layout({children}:{children:ReactNode}) {
  const auth=useAuth()
  const navigate=useNavigate()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function onLogout(){
    setBusy(true);setError('')
    try {await auth.logout()} catch(err) {
      setError(err instanceof ApiError ? `Logout local realizado, pero el servidor respondió: ${err.message}` : 'No se pudo confirmar el cierre de sesión en el servidor.')
    } finally {setBusy(false);navigate('/login',{replace:true})}
  }
  return <div className="min-h-screen bg-slate-950 text-slate-50">
    <header className="border-b border-slate-800 bg-slate-900/90">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Link to="/dashboard" className="text-xl font-bold tracking-widest text-cyan-300">LUMON · MDR</Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link className="hover:text-cyan-300" to="/dashboard">Inicio</Link>
          {auth.can('files:read') && <Link className="hover:text-cyan-300" to="/files">Archivos</Link>}
          {auth.can('refiners:read') && <Link className="hover:text-cyan-300" to="/refiners">Expedientes</Link>}
          <Link className="hover:text-cyan-300" to="/estado">Estado</Link>
          <button disabled={busy} onClick={()=>void onLogout()} className="rounded-lg border border-slate-500 px-3 py-2 hover:bg-slate-800 disabled:opacity-50">Cerrar sesión</button>
        </nav>
      </div>
    </header>
    {error && <p role="alert" className="mx-auto max-w-6xl px-5 py-3 text-amber-300">{error}</p>}
    {children}
  </div>
}
