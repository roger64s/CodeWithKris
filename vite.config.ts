import { defineConfig, type Plugin } from 'vite'
import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const metricsPagePlugin: Plugin = {
  name: 'emit-metrics-page',
  generateBundle() {
    this.emitFile({
      type: 'asset',
      fileName: 'docs/charts.html',
      source: readFileSync(new URL('./docs/charts.html', import.meta.url), 'utf8'),
    })
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), metricsPagePlugin],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  server: {
    watch: {
      ignored: ['**/Doc/**'],
    },
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
})
