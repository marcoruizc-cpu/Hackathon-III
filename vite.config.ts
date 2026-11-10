import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// SHA corto del commit desplegado (Vercel). En local: "dev".
// Tailwind se procesa con PostCSS (postcss.config.js): el plugin @tailwindcss/vite
// rompía el typecheck con Vite 8 + TypeScript 7.
const buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

export default defineConfig({
  plugins: [react()],
  define: {
    __LUMON_BUILD__: JSON.stringify(buildSha),
    __BUILD_SHA__: JSON.stringify(buildSha),
  },
})
