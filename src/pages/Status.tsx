import {useEffect,useState} from 'react'
import {Layout} from '../components/Layout'
import {useAuth} from '../context/AuthContext'
import {apiRequest,ApiError,checkHealth} from '../lib/session'

function describe(v: unknown) {return JSON.stringify(v,null,2)}
export function Status(){
  const auth=useAuth()
  const [health,setHealth]=useState('Verificando…')
  const [integrations,setIntegrations]=useState<unknown>(null)
  const [clearance,setClearance]=useState<unknown>(null)
  const [message,setMessage]=useState('')
  const [busy,setBusy]=useState(false)
  async function load(){
    try {await checkHealth();setHealth('API conectada')}
    catch {setHealth('Sin conexión')}
    try {setIntegrations(await apiRequest<unknown>('/integrations/status'))}
    catch(e) {setIntegrations({error:e instanceof Error?e.message:'No disponible'})}
    try {setClearance(await apiRequest<unknown>('/clearance'))}
    catch(e) {setClearance({error:e instanceof Error?e.message:'No disponible'})}
  }
  useEffect(()=>{void load()},[])
  async function checkClearance(){
    setBusy(true);setMessage('')
    try {const response=await apiRequest<unknown>('/clearance/check',{method:'POST'});setMessage(describe(response));await load()}
    catch(e){setMessage(e instanceof ApiError ? `${e.code}: ${e.message}`:'No se pudo ejecutar la revisión.')}
    finally{setBusy(false)}
  }
  return <Layout><main className="mx-auto max-w-6xl px-5 py-10">
    <h1 className="text-3xl font-bold">Estado de Lumon</h1>
    <p className="mt-3 text-slate-300">Build desplegado: <code className="text-cyan-300">{__LUMON_BUILD__}</code></p>
    <p className="mt-1 text-slate-300">API: {health}</p>
    <p className="mt-1 text-slate-300">Equipo: {auth.team?.code || 'No informado'}</p>
    <div className="mt-8 grid gap-5 md:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Integraciones</h2><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-200">{integrations?describe(integrations):'Cargando…'}</pre></section>
      <section className="min-w-0 rounded-xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-bold">Clearance</h2><pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-xs text-slate-200">{clearance?describe(clearance):'Cargando…'}</pre></section>
    </div>
    <button disabled={busy} onClick={()=>void checkClearance()} className="mt-8 rounded-lg bg-cyan-600 px-5 py-3 font-semibold hover:bg-cyan-500 disabled:opacity-50">{busy?'Comprobando…':'Abrir el Piso de Pruebas'}</button>
    <p className="mt-3 text-sm text-slate-300">La revisión automática solo se aprueba cuando CP1 y CP2 funcionan desde el despliegue público.</p>
    {message && <pre role="status" className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl border border-slate-700 p-4 text-sm">{message}</pre>}
  </main></Layout>
}
