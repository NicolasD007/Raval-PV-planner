import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // import.meta.env wird von Vite zur Build-Zeit injiziert; defensiv geprüft,
    // damit ein anderer/fehlender Bundler-Kontext hier nie zum Absturz führt.
    const base = import.meta.env?.BASE_URL ?? '/'
    navigator.serviceWorker.register(`${base}sw.js`).catch(() => {
      // Offline-Funktionalität ist ein Komfortfeature - ein fehlgeschlagenes
      // Registrieren darf die App selbst nicht blockieren.
    })
  })
}
