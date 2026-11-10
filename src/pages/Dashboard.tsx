import {Link} from 'react-router-dom'
import {Layout} from '../components/Layout'
import {useAuth} from '../context/AuthContext'

export function Dashboard(){
  const auth=useAuth()
  return <Layout><main className="mx-auto max-w-6xl px-5 py-10">
    <p className="text-sm uppercase tracking-[.35em] text-cyan-300">Checkpoint 1 · Orientación</p>
    <h1 className="mt-3 text-4xl font-bold">Bienvenido al piso</h1>
    <p className="mt-4 text-slate-300">{auth.user?.displayName || auth.user?.email || 'Refinador'} · {auth.team?.name || 'Cuadrilla'}</p>
    <section className="mt-8 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-sm text-slate-300">Equipo</h2><p className="mt-2 text-xl font-bold">{auth.team?.code || 'Por confirmar'}</p></div>
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-sm text-slate-300">Sesión</h2><p className="mt-2 text-xl font-bold text-green-400">Activa</p></div>
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-sm text-slate-300">Permisos</h2><p className="mt-2 text-xl font-bold">{auth.permissions.length}</p></div>
    </section>
    <h2 className="mt-10 text-2xl font-bold">Accesos disponibles</h2>
    <div className="mt-4 flex flex-wrap gap-3">
      {auth.can('files:read') && <Link className="rounded-lg bg-cyan-700 px-5 py-3 hover:bg-cyan-600" to="/files">Abrir archivos</Link>}
      <Link className="rounded-lg border border-slate-600 px-5 py-3 hover:bg-slate-800" to="/estado">Ver estado del sistema</Link>
    </div>
    <p className="mt-8 text-sm text-slate-400">Las acciones están habilitadas según el arreglo permissions devuelto por /auth/me, no según el nombre del rol.</p>
  </main></Layout>
}
