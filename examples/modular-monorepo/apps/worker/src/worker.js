import { getConfig } from 'confio'

export const runBatch = () => {
  const config = getConfig()

  console.log(`worker draining ${config.queue.url} in batches of ${config.queue.batchSize}`)

  // La config è read-only a ogni livello: assegnare qui darebbe
  // TypeError: Cannot assign to read only property 'batchSize' of object '#<Object>'
  console.log('mongo host:', config.db.mongodb.host)

  // adminPassword è marcata "secret": true, ma il package non maschera: la marcatura la
  // elenca in secretPaths(), da passare al proprio logger. console.log non la consulta.
  console.log('config:', config.db.mongodb)

  // Stesso valore, letto direttamente: nessuna differenza, sempre in chiaro.
  console.log('password:', config.db.mongodb.adminPassword)
}
