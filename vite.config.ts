import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// En développement, Vite (5174) renvoie /api vers le serveur MMS (8788)
export default defineConfig({
  plugins: [react()],
  // L'avertissement de taille (500 ko) part sur stderr et fait échouer le déploiement automatique (auto-deploy.ps1)
  // PLUGIN_TIMINGS (build lent sur le VPS) part aussi sur stderr : désactivé pour la même raison (échec du 02/11 16:38)
  build: { chunkSizeWarningLimit: 900, rolldownOptions: { checks: { pluginTimings: false } } },
  server: {
    port: 5174,
    host: true,
    proxy: { '/api': { target: 'http://localhost:8788', changeOrigin: true } },
    // Les fichiers peuvent être modifiés hors de Windows (dossier partagé) : on les relit
    // toutes les secondes au lieu d'attendre les notifications du système
    watch: { usePolling: true, interval: 1000 },
  },
})
