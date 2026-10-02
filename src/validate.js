import { providerFactory } from './providers/index.js'
import { getLocalValue }   from './env-config.js'

/** Manifest keys that are not config entries. The loader reads them too. */
export const SKIP_KEYS = new Set(['version'])
const LEAF_FIELDS     = ['source', 'key']            // required
const OPTIONAL_FIELDS = ['secret', 'extraOptions']   // allowed, not required
const ALLOWED_FIELDS  = [...LEAF_FIELDS, ...OPTIONAL_FIELDS]

/**
 * Tells a JSON object apart from everything else: null, arrays and scalars excluded.
 *
 * @param {unknown} value - any manifest value
 * @returns {boolean} true if it is a non-array object
 */
const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Tells whether a node means to be a leaf, even an incomplete one.
 *
 * Without this rule { "source": "env" } would be ambiguous — a leaf missing key, or a
 * nested node containing an entry named "source" — and the error would end up pointing
 * at the wrong place.
 *
 * @param {unknown} value - any manifest value
 * @returns {boolean} true if it is an object declaring at least one of source and key
 */
const declaresLeaf = (value) =>
  isPlainObject(value) && LEAF_FIELDS.some((field) => field in value)

/**
 * Checks a single leaf and collects the problems found, without throwing.
 *
 * Checks three things: source and key present and non-empty strings, extraOptions an
 * object if declared, no property outside ALLOWED_FIELDS.
 *
 * @param {object}   leaf     - the node recognized by declaresLeaf()
 * @param {string}   dotPath  - path of the leaf, for the messages
 * @param {string[]} problems - accumulator, modified in place
 * @returns {void}
 */
const checkLeaf = (leaf, dotPath, problems) => {
  for (const field of LEAF_FIELDS) {
    // The type matters as much as the presence: isLeaf in loader.js recognizes a leaf only
    // if source and key are strings, so { key: 42 } would get past here and then not be
    // recorded among the available dot-paths — and the final error would say the dot-path
    // does not exist, sending you to look for a typo in REQUIRED_CONFIG that is not there.
    if ([null, undefined].includes(leaf[field])) {
      problems.push(`${dotPath}: '${field}' must be set`)
    }
    else if (typeof leaf[field] !== 'string' || leaf[field].trim() === '') {
      problems.push(`${dotPath}: '${field}' must be a non-empty string`)
    }
  }

  // The content is none of our business — the provider knows which options it accepts.
  // Here it only matters that it can be forwarded as an object: an array or a scalar would
  // reach the provider as arguments it cannot read, and the error would surface far from here.
  if ('extraOptions' in leaf && !isPlainObject(leaf.extraOptions)) {
    problems.push(`${dotPath}: 'extraOptions' must be an object`)
  }

  for (const name of Object.keys(leaf)) {
    if (!ALLOWED_FIELDS.includes(name)) {
      problems.push(`${dotPath}: unexpected property '${name}'`)
    }
  }
}

/**
 * Walks the manifest and collects the problems of every node.
 *
 * Each entry can only be a leaf or a node containing other entries: anything else — an
 * array, a string, a number — is a problem reported with its dot-path.
 *
 * @param {object}   tree     - the manifest or one of its subtrees
 * @param {string}   prefix   - dot-path accumulated during the recursion
 * @param {string[]} problems - accumulator, modified in place
 * @returns {void}
 */
const walk = (tree, prefix, problems) => {
  for (const key in tree) {
    if (SKIP_KEYS.has(key)) {
      continue
    }

    const value   = tree[key]
    const dotPath = prefix ? `${prefix}.${key}` : key

    if (declaresLeaf(value))  {
      checkLeaf(value, dotPath, problems)
    } 
    else if (isPlainObject(value)) {
      walk(value, dotPath, problems)
    }
    else problems.push(`${dotPath}: expected { source, key } or a nested object`)
  }
}

/**
 * Checks the structure of the manifest, nothing more: every entry is a leaf with source and
 * key set, with the optional secret and extraOptions fields, and nothing else; or a node that
 * contains other entries.
 *
 * It does not look at the values. Whether the source really exists depends on which providers
 * are registered and concerns only the required leaves: initialize() takes care of that.
 *
 * Collects every problem before throwing.
 *
 * @param {object} raw - the config.json read
 * @returns {void}
 * @throws {Error} 'Startup failed: config.json is not valid — …' listing every malformed
 *                 entry with its dot-path, separated by '; '
 */
export const validateManifest = (raw) => {
  const problems = []
  walk(raw, '', problems)

  if (problems.length) {
    throw new Error(`Startup failed: config.json is not valid — ${problems.join('; ')}`)
  }
}

/**
 * Checks that every required dot-path really exists in the manifest.
 *
 * @param {string[]}    requiredPaths  - dot-paths required at startup
 * @param {Set<string>} availablePaths - dot-paths recorded by collectConfig()
 * @returns {void}
 * @throws {Error} 'Startup failed: dot-path … not found in config.json' at the first missing one
 */
const checkRequiredPaths = (requiredPaths, availablePaths) =>
  requiredPaths.forEach((dotPath) => {
    if (!availablePaths.has(dotPath)) {
      throw new Error(`Startup failed: dot-path '${dotPath}' in REQUIRED_CONFIG not found in config.json`)
    }
  })

/**
 * Fetches the leaf at a dot-path inside the leaf tree.
 *
 * @param {object} config  - tree of the leaves only, from collectConfig()
 * @param {string} dotPath - path of the leaf (e.g. "db.mongodb.host")
 * @returns {object | undefined} the leaf { source, key, … }, undefined if the path
 *                               leads nowhere
 */
const leafAt = (config, dotPath) =>
  dotPath.split('.').reduce((node, key) => node?.[key], config)

/**
 * Checks that every required leaf points to a registered provider, before contacting any
 * of them: a misspelled source must not surface halfway through resolution, after other
 * secrets have already been fetched over the network.
 *
 * Skips the leaves covered by the overlay, same condition as resolveLeaf: if the value
 * comes from the local file the provider is never contacted, so it is not needed.
 *
 * @param {object}      config        - tree of the leaves only, from collectConfig()
 * @param {string[]}    requiredPaths - dot-paths required at startup
 * @param {object|null} localOverlay  - config.<NODE_ENV>.json, null in online environments
 * @returns {void}
 * @throws {Error} 'Startup failed: source … is not registered — available: …' at the first
 *                 unknown source, listing the available ones
 */
const checkRequiredSources = (config, requiredPaths, localOverlay) =>
  requiredPaths.forEach((dotPath) => {
    if (getLocalValue(localOverlay, dotPath) != null) {
      return
    }

    const { source } = leafAt(config, dotPath)
    if (!providerFactory.has(source)) {
      throw new Error(
        `Startup failed: source '${source}' required by '${dotPath}' is not registered — available: ${providerFactory.sources().join(', ')}`
      )
    }
  })

/**
 * All the checks on the config: first the shape
 * of the manifest, then that the required dot-paths exist, finally that their sources are
 * served by a registered provider.
 *
 *
 * @param {object}      context               - the terms of the check, in a single object
 * @param {object}      context.raw           - the config.json read
 * @param {object}      context.config        - tree of the leaves only, from collectConfig
 * @param {Set<string>} context.paths         - available dot-paths, from collectConfig
 * @param {string[]}    context.requiredPaths - dot-paths required at startup
 * @param {object|null} context.localOverlay  - config.<NODE_ENV>.json, null if online
 * @returns {void}
 * @throws {Error} 'Startup failed: …' at the first check that fails, in the order
 *                 manifest, dot-path, source
 */
export const validate = ({ raw, config, paths, requiredPaths, localOverlay }) => {
  validateManifest(raw)
  checkRequiredPaths(requiredPaths, paths)
  checkRequiredSources(config, requiredPaths, localOverlay)
}
