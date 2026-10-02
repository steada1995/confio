import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fixture } from './helpers.js'
import { providerFactory, resetProvidersForTests } from '../src/providers/index.js'

afterEach(() => {
  resetProvidersForTests()
  delete process.env.RUN_SECRETS_DIR
})

// ---------------------------------------------------------------------------

describe('EnvProvider', () => {
  describe('when the env var is set', () => {
    it('should return its value', () => {
      process.env._TEST_VAR = 'hello'
      assert.equal(providerFactory.get('env').get('_TEST_VAR'), 'hello')
      delete process.env._TEST_VAR
    })
  })

  describe('when the env var is not set', () => {
    it('should throw with the var name in the message', () => {
      assert.throws(
        () => providerFactory.get('env').get('_NONEXISTENT_VAR_XYZ'),
        /ENV var '_NONEXISTENT_VAR_XYZ' is not set/
      )
    })
  })

  describe('when the env var is an empty string', () => {
    it('should throw as if it were not set', () => {
      process.env._TEST_EMPTY = ''
      assert.throws(
        () => providerFactory.get('env').get('_TEST_EMPTY'),
        /is not set/
      )
      delete process.env._TEST_EMPTY
    })
  })
})

// ---------------------------------------------------------------------------

describe('FileProvider', () => {
  describe('when the secret file exists', () => {
    it('should return the file content', () => {
      process.env.RUN_SECRETS_DIR = fixture('secrets', 'mykey')
      assert.equal(providerFactory.get('file').get('mykey'), 'myvalue')
    })

    it('should trim whitespace from the value', () => {
      process.env.RUN_SECRETS_DIR = fixture('secrets', 'mykey-trim')
      assert.equal(providerFactory.get('file').get('mykey'), 'myvalue')
    })
  })

  describe('when the secret file does not exist', () => {
    it('should throw with the file path in the message', () => {
      const dir = fixture('secrets', 'empty')
      process.env.RUN_SECRETS_DIR = dir
      const missing = path.join(dir, 'nonexistent')
      assert.throws(
        () => providerFactory.get('file').get('nonexistent'),
        new Error(`file '${missing}' is not readable`)
      )
    })
  })
})

// ---------------------------------------------------------------------------

describe('providerFactory', () => {
  describe('when a custom provider is registered', () => {
    it('should be retrievable by its source name', async () => {
      providerFactory.register('vault', { async get(key) { return `mock:${key}` } })
      const result = await providerFactory.get('vault').get('mypath')
      assert.equal(result, 'mock:mypath')
    })
  })

  describe('when an unknown source is requested', () => {
    it('should throw with the source name in the message', () => {
      assert.throws(
        () => providerFactory.get('unknown'),
        /Unknown config provider: 'unknown'/
      )
    })
  })

  describe('when the source names a member of Object.prototype', () => {
    it('should treat it as unknown, not as an inherited property', () => {
      assert.equal(providerFactory.has('toString'), false)
      assert.equal(providerFactory.has('constructor'), false)
      assert.throws(
        () => providerFactory.get('toString'),
        /Unknown config provider: 'toString'/
      )
    })
  })

  describe('when resetProvidersForTests is called', () => {
    it('should restore only the built-in providers', () => {
      providerFactory.register('custom', { get() { return 'x' } })
      resetProvidersForTests()
      assert.throws(() => providerFactory.get('custom'), /Unknown/)
      assert.ok(providerFactory.get('env'))
      assert.ok(providerFactory.get('file'))
    })
  })
})
