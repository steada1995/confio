import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pathDirName = path.dirname(fileURLToPath(import.meta.url))
const SPEC     = path.join(pathDirName, '..')
const FIXTURES = path.join(SPEC, 'fixtures')

/**
 * Absolute path to a fixture, rooted at spec/fixtures/.
 *
 * Segments are passed separately so that path.join uses the platform separator:
 *   fixture('initialize', 'base') -> <repo>/spec/fixtures/initialize/base
 *
 * @param {...string} parts - the path segments under spec/fixtures/
 * @returns {string} the absolute path, whether or not it exists on disk
 */
export const fixture = (...parts) => path.join(FIXTURES, ...parts)

/**
 * Repository root, derived from this file's own location.
 *
 * Deliberately not taken from src/config-dir.js: a test that checks where a relative path
 * gets anchored needs an expected value the code under test had no hand in computing.
 *
 * @type {string}
 */
export const repoRoot = path.join(SPEC, '..')
