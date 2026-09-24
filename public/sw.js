// Service worker de Libreta de Plata: permite instalarla como app y abrirla sin conexión.
// Los archivos se piden primero a la red (así siempre ves la última versión) y, si no hay
// conexión, se usan los guardados. La API (/api/) nunca se guarda.
const CACHE = 'libreta-v2';
const ARCHIVOS = ['/', '/estilos.css', '/app.js', '/lector.js', '/presupuesto.js', '/manifest.webmanifest', '/iconos/icono-192.png', '/iconos/icono-512.png'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', ev => {
  const url = new URL(ev.request.url);
  if (ev.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/descargar/')) return;
  ev.respondWith(
    fetch(ev.request)
      .then(r => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then(c => c.put(ev.request.mode === 'navigate' ? '/' : ev.request, copia)); }
        return r;
      })
      .catch(() => caches.match(ev.request.mode === 'navigate' ? '/' : ev.request, { ignoreSearch: true }))
  );
});
