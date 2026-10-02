# confio

Environment variable and secret configuration for Node.

No dependencies. ESM only. Node >= 18.

> [!NOTE]
> Names like `db.mongodb`, `MONGODB_HOST` or `http.port` are examples: the dot-paths, keys
> and manifest structure are yours to decide.

### At a glance

```javascript
import { initialize, getConfig } from '@steada1995/confio'

await initialize({ configDir: '/app/config', requiredConfig: 'db.mongodb.host' })   // once, at the entrypoint

const config = getConfig()                       // anywhere else
config.db.mongodb.host                           // → "mongo.prod"
```

---

## Why

One place where a service's variables and secrets are declared: `config.json`, versioned
alongside the code.

And one common way to retrieve them, so that no microservice in the monorepo has to
write its own. Code reading `config.db.mongodb.password` does not know whether an
environment variable, a file mounted by the orchestrator or a remote secret manager sits
behind it: that is in the manifest, and it changes there.

The rest follows from those two. The config is resolved in full before the service starts
listening, and the leaves you marked as secrets are listed for your logger to redact. The
sections below explain how.

---

## Installation

```bash
npm install @steada1995/confio
```

Providers for remote secret managers are not bundled — see
[Custom providers](#custom-providers).

---

## Quick start

**1. Declare the values in `config.json`:**

```json
{
  "version": "1.0.0",
  "http": {
    "port": { "source": "env", "key": "PORT" }
  },
  "db": {
    "mongodb": {
      "host":          { "source": "env",  "key": "MONGODB_HOST" },
      "adminPassword": { "source": "file", "key": "mongodb_admin_password", "secret": true }
    }
  }
}
```

Every leaf is `{ source, key }` plus two optional fields — see [The manifest](#the-manifest).
Anything that is not a leaf is a container: nest as deep as you like.

**2. Load it once, at the entrypoint, before anything else:**

```javascript
import { fileURLToPath } from 'node:url'
import { initialize } from '@steada1995/confio'

process.env.REQUIRED_CONFIG = 'http.port,db.mongodb.host,db.mongodb.adminPassword'

await initialize({ configDir: fileURLToPath(new URL('../config', import.meta.url)) })

startServer()
```

**3. Read it anywhere:**

```javascript
import { getConfig } from '@steada1995/confio'

const config = getConfig()

config.http.port                 // → "3000"   (a string: it came from the env provider)
config.db.mongodb.host           // → "mongo.prod"
config.db.mongodb.adminPassword  // → the real secret, readable
JSON.stringify(config)           // → the secret is there too: masking is your logger's job
```

The returned object is read-only at every level. Trying to change it gives:

```
TypeError: Cannot assign to read only property 'host' of object '#<Object>'
```

---

## The manifest

`config.json` lives in the directory named by `configDir` or `CONFIG_DIR`. A leaf takes:

| Field          | Required | What it is                                                          |
|----------------|----------|---------------------------------------------------------------------|
| `source`       | yes      | Which provider resolves it: `env`, `file`, or one you registered     |
| `key`          | yes      | What that provider has to fetch: variable name, file name, secret id |
| `secret`       | no       | `true` lists the leaf in `secretPaths()`, for your logger to redact |
| `extraOptions` | no       | Free-form object handed to the provider, untouched                   |

`source` and `key` must be non-empty strings.

One key is ignored at any level, `version`: it is not read as a leaf and does not reach
the result.

### `extraOptions`

The package checks that it is an object and nothing more: what goes inside is between you
and your provider. It arrives as the second argument of `get()`. The typical use is
pinning the version of a secret:

```json
"apiKey": {
  "source": "aws",
  "key": "prod/external-api-key",
  "secret": true,
  "extraOptions": { "VersionStage": "AWSPREVIOUS" }
}
```

Each service spells versions differently, for example: AWS Secrets Manager takes
`VersionId` or `VersionStage` as separate request fields — omit both and it returns
`AWSCURRENT`; Azure Key Vault takes `{ version }`.

---

## Sources

Built in:

| source | Where it reads from                               | Visible in `printenv` |
|--------|---------------------------------------------------|-----------------------|
| `env`  | `process.env[key]`                                | yes                   |
| `file` | `<RUN_SECRETS_DIR>/<key>`, default `/run/secrets` | no                    |

`file` is for secrets the orchestrator mounts into the container filesystem: Docker Swarm
puts them under `/run/secrets/<name>`, Kubernetes wherever your volume says — point
`RUN_SECRETS_DIR` at it.

An empty value is refused whatever its origin: an env var set to `""`, a secret file that
is blank or whitespace only, a provider returning `""`. You do not get `""` in the config:
`initialize()` fails and the service does not start, with

```
Startup failed: 'db.mongodb.adminPassword' got an empty value from source 'file'
```

Providers for remote secret managers (AWS Secrets Manager, Azure Key Vault, HashiCorp
Vault, …) are **not bundled**: write one against the SDK you already use — see
[Custom providers](#custom-providers).

---

## Environments

The environment is named by the `NODE_ENV` environment variable, and it is what decides how
values are resolved. Unset, it is `production`: a forgotten `NODE_ENV` resolves through the
providers rather than through a local file that happened to be lying around. Two modes.

**Online environments** — `production`, `staging`, `qa`; the list changes with the
`CONFIG_ONLINE_ENVS` environment variable. Values come only from providers. No local file
is read, even if one is sitting right there.

**Every other environment** — `development`, `test`, whatever you name it. The package
reads `config.<NODE_ENV>.json` from the same directory and uses it as an overlay: for each
leaf the local value wins if present, otherwise the provider declared in `config.json`
answers.

```jsonc
// config.development.json
{
  "db": {
    "mongodb": {
      "host": "localhost",
      "adminPassword": "dev-password"
    }
  }
}
```

With that file a developer runs the service on their own machine without installing
anything: no reachable vault, no secret files under `/run/secrets`, no environment
variables exported by hand. Leaves the overlay does not cover still go through their
provider.

An overlay value enters the config as it is written: `"port": 3000` gives the number
`3000`, `"debug": false` the boolean `false`. The same leaf resolved through `env` or `file`
is a string.

---

## Environment variables

| Variable             | Default                 | What it does                                                                    |
|----------------------|-------------------------|----------------------------------------------------------------------------------|
| `CONFIG_DIR`         | — (required)            | Directory holding `config.json`, unless `configDir` is passed to `initialize()`  |
| `REQUIRED_CONFIG`    | — (required)            | Comma-separated dot-paths to resolve, unless `requiredConfig` is passed          |
| `NODE_ENV`           | `production`            | Selects the environment and `config.<NODE_ENV>.json`                            |
| `CONFIG_ONLINE_ENVS` | `production,staging,qa` | Environments that ignore the local overlay                                      |
| `RUN_SECRETS_DIR`    | `/run/secrets`          | Base directory for the `file` provider                                          |

### `REQUIRED_CONFIG` decides what is loaded

Only the dot-paths listed there are resolved. Everything else in `config.json` is left
alone and its provider is never contacted, so one manifest can describe more than a given
service needs:

```
REQUIRED_CONFIG=http.port,db.mongodb.host,db.mongodb.adminPassword
```

A dot-path that is not in `config.json` stops the startup. A value that is in
`config.json` but not in `REQUIRED_CONFIG` is simply absent from the result.

### `CONFIG_DIR`

A relative `CONFIG_DIR` resolves against the project root — the first `package.json` above
the entrypoint, outside `node_modules` — and not against the directory you ran the command
from.

The difference shows with a service in `apps/api/` whose config sits in `apps/api/config/`.
With `CONFIG_DIR=./config`, both `node apps/api/src/index.js` from the monorepo root and
`node src/index.js` from inside `apps/api/` find the same directory. Were the path resolved
against the current directory, the first of the two would look for `config/` at the root
and not find it.

#### Naming a package instead of a path

When that directory does not exist, the value is tried once more as a package name:

```javascript
await initialize({ configDir: '@example/config', requiredConfig: '…' })
```

This is for config shipped as a workspace package, declared by each service among its own
dependencies. That is how
[`examples/microservices-pnpm`](./examples/microservices-pnpm) is built.

---

## Secrets

Mark the leaf and the rest follows:

```json
"adminPassword": { "source": "file", "key": "mongodb_admin_password", "secret": true }
```

The package resolves the value and hands it back as it is; who hides it from the logs is
your logger. `secretPaths()` returns the dot-paths of the resolved leaves declared as
secret: a secret leaf left out of `REQUIRED_CONFIG` is not in the config, so it is not
listed either. How it hooks into pino, and what stays uncovered, is in
[`examples/pino-redaction`](./examples/pino-redaction).

---

## Custom providers

Register before calling `initialize()`:

```javascript
import { providerFactory, initialize } from '@steada1995/confio'

providerFactory.register('vault', {
  async get(key, extraOptions) {
    return fetchFromVault(key, extraOptions)
  }
})

await initialize({ configDir: '/app/config' })
```

From then on `"vault"` is a valid `source` in the manifest, and every leaf declaring it is
resolved by that `get()`:

```json
"apiKey": {
  "source": "vault",
  "key": "prod/external-api-key",
  "extraOptions": { "version": "3" }
}
```

```javascript
get('prod/external-api-key', { version: '3' })   // what the package calls
```

Both arguments come from the leaf and from nowhere else: `key` is its `key`, `extraOptions`
its `extraOptions` — `undefined` when the leaf declares none. The dot-path
(`external.apiKey`) is not passed: the provider does not know where the value will land,
and does not need to.

A provider is any object with one required method, `get`. Two constraints:

- **Sync or async, as you prefer**: a returned promise is awaited.
- **It must return a string.** A JSON secret is fine — return it as text and let the
  caller parse it. The package does not police the type; returning an object leaves you
  with an object in the config.

Throw and the startup stops: the message carries the leaf's dot-path alongside your own
error, so it is clear which value was missing.

The first argument of `register()` is the source name, the one you then write in
`"source"`. Passing `'env'` or `'file'` — the two built-in sources — replaces the provider
serving them.

Sources are checked before any provider is contacted: a `source` nobody registered stops
the startup without a single network call.

---

## Error messages

Every failure is a `Startup failed:` line naming what went wrong — the dot-path involved,
when there is one:

```
Startup failed: configDir is required — pass initialize({ configDir }) or set CONFIG_DIR
Startup failed: REQUIRED_CONFIG is not set
Startup failed: '/app/config/config.json' not found
Startup failed: '/app/config/config.json' is not valid JSON — Unexpected end of JSON input
Startup failed: config.json is not valid — db.mongodb.host: 'key' must be set
Startup failed: config.json is not valid — db.mongodb.host: 'key' must be a non-empty string
Startup failed: config.json is not valid — db.mongodb.host: unexpected property 'extra'
Startup failed: config.json is not valid — external.apiKey: 'extraOptions' must be an object
Startup failed: config.json is not valid — db.mongodb.host: expected { source, key } or a nested object
Startup failed: dot-path 'db.mongodb.host' in REQUIRED_CONFIG not found in config.json
Startup failed: source 'ftp' required by 'db.mongodb.host' is not registered — available: env, file
Startup failed: ENV var 'MONGODB_HOST' required by 'db.mongodb.host' is not set
Startup failed: file '/run/secrets/mongodb_name' required by 'db.mongodb.name' is not readable
Startup failed: secret 'prod/secret' (vault) required by 'db.mongodb.password' is not reachable — timeout
Startup failed: 'db.mongodb.password' got no value from source 'vault'
Startup failed: 'db.mongodb.password' got an empty value from source 'file'
```

They are raised in that order — the options, then the files, then the manifest shape, then
dot-paths and sources, then, leaf by leaf, the provider and the value it returned — so the
first thing you see is the first thing to fix. Manifest problems are reported all at once,
not one per run.

One more comes from calling `initialize()` a second time with different options:

```
Startup failed: initialize() was already called with different options (requiredConfig: "http.port" vs "db.mongodb.host") — the config is loaded once per process: …
```

---

## Examples

Four runnable projects, each with its own README:

- [`modular-monorepo/`](./examples/modular-monorepo) — one `config/` in the repo root,
  shared by every service. npm workspaces.
- [`microservices-pnpm/`](./examples/microservices-pnpm) — `config/` as a dependency: a
  workspace package each service declares and names in `configDir`. pnpm.
- [`monorepo-react/`](./examples/monorepo-react) — a backend and a React frontend on one
  config: the browser gets only the public leaves, from an endpoint.
- [`pino-redaction/`](./examples/pino-redaction) — `secretPaths()` handed to
  `pino({ redact })`, with the five covered and uncovered cases.

`examples/providers/` holds two reference providers built on the official SDKs, meant to be
copied into your own project: `aws.provider.js` and `azure.provider.js`.

---

## Limits

Deliberate, not oversights:

- **No hot reload.** The config is read once per process. Rotating a secret reaches the
  service at its next restart.

---

## License

MIT
