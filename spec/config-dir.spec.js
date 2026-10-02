import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fixture, repoRoot } from './utilities/index.mjs'
import { resolveConfigDir } from '../src/config-dir.js'

const appEntry   = fixture('package-config', 'app.js')
const packageDir = fixture('package-config', 'node_modules', '@fixture', 'config')

// The root that paths resolve from depends on the entrypoint: with argv[1] on the fixture
// it is the fixture itself, which has its own package.json. Expected values start from
// here and from repoRoot, never from projectRoot(): comparing the code with itself proves nothing.
const fixtureRoot = fixture('package-config')
const relative    = path.join('spec', 'fixtures', 'initialize', 'base')

let realArgv

beforeEach(() => { realArgv = process.argv[1] })
afterEach(() => {
  process.argv[1] = realArgv
  delete process.env.CONFIG_DIR
})

describe('resolveConfigDir', () => {

  describe('when nothing says where the config is', () => {
    it('should name both ways of saying it', () => {
      assert.throws(() => resolveConfigDir(), /configDir is required.*initialize.*CONFIG_DIR/)
    })
  })

  describe('when the path exists', () => {
    it('should keep an absolute one as it is', () => {
      const dir = fixture('initialize', 'base')
      assert.equal(resolveConfigDir(dir), dir)
    })

    it('should anchor a relative one to the project root, wherever the command was given', () => {
      const expected    = path.join(repoRoot, relative)
      const previousCwd = process.cwd()

      assert.equal(resolveConfigDir(relative), expected)

      process.chdir(path.join(previousCwd, 'spec', 'fixtures'))
      try {
        assert.equal(resolveConfigDir(relative), expected)
      } finally {
        process.chdir(previousCwd)
      }
    })
  })

  describe('when the path leads nowhere and the name is a package', () => {
    it('should find the directory holding its config.json', () => {
      process.argv[1] = appEntry

      assert.equal(resolveConfigDir('@fixture/config'), packageDir)
    })

    it('should fall back to the working directory when there is no entrypoint to start from', () => {
      // without argv[1] there is no root to walk up from: the path stays, anchored to the cwd
      process.argv[1] = undefined

      assert.equal(resolveConfigDir('@nope/missing'), path.join(process.cwd(), '@nope', 'missing'))
    })
  })

  describe('when the path exists and a package has the same name', () => {
    it('should keep the path: the filesystem always comes first', () => {
      process.argv[1] = appEntry

      // '@fixture/both' exists in two forms under the fixture root: a real directory,
      // and a package inside its node_modules. The directory must win.
      const asDirectory = path.join(fixtureRoot, '@fixture', 'both')
      const asPackage   = fixture('package-config', 'node_modules', '@fixture', 'both')

      assert.equal(resolveConfigDir('@fixture/both'), asDirectory)
      assert.notEqual(resolveConfigDir('@fixture/both'), asPackage)
    })
  })

  describe('when it is neither a path nor a package', () => {
    it('should hand back the path, leaving the error to the loader', () => {
      process.argv[1] = appEntry

      assert.equal(resolveConfigDir('@nope/missing'), path.join(fixtureRoot, '@nope', 'missing'))
    })
  })
})
