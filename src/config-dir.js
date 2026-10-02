import fs   from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

/**
 * Root of the project that uses the library.
 *
 * Starts from the application entrypoint (process.argv[1]) and walks up to the first
 * package.json outside node_modules.
 *
 * Also supports starting from a submodule of the application: in a monorepo the returned
 * root is the one of the started module, not the repo's, and it does not change depending
 * on the directory the command was run from.
 *
 * @returns {string} absolute path of the root. When walking up is not possible — no
 *                   entry file to start from, or no package.json all the way up to the
 *                   filesystem root — falls back to the directory the command was run
 *                   from.
 * @throws {Error}
 */
export const projectRoot = () => {
  const entry = process.argv[1]
  if (!entry) {
    return process.cwd()
  }

  let dir = path.dirname(path.resolve(entry))
  while (true) {
    const insideDependencies = dir.split(path.sep).includes('node_modules')
    if (!insideDependencies && fs.existsSync(path.join(dir, 'package.json'))) {
      return dir
    }

    const parent = path.dirname(dir)
    if (parent === dir) {
      return process.cwd()
    }
    dir = parent
  }
}

/**
 * Turns a package name into the directory holding its config.json: the config shipped as
 * a dependency, whose name the application knows but not its location, which depends on
 * the package manager.
 *
 * Resolves from the application entrypoint (process.argv[1]) and not from this file,
 * because that package is a dependency of the application, not of confio.
 *
 * @param {string} specifier - the package name, e.g. '@example/config'
 * @returns {string | null} the directory holding its config.json, or null if the package
 *                          cannot be resolved or does not contain that file
 */
const packageConfigDir = (specifier) => {
  const entry = process.argv[1]
  if (!entry) {
    return null
  }

  try {
    const require = createRequire(path.resolve(entry))
    return path.dirname(require.resolve(`${specifier}/config.json`))
  } catch {
    return null
  }
}

/**
 * Resolves the directory that contains config.json.
 *
 * The path always comes from outside — the initialize() option or the CONFIG_DIR env var.
 * There is no default: without one the function throws.
 *
 * An absolute path is used as is. A relative path is anchored to the project root, not to
 * the directory the command was run from: `CONFIG_DIR=./config` therefore points to the
 * same place however the application is started.
 *
 * If that directory does not exist, the value is tried a second time as a package name:
 * `configDir: '@example/config'` finds the config shipped as a workspace dependency. It is
 * a fallback, not an alternative — the filesystem always comes first, so the meaning of a
 * path that exists never changes.
 *
 * @param {string} [configDir] - path or package name passed to
 *                               initialize({ configDir }); if missing, CONFIG_DIR is used
 * @returns {string} absolute path of the config directory, ready to read; does not
 *                   guarantee that it exists
 * @throws {Error} 'Startup failed: configDir is required — pass initialize({ configDir })
 *                 or set CONFIG_DIR' when the directory is given by neither of the two
 */
export const resolveConfigDir = (configDir) => {
  const dir = configDir ?? process.env.CONFIG_DIR
  if (!dir) {
    throw new Error(
      'Startup failed: configDir is required — pass initialize({ configDir }) or set CONFIG_DIR'
    )
  }

  const asPath = path.isAbsolute(dir) ? dir : path.resolve(projectRoot(), dir)
  if (fs.existsSync(asPath)) {
    return asPath
  }

  // The path leads nowhere: before giving up, the value may be a package name. If it is
  // not, fall back to the original path and let the loader raise the error, naming the
  // file it could not find.
  return packageConfigDir(dir) ?? asPath
}
