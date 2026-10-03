# modular-monorepo (example)

Un progetto modulare con **una sola `config/` nella radice**, condivisa da tutti i
servizi, identica in sviluppo e in produzione. Nessun servizio possiede la propria
configurazione: il manifest è uno, e ognuno ne dichiara la fetta che gli serve.

```
config/
  config.json                ← manifest unico: tutte le foglie di tutti i servizi
  config.development.json    ← overlay locale (NODE_ENV=development, il default)
apps/
  api/src/index.js           ← entrypoint: registra il provider "vault", initialize()
  api/src/server.js, db.js   ← getConfig() dopo l'avvio
  worker/src/index.js        ← entrypoint: fetta diversa dello stesso manifest
  worker/src/worker.js
```

## Le due idee

**Il manifest è condiviso, la fetta no.** `resolveAll` risolve solo le foglie elencate in
`requiredConfig`, quindi ogni servizio dichiara le sue e ignora le altre:

```javascript
// apps/api/src/index.js
requiredConfig: 'http.port,db.mongodb.host,db.mongodb.adminPassword,external.apiKey'

// apps/worker/src/index.js
requiredConfig: 'queue.url,queue.batchSize,db.mongodb.host,db.mongodb.adminPassword'
```

L'api non risolve mai `queue.*` e non fallisce se la coda è irraggiungibile; il worker non
ha nemmeno bisogno di registrare il provider `vault`, perché `external.apiKey` non è nella
sua lista. `db.mongodb.*` è dichiarato una volta e usato da entrambi.

**Il percorso è ancorato al file sorgente**, non alla cartella corrente né all'entrypoint:

```javascript
const CONFIG_DIR = new URL('../../../config', import.meta.url).pathname

await initialize({ configDir: process.env.CONFIG_DIR ?? CONFIG_DIR, requiredConfig: '…' })
```

Il risultato è assoluto, quindi la risalita al `package.json` che `confio` fa sui
percorsi relativi non entra in gioco. Questi tre comandi caricano la stessa `config/`:

```bash
npm run start:worker                 # dalla radice del monorepo
node apps/worker/src/index.js        # dalla radice, per percorso
cd apps/worker && node src/index.js  # da dentro il servizio
```

`process.env.CONFIG_DIR` ha la precedenza perché `initialize()` legge l'env var **solo
quando l'opzione manca**: senza quel `??`, il default cablato nel codice non sarebbe più
sovrascrivibile da un ambiente che monta la config altrove.

> Con più di due o tre servizi, sposta `CONFIG_DIR` in un pacchetto condiviso del
> workspace. Il conteggio dei `..` deve esistere in un punto solo.

## Provalo

```bash
cd examples/modular-monorepo
npm install                          # collega confio via file:../..
```

### Sviluppo

```bash
npm run start:worker
```
```
worker draining amqp://localhost:5672 in batches of 10
mongo host: localhost
config: { host: 'localhost', adminPassword: 'dev-password' }
password: dev-password
```

Il segreto si vede, ed è il comportamento previsto: il package non maschera niente.
`"secret": true` nel manifest dichiara la foglia, e `secretPaths()` passa i dot-path al
logger — vedi [`examples/pino-redaction`](../pino-redaction). Qui si stampa con
`console.log`, che nessun logger intercetta.

```bash
npm run start:api
curl localhost:3000
```
```json
{"status":"ok","db":"mongodb://admin:dev-password@localhost:27017","apiKey":"vault-secret:external/api-key@AWSPREVIOUS"}
```

Anche qui la password si vede: la risposta HTTP la costruisce il servizio, e cosa metterci
è una sua decisione. Il package non filtra niente in uscita.

`apiKey` arriva dal provider `vault` registrato in `apps/api/src/providers.js`: la foglia
non è nell'overlay, quindi anche in locale passa sempre dall'integrazione. Il suffisso
`@AWSPREVIOUS` è il suo `extraOptions`, inoltrato al provider senza che il package ci
guardi dentro.

### Produzione

In `production` — ambiente online per default — `config.development.json` viene ignorato
del tutto e ogni valore deve risolversi attraverso il suo provider.

Prima il fallimento, senza il file del segreto:

```bash
NODE_ENV=production QUEUE_URL=amqp://rabbit:5672 QUEUE_BATCH_SIZE=100 \
MONGODB_HOST=mongo.prod RUN_SECRETS_DIR=/tmp/secrets \
npm run start:worker
```
```
Error: Startup failed: file '/tmp/secrets/mongodb_admin_password' required by 'db.mongodb.adminPassword' is not readable
```

Il messaggio nomina la foglia che chiedeva quel valore: il provider conosce solo la propria
`key`, il dot-path lo aggiunge `resolveLeaf` riscrivendo l'errore.

Poi con il segreto al suo posto:

```bash
mkdir -p /tmp/secrets && printf 'prod-password' > /tmp/secrets/mongodb_admin_password
NODE_ENV=production QUEUE_URL=amqp://rabbit:5672 QUEUE_BATCH_SIZE=100 \
MONGODB_HOST=mongo.prod RUN_SECRETS_DIR=/tmp/secrets \
npm run start:worker
```

## In un container

L'ancoraggio al sorgente ha una condizione: **l'immagine deve riprodurre la stessa
struttura di cartelle del repo**, perché i tre livelli di risalita vengono contati lì.

```dockerfile
WORKDIR /app
COPY config/    ./config/
COPY apps/api/  ./apps/api/
CMD ["node", "apps/api/src/index.js"]
```

`/app/apps/api/src/index.js` risale a `/app/config/`. Se appiattisci l'immagine copiando
solo `apps/api/` dentro `/app/`, il conto salta — e in quel caso conviene trattare la config
come una dipendenza: vedi [`../microservices-pnpm/`](../microservices-pnpm).

## Note

`"@steada1995/confio": "file:../../../.."` nei `package.json` dei servizi è un artefatto
dell'esempio: il package non è pubblicato e questo lo collega alla cartella sorgente. In un
progetto vero è una dipendenza qualunque, `"@steada1995/confio": "^1.0.0"`.

`config.development.json` è versionato qui perché l'esempio sia eseguibile subito. In un
progetto vero va in `.gitignore`: contiene valori di sviluppo, e il `.gitignore` di questo
repo esclude già `*.local.json`.
