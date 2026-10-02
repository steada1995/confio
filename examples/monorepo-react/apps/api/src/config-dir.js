/**
 * La config unica del monorepo, ancorata a questo file e non alla cartella da cui arriva
 * il comando: `npm start --workspace api` dalla radice e `node src/index.js` da qui
 * trovano la stessa directory.
 *
 * CONFIG_DIR ha comunque la precedenza, perché initialize() legge l'env var solo quando
 * l'opzione manca: un ambiente che monta la config altrove resta libero di farlo.
 */
export const CONFIG_DIR =
  process.env.CONFIG_DIR ?? new URL('../../../config', import.meta.url).pathname
