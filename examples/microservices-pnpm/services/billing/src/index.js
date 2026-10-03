import { initialize } from '@steada1995/confio'
import { charge } from './billing.js'

/**
 * Stessa riga dell'api: i due servizi condividono il manifest perché condividono la
 * dipendenza, non perché si sono messi d'accordo su un percorso.
 */
await initialize({
  configDir: process.env.CONFIG_DIR ?? '@example/config',
  requiredConfig: 'billing.stripeKey,db.mongodb.host,db.mongodb.adminPassword'
})

charge()
