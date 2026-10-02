import { initialize, getConfig, secretPaths } from 'confio'
import { buildLogger } from './logger.js'

const CONFIG_DIR = new URL('../config', import.meta.url).pathname

// La config si carica per prima: secretPaths() è disponibile solo dopo, perché sa quali
// foglie sono state davvero risolte — non tutte quelle scritte nel manifest.
await initialize({
  configDir:      process.env.CONFIG_DIR ?? CONFIG_DIR,
  requiredConfig: 'http.port,db.mongodb.host,db.mongodb.adminPassword'
})

const config = getConfig()
const log    = buildLogger()

console.log('dot-path dichiarati segreti:', secretPaths())
// → [ 'db.mongodb.adminPassword' ]

// 1. La config alla radice dell'oggetto di log: i dot-path del manifest combaciano con i
//    percorsi dentro il log, quindi la foglia segreta esce redatta.
log.info(config, 'config caricata')
// → "adminPassword":"[Redacted]", host e port in chiaro

// 2. Sotto un'altra chiave, invece, i percorsi non combaciano più: pino cerca
//    db.mongodb.adminPassword, qui il valore sta in cfg.db.mongodb.adminPassword.
log.info({ cfg: config }, 'config sotto una chiave diversa')
// → il segreto ESCE IN CHIARO. Serve redact: ['cfg.db.mongodb.adminPassword'], oppure
//   logga la config alla radice come al punto 1.

// 3. Il valore letto dalla foglia e messo sotto una chiave scelta da te è coperto solo se
//    quella chiave è dichiarata: qui non lo è.
log.info({ password: config.db.mongodb.adminPassword }, 'valore sotto una chiave propria')
// → IN CHIARO. Con pino({ redact: [...secretPaths(), 'password'] }) sarebbe redatto:
//   la regola guarda il nome e la posizione della chiave, mai il valore.

// 4. Il valore interpolato in una stringa non è coperto in nessun caso: redact lavora
//    sull'oggetto, non sul messaggio.
log.info(`connessione: mongodb://admin:${config.db.mongodb.adminPassword}@host`)
// → IN CHIARO. Non interpolare i segreti: passali come campo dell'oggetto di log.

// 5. Anche console.log resta fuori: la redazione è del logger, non del processo.
console.log('con console.log:', config.db.mongodb.adminPassword)
// → IN CHIARO.
