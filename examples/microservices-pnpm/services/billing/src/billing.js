import { getConfig } from '@steada1995/confio'

export const charge = () => {
  const config = getConfig()

  console.log('billing ready, mongo host:', config.db.mongodb.host)

  // stripeKey è marcata "secret": true, ma il package non maschera: la marcatura la elenca
  // in secretPaths(), da dare al proprio logger. Con console.log esce in chiaro, sia
  // stampando l'oggetto sia leggendo la foglia.
  console.log('config:', config.billing)
  console.log('stripe key:', config.billing.stripeKey)
}
