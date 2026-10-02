import { getConfig } from 'confio'

export const connectionString = () => {
  const { host, adminPassword } = getConfig().db.mongodb
  return `mongodb://admin:${adminPassword}@${host}:27017`
}
