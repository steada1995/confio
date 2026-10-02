import { describe, it } from 'node:test'
import assert           from 'node:assert/strict'
import { validateManifest } from '../src/validate.js'


const problemsOf = (raw) => {
  try {
    validateManifest(raw)
  } catch (err) {
    return err.message.split(' — ')[1].split('; ')
  }
  assert.fail('expected validateManifest to throw')
}

const leaf = { source: 'env', key: 'MONGODB_HOST' }
const wrap = (host) => ({ version: '1.0.0', db: { mongodb: { host } } })

describe('validateManifest', () => {

  describe('when the manifest is well formed', () => {
    it('should accept leaves nested at any depth', () => {
      validateManifest(wrap(leaf))
      validateManifest({ a: { b: { c: { d: leaf } } } })
    })

    it('should ignore version', () => {
      validateManifest({ version: '1.0.0', db: leaf })
    })

    it('should not look into what source and key say, only at their type', () => {
      validateManifest(wrap({ source: 'anything', key: 'ANYTHING' }))
    })
  })

  describe('when a leaf field is missing or empty', () => {
    it('should name the field, for undefined and for null alike', () => {
      assert.deepEqual(problemsOf(wrap({ source: 'env' })), ["db.mongodb.host: 'key' must be set"])
      assert.deepEqual(problemsOf(wrap({ source: 'env', key: null })), ["db.mongodb.host: 'key' must be set"])
      assert.deepEqual(problemsOf(wrap({ key: 'HOST' })), ["db.mongodb.host: 'source' must be set"])
      assert.deepEqual(problemsOf(wrap({ source: null, key: null })), [
        "db.mongodb.host: 'source' must be set",
        "db.mongodb.host: 'key' must be set"
      ])
    })
  })

  describe('when source or key is set but is not a usable string', () => {
    it('should say so instead of letting the leaf through', () => {
      for (const value of [42, true, {}, ['a']])
        assert.deepEqual(problemsOf(wrap({ ...leaf, key: value })),
          ["db.mongodb.host: 'key' must be a non-empty string"])
    })

    it('should reject an empty or blank string as well', () => {
      assert.deepEqual(problemsOf(wrap({ ...leaf, key: '' })),
        ["db.mongodb.host: 'key' must be a non-empty string"])
      assert.deepEqual(problemsOf(wrap({ ...leaf, key: '   ' })),
        ["db.mongodb.host: 'key' must be a non-empty string"])
    })

    it('should report source and key independently', () => {
      assert.deepEqual(problemsOf(wrap({ source: 7, key: '' })), [
        "db.mongodb.host: 'source' must be a non-empty string",
        "db.mongodb.host: 'key' must be a non-empty string"
      ])
    })
  })

  describe('when a leaf carries extraOptions', () => {
    it('should accept any object, without looking inside it', () => {
      validateManifest(wrap({ ...leaf, extraOptions: { VersionStage: 'AWSPREVIOUS' } }))
      validateManifest(wrap({ ...leaf, extraOptions: {} }))
      validateManifest(wrap({ ...leaf, extraOptions: { nested: { anything: [1, 2] } } }))
    })

    it('should reject anything that is not an object', () => {
      for (const value of ['AWSPREVIOUS', 42, true, ['a'], null])
        assert.deepEqual(problemsOf(wrap({ ...leaf, extraOptions: value })),
          ["db.mongodb.host: 'extraOptions' must be an object"])
    })

    it('should report it together with the other problems of the same leaf', () => {
      assert.deepEqual(problemsOf(wrap({ source: 'env', extraOptions: 'x' })), [
        "db.mongodb.host: 'key' must be set",
        "db.mongodb.host: 'extraOptions' must be an object"
      ])
    })
  })

  describe('when a leaf carries a property other than source and key', () => {
    it('should name the property', () => {
      assert.deepEqual(problemsOf(wrap({ ...leaf, extra: 1 })),
        ["db.mongodb.host: unexpected property 'extra'"])
    })
  })

  describe('when a node is neither a leaf nor an object', () => {
    it('should report it at its own dot-path', () => {
      for (const value of ['localhost', 42, ['a'], null, true])
        assert.deepEqual(problemsOf(wrap(value)),
          ['db.mongodb.host: expected { source, key } or a nested object'])
    })
  })

  describe('when there are several mistakes', () => {
    it('should report them all, not just the first', () => {
      const problems = problemsOf({
        db:       { mongodb: { host: { source: 'env' } } },
        external: { apiKey: 'plain' }
      })

      assert.deepEqual(problems, [
        "db.mongodb.host: 'key' must be set",
        'external.apiKey: expected { source, key } or a nested object'
      ])
    })
  })
})
