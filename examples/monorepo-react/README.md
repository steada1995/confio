# Monorepo con backend e frontend React, una config sola

Un solo `config/` nella radice, letto **solo dal backend**. Il frontend non importa
`confio`: riceve dall'API le foglie che gli servono.

```bash
npm install
npm run start:api     # http://localhost:3001
npm run dev:web       # http://localhost:5173
```

## Perché il browser non legge la config

`confio` legge file JSON, variabili d'ambiente e segreti montati dall'orchestratore:
è codice Node. Nel browser non c'è niente di tutto questo — e se anche ci fosse, ogni
valore letto finirebbe dentro un bundle scaricabile da chiunque apra la pagina. Un segreto
in un file JavaScript servito al pubblico non è più un segreto.

Vale anche per la scorciatoia abituale, `VITE_*` nel `.env` del frontend: quei valori sono
sostituiti nel bundle a build time, quindi sono pubblici per costruzione, e ti obbligano a
tenere allineate due dichiarazioni della stessa cosa.

## Come sono divisi i ruoli

| | Chi | Cosa vede |
|---|---|---|
| `config/config.json` | il manifest unico | tutte le foglie |
| `apps/api` | `initialize()` + `getConfig()` | tutto ciò che dichiara in `requiredConfig` |
| `apps/api/src/public-config.js` | l'elenco esplicito | `web.apiBaseUrl`, `web.appName` |
| `apps/web` | `fetch('/config')` | solo quelle due |

`publicConfig()` è il punto di controllo: il criterio non è "non è marcato secret", è
"serve alla pagina". `db.mongodb.host` non è un segreto, ma nel browser non ha niente da
fare.

Verifica che regge: dopo `npm run build:web`, in `apps/web/dist` non compare né la password
né l'host del database.

## In sviluppo

La pagina chiama sempre `/config` sulla propria origine; in sviluppo è Vite a inoltrare
all'API (`server.proxy` in `apps/web/vite.config.js`). In produzione l'API sta dietro lo
stesso dominio, e non cambia niente nel codice della pagina. Se la 3001 è occupata,
`API_ORIGIN` sposta il target del proxy.
