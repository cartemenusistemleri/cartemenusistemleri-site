// Panel uygulama kabuğu: önbellek tutmaz, her şey her zaman güncel sunucudan gelir.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
