import fs   from 'node:fs'
import path from 'node:path'
import { readJson } from './read-json.js'

const DEFAULT_ONLINE_ENVS = 'production,staging,qa'

/**
 * The current environment.
 *
 * The default is 'production', not 'development': a NODE_ENV forgotten in production
 * must let values come from the providers, not read a local file that happened to be
 * there by chance. Whoever develops locally declares it.
 *
 * @returns {string} the value of NODE_ENV, or 'production' if not set
 */
export const resolveEnv = () => process.env.NODE_ENV ?? 'production'

/**
 * The environments considered online, read from CONFIG_ONLINE_ENVS.
 *
 * @returns {string[]} the environment names, without spaces or empty entries; defaults
 *                     to ['production', 'staging', 'qa']
 */
export const parseOnlineEnvs = () =>
  (process.env.CONFIG_ONLINE_ENVS ?? DEFAULT_ONLINE_ENVS)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

/**
 * Tells whether the current environment is online: no config.<env>.json, values only from
 * env / file / remote.
 *
 * @returns {boolean} true if resolveEnv() is among the online environments
 */
export const isOnlineEnv = () => parseOnlineEnvs().includes(resolveEnv())

/**
 * The name of the overlay file for the current environment.
 *
 * @returns {string} e.g. 'config.development.json'
 */
export const localConfigFileName = () => `config.${resolveEnv()}.json`

/**
 * The path of the overlay file inside the config directory.
 *
 * @param {string} configDir - path of the config directory, already resolved
 * @returns {string} path of the file, whether it exists or not
 */
export const localConfigPath = (configDir) =>
  path.join(configDir, localConfigFileName())

/**
 * Loads config.<env>.json, the overlay for local environments.
 *
 * The file is optional, and in online environments it is not even looked for: in both
 * cases it returns null, which for getLocalValue() means "no local value, go through the
 * provider".
 *
 * @param {string} configDir - path of the config directory, already resolved
 * @returns {object | null} the overlay read, or null if the environment is online or the
 *                          file does not exist
 */
export const loadLocalConfig = (configDir) => {
  if (isOnlineEnv()) {
    return null
  }

  const filePath = localConfigPath(configDir)
  if (!fs.existsSync(filePath)) {
    return null
  }

  return readJson(filePath)
}

/**
 * Looks up the value of a leaf inside the overlay, walking down the dot-path.
 *
 * The overlay has the same nested structure as the final resolved config, not the
 * { source, key } manifest of config.json. Example:
 *   overlay.db.mongodb.host = "mongo.lab"
 *   dotPath                 = "db.mongodb.host"
 *   → "mongo.lab"
 *
 * Used by resolveLeaf() before the providers: if it finds a value, that one takes
 * priority; otherwise it falls back to env / file / remote.
 *
 * @param {object | null} overlay - object from loadLocalConfig(), null in online environments
 * @param {string}        dotPath - path of the leaf (e.g. "db.mongodb.host")
 * @returns {unknown} the value found, or undefined if the overlay is null, the key is
 *                    missing or the path goes through a node that is not an object
 */
export const getLocalValue = (overlay, dotPath) => {
  if (!overlay) {
    return undefined
  }

  // "db.mongodb.host" → ["db", "mongodb", "host"], then walks down level by level
  return dotPath.split('.').reduce(
    (node, key) => {
      if(node != null && typeof node === 'object') {
        return node[key]
      }
      return undefined // broken path: missing key or non-object node → undefined (provider fallback)
    }, overlay)
}
