import { Link } from 'react-router-dom'

import { useSession } from '../auth/SessionContext'
import { Card } from '../components/ui'

export default function HomePage() {
  const { me } = useSession()
  if (!me) return null
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Hola, {me.displayName}</h1>
      <Card title="Sesión">
        <p className="text-sm">
          Equipo {me.team.code} · rol {me.role.name} ({me.role.code})
        </p>
        <p className="mt-1 text-sm text-slate-400">Permisos: {me.permissions.join(', ') || 'ninguno'}</p>
        <p className="mt-1 text-sm">Piso de Pruebas: {me.clearance.granted ? 'ABIERTO' : 'cerrado'}</p>
      </Card>
      <div className="flex gap-3">
        <Link className="text-emerald-400" to="/estado">
          Ir a Estado →
        </Link>
        <Link className="text-emerald-400" to="/files">
          Ir a Archivos →
        </Link>
      </div>
    </main>
  )
}
