import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    manifest: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three-core', test: /[\\/]three[\\/]build[\\/]three\.core\.js$/, priority: 20 },
            { name: 'three-renderer', test: /[\\/]three[\\/]build[\\/]three\.module\.js$/, priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: loadEnv(mode, process.cwd(), 'SUREAU_').SUREAU_API_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
}))
