const CACHE = 'studylang-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['/', '/manifest.webmanifest', '/favicon.svg'])))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        if (event.request.method === 'GET' && copy.ok) {
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined)
        }
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error())),
  )
})
