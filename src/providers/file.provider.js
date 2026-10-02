import fs from 'node:fs'
import path from 'node:path'

/**
 * The directory where the orchestrator mounts the secrets.
 *
 * Read on every call and not once when the module loads, so it also works if the
 * application sets the variable after importing the library.
 *
 * @returns {string} RUN_SECRETS_DIR if set, otherwise '/run/secrets'
 */
export const secretsDir = () => process.env.RUN_SECRETS_DIR || '/run/secrets'

/**
 * Reads the file holding a secret and returns its cleaned-up content: spaces, tabs and
 * newlines before the first character and after the last one are removed
 * (`String.prototype.trim`); the text in between is left intact.
 *
 * Without that cleanup, the newline `echo` appends at the end would end up in the password.
 *
 * @param {string} filePath - absolute path of the file
 * @returns {string} the file content, cleaned up
 * @throws {Error} "file '…' is not readable" if the file does not exist; the original fs
 *                 error in the other cases (permissions, I/O), which must not be masked
 */
const readFile = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf8').trim()
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`file '${filePath}' is not readable`)
    }
    throw err
  }
}

/**
 * Built-in provider for the "file" source: reads the secrets mounted on the filesystem.
 *
 * @type {{ get(key: string): string }}
 */
export const FileProvider = {
  /**
   * Reads the secret from the file with the same name inside secretsDir().
   *
   * @param {string} key - name of the file (e.g. 'mongodb_admin_password')
   * @returns {string} the file content, stripped of leading and trailing spaces and newlines
   * @throws {Error} "file '…' is not readable" if the file does not exist; resolveLeaf
   *                 rewrites it adding the dot-path of the leaf
   */
  get(key) {
    return readFile(path.join(secretsDir(), key))
  }
}
