import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { normalizeOptions, assertSameOptions } from '../src/options.js'
import { fixture } from './utilities/index.mjs'

afterEach(() => {
  delete process.env.CONFIG_DIR
  delete process.env.REQUIRED_CONFIG
})

// ---------------------------------------------------------------------------

describe('normalizeOptions', () => {

  describe('configDir', () => {
    it('should turn a relative configDir into an absolute path under the project root', () => {
      const normalized = normalizeOptions({ configDir: path.join('spec', 'fixtures') })
      assert.equal(normalized.configDir, fixture())
    })

    it('should give the same value whether it arrives as option or as CONFIG_DIR', () => {
      process.env.CONFIG_DIR = '/app/config'

      assert.equal(normalizeOptions({}).configDir,                          '/app/config')
      assert.equal(normalizeOptions({ configDir: '/app/config' }).configDir, '/app/config')
    })

    it('should be null when neither is provided, without throwing', () => {
      assert.equal(normalizeOptions({}).configDir, null)
    })
  })

  describe('requiredConfig', () => {
    it('should ignore spacing around the dot-paths', () => {
      assert.equal(
        normalizeOptions({ requiredConfig: ' db.host , db.name ' }).requiredConfig,
        'db.host,db.name'
      )
    })

    it('should keep the order as written', () => {
      assert.equal(normalizeOptions({ requiredConfig: 'b,a' }).requiredConfig, 'b,a')
    })

    it('should fall back to REQUIRED_CONFIG', () => {
      process.env.REQUIRED_CONFIG = 'db.host'
      assert.equal(normalizeOptions({}).requiredConfig, 'db.host')
    })

    it('should be null when empty, blank or not a string', () => {
      assert.equal(normalizeOptions({ requiredConfig: '' }).requiredConfig,      null)
      assert.equal(normalizeOptions({ requiredConfig: ' , ' }).requiredConfig,   null)
      assert.equal(normalizeOptions({ requiredConfig: ['a'] }).requiredConfig,   null)
      assert.equal(normalizeOptions({}).requiredConfig,                          null)
    })
  })

})

// ---------------------------------------------------------------------------

describe('assertSameOptions', () => {
  const loaded = { configDir: '/app/config', requiredConfig: 'db.host' }

  describe('when the options match', () => {
    it('should not throw', () => {
      assert.doesNotThrow(() => assertSameOptions(loaded, { ...loaded }))
    })
  })

  describe('when an option differs', () => {
    it('should name the option and both values', () => {
      assert.throws(
        () => assertSameOptions(loaded, { ...loaded, configDir: '/other/config' }),
        /configDir: "\/app\/config" vs "\/other\/config"/
      )
    })

    it('should report every option that changed', () => {
      assert.throws(
        () => assertSameOptions(loaded, { configDir: null, requiredConfig: 'db.name' }),
        (err) => {
          assert.match(err.message, /configDir: "\/app\/config" vs \(not set\)/)
          assert.match(err.message, /requiredConfig: "db\.host" vs "db\.name"/)
          return true
        }
      )
    })

    it('should point at getConfig as the way to read the loaded config', () => {
      assert.throws(
        () => assertSameOptions(loaded, { ...loaded, requiredConfig: 'db.name' }),
        /loaded once per process.*getConfig\(\)/s
      )
    })
  })
})
