import { describe, it } from 'node:test'
import assert           from 'node:assert/strict'
import { fixture } from './helpers.js'
import { loadManifest } from '../src/loader.js'
import { loadLocalConfig } from '../src/env-config.js'

process.env.NODE_ENV = 'test'

// loadManifest also validates the required dot-paths: with none required there is nothing to validate
const load = (configDir, requiredPaths = []) =>
  loadManifest(configDir, { requiredPaths, localOverlay: null })

describe('loadManifest', () => {

  describe('when config.json cannot be read', () => {
    it('should name the file that is missing, not leave an ENOENT to interpret', () => {
      assert.throws(() => load(fixture('loader', 'nowhere')),
        /Startup failed: '.*nowhere\/config\.json' not found/)
    })

    it('should name the file whose JSON is broken', () => {
      assert.throws(() => load(fixture('loader', 'broken-json')),
        /Startup failed: '.*broken-json\/config\.json' is not valid JSON —/)
    })
  })

  describe('when config.<NODE_ENV>.json supplies a required value', () => {
    it('should load even where the dot-path names an unregistered source', () => {
      const configDir    = fixture('loader', 'invalid-source')
      const localOverlay = loadLocalConfig(configDir)
      assert.equal(localOverlay.db.mongodb.host, 'mongo.lab')

      const { paths } = loadManifest(configDir, {
        requiredPaths: ['db.mongodb.host'],
        localOverlay
      })
      assert.ok(paths.has('db.mongodb.host'))
    })
  })

  describe('when config.<NODE_ENV>.json is broken', () => {
    it('should name the overlay file, not config.json', () => {
      assert.throws(() => loadLocalConfig(fixture('loader', 'broken-overlay')),
        /Startup failed: '.*broken-overlay\/config\.test\.json' is not valid JSON —/)
    })
  })

  describe('when a leaf is malformed', () => {
    it('should throw naming the leaf and the missing field', () => {
      assert.throws(
        () => load(fixture('loader', 'missing-key')),
        /config\.json is not valid — db\.mongodb\.host: 'key' must be set/
      )
    })

    it('should report exactly one problem for one mistake', () => {
      try {
        load(fixture('loader', 'missing-key'))
        assert.fail('expected loadManifest to throw')
      } catch (err) {
        const problems = err.message.split(' — ')[1]
        assert.equal(problems.split('; ').length, 1)
      }
    })
  })

  describe('when the source is unknown', () => {
    it('should load fine when that dot-path is not required', () => {
      const { paths } = load(fixture('loader', 'invalid-source'))
      assert.ok(paths.has('db.mongodb.host'))
    })

    it('should throw when that dot-path is required', () => {
      assert.throws(
        () => load(fixture('loader', 'invalid-source'), ['db.mongodb.host']),
        /source 'ftp' required by 'db\.mongodb\.host' is not registered/
      )
    })
  })

  describe('when a required dot-path is not in config.json', () => {
    it('should throw naming it', () => {
      assert.throws(
        () => load(fixture('loader', 'valid-paths'), ['db.mongodb.unknown']),
        /dot-path 'db\.mongodb\.unknown' in REQUIRED_CONFIG not found/
      )
    })
  })

  describe('when config.json is valid', () => {
    it('should return paths as a Set containing all dot-paths', () => {
      const { paths } = load(fixture('loader', 'valid-paths'))

      assert.ok(paths instanceof Set)
      assert.ok(paths.has('db.mongodb.host'))
      assert.ok(paths.has('db.mongodb.name'))
      assert.equal(paths.size, 2)
    })

    it('should return config preserving the nested structure', () => {
      const { config } = load(fixture('loader', 'valid-structure'))

      assert.equal(config.db.mongodb.host.source, 'env')
      assert.equal(config.db.mongodb.host.key,    'MONGODB_HOST')
    })

    it('should exclude the special key version from paths', () => {
      const { paths } = load(fixture('loader', 'special-keys'))

      assert.ok(!paths.has('version'))
      assert.ok(paths.has('db.mongodb.host'))
    })
  })
})
