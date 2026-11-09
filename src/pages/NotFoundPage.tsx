import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="p-8 text-center">
      <h1 className="text-3xl font-bold">404</h1>
      <p className="mt-2 text-slate-400">Esta página no existe.</p>
      <Link to="/" className="mt-4 inline-block text-emerald-400">
        Volver
      </Link>
    </main>
  )
}
