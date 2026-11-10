import {useState} from 'react'
import type {FormEvent} from 'react'
import {Link,Navigate,useNavigate,useSearchParams} from 'react-router-dom'
import {useAuth} from '../context/AuthContext'
import {ApiError} from '../lib/session'

export function Login(){
  const auth=useAuth()
  const navigate=useNavigate()
  const [params]=useSearchParams()
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const raw=params.get('next') || '/dashboard'
  // Prevent redirects outside this site.
  const next=raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('\\') ? raw : '/dashboard'
  if(auth.status==='loading') return <main className="min-h-screen bg-slate-950 p-8 text-center text-white" role="status">Restaurando sesión…</main>
  if(auth.status==='authenticated') return <Navigate to={next} replace />
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError('');setBusy(true)
    try {await auth.login(email.trim(),password);navigate(next,{replace:true})}
    catch(err){setError(err instanceof ApiError ? err.message : 'No pudimos iniciar la sesión.')}
    finally{setBusy(false)}
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-950 p-5 text-white">
    <section className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-xl">
      <p className="text-xs uppercase tracking-[.5em] text-cyan-300">Lumon Industries</p>
      <h1 className="mt-3 text-3xl font-bold">Entrar al piso</h1>
      <p className="mt-2 text-sm text-slate-300">Usa la cuenta de tu cuadrilla, no un token copiado.</p>
      {(auth.reason || error) && <p role="alert" className="mt-5 rounded-lg border border-amber-600 bg-amber-950 p-3 text-sm text-amber-200">{error || auth.reason}</p>}
      <form className="mt-6 space-y-4" onSubmit={e=>void submit(e)}>
        <label className="block text-sm" htmlFor="email">Correo
          <input id="email" className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3 outline-offset-2 focus:outline-cyan-400" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/>
        </label>
        <label className="block text-sm" htmlFor="password">Contraseña
          <input id="password" className="mt-1 block w-full rounded-lg border border-slate-500 bg-slate-950 p-3 outline-offset-2 focus:outline-cyan-400" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/>
        </label>
        <button disabled={busy} type="submit" className="w-full rounded-lg bg-cyan-600 px-4 py-3 font-semibold hover:bg-cyan-500 disabled:opacity-50">{busy?'Ingresando…':'Iniciar sesión'}</button>
      </form>
      <p className="mt-6 text-sm text-slate-300">¿Cuadrilla nueva? <Link className="text-cyan-300 underline" to="/register">Registrar equipo</Link></p>
    </section>
  </main>
}
