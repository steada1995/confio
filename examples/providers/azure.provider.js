// peerDependency opzionale — importata dinamicamente solo se usata
let _client = null

const loadSdk = async () => {
  const vaultUrl = process.env.AZURE_KEYVAULT_URL
  if (!vaultUrl) throw new Error('AZURE_KEYVAULT_URL is not set — required for Azure Key Vault provider')

  try {
    const { DefaultAzureCredential } = await import('@azure/identity')
    const { SecretClient } = await import('@azure/keyvault-secrets')
    const secretClient = new SecretClient(vaultUrl, new DefaultAzureCredential())
    return {
      async get(secretName) {
        const res = await secretClient.getSecret(secretName)
        if (!res.value) throw new Error(`Secret '${secretName}' has no value`)
        return res.value
      }
    }
  } catch (err) {
    throw new Error(`Azure provider unavailable — install @azure/keyvault-secrets and @azure/identity (${err.message})`)
  }
}

const getClient = async () => {
  if (!_client) _client = await loadSdk()
  return _client
}

export const AzureProvider = {
  async get(key) {
    const client = await getClient()
    return client.get(key)
  }
}

export const resetAzureClientForTests = () => { _client = null }
