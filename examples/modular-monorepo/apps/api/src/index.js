import { initialize } from 'confio'
import { registerProviders } from './providers.js'
import { startServer } from './server.js'

/**
 * La directory config è ancorata a questo file, non alla cartella da cui arriva il
 * comando né all'entrypoint: `npm start` da qui e `node apps/api/src/index.js` dalla
 * radice del monorepo trovano la stessa `config/`.
 *
 * process.env.CONFIG_DIR ha la precedenza perché initialize() legge l'env var solo se
 * l'opzione manca: senza questa riga, il default cablato qui non sarebbe più
 * sovrascrivibile da un ambiente che monta la config altrove.
 */
const CONFIG_DIR = new URL('../../../config', import.meta.url).pathname

registerProviders()

await initialize({
  configDir: process.env.CONFIG_DIR ?? CONFIG_DIR,

  // La fetta di manifest che riguarda questo servizio. Il manifest è condiviso, ma
  // queue.* non viene risolto qui: l'api non fallisce se la coda è irraggiungibile.
  requiredConfig: 'http.port,db.mongodb.host,db.mongodb.adminPassword,external.apiKey'
})

startServer()
