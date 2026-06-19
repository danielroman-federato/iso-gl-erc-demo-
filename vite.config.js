import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Asset base path. Default '/' is correct for Vercel and `npm run dev`.
// Set VITE_BASE_PATH=/iso-gl-erc-demo-/ when building for GitHub Pages so
// assets resolve under the repo subpath. The publish-demo.ps1 script sets this.
const basePath = process.env.VITE_BASE_PATH || '/'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: basePath,
  server: {
    host: true,         // bind 0.0.0.0 so Codespaces port forwarding can reach it
    port: 5174,
    strictPort: false,
    proxy: {
      // Forward backend calls through the same origin as the frontend, so
      // remote viewers (Codespaces, tunnels) don't need a separate URL for :8000.
      '/api': 'http://localhost:8000',
    },
  },
})
