import path from 'node:path'
import { loadManifest }    from './loader.js'
import { providerFactory } from './providers/index.js'
import { EnvProvider }     from './providers/env.provider.js'
import { FileProvider, secretsDir } from './providers/file.provider.js'
import { resolveConfigDir, projectRoot } from './config-dir.js'
import { normalizeOptions, assertSameOptions } from './options.js'
import { requireValue }    from './resolved-value.js'
import {
  loadLocalConfig,
  getLocalValue
} from './env-config.js'

export { providerFactory, resolveConfigDir, projectRoot }
export {
  resolveEnv,
  parseOnlineEnvs,
  isOnlineEnv,
  localConfigFileName,
  localConfigPath,
  loadLocalConfig,
  getLocalValue
} from './env-config.js'

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let _config        = null
let _options       = null
let _loading       = null
let _secretPaths   = []

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Freezes the tree at every level, not just the root.
 *
 * @param {unknown} obj - the resolved tree, or one of its nodes
 * @returns {unknown} the same value received, deeply frozen; scalars are returned
 *                    unchanged
 */
const deepFreeze = (obj) => {
  if (!obj || typeof obj !== 'object') {
    return obj
  }
  if (Object.isFrozen(obj)) {
    return obj
  }

  Object.freeze(obj)
  for (const key of Object.keys(obj)) deepFreeze(obj[key])
  return obj
}

/**
 * Resolves a single leaf: first the local overlay, then the declared provider.
 *
 * A value found in the overlay enters the config as is, without conversions, and the
 * provider is not contacted.
 *
 * The provider's error is rewritten adding the dot-path, which the provider does not
 * know: it only sees its own key.
 *
 * @param {string}        dotPath      - path of the leaf (e.g. "db.mongodb.host")
 * @param {object}        leaf         - the manifest leaf: { source, key, secret?,
 *                                       extraOptions? }
 * @param {object | null} localOverlay - config.<NODE_ENV>.json, null in online environments
 * @returns {Promise<unknown>} the resolved value, never null, undefined or empty string
 * @throws {Error} "Startup failed: ENV var '…' required by '…' is not set" for the env
 *                 source; "… file '…' … is not readable" for the file source; "… secret '…'
 *                 (…) … is not reachable — …" for the others, with the original message
 *                 appended; "… got no value from …" if the provider answers without a value
 */
const resolveLeaf = async (dotPath, leaf, localOverlay) => {
  const localValue = getLocalValue(localOverlay, dotPath)
  if (localValue != null) {
    return requireValue(localValue, dotPath, 'the local config file')
  }

  const { source, key, extraOptions } = leaf
  const provider = providerFactory.get(source)

  // The check on the value sits outside the try: inside, an unusable value would be
  // rewritten by the catch as "provider unreachable", which is a different story.
  let value
  try {
    const result = provider.get(key, extraOptions)
    value = result instanceof Promise ? await result : result
  } catch (err) {
    const msg = err.message ?? String(err)

    // The two specific messages belong to the built-in providers, not to the source names:
    // a provider registered as 'env' or 'file' fails for its own reasons, and its error
    // must reach the caller instead of a misleading "not set" or "not readable".
    if (provider === EnvProvider) {
      throw new Error(`Startup failed: ENV var '${key}' required by '${dotPath}' is not set`)
    }

    if (provider === FileProvider) {
      throw new Error(`Startup failed: file '${path.join(secretsDir(), key)}' required by '${dotPath}' is not readable`)
    }

    throw new Error(`Startup failed: secret '${key}' (${source}) required by '${dotPath}' is not reachable — ${msg}`)
  }

  return requireValue(value, dotPath, `source '${source}'`)
}

/**
 * Splits the list of required dot-paths, tolerating extra spaces and commas.
 *
 * @param {string | undefined} requiredConfig - the requiredConfig option or REQUIRED_CONFIG
 * @returns {string[]} the dot-paths, at least one
 * @throws {Error} 'Startup failed: REQUIRED_CONFIG is not set' if the list is missing or
 *                 made of spaces only
 */
const parseRequiredPaths = (requiredConfig) => {
  if (!requiredConfig?.trim()) {
    throw new Error('Startup failed: REQUIRED_CONFIG is not set')
  }
  return requiredConfig.split(',').map((requiredPath) => requiredPath.trim()).filter(Boolean)
}

/**
 * Walks the leaf tree and resolves the required ones, one at a time.
 *
 *
 * @param {object}        config       - tree of the leaves only, from collectConfig()
 * @param {Set<string>}   requiredSet  - dot-paths to resolve
 * @param {object | null} localOverlay - config.<NODE_ENV>.json, null in online environments
 * @param {Set<string>}   secretPaths  - accumulator of the secret dot-paths, filled here
 * @param {string}        [prefix]     - dot-path accumulated during the recursion
 * @returns {Promise<object>} the resolved tree, with only the required branches
 * @throws {Error} 'Startup failed: …' propagated from resolveLeaf() at the first leaf that
 *                 does not resolve
 */
const resolveAll = async (config, requiredSet, localOverlay, secretPaths, prefix = '') => {
  const resolved = {}

  for (const key in config) {
    const value   = config[key]
    const dotPath = prefix ? `${prefix}.${key}` : key

    if (!(value && typeof value === 'object')) {
      continue
    }

    if (value.source) {
      if (requiredSet.has(dotPath)) {
        resolved[key] = await resolveLeaf(dotPath, value, localOverlay)

        if (value.secret) {
          secretPaths.add(dotPath)
        }
      }
    } else {
      // A branch containing no required leaf does not enter the result: the structure
      // of the manifest is not information the caller asked for.
      const branch = await resolveAll(value, requiredSet, localOverlay, secretPaths, dotPath)

      if (Object.keys(branch).length) {
        resolved[key] = branch
      }
    }
  }

  return resolved
}

/**
 * The actual loading, behind the initialize() guard.
 *
 * In order: resolves the directory, reads and validates the manifest, loads the overlay,
 * resolves the required leaves, records the secret dot-paths, freezes the result and
 * assigns it to the module state.
 *
 * @param {{ configDir?: string, requiredConfig?: string }} options - the initialize()
 *        options, not normalized
 * @returns {Promise<object>} the resolved config, frozen at every level
 * @throws {Error} 'Startup failed: …' at the first step that fails: directory not given,
 *                 manifest missing or invalid, non-existent dot-path, provider not
 *                 registered or unreachable, value missing or empty
 * @throws {SyntaxError} if config.json or the overlay do not contain valid JSON
 */
const load = async (options) => {
  const configDir = resolveConfigDir(options.configDir)

  const requiredPaths  = parseRequiredPaths(options.requiredConfig ?? process.env.REQUIRED_CONFIG)
  const localOverlay   = loadLocalConfig(configDir)
  const { config }     = loadManifest(configDir, { requiredPaths, localOverlay })

  const secretDotPaths = new Set()
  const resolved = await resolveAll(config, new Set(requiredPaths), localOverlay, secretDotPaths)

  _secretPaths = Object.freeze([...secretDotPaths])

  _config = deepFreeze(resolved)
  return _config
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Loads and validates the config, once.
 *
 * In online environments (default: production, staging, qa) values come only from the
 * providers; elsewhere the config.<NODE_ENV>.json overlay wins, leaf by leaf.
 *
 * The guard is on _loading : two concurrent calls share the same load instead of
 * fetching every secret twice.
 *
 * A later call with different options is an error: silently returning the first config
 * would mean handing over something different from what was asked for.
 *
 * @param {object}  [options]                - where not given, the env vars apply
 * @param {string}  [options.configDir]      - directory containing config.json; falls back
 *                                             to CONFIG_DIR
 * @param {string}  [options.requiredConfig] - dot-paths to resolve, comma-separated;
 *                                             falls back to REQUIRED_CONFIG
 * @returns {Promise<object>} the resolved and frozen config; a second call with the
 *                            same options returns the first load
 * @throws {Error} 'Startup failed: …' if the config directory is missing,
 *                 if a required dot-path does not exist in config.json,
 *                 if a required value cannot be resolved
 *                 or if initialize was already called with different options.
 */
export const initialize = (options = {}) => {
  try {
    const requested = normalizeOptions(options)

    if (_loading) {
      assertSameOptions(_options, requested)
      return _loading
    }

    _options = requested
  } catch (err) {
    return Promise.reject(err)
  }

  _loading = load(options)
  return _loading
}

/**
 * The already loaded config, to read anywhere after initialize().
 *
 * Loads nothing and does not wait: if the config is not there, it says so instead of
 * returning an incomplete object.
 *
 * @returns {object} the resolved config, frozen at every level
 * @throws {Error} 'Config is not initialized — call await initialize() first' if initialize()
 *                 was never called; 'Config is not ready — …' if it is in progress or has
 *                 failed
 */
export const getConfig = () => {
  if (!_config) {
    throw new Error(_loading
      ? 'Config is not ready — initialize() has not finished, or it failed; await it before getConfig()'
      : 'Config is not initialized — call await initialize() first')
  }
  return _config
}

/**
 * Returns all the dot-paths of the leaves marked "secret": true among the resolved ones.
 *
 * @returns {readonly string[]} the dot-paths of the secret leaves actually resolved
 * @throws {Error} the same messages as getConfig() if the config is not ready
 */
export const secretPaths = () => {
  getConfig()
  return _secretPaths
}

/**
 * Resets the module to its initial state: no config loaded, no secret dot-path
 * remembered.
 *
 * Tests only: the config is loaded once per process, and without this every test after
 * the first would read the config of the previous one.
 *
 * @returns {void}
 */
export const resetForTests = () => {
  _config      = null
  _options     = null
  _loading     = null
  _secretPaths = []
}
