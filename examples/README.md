# Examples

Runnable projects: two ways of pointing a service at its config, one on serving a browser
frontend, one on redacting secrets. Same package, same manifest format — what changes is
how `config/` is reached, and who is allowed to see it.

- [`modular-monorepo/`](./modular-monorepo) — **one `config/` in the repo root**, shared by
  every service and identical in development and production. `configDir` is anchored to the
  source file with `import.meta.url`, so the same directory is found whatever the current
  working directory or the entrypoint. Each service declares its slice of the shared
  manifest through `requiredConfig`. npm workspaces. Start here.

- [`microservices-pnpm/`](./microservices-pnpm) — **`config/` as a dependency**. It is a
  workspace package — the config files plus a `package.json`, no code — that every service
  declares and resolves through module resolution, so no service knows where it sits or how
  deep. `pnpm deploy` then copies it into the image like any other dependency. pnpm
  workspace.

- [`monorepo-react/`](./monorepo-react) — **one config, a backend and a React frontend**.
  Only the backend reads it; the browser gets the two leaves it needs from an endpoint, so
  no secret ever reaches the bundle. npm workspaces, Vite.

- [`pino-redaction/`](./pino-redaction) — **secrets and the logger**. The package only
  declares which leaves are secret; `secretPaths()` hands those dot-paths to pino's
  `redact`, and the example shows line by line what stays covered and what does not.

- [`providers/`](./providers) — reference custom providers built on official SDKs, meant to
  be copied into your own project and registered with `providerFactory.register()`:
  - `aws.provider.js` — AWS Secrets Manager (`@aws-sdk/client-secrets-manager`)
  - `azure.provider.js` — Azure Key Vault (`@azure/keyvault-secrets`, `@azure/identity`)

None of this directory's dependencies are installed by the package itself — see each
example's own instructions.
