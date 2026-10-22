import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement, Vite (5174) renvoie /api vers le serveur MMS (8788)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    host: true,
    proxy: { '/api': { target: 'http://localhost:8788', changeOrigin: true } },
    // Les fichiers peuvent être modifiés hors de Windows (dossier partagé) : on les relit
    // toutes les secondes au lieu d'attendre les notifications du système
    watch: { usePolling: true, interval: 1000 },
  },
})
