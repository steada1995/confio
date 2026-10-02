import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Nessun accesso alla config qui dentro.
 *
 * confio legge file, variabili d'ambiente e segreti montati: è codice Node, e nel
 * browser non può girare. Anche solo importarlo in un modulo del frontend farebbe fallire
 * il bundle — e se anche funzionasse, ogni valore letto finirebbe in un file JavaScript
 * scaricabile da chiunque apra la pagina.
 *
 * L'unica cosa che serve al build è dove sta l'API, che in sviluppo è il proxy qui sotto:
 * la pagina chiama sempre /config sulla propria origine, e in sviluppo è Vite a inoltrare.
 * Il target segue http.port della config; API_ORIGIN lo sposta se la porta è occupata.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/config': process.env.API_ORIGIN ?? 'http://localhost:3001' }
  }
})
