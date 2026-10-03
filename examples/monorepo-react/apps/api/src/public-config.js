import { getConfig } from '@steada1995/confio'

/**
 * Le sole foglie che il browser può vedere.
 *
 * L'elenco è esplicito e vive qui, non nel manifest: il criterio non è "non è segreto", è
 * "serve alla pagina". `db.mongodb.host` non è marcato secret, ma non ha niente da fare in
 * un bundle scaricabile da chiunque.
 *
 * Vale anche come punto unico da rileggere in code review: se qualcosa finisce nel browser
 * per sbaglio, è passato di qui.
 *
 * @returns {{ apiBaseUrl: string, appName: string }} il ramo web della config
 */
export const publicConfig = () => {
  const { apiBaseUrl, appName } = getConfig().web
  return { apiBaseUrl, appName }
}
