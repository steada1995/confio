import fs from 'node:fs'

/**
 * Reads a JSON file from disk, saying, when it fails, which file it is and what is wrong.
 *
 * Node alone would say "ENOENT ... open '/app/config/config.json'" or "Unexpected end of
 * JSON input" — the latter without even naming the file. They are the two most likely
 * errors on first startup, which is when the user has the least context to make sense of
 * them.
 *
 * @param {string} filePath - absolute path of the file
 * @returns {object} the parsed JSON
 * @throws {Error} "Startup failed: '…' not found" if the file is not there; "… is not
 *                 readable — …" if the filesystem denies it; "… is not valid JSON — …" if
 *                 the content cannot be parsed
 */
export const readJson = (filePath) => {
  let text

  try {
    text = fs.readFileSync(filePath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(`Startup failed: '${filePath}' not found`)
    }

    throw new Error(`Startup failed: '${filePath}' is not readable — ${err.message}`)
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`Startup failed: '${filePath}' is not valid JSON — ${err.message}`)
  }
}
