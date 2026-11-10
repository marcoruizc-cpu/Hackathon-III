import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const buildSha = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __LUMON_BUILD__: JSON.stringify(buildSha),
  },
})