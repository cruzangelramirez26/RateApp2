import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:8000',
      '/tracks': 'http://localhost:8000',
      '/playlists': 'http://localhost:8000',
      '/virtual': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    }
  },
  build: {
    outDir: 'dist',
  }
})
