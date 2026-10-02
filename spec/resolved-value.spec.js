import { describe, it } from 'node:test'
import assert           from 'node:assert/strict'
import { requireValue } from '../src/resolved-value.js'

const checkValue = (value) => requireValue(value, 'db.mongodb.host', "source 'vault'")

describe('requireValue', () => {

  describe('when a value is there', () => {
    it('should hand it back untouched, whatever it is', () => {
      const object = { user: 'admin' }

      assert.equal(checkValue('mongo.lab'), 'mongo.lab')
      assert.equal(checkValue('0'), '0')
      assert.equal(checkValue(' pa ss '), ' pa ss ')
      assert.equal(checkValue(0), 0)
      assert.equal(checkValue(false), false)
      assert.strictEqual(checkValue(object), object)
    })
  })

  describe('when the value is the empty string', () => {
    it('should throw naming the leaf and where it came from', () => {
      assert.throws(() => checkValue(''),
        /Startup failed: 'db\.mongodb\.host' got an empty value from source 'vault'/)
    })
  })

  describe('when there is no value at all', () => {
    it('should throw for null and for undefined alike', () => {
      for (const value of [null, undefined])
        assert.throws(() => checkValue(value),
          /Startup failed: 'db\.mongodb\.host' got no value from source 'vault'/)
    })
  })

})
