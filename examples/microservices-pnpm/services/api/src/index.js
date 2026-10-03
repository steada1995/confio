import { initialize } from '@steada1995/confio'
import { startServer } from './server.js'

/**
 * @example/config non contiene codice: è la directory config con dentro config.json, i
 * suoi overlay e un package.json che la rende una dipendenza. Il servizio ne scrive il
 * nome e basta — dove il gestore di pacchetti l'abbia messa non lo sa nessuno qui.
 *
 * configDir prova prima il filesystem: '@example/config' non è una directory del progetto,
 * quindi confio lo risolve come pacchetto, partendo dall'entrypoint di questo
 * servizio. In sviluppo trova il workspace attraverso il symlink di pnpm, quindi modificare
 * il manifest si vede subito; dopo `pnpm deploy` trova la copia dentro node_modules.
 *
 * process.env.CONFIG_DIR resta prioritario perché initialize() legge l'env var solo quando
 * l'opzione manca: un ambiente che monta un manifest diverso può ancora scavalcare il
 * pacchetto senza rebuild.
 */
await initialize({
  configDir: process.env.CONFIG_DIR ?? '@example/config',

  // La fetta di manifest che riguarda questo servizio. Il manifest è condiviso dal
  // pacchetto, la selezione no: billing.stripeKey non viene risolto qui.
  requiredConfig: 'http.port,db.mongodb.host,db.mongodb.adminPassword'
})

startServer()
