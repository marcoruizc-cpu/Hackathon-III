import { execSync } from 'node:child_process'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * X-Lumon-Build: SHA del commit desplegado, inyectado en tiempo de build.
 * - `vite` (dev, localhost): "dev".
 * - Vercel: VERCEL_GIT_COMMIT_SHA. Netlify: COMMIT_REF. Cloudflare Pages: CF_PAGES_COMMIT_SHA.
 * - Respaldo: `git rev-parse HEAD`.
 * La API exige ^[0-9a-f]{7,40}$ fuera de localhost.
 */
function resolveBuildSha(command: 'serve' | 'build'): string {
  if (command === 'serve') return 'dev'
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_REF ?? process.env.CF_PAGES_COMMIT_SHA ?? ''
  let sha = fromEnv
  if (!sha) {
    try {
      sha = execSync('git rev-parse HEAD').toString().trim()
    } catch {
      sha = ''
    }
  }
  sha = sha.toLowerCase()
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha.slice(0, 7) : 'dev'
}

export default defineConfig(({ command }) => ({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(resolveBuildSha(command)),
  },
}))
