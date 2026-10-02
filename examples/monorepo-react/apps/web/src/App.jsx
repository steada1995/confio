import { useEffect, useState } from 'react'

/**
 * La pagina prende la config da /config, servita dall'API, e non dal proprio bundle.
 *
 * È il punto dell'esempio: la config del monorepo è una sola, ma il browser ne riceve solo
 * il ramo che publicConfig() ha deciso di esporre. Nessuna variabile d'ambiente da
 * ridichiarare qui, nessun VITE_* da tenere allineato a mano — e nessun segreto nel bundle.
 */
export const App = () => {
  const [config, setConfig] = useState(null)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    fetch('/config')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setConfig)
      .catch((err) => setError(err.message))
  }, [])

  if (error)   return <p>config non raggiungibile: {error}</p>
  if (!config) return <p>caricamento…</p>

  return (
    <main>
      <h1>{config.appName}</h1>
      <p>API: <code>{config.apiBaseUrl}</code></p>
    </main>
  )
}
