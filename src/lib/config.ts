/** Configuración de build/entorno. Nada de URLs escritas en el código. */
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta ${name} en .env (reinicia npm run dev tras crearlo).`)
  return value.replace(/\/+$/, '')
}

export const API_BASE_URL = required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL)
export const WS_BASE_URL = required('VITE_WS_BASE_URL', import.meta.env.VITE_WS_BASE_URL)
/** SHA del commit (o "dev" en local). Va en X-Lumon-Build en TODA request. */
export const BUILD_SHA: string = __BUILD_SHA__

export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''
