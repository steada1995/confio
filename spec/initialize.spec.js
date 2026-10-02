import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fixture } from './helpers.js'
import {
  initialize,
  getConfig,
  secretPaths,
  resetForTests,
  loadLocalConfig,
  projectRoot
} from '../src/index.js'
import { providerFactory, resetProvidersForTests } from '../src/providers/index.js'

const baseConfigDir    = fixture('initialize', 'base')
const partialConfigDir = fixture('initialize', 'partial')
const extraOptionsDir  = fixture('initialize', 'extra-options')
const emptySecretDir   = fixture('initialize', 'empty-secret')
const emptyOverlayDir  = fixture('initialize', 'empty-overlay')
const typedOverlayDir  = fixture('initialize', 'typed-overlay')
const testLocalValues       = () => loadLocalConfig(baseConfigDir)

beforeEach(() => {
  process.env.NODE_ENV = 'test'
})
afterEach(() => {
  resetForTests()
  resetProvidersForTests()
  delete process.env.NODE_ENV
  delete process.env.MONGODB_HOST
  delete process.env.REQUIRED_CONFIG
  delete process.env.RUN_SECRETS_DIR
  delete process.env.CONFIG_ONLINE_ENVS
  delete process.env.CONFIG_DIR
})

// ---------------------------------------------------------------------------

describe('initialize', () => {

  describe('when neither configDir nor CONFIG_DIR is provided', () => {
    it('should throw naming both ways to provide it', async () => {
      await assert.rejects(
        () => initialize({ requiredConfig: 'db.mongodb.host' }),
        /configDir is required.*initialize.*CONFIG_DIR/
      )
    })
  })

  describe('when configDir is absent but CONFIG_DIR is set', () => {
    it('should load from the directory named by the env var', async () => {
      process.env.CONFIG_DIR = baseConfigDir

      const config = await initialize({ requiredConfig: 'db.mongodb.host' })
      assert.equal(config.db.mongodb.host, testLocalValues().db.mongodb.host)
    })
  })

  describe('when both configDir and CONFIG_DIR are provided', () => {
    it('should use the option and ignore the env var', async () => {
      process.env.CONFIG_DIR = fixture('initialize', 'does-not-exist')

      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.equal(config.db.mongodb.host, testLocalValues().db.mongodb.host)
    })
  })

  describe('when initialize is called twice concurrently', () => {
    it('should share one load: same object, one provider call', async () => {
      process.env.NODE_ENV = 'production'   // online: no overlay, values come from the providers

      let calls = 0
      providerFactory.register('vault', {
        async get() {
          calls++
          await new Promise((resume) => setTimeout(resume, 20))
          return `secret-${calls}`
        }
      })

      const options = { configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' }
      const [first, second] = await Promise.all([initialize(options), initialize(options)])

      assert.equal(first, second)
      assert.equal(calls, 1)
    })

    it('should hand the same object to a call that arrives while the first is still loading',
      async () => {
        process.env.NODE_ENV = 'production'

        let calls = 0
        providerFactory.register('vault', {
          async get() {
            calls++
            await new Promise((resume) => setTimeout(resume, 40))
            return 'secret'
          }
        })

        const options = { configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' }
        const started = initialize(options)

        await new Promise((resume) => setTimeout(resume, 10))   // the first one is still waiting
        const late = initialize(options)

        assert.equal(await started, await late)
        assert.equal(calls, 1)
      })
  })

  describe('when initialize is called again with different options', () => {
    const load = () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })

    it('should reject naming the option that changed', async () => {
      await load()

      await assert.rejects(
        () => initialize({ configDir: partialConfigDir, requiredConfig: 'db.mongodb.host' }),
        new RegExp(`already called with different options.*configDir.*${baseConfigDir}.*${partialConfigDir}`)
      )
    })

    it('should reject when requiredConfig changes', async () => {
      await load()

      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host,db.mongodb.name' }),
        /already called with different options.*requiredConfig/
      )
    })

    it('should reject while the first load is still in flight', async () => {
      process.env.NODE_ENV = 'production'
      providerFactory.register('vault', {
        async get() {
          await new Promise((resume) => setTimeout(resume, 40))
          return 'secret'
        }
      })

      const started = initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' })

      await assert.rejects(
        () => initialize({ configDir: partialConfigDir, requiredConfig: 'db.mongodb.password' }),
        /already called with different options/
      )
      assert.equal((await started).db.mongodb.password, 'secret')
    })

    it('should leave the loaded config untouched', async () => {
      const config = await load()

      await assert.rejects(() => initialize({ configDir: partialConfigDir }))

      assert.strictEqual(getConfig(), config)
      assert.strictEqual(await load(), config)
    })
  })

  describe('when initialize is called again with the same options written differently', () => {
    it('should return the singleton for a relative configDir pointing at the same directory', async () => {
      const relative = path.relative(projectRoot(), baseConfigDir)

      const config1 = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      const config2 = await initialize({ configDir: relative,      requiredConfig: 'db.mongodb.host' })
      assert.strictEqual(config1, config2)
    })

    it('should return the singleton when the second call reads the env vars instead', async () => {
      const config1 = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })

      process.env.CONFIG_DIR      = baseConfigDir
      process.env.REQUIRED_CONFIG = ' db.mongodb.host '
      assert.strictEqual(await initialize(), config1)
    })
  })

  describe('when a required leaf points at an unregistered source', () => {
    it('should throw before contacting any provider', async () => {
      process.env.NODE_ENV = 'production'   // online: no overlay, values come from the providers
      let contacted = 0
      providerFactory.register('env', { get(key) { contacted++; return 'x' } })

      await assert.rejects(
        () => initialize({
          configDir: fixture('loader', 'invalid-source'),
          requiredConfig: 'db.mongodb.host'
        }),
        /source 'ftp' required by 'db\.mongodb\.host' is not registered — available: env, file/
      )
      assert.equal(contacted, 0)
    })
  })

  describe('when a leaf declares extraOptions', () => {
    const recordingVault = () => {
      const calls = []
      providerFactory.register('vault', {
        get(key, extraOptions) {
          calls.push({ key, extraOptions })
          return `value-of-${key}`
        }
      })
      return calls
    }

    it('should hand them to the provider as the second argument', async () => {
      const calls = recordingVault()

      await initialize({ configDir: extraOptionsDir, requiredConfig: 'db.mongodb.password' })

      assert.deepEqual(calls, [{
        key:          'prod/db-password',
        extraOptions: { VersionStage: 'AWSPREVIOUS', VersionId: 'abc123' }
      }])
    })

    it('should pass undefined for a leaf that does not declare them', async () => {
      const calls = recordingVault()

      await initialize({ configDir: extraOptionsDir, requiredConfig: 'db.mongodb.host' })

      assert.deepEqual(calls, [{ key: 'prod/host', extraOptions: undefined }])
    })

    it('should keep resolving the value, secret leaf included', async () => {
      recordingVault()

      const config = await initialize({
        configDir:      extraOptionsDir,
        requiredConfig: 'db.mongodb.host,db.mongodb.password'
      })

      assert.equal(config.db.mongodb.host,     'value-of-prod/host')
      assert.equal(config.db.mongodb.password, 'value-of-prod/db-password')
      assert.deepEqual([...secretPaths()], ['db.mongodb.password'])
    })

    it('should not reach the provider at all when the local overlay covers the leaf', async () => {
      const calls = recordingVault()

      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' })

      assert.deepEqual(calls, [])
      assert.equal(config.db.mongodb.password, testLocalValues().db.mongodb.password)
    })
  })

  describe('when a resolved value is missing or empty', () => {
    beforeEach(() => { process.env.NODE_ENV = 'production' })   // online: no overlay

    it('should refuse an empty secret from the file provider', async () => {
      process.env.RUN_SECRETS_DIR = fixture('secrets', 'blank-value')

      await assert.rejects(
        () => initialize({ configDir: emptySecretDir, requiredConfig: 'db.mongodb.name' }),
        /'db\.mongodb\.name' got an empty value from source 'file'/
      )
    })

    it('should refuse an empty value coming from the local config file', async () => {
      process.env.NODE_ENV = 'test'

      await assert.rejects(
        () => initialize({ configDir: emptyOverlayDir, requiredConfig: 'db.mongodb.host' }),
        /'db\.mongodb\.host' got an empty value from the local config file/
      )
    })

    it('should keep telling the provider errors apart from the value errors', async () => {
      providerFactory.register('vault', { get() { throw new Error('unreachable') } })

      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' }),
        /secret 'prod\/secret' \(vault\) required by 'db\.mongodb\.password' is not reachable/
      )
    })
  })

  describe('when a required leaf is marked secret', () => {
    it('should still hand back the real value: the package does not mask', async () => {
      const config = await initialize({
        configDir: fixture('initialize', 'secret'),
        requiredConfig: 'db.mongodb.host,db.mongodb.password'
      })

      assert.equal(config.db.mongodb.password, 'local-secret')
      assert.match(JSON.stringify(config), /local-secret/)
    })
  })
  describe('when configDir names a package instead of a path', () => {
    it('should load the config.json that package ships', async () => {
      process.env.NODE_ENV    = 'production'
      process.env.MONGODB_HOST = 'mongo.prod'

      const realArgv  = process.argv[1]
      process.argv[1] = fixture('package-config', 'app.js')

      try {
        const config = await initialize({
          configDir:      '@fixture/config',
          requiredConfig: 'db.mongodb.host'
        })

        assert.equal(config.db.mongodb.host, 'mongo.prod')
      } finally {
        process.argv[1] = realArgv
      }
    })
  })

  describe('secretPaths', () => {
    it('should list the dot-paths of the leaves marked secret', async () => {
      await initialize({
        configDir: fixture('initialize', 'secret'),
        requiredConfig: 'db.mongodb.host,db.mongodb.password'
      })

      assert.deepEqual([...secretPaths()], ['db.mongodb.password'])
    })

    it('should be empty when no required leaf is marked secret', async () => {
      await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })

      assert.deepEqual([...secretPaths()], [])
    })

    it('should refuse to answer before initialize, like getConfig', () => {
      assert.throws(() => secretPaths(), /Config is not initialized/)
    })
  })

  describe('when REQUIRED_CONFIG is not set', () => {
    it('should throw with a clear error message', async () => {
      await assert.rejects(
        () => initialize({ configDir: baseConfigDir }),
        /REQUIRED_CONFIG is not set/
      )
    })
  })

  describe('when a required dot-path does not exist in config.json', () => {
    it('should throw naming the missing dot-path', async () => {
      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.unknown' }),
        /dot-path 'db\.mongodb\.unknown' in REQUIRED_CONFIG not found/
      )
    })
  })

  describe('when NODE_ENV is online (production)', () => {
    beforeEach(() => { process.env.NODE_ENV = 'production' })

    it('should throw when a required env var is not set', async () => {
      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' }),
        /ENV var 'MONGODB_HOST' required by 'db\.mongodb\.host' is not set/
      )
    })

    it('should throw when a required file secret does not exist', async () => {
      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.name' }),
        /file '\/run\/secrets\/mongodb_name' required by 'db\.mongodb\.name' is not readable/
      )
    })

    it('should throw when a required remote secret is not reachable', async () => {
      providerFactory.register('vault', { async get() { throw new Error('unreachable') } })
      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.password' }),
        /secret 'prod\/secret' \(vault\) required by 'db\.mongodb\.password' is not reachable/
      )
    })

    it('should keep the error of a provider registered in place of env', async () => {
      process.env.MONGODB_HOST = 'mongo.prod'   // set: "not set" would be a lie
      providerFactory.register('env', { async get() { throw new Error('vault timeout') } })

      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' }),
        /secret 'MONGODB_HOST' \(env\) required by 'db\.mongodb\.host' is not reachable — vault timeout/
      )
    })

    it('should keep the error of a provider registered in place of file', async () => {
      providerFactory.register('file', { get() { throw new Error('permission denied') } })

      await assert.rejects(
        () => initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.name' }),
        /secret 'mongodb_name' \(file\) required by 'db\.mongodb\.name' is not reachable — permission denied/
      )
    })

    it('should resolve values from providers, ignoring config.production.json if present', async () => {
      process.env.MONGODB_HOST = 'mongo.prod'
      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.equal(config.db.mongodb.host, 'mongo.prod')
    })
  })

  describe('when NODE_ENV is local and config.<env>.json is present', () => {
    it('should resolve values from the local config file', async () => {
      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.equal(config.db.mongodb.host, testLocalValues().db.mongodb.host)
    })

    it('should resolve env, file and vault values from config.test.json', async () => {
      const config = await initialize({
        configDir: baseConfigDir,
        requiredConfig: 'db.mongodb.host,db.mongodb.name,db.mongodb.password'
      })

      const expected = testLocalValues().db.mongodb
      assert.equal(config.db.mongodb.host,     expected.host)
      assert.equal(config.db.mongodb.name,     expected.name)
      assert.equal(config.db.mongodb.password, expected.password)
    })

    it('should keep the JSON type of every value taken from the local file', async () => {
      const config = await initialize({
        configDir:      typedOverlayDir,
        requiredConfig: 'http.port,http.debug,http.host'
      })

      assert.equal(config.http.port,  3000)
      assert.equal(config.http.debug, false)
      assert.equal(config.http.host,  'localhost')
    })

    it('should fall back to provider when a value is missing in the local file', async () => {
      providerFactory.register('vault', {
        async get(key) {
          if (key === 'prod/secret') return 'from-vault'
          throw new Error('not found')
        }
      })

      const config = await initialize({
        configDir: partialConfigDir,
        requiredConfig: 'db.mongodb.host,db.mongodb.password'
      })

      assert.equal(config.db.mongodb.host,     'mongo.lab')
      assert.equal(config.db.mongodb.password, 'from-vault')
    })

    it('should not expose dot-paths that were not in REQUIRED_CONFIG', async () => {
      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.equal(config.db?.mongodb?.name,     undefined)
      assert.equal(config.db?.mongodb?.password, undefined)
    })

    it('should return a deep frozen object — throws on any nested mutation', async () => {
      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.throws(() => { config.db            = {} })
      assert.throws(() => { config.db.mongodb    = {} })
      assert.throws(() => { config.db.mongodb.host = 'changed' })
    })

    it('should return the same singleton on subsequent calls', async () => {
      const config1 = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      const config2 = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.strictEqual(config1, config2)
    })
  })
})

// ---------------------------------------------------------------------------

describe('getConfig', () => {
  describe('when initialize was called and failed', () => {
    it('should say the config is not ready, not that initialize is still to be called', async () => {
      await initialize({ configDir: fixture('initialize', 'does-not-exist'), requiredConfig: 'x' })
        .catch(() => {})

      assert.throws(() => getConfig(), /Config is not ready — initialize\(\) has not finished, or it failed/)
    })
  })

  describe('when initialize has not been called', () => {
    it('should throw', () => {
      assert.throws(
        () => getConfig(),
        /Config is not initialized/
      )
    })
  })

  describe('when initialize has been called', () => {
    it('should return the same object as initialize', async () => {
      const config = await initialize({ configDir: baseConfigDir, requiredConfig: 'db.mongodb.host' })
      assert.strictEqual(getConfig(), config)
    })
  })
})
