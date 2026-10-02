/**
 * An environment variable exported empty counts as not set.
 *
 * @param {string | undefined} value - the value read from process.env
 * @returns {boolean} true if it is undefined or the empty string
 */
const isNotSet = (value) => value === undefined || value === ''

/**
 * Built-in provider for the "env" source: reads values from environment variables.
 *
 * @type {{ get(key: string): string }}
 */
export const EnvProvider = {
  /**
   * Reads the given environment variable.
   *
   * @param {string} key - name of the environment variable (e.g. 'MONGODB_ADMIN_PASSWORD')
   * @returns {string} the value, not empty
   * @throws {Error} "ENV var '…' is not set" if it is missing or empty; resolveLeaf rewrites
   *                 it adding the dot-path of the leaf
   */
  get(key) {
    const value = process.env[key]
    if (isNotSet(value)) {
      throw new Error(`ENV var '${key}' is not set`)
    }
    return value
  }
}
