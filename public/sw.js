// Offline-Shell für den Raval PV Planner (Abschnitt 26).
// Strategie: App-Shell (HTML/JS/CSS/Icons) wird beim Install vorab gecacht und
// danach "stale-while-revalidate" bedient, damit die App auch ohne Netz startet
// und zuletzt bekannte Daten zeigt. API-Aufrufe (Open-Meteo) werden bewusst NICHT
// vom Service Worker gecacht - die App selbst markiert veraltete Wetterdaten klar
// ("Wetterdaten nicht aktuell", siehe useAppData.js), das soll nicht durch eine
// stillschweigende SW-Cache-Antwort verschleiert werden.

const CACHE_NAME = 'raval-pv-shell-v1'
const APP_SHELL = ['./', './index.html', './manifest.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isApiRequest(url) {
  return url.hostname.includes('open-meteo.com')
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method !== 'GET' || isApiRequest(url)) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          }
          return response
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
