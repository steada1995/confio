import { describe, it, beforeEach, afterEach } from 'node:test'
import assert                                  from 'node:assert/strict'
import { fixture }                             from './helpers.js'
import {
  resolveEnv,
  localConfigFileName,
  loadLocalConfig,
  isOnlineEnv,
  parseOnlineEnvs
} from '../src/env-config.js'

const withEnv = (env, run) => {
  const previous = process.env.NODE_ENV
  if (env === undefined) {
    delete process.env.NODE_ENV
  } else {
    process.env.NODE_ENV = env
  }

  try {
    return run()
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV
    } else {
      process.env.NODE_ENV = previous
    }
  }
}

beforeEach(() => { process.env.NODE_ENV = 'test' })
afterEach(() => {
  delete process.env.CONFIG_ONLINE_ENVS
  delete process.env.NODE_ENV
})

describe('env config', () => {

  describe('resolveEnv', () => {
    it('should read NODE_ENV', () => {
      assert.equal(withEnv('staging', resolveEnv), 'staging')
    })

    it('should fall back to production when NODE_ENV is not set', () => {
      assert.equal(withEnv(undefined, resolveEnv), 'production')
    })
  })

  describe('localConfigFileName', () => {
    it('should name the file after NODE_ENV', () => {
      assert.equal(withEnv('test',        localConfigFileName), 'config.test.json')
      assert.equal(withEnv('development', localConfigFileName), 'config.development.json')
      assert.equal(withEnv('production',  localConfigFileName), 'config.production.json')
    })
  })

  describe('isOnlineEnv', () => {
    it('should treat production, staging and qa as online by default', () => {
      for (const env of ['production', 'staging', 'qa'])
        assert.equal(withEnv(env, isOnlineEnv), true, env)

      for (const env of ['test', 'development'])
        assert.equal(withEnv(env, isOnlineEnv), false, env)
    })

    it('should follow CONFIG_ONLINE_ENVS when set', () => {
      process.env.CONFIG_ONLINE_ENVS = 'prod,staging'

      assert.deepEqual(parseOnlineEnvs(), ['prod', 'staging'])
      assert.equal(withEnv('prod',       isOnlineEnv), true)
      assert.equal(withEnv('production', isOnlineEnv), false)
      assert.equal(withEnv('test',       isOnlineEnv), false)
    })
  })

  describe('loadLocalConfig', () => {
    const base = fixture('initialize', 'base')

    it('should load config.<NODE_ENV>.json for local envs', () => {
      const values = withEnv('test', () => loadLocalConfig(base))
      assert.equal(values.db.mongodb.host, 'mongo.lab')
    })

    it('should return null for online envs', () => {
      assert.equal(withEnv('production', () => loadLocalConfig(base)), null)
    })

    it('should return null when the file is absent', () => {
      assert.equal(withEnv('staging-local', () => loadLocalConfig(base)), null)
    })
  })
})
