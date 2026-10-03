import { providerFactory } from '@steada1995/confio'

/**
 * Il provider custom va registrato prima di initialize().
 *
 * `external.apiKey` usa "source": "vault" e non compare in config.development.json, così
 * anche in locale passa sempre di qui: l'integrazione è esercitata davvero, non aggirata
 * dall'overlay.
 *
 * extraOptions arriva come secondo argomento, inoltrato dal package senza guardarci
 * dentro: opzioni che hanno senso solo per questo backend. Un provider che non ne ha
 * bisogno accetta il solo key.
 *
 * Per provider reali costruiti sugli SDK ufficiali, vedi ../../../providers/.
 */
export const registerProviders = () => {
  providerFactory.register('vault', {
    async get(key, extraOptions) {
      const stage = extraOptions?.VersionStage ?? 'AWSCURRENT'
      return `vault-secret:${key}@${stage}`
    }
  })
}
