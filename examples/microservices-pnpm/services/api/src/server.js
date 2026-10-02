import http from 'node:http'
import { getConfig } from 'confio'
import { connectionString } from './db.js'

export const startServer = () => {
  const config = getConfig()

  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', db: connectionString() }))
  })

  server.listen(Number(config.http.port), () => {
    console.log(`api listening on http://localhost:${config.http.port}`)
  })

  return server
}
