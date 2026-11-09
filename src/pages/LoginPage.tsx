import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router-dom'

import { useSession } from '../auth/SessionContext'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'
import { ApiError, errorMessage } from '../lib/errors'

export default function LoginPage() {
  const { state, signIn } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: Location } | null)?.from
  const target = from ? `${from.pathname}${from.search}` : '/'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (state.status === 'signedIn') return <Navigate to={target} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn({ email: email.trim(), password })
      navigate(target, { replace: true }) // vuelve EXACTAMENTE a donde quería ir
    } catch (err: unknown) {
      setError(err instanceof ApiError && err.error === 'INVALID_CREDENTIALS' ? 'Email o contraseña incorrectos.' : errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const reason = state.status === 'signedOut' ? state.reason : null
  return (
    <main className="mx-auto mt-16 max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Lumon · Iniciar sesión</h1>
      {reason && reason !== 'LOGOUT' ? <p className="text-amber-400">Tu sesión terminó ({reason}). Vuelve a ingresar.</p> : null}
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Email">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        </Field>
        <Field label="Contraseña">
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </Field>
        {error ? <ErrorBox message={error} /> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <Link to="/register" className="block text-center text-emerald-400">
        Registrar cuadrilla
      </Link>
    </main>
  )
}
