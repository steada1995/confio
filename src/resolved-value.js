/**
 * The check every resolved value goes through before entering the config, wherever it
 * comes from — local file or provider.
 *
 * It only checks whether a value is there. The type is up to whoever writes the provider,
 * which must return a string: if it returns anything else, it has a bug.
 *
 * The empty string is a separate case, and that is why the check lives here: the type is
 * right, but a secret was mounted empty.
 *
 * @param {unknown} value   - the resolved config or secret value
 * @param {string}  dotPath - the dot-path of the leaf
 * @param {string}  origin  - where it comes from, for the message (e.g. "source 'env'")
 * @returns {unknown} the same value received
 *
 * @throws {Error} "Startup failed: '…' got no value from …" if it is null or undefined;
 *                 "… got an empty value from …" if it is the empty string
 */
export const requireValue = (value, dotPath, origin) => {
  if (value === null || value === undefined) {
    throw new Error(`Startup failed: '${dotPath}' got no value from ${origin}`)
  }

  if (value === '') {
    throw new Error(`Startup failed: '${dotPath}' got an empty value from ${origin}`)
  }

  return value
}
