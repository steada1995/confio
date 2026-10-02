import { initialize } from 'confio'
import { runBatch } from './worker.js'

/**
 * Stesso ancoraggio dell'api, stesso numero di livelli: i due servizi stanno alla stessa
 * profondità e vedono la stessa config/ nella radice.
 *
 * Quando i servizi diventano più di due o tre, questa costante va in un pacchetto
 * condiviso del workspace: il conteggio dei '..' deve esistere in un punto solo.
 */
const CONFIG_DIR = new URL('../../../config', import.meta.url).pathname

await initialize({
  configDir: process.env.CONFIG_DIR ?? CONFIG_DIR,

  // Fetta diversa dello stesso manifest: niente http.port, niente external.apiKey. Il
  // provider "vault" non è nemmeno registrato qui, e non serve — quella foglia non viene
  // risolta.
  requiredConfig: 'queue.url,queue.batchSize,db.mongodb.host,db.mongodb.adminPassword'
})

runBatch()
