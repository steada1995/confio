import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pathDirName = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES = path.join(pathDirName, 'fixtures')


/**
 * Absolute path to a fixture, rooted at spec/fixtures/.
 *
 * @param {...string} parts - the path segments under spec/fixtures/
 * @returns {string} the absolute path, whether or not it exists on disk
 */
export const fixture = (...parts) => path.join(FIXTURES, ...parts)
