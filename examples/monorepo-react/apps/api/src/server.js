import http from 'node:http'
import { getConfig } from 'confio'
import { publicConfig } from './public-config.js'

const json = (res, status, body) => {
  res.writeHead(status, {
    'content-type': 'application/json',
    // il frontend gira su un'altra porta durante lo sviluppo
    'access-control-allow-origin': '*'
  })
  res.end(JSON.stringify(body))
}

/**
 * Avvia l'API. Una sola rotta interessante: /config, da cui la pagina prende ciò che le
 * serve — così la config resta una sola, letta in un solo posto, e il browser non vede
 * mai il resto.
 *
 * @returns {import('node:http').Server} il server in ascolto
 */
export const startServer = () => {
  const config = getConfig()

  const server = http.createServer((req, res) => {
    if (req.url === '/config') {
      return json(res, 200, publicConfig())
    }

    if (req.url === '/health') {
      // il segreto è leggibile qui, nel processo Node: è il browser a non doverlo avere
      return json(res, 200, { db: config.db.mongodb.host, ok: true })
    }

    return json(res, 404, { error: 'not found' })
  })

  return server.listen(Number(config.http.port), () => {
    console.log(`api in ascolto su http://localhost:${config.http.port}`)
  })
}
