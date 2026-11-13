/* COMEBACK. — çevrimdışı çalışma: uygulama kabuğu önbellekte, veriler cihazda (localStorage) ve bağlantı gelince hesapla eşitlenir */
const SURUM = 'cb-v43';
const KABUK = ['./', 'app.css?v=33', 'data.js?v=8', 'kutuphane.js?v=11', 'motor.js?v=12', 'rehber.js?v=1', 'app.js?v=39', 'gizlilik.html', 'ikon-192.png?v=3'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((l) => Promise.all(l.filter((k) => k !== SURUM).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0) return; // API hep ağdan
  if (e.request.mode === 'navigate') {
    // sayfa: önce ağ, yoksa önbellek
    e.respondWith(fetch(e.request).then((r) => { const k = r.clone(); caches.open(SURUM).then((c) => c.put('./', k)); return r; }).catch(() => caches.match('./')));
    return;
  }
  // dosyalar: önce önbellek, arkada güncelle
  e.respondWith(caches.match(e.request).then((v) => {
    const ag = fetch(e.request).then((r) => { if (r.ok) { const k = r.clone(); caches.open(SURUM).then((c) => c.put(e.request, k)); } return r; }).catch(() => v);
    return v || ag;
  }));
});
// dinlenme bildirimi: dokununca açık uygulamaya dön ya da yenisini aç
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hedef = (e.notification.data && e.notification.data.url) || '/comeback/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((l) => {
    const c = l.find((x) => x.url.indexOf('/comeback/') >= 0);
    return c ? c.focus() : self.clients.openWindow(hedef);
  }));
});
