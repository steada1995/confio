import pino from 'pino'
import { secretPaths } from 'confio'

/**
 * Il logger dell'applicazione, costruito DOPO initialize().
 *
 * Il package non maschera niente: `"secret": true` nel manifest è una dichiarazione, e
 * secretPaths() la restituisce come elenco di dot-path. Passandola a `redact` le due liste
 * non possono divergere: rinominare una foglia nel manifest aggiorna anche la redazione.
 *
 * @returns {import('pino').Logger} il logger con i segreti del manifest già dichiarati
 */
export const buildLogger = () => pino({
  // ['db.mongodb.adminPassword'] — gli stessi dot-path del manifest.
  redact: secretPaths()
})
