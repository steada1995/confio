import { initialize } from 'confio'
import { CONFIG_DIR } from './config-dir.js'
import { startServer } from './server.js'

/**
 * L'API risolve la sua fetta di manifest: le sue cose (porta, database) più il ramo web,
 * che non le serve per lavorare ma che deve poter servire alla pagina.
 */
await initialize({
  configDir:      CONFIG_DIR,
  requiredConfig: 'http.port,web.apiBaseUrl,web.appName,db.mongodb.host,db.mongodb.adminPassword'
})

startServer()
