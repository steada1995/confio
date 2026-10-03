# microservices-pnpm (example)

Microservizi in un workspace pnpm dove **la directory `config/` è una dipendenza**. Non è
un percorso da raggiungere risalendo cartelle: è un pacchetto che ogni servizio dichiara nel
proprio `package.json`, e che la risoluzione dei moduli gli mette in mano.

```
config/                       ← pacchetto @example/config
  package.json                  solo il nome e la versione: nessun codice
  config.json                   manifest condiviso
  config.development.json       overlay locale (NODE_ENV=development, il default)
services/
  api/package.json            ← "@example/config": "workspace:*"
  api/src/index.js
  api/src/server.js, db.js
  billing/package.json        ← la stessa dipendenza
  billing/src/index.js
  billing/src/billing.js
```

## L'idea

`config/` non contiene codice. È la directory di configurazione così com'è, più un
`package.json` che la rende dichiarabile:

```json
{
  "name": "@example/config",
  "version": "1.0.0",
  "private": true
}
```

Il servizio la dichiara come qualunque altra dipendenza:

```json
"dependencies": {
  "@example/config": "workspace:*",
  "@steada1995/confio": "file:../../../.."
}
```

e ne passa il nome a `configDir`, senza ricavarne il percorso:

```javascript
await initialize({
  configDir: process.env.CONFIG_DIR ?? '@example/config',
  requiredConfig: 'billing.stripeKey,db.mongodb.host,db.mongodb.adminPassword'
})
```

`configDir` prova prima il filesystem; solo se quella directory non esiste tenta il nome
come pacchetto, risolvendolo dall'entrypoint del servizio. Un percorso che esiste mantiene
quindi sempre il suo significato.

Nessun `..` da contare, e il servizio non sa dove `config/` si trovi né a che profondità
stia rispetto a lui: se cambia posizione nel repo, la dipendenza continua a risolversi.
Sposta invece il servizio nell'albero e non cambia niente comunque — è la differenza con un
percorso relativo, che quella profondità la codifica.

`createRequire` e non `import.meta.resolve`: quest'ultimo è diventato disponibile in
versioni diverse di Node a seconda della riga di rilascio, e il package dichiara
`engines: node >= 18`.

`require.resolve` segue i symlink, quindi in sviluppo il percorso è `config/` nel workspace
— si modifica il manifest e il servizio lo vede subito, senza reinstallare. Dopo
`pnpm deploy` la stessa riga trova la copia dentro `node_modules`.

**Il manifest è condiviso, la fetta no.** `resolveAll` risolve solo le foglie elencate in
`requiredConfig`, quindi `api` non tocca mai `billing.stripeKey` e `billing` non risolve
`http.port`, mentre `db.mongodb.*` è dichiarato una volta e usato da entrambi.

`process.env.CONFIG_DIR` mantiene la precedenza, perché `initialize()` legge l'env var solo
quando l'opzione manca: un ambiente che monta un manifest diverso può ancora scavalcare il
pacchetto senza rebuild.

### Cosa ci si guadagna

La config diventa versionata e tracciabile come il codice: `"@example/config": "workspace:*"`
oggi, `"^2.0.0"` da un registro privato domani, se un giorno i servizi escono dal monorepo.
Chi non la dichiara non la vede — un servizio che si dimentica la dipendenza fallisce
all'installazione, non all'avvio in produzione.

Se invece config e servizi vivono nello stesso repo e cambiano sempre insieme, una sola
`config/` in radice raggiunta per percorso è più diretta: vedi
[`../modular-monorepo/`](../modular-monorepo).

## Provalo

```bash
cd examples/microservices-pnpm
pnpm install
```

```bash
pnpm start:billing
```
```
billing ready, mongo host: localhost
config: { stripeKey: 'sk_test_dev' }
stripe key: sk_test_dev
```

Il segreto si vede, ed è il comportamento previsto: il package non maschera niente.
`"secret": true` nel manifest dichiara la foglia, e `secretPaths()` passa i dot-path al
logger — vedi [`examples/pino-redaction`](../pino-redaction). Qui si stampa con
`console.log`, che nessun logger intercetta.

```bash
pnpm start:api
curl localhost:3001
```
```json
{"status":"ok","db":"mongodb://admin:dev-password@localhost:27017"}
```

Anche qui la password si vede: la risposta HTTP la costruisce il servizio, e cosa metterci
è una sua decisione. Il package non filtra niente in uscita.

### Produzione

In `production` — ambiente online per default — `config.development.json` viene ignorato del
tutto e ogni valore deve passare dal suo provider:

```bash
mkdir -p /tmp/secrets
printf 'prod-password' > /tmp/secrets/mongodb_admin_password
printf 'sk_live_prod'  > /tmp/secrets/stripe_api_key

NODE_ENV=production MONGODB_HOST=mongo.prod RUN_SECRETS_DIR=/tmp/secrets pnpm start:billing
```

`RUN_SECRETS_DIR` sta al posto di `/run/secrets`, dove l'orchestratore monta i segreti.
Senza il file, l'avvio si ferma:

```
Startup failed: file '/run/secrets/stripe_api_key' required by 'billing.stripeKey' is not readable
```

Un refuso nella fetta richiesta si vede prima ancora di contattare un provider:

```
Startup failed: dot-path 'billing.typo' in REQUIRED_CONFIG not found in config.json
```

## Nell'immagine

`pnpm deploy` risolve il workspace e produce una directory autonoma, con `@example/config`
copiato dentro `node_modules` invece che collegato:

```bash
pnpm deploy --filter=billing --prod /out
cd /out && node src/index.js     # gira senza il resto del monorepo
```

Serve `inject-workspace-packages=true` nel `.npmrc` — da pnpm 10 `deploy` rifiuta di
procedere senza, e lo dice:

```
ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE  By default, starting from pnpm v10, we only deploy
from workspaces that have "inject-workspace-packages=true" set
```

Nel Dockerfile diventano due stadi: il primo esegue `pnpm deploy` sul monorepo, il secondo
copia solo il risultato.

```dockerfile
FROM node:22-slim AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm deploy --filter=billing --prod /out

FROM node:22-slim
WORKDIR /app
COPY --from=build /out ./
CMD ["node", "src/index.js"]
```

Nessun `COPY config/` e nessuna profondità di cartelle da rispettare: la config entra
nell'immagine perché è una dipendenza, come il resto.

## Note

`"@steada1995/confio": "file:../../../.."` è un artefatto dell'esempio: il package non è
pubblicato e questo lo collega alla cartella sorgente, quattro livelli sopra. In un progetto
vero è una dipendenza qualunque — `"@steada1995/confio": "^1.0.0"` — mentre `@example/config`
resta `workspace:*` finché è un pacchetto del monorepo.

`config/config.development.json` è versionato perché l'esempio sia eseguibile subito. In un
progetto vero l'overlay di sviluppo va in `.gitignore`, e in produzione non viene comunque
letto.
