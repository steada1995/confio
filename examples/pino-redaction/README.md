# Redazione dei segreti con pino

Il package non maschera niente. `"secret": true` nel manifest è una **dichiarazione**:
`secretPaths()` la restituisce come elenco di dot-path, e a redigere è il logger
dell'applicazione.

```bash
npm install
npm start
```

## Come si collega

```javascript
import pino from 'pino'
import { initialize, getConfig, secretPaths } from 'confio'

await initialize({ requiredConfig: 'db.mongodb.adminPassword' })

const log = pino({ redact: secretPaths() })
log.info(getConfig(), 'config caricata')
// → "adminPassword":"[Redacted]"
```

Passare `secretPaths()` invece di riscrivere i percorsi a mano tiene allineate le due
liste: se rinomini una foglia nel manifest, la redazione la segue.

## Cosa copre e cosa no

`redact` di pino guarda **il nome e la posizione della chiave** dentro l'oggetto di log,
mai il valore. Da `src/index.js`, output reale:

| Come logghi | Esito |
|---|---|
| `log.info(config, '…')` | `[Redacted]` — i dot-path combaciano |
| `log.info({ cfg: config }, '…')` | in chiaro — il wrapper sposta i percorsi |
| `log.info({ password: config.db.mongodb.adminPassword })` | in chiaro finché `'password'` non è fra i path |
| `` log.info(`dsn=${config.db.mongodb.adminPassword}`) `` | in chiaro — il messaggio non passa da `redact` |
| `console.log(config.db.mongodb.adminPassword)` | in chiaro — la redazione è del logger |

Le regole pratiche che ne discendono:

- logga la config **alla radice** dell'oggetto di log, o adegua i percorsi al wrapper;
- non interpolare un segreto in una stringa: passalo come campo, se proprio deve comparire;
- se usi chiavi tue, aggiungile: `pino({ redact: [...secretPaths(), 'password'] })`.

I percorsi di pino sono case sensitive e il wildcard `*` copre un livello solo
(`db.*.password`), mentre un `*` finale redige l'intero nodo (`db.mongodb.*` nasconde
anche `host`).
