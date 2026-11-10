import {useState} from 'react'
import type {FormEvent} from 'react'
import {Link,Navigate,useNavigate} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {ApiError} from '../lib/session'

/**
 * Error del servidor para un campo (Swagger):
 * - 400 VALIDATION_ERROR → details.fields = { campo: mensaje }
 * - 409 EMAIL_TAKEN / TEAM_NAME_TAKEN → details.field = "email" | "teamName" (el texto viene en message)
 */
function fieldMessage(error: ApiError | null, field: string): string | null {
  if (!error || !error.details || typeof error.details !== 'object') return null
  const details = error.details as Record<string, unknown>
  const fields = details.fields
  if (fields && typeof fields === 'object') {
    const value = (fields as Record<string, unknown>)[field]
    if (typeof value === 'string') return value
  }
  if (details.field === field) return error.message
  return null
}
export function Register(){
  const auth=useAuth();const navigate=useNavigate()
  const [teamName,setTeamName]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState<ApiError|null>(null)
  const [busy,setBusy]=useState(false)
  if(auth.status==='loading') return <main className="min-h-screen bg-slate-950 p-8 text-center text-white" role="status">Restaurando sesión…</main>
  if(auth.status==='authenticated') return <Navigate to="/dashboard" replace />
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError(null);setBusy(true)
    try {await auth.register(teamName.trim(),email.trim(),password);navigate('/dashboard',{replace:true})}
    catch(err){setError(err instanceof ApiError ? err : new ApiError(0,'UNKNOWN','No pudimos registrar la cuadrilla.'))}
    finally{setBusy(false)}
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
    <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8">
      <p className="text-xs uppercase tracking-[.5em] text-cyan-300">Orientación · CP1</p>
      <h1 className="mt-3 text-3xl font-bold">Registrar cuadrilla</h1>
      <p className="mt-2 text-sm text-slate-300">Si tu equipo ya está registrado, entra por Login. No crees otra cuenta de equipo.</p>
      {error && <p role="alert" className="mt-5 rounded-lg border border-amber-700 bg-amber-950 p-3 text-amber-200">{error.message}</p>}
      <form className="mt-6 space-y-4" onSubmit={e=>void submit(e)}>
        <label className="block text-sm" htmlFor="team">Nombre de cuadrilla
          <input id="team" required value={teamName} onChange={e=>setTeamName(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3"/>
          {fieldMessage(error,'teamName') && <span className="text-amber-200">{fieldMessage(error,'teamName')}</span>}
        </label>
        <label className="block text-sm" htmlFor="email">Correo
          <input id="email" type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3"/>
          {fieldMessage(error,'email') && <span className="text-amber-200">{fieldMessage(error,'email')}</span>}
        </label>
        <label className="block text-sm" htmlFor="password">Contraseña
          <input id="password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3"/>
          {fieldMessage(error,'password') && <span className="text-amber-200">{fieldMessage(error,'password')}</span>}
        </label>
        <button disabled={busy} className="w-full rounded-lg bg-cyan-600 p-3 font-semibold hover:bg-cyan-500 disabled:opacity-50" type="submit">{busy?'Registrando…':'Crear cuadrilla'}</button>
      </form>
      <p className="mt-6 text-sm text-slate-300">¿Ya tienen cuenta? <Link to="/login" className="text-cyan-300 underline">Iniciar sesión</Link></p>
    </section>
  </main>
}
