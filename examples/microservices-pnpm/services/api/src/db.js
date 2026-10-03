import { getConfig } from '@steada1995/confio'

export const connectionString = () => {
  const { host, adminPassword } = getConfig().db.mongodb
  return `mongodb://admin:${adminPassword}@${host}:27017`
}
