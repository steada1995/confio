import { EnvProvider }  from './env.provider.js'
import { FileProvider } from './file.provider.js'

/** The providers shipped with the package, the content of the freshly created registry. */
const BUILT_IN = [['env', EnvProvider], ['file', FileProvider]]

/**
 * Registry of the available providers.
 *
 * A Map and not an object: the key is the source declared by config.json, that is, data
 * coming from outside. An object would also answer to the names inherited from
 * Object.prototype — 'toString', 'constructor' — and has() would say yes for a provider
 * nobody registered.
 *
 * @type {Map<string, { get(key: string, extraOptions?: object): string | Promise<string> }>}
 */
const registry = new Map(BUILT_IN)

/**
 * Factory to access and register secret providers.
 * Use register() to add custom providers (e.g. AWS Secrets Manager,
 * Azure Key Vault, Vault) without modifying the package.
 *
 * The second argument of get() is the leaf's extraOptions: options that concern only
 * that service — the version of a secret, for instance — and that the package forwards
 * without looking inside. It is undefined when the leaf does not declare it, so a provider
 * that accepts only key stays valid.
 *
 * @example
 * import { providerFactory } from '@steada1995/confio'
 * providerFactory.register('vault', { get(key, extraOptions) { ... } })
 */
export const providerFactory = {
  /**
   * Registers a custom provider, or replaces an existing one.
   *
   * Must be called before initialize(): afterwards, the leaves are already resolved.
   *
   * @param {string} source - name of the source (e.g. "vault"); "env" and "file" replace
   *                          the built-in provider with that name
   * @param {{ get(key: string, extraOptions?: object): string | Promise<string> }} provider
   * @returns {void}
   */
  register(source, provider) { registry.set(source, provider) },

  /**
   * Returns the provider for a given source.
   *
   * @param {string} source - name of the source declared by the leaf
   * @returns {{ get(key: string, extraOptions?: object): string | Promise<string> }} the
   *          registered provider
   * @throws {Error} "Unknown config provider: '…'" if nobody registered it
   */
  get(source) {
    const provider = registry.get(source)
    if (!provider) {
      throw new Error(`Unknown config provider: '${source}'`)
    }
    return provider
  },

  /**
   * Tells whether a source is served, without throwing — used by validate() before
   * contacting any provider.
   *
   * @param {string} source - name of the source declared by the leaf
   * @returns {boolean} true if a provider is registered for this source
   */
  has(source) { return registry.has(source) },

  /**
   * The available sources, for error messages.
   *
   * @returns {string[]} the registered names, including 'env' and 'file'
   */
  sources() { return [...registry.keys()] }
}

/**
 * Resets the registry to the built-in providers only, discarding those registered by the
 * tests.
 *
 * Tests only: there is one registry per process, and a custom provider left behind would
 * change the outcome of the next test.
 *
 * @returns {void}
 */
export const resetProvidersForTests = () => {
  registry.clear()
  BUILT_IN.forEach(([source, provider]) => registry.set(source, provider))
}
