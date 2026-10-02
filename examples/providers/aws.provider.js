// peerDependency opzionale — importata dinamicamente solo se usata
let _client = null

const loadSdk = async () => {
  try {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager')
    const smClient = new SecretsManagerClient({})
    return {
      // extraOptions della foglia: VersionId o VersionStage, gli unici altri campi che
      // GetSecretValue accetta. Omessi entrambi, Secrets Manager restituisce AWSCURRENT.
      // https://docs.aws.amazon.com/secretsmanager/latest/apireference/API_GetSecretValue.html
      async get(secretId, extraOptions) {
        const res = await smClient.send(
          new GetSecretValueCommand({ SecretId: secretId, ...extraOptions })
        )
        if (!res.SecretString) throw new Error(`Secret '${secretId}' has no string value`)
        return res.SecretString
      }
    }
  } catch (err) {
    throw new Error(`AWS provider unavailable — install @aws-sdk/client-secrets-manager (${err.message})`)
  }
}

const getClient = async () => {
  if (!_client) _client = await loadSdk()
  return _client
}

export const AwsProvider = {
  async get(key, extraOptions) {
    const client = await getClient()
    return client.get(key, extraOptions)
  }
}

export const resetAwsClientForTests = () => { _client = null }
