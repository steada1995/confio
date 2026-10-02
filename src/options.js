import { resolveConfigDir } from './config-dir.js'

/**
 * Normalizes the initialize() options: collects the values from options or from the env
 * vars and brings them into a single canonical form.
 *
 * Never throws: a missing option or one of the wrong type becomes null, and rejecting it
 * with the right message is load()'s job.
 *
 * @param {{ configDir?: string, requiredConfig?: string }} options - the initialize()
 *        options; when missing they fall back to CONFIG_DIR and REQUIRED_CONFIG
 * @returns {{ configDir: string | null, requiredConfig: string | null }} the comparable
 *          form: null where the option is missing or has an unexpected type
 */
export const normalizeOptions = (options) => {
  const configDir      = options.configDir      ?? process.env.CONFIG_DIR
  const requiredConfig = options.requiredConfig ?? process.env.REQUIRED_CONFIG

  return {
    configDir:      configDir ? resolveConfigDir(configDir) : null,
    requiredConfig: normalizeRequiredConfig(requiredConfig)
  }
}

/**
 * Normalizes the list of required dot-paths: makes it unambiguous by removing whitespace
 * and empty entries. The order stays the original one.
 *
 * @param {unknown} requiredConfig - the list as it arrived, of any type
 * @returns {string | null} the cleaned-up dot-paths joined with commas, or null if it is
 *                          not a string or contains no path
 */
const normalizeRequiredConfig = (requiredConfig) => {
  if (typeof requiredConfig !== 'string') {
    return null
  }

  const paths = requiredConfig.split(',').map((requiredPath) => requiredPath.trim()).filter(Boolean)
  return paths.length ? paths.join(',') : null
}

/**
 * Makes an option readable inside the error message.
 *
 * @param {string | boolean | null} value - a normalized option
 * @returns {string} '(not set)' for null, otherwise the quoted value
 */
const describe = (value) => (value === null ? '(not set)' : JSON.stringify(value))

/**
 * Requires initialize() to be called again with the same options as the load already
 * done: the config is loaded once per process, and different options cannot be
 * specified.
 *
 * @param {object} loaded    - normalized options of the load already in progress or done
 * @param {object} requested - normalized options of the current call
 * @returns {void} when the two calls ask for the same thing
 * @throws {Error} 'Startup failed: initialize() was already called with different options
 *                 (…)' naming every option that changes, with old and new value
 */
export const assertSameOptions = (loaded, requested) => {
  const changed = Object.keys(loaded).filter((option) => loaded[option] !== requested[option])
  if (!changed.length) {
    return
  }

  const detail = changed
    .map((option) => `${option}: ${describe(loaded[option])} vs ${describe(requested[option])}`)
    .join(', ')

  throw new Error(
    `Startup failed: initialize() was already called with different options (${detail}) — ` +
    'the config is loaded once per process: call initialize() with the same options, or use ' +
    'getConfig() to read the config already loaded'
  )
}
