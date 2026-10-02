import path from 'node:path'
import { readJson } from './read-json.js'
import { validate, SKIP_KEYS } from './validate.js'

/**
 * Tells whether a JSON node is a leaf — that is, a value to resolve.
 *
 * A leaf is an object with source (where to read from) and key (what to read), both
 * strings. Intermediate nodes are not leaves — they are just containers.
 *
 * @param {unknown} value - any JSON value
 * @returns {boolean} true if it is an object with string source and key
 */
const isLeaf = (value) =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof value.source === 'string' &&
  typeof value.key    === 'string'

/**
 * Walks the JSON tree recursively, building in a single pass:
 *   - config: nested structure identical to the JSON but with leaves only (empty intermediate nodes)
 *   - paths:  Set of all the dot-paths available to checkRequiredPaths
 *
 * SKIP_KEYS excludes the special keys that are not leaves to resolve.
 *
 * @param {object}      tree     - JavaScript object (the config.json or one of its subtrees)
 * @param {object}      config   - output object being built (nested structure of the leaves)
 * @param {Set<string>} paths    - output set being built (available dot-paths)
 * @param {string}      [prefix] - dot-path accumulated during the recursion
 * @returns {{ config: object, paths: Set<string> }} the same two accumulators received,
 *          filled in; a malformed entry is not recorded and does not stop the walk
 */
const collectConfig = (tree, config = {}, paths = new Set(), prefix = '') => {
  for (const key in tree) {
    if (SKIP_KEYS.has(key)) {
      continue
    }

    const value   = tree[key]
    const dotPath = prefix ? `${prefix}.${key}` : key

    if (isLeaf(value)) {
      config[key] = value      // writes the leaf into the nested object
      paths.add(dotPath)       // records the dot-path among the available paths
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      config[key] = {}         // creates the intermediate node in the object
      collectConfig(value, config[key], paths, dotPath) // descend into it
    }
  }

  return { config, paths }
}

/**
 * @typedef {object} ManifestDefinition
 * @property {object}      config - nested structure of the leaves, ready for resolution
 * @property {Set<string>} paths  - set of all the dot-paths available in config.json
 * @property {object}      raw    - full raw JSON
 */

/**
 * Reads, indexes and validates the config.json manifest — no value is resolved here: the
 * leaves stay { source, key }, and turning them into values is resolveAll()'s job.
 *
 * It is the only public function of this module — the whole package starts from here.
 *
 * Indexing comes before validation because collectConfig is tolerant: it does not break
 * on a malformed entry, it just does not record it.
 *
 * @param {string} configDir - absolute path of the config directory
 * @param {{ requiredPaths: string[], localOverlay: object|null }} context - dot-paths
 *        required at startup and local overlay, both needed by validate()
 * @returns {ManifestDefinition} raw, config and paths of the already validated manifest
 *
 * @throws {Error}  'Startup failed: …' if a validate() check does not pass
 */
export const loadManifest = (configDir, { requiredPaths, localOverlay }) => {
  const raw = readJson(path.join(configDir, 'config.json'))
  const { config, paths } = collectConfig(raw)

  validate({ raw, config, paths, requiredPaths, localOverlay })

  return { raw, config, paths }
}
