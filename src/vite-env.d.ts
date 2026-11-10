/// <reference types="vite/client" />
declare const __LUMON_BUILD__: string
declare const __BUILD_SHA__: string
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
  readonly VITE_WS_BASE_URL: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string
}
interface ImportMeta { readonly env: ImportMetaEnv }
