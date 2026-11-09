import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useSession } from '../auth/SessionContext'
import { Button, ErrorBox, Field, inputClass } from '../components/ui'
import { errorMessage, fieldErrors } from '../lib/errors'

export default function RegisterPage() {
  const { signUp } = useSession()
  const navigate = useNavigate()
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setFields({})
    try {
      const { teamCode } = await signUp({ teamName: teamName.trim(), email: email.trim(), password })
      navigate('/estado', { replace: true, state: { teamCode } })
    } catch (err: unknown) {
      const byField = fieldErrors(err) // VALIDATION_ERROR details.fields y 409 { field }
      if (Object.keys(byField).length > 0) setFields(byField)
      else setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto mt-16 max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Registrar cuadrilla</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label="Nombre de la cuadrilla (3–40)" error={fields.teamName}>
          <input className={inputClass} value={teamName} onChange={(e) => setTeamName(e.target.value)} minLength={3} maxLength={40} required />
        </Field>
        <Field label="Email" error={fields.email}>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Contraseña (8–72)" error={fields.password}>
          <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} maxLength={72} required />
        </Field>
        {fields._ ? <ErrorBox message={fields._} /> : null}
        {error ? <ErrorBox message={error} /> : null}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Creando…' : 'Crear cuadrilla'}
        </Button>
      </form>
      <Link to="/login" className="block text-center text-emerald-400">
        Ya tengo cuenta
      </Link>
    </main>
  )
}
