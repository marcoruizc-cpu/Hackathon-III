import { useState } from 'react'

import { useSession } from '../auth/SessionContext'
import { Button, Card, CheckList, ErrorBox, Field, inputClass, Loading } from '../components/ui'
import {
  getClearance,
  getIntegrationStatus,
  putRoster,
  registerStorage,
  requestChallenge,
  runClearanceCheck,
  setChaos,
  verifyDeploy,
  type Check,
  type DeployChallenge,
  type RosterMember,
} from '../features/integrations/api'
import { BUILD_SHA, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../lib/config'
import { ApiError, errorMessage, isRecord } from '../lib/errors'
import { useRemote } from '../lib/useRemote'

/** Checks de un 422 (STORAGE_VERIFICATION_FAILED → details.checks). */
function checksFromError(error: unknown): Check[] | null {
  if (error instanceof ApiError && isRecord(error.details) && Array.isArray(error.details.checks)) {
    return error.details.checks as Check[]
  }
  return null
}

/** Página /estado: todo lo de los primeros 20 minutos en un solo lugar. */
export default function EstadoPage() {
  const { me, reloadMe } = useSession()
  const [tick, setTick] = useState(0)
  const status = useRemote(`status:${tick}`, getIntegrationStatus)
  const clearance = useRemote(`clearance:${tick}`, getClearance)
  const refresh = () => setTick((n) => n + 1)

  // Deploy
  const [origin, setOrigin] = useState(window.location.origin)
  const [challenge, setChallenge] = useState<DeployChallenge | null>(null)
  const [deployMsg, setDeployMsg] = useState<string | null>(null)

  // Storage
  const [projectUrl, setProjectUrl] = useState(SUPABASE_URL)
  const [publicKey, setPublicKey] = useState(SUPABASE_PUBLISHABLE_KEY)
  const [storageChecks, setStorageChecks] = useState<Check[] | null>(null)
  const [storageMsg, setStorageMsg] = useState<string | null>(null)

  // Roster
  const [roster, setRoster] = useState<RosterMember[]>([
    { name: 'Marco Sebastián Ruiz Camarena', code: '202520102' },
    { name: 'Eli Bernie Reyes Juarez', code: '202520084' },
    { name: 'Gabriel Saavedra', code: '' },
  ])
  const [rosterMsg, setRosterMsg] = useState<string | null>(null)

  // Clearance
  const [checkResult, setCheckResult] = useState<Check[] | null>(null)
  const [checkMsg, setCheckMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name)
    try {
      await fn()
    } finally {
      setBusy(null)
      refresh()
    }
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">Estado</h1>
      <p className="text-sm text-slate-400">
        Equipo <b>{me?.team.code}</b> · {me?.team.name} · rol {me?.role.name} · build <code>{BUILD_SHA}</code>
      </p>

      <Card title="1. Dominio (deploy)">
        {status.loading ? <Loading /> : status.data ? (
          <p className="mb-2 text-sm">
            Verificado: <b>{status.data.deploy.origin ?? 'no'}</b> · último build visto: <code>{status.data.deploy.lastBuildSeen ?? '—'}</code>
          </p>
        ) : status.errorText ? <ErrorBox message={status.errorText} onRetry={status.retry} /> : null}
        <div className="flex gap-2">
          <input className={inputClass} value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://mi-app.vercel.app" />
          <Button
            disabled={busy !== null}
            onClick={() =>
              run('challenge', async () => {
                setDeployMsg(null)
                try {
                  setChallenge(await requestChallenge(origin.trim()))
                } catch (e: unknown) {
                  setDeployMsg(errorMessage(e))
                }
              })
            }
          >
            Pedir token
          </Button>
        </div>
        {challenge ? (
          <div className="mt-3 space-y-2 text-sm">
            <p>
              Pega este token (solo eso) en <code>public{challenge.wellKnownPath}</code>, haz commit + push y espera el deploy:
            </p>
            <pre className="select-all rounded bg-slate-950 p-2">{challenge.token}</pre>
            <p className="text-slate-400">Vence: {new Date(challenge.expiresAt).toLocaleTimeString()}</p>
          </div>
        ) : null}
        <Button
          variant="secondary"
          className="mt-3"
          disabled={busy !== null}
          onClick={() =>
            run('verify', async () => {
              try {
                const r = await verifyDeploy()
                setDeployMsg(`Verificado ${r.origin}`)
              } catch (e: unknown) {
                const d = e instanceof ApiError && isRecord(e.details) ? JSON.stringify(e.details) : ''
                setDeployMsg(`${errorMessage(e)} ${d}`)
              }
            })
          }
        >
          Verificar dominio
        </Button>
        {deployMsg ? <p className="mt-2 text-sm text-amber-300">{deployMsg}</p> : null}
      </Card>

      <Card title="2. Storage (Supabase)">
        <div className="grid gap-2">
          <Field label="Project URL (sin ruta)">
            <input className={inputClass} value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} />
          </Field>
          <Field label="Publishable key (sb_publishable_… o anon). NUNCA la secret.">
            <input className={inputClass} value={publicKey} onChange={(e) => setPublicKey(e.target.value)} />
          </Field>
          <Button
            disabled={busy !== null}
            onClick={() =>
              run('storage', async () => {
                setStorageMsg(null)
                setStorageChecks(null)
                try {
                  const r = await registerStorage({ provider: 'SUPABASE', projectUrl: projectUrl.trim(), bucket: 'lumon-media', publicKey: publicKey.trim() })
                  setStorageChecks(r.checks)
                  setStorageMsg('Storage verificado.')
                } catch (e: unknown) {
                  setStorageChecks(checksFromError(e))
                  setStorageMsg(errorMessage(e))
                }
              })
            }
          >
            Registrar y verificar storage
          </Button>
        </div>
        {storageMsg ? <p className="mt-2 text-sm text-amber-300">{storageMsg}</p> : null}
        {storageChecks ? <div className="mt-2"><CheckList checks={storageChecks} /></div> : null}
        {status.data?.storage.checks.length ? <div className="mt-2 opacity-70"><CheckList checks={status.data.storage.checks} /></div> : null}
      </Card>

      <Card title="3. Roster (3 integrantes)">
        {roster.map((m, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input className={inputClass} value={m.name} onChange={(e) => setRoster((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nombre" />
            <input className={`${inputClass} max-w-40`} value={m.code} onChange={(e) => setRoster((r) => r.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} placeholder="Código" />
          </div>
        ))}
        <Button
          disabled={busy !== null}
          onClick={() =>
            run('roster', async () => {
              try {
                const r = await putRoster(roster.map((m) => ({ name: m.name.trim(), code: m.code.trim() })))
                setRosterMsg(r.complete ? 'Roster completo.' : 'Roster guardado (incompleto).')
              } catch (e: unknown) {
                setRosterMsg(`${errorMessage(e)} ${e instanceof ApiError && e.details ? JSON.stringify(e.details) : ''}`)
              }
            })
          }
        >
          Guardar roster
        </Button>
        {rosterMsg ? <p className="mt-2 text-sm text-amber-300">{rosterMsg}</p> : null}
        {clearance.data ? (
          <p className="mt-2 text-sm text-slate-400">
            En servidor: {clearance.data.roster.members.map((m) => `${m.name} (${m.code})`).join(', ') || '—'} {clearance.data.roster.locked ? '· BLOQUEADO' : ''}
          </p>
        ) : null}
      </Card>

      <Card title="4. Modo caos y Piso de Pruebas">
        {clearance.data ? (
          <p className="mb-2 text-sm">
            Workspace {clearance.data.workspace.kind} · caos {clearance.data.workspace.chaosLevel} · Piso: {clearance.data.granted ? 'ABIERTO' : 'cerrado'}
            {clearance.data.round.drawnMember ? ` · Sorteado ronda ${clearance.data.round.drawnMember.round}: ${clearance.data.round.drawnMember.name}` : ''}
          </p>
        ) : clearance.errorText ? <ErrorBox message={clearance.errorText} onRetry={clearance.retry} /> : <Loading />}
        <div className="flex flex-wrap gap-2">
          {([0, 1, 2] as const).map((lvl) => (
            <Button key={lvl} variant="secondary" disabled={busy !== null} onClick={() => run('chaos', async () => void (await setChaos(lvl).catch((e: unknown) => setCheckMsg(errorMessage(e)))))}>
              Caos {lvl}
            </Button>
          ))}
          <Button
            disabled={busy !== null}
            onClick={() =>
              run('check', async () => {
                setCheckMsg(null)
                try {
                  const r = await runClearanceCheck()
                  setCheckResult(r.checks)
                  setCheckMsg(r.granted ? 'Piso de Pruebas ABIERTO.' : 'Aún no.')
                  if (r.granted) await reloadMe()
                } catch (e: unknown) {
                  setCheckMsg(errorMessage(e)) // 403 CHECK_FROM_APP_REQUIRED desde localhost
                }
              })
            }
          >
            Correr revisión automática
          </Button>
        </div>
        {checkMsg ? <p className="mt-2 text-sm text-amber-300">{checkMsg}</p> : null}
        {checkResult ? <div className="mt-2"><CheckList checks={checkResult} /></div> : clearance.data?.checks.length ? <div className="mt-2 opacity-70"><CheckList checks={clearance.data.checks} /></div> : null}
      </Card>
    </main>
  )
}
