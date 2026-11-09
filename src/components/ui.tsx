import type { ButtonHTMLAttributes, ReactNode } from 'react'

export function Button({ className = '', variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-emerald-500 text-slate-950 hover:bg-emerald-400',
    secondary: 'bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-700',
    danger: 'bg-red-500 text-white hover:bg-red-400',
  }[variant]
  return (
    <button
      {...props}
      className={`rounded px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    />
  )
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      {title ? <h2 className="mb-3 text-lg font-semibold">{title}</h2> : null}
      {children}
    </section>
  )
}

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <p className="p-4 text-slate-400" role="status">
      {label}
    </p>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded border border-red-800 bg-red-950/50 p-3 text-red-300" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          Reintentar
        </Button>
      ) : null}
    </div>
  )
}

export function Empty({ message }: { message: string }) {
  return <p className="p-4 text-slate-400">{message}</p>
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-slate-300">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-red-400">{error}</span> : null}
    </label>
  )
}

export const inputClass = 'w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 outline-none focus:border-emerald-500'

export function CheckList({ checks }: { checks: { name: string; passed: boolean; detail: string }[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {checks.map((c) => (
        <li key={c.name} className={c.passed ? 'text-emerald-400' : 'text-red-400'}>
          {c.passed ? '✔' : '✘'} <b>{c.name}</b> — <span className="text-slate-300">{c.detail}</span>
        </li>
      ))}
    </ul>
  )
}
