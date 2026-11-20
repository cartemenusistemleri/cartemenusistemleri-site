/* COMEBACK. — çevrimdışı çalışma: uygulama kabuğu önbellekte, veriler cihazda (localStorage) ve bağlantı gelince hesapla eşitlenir */
const SURUM = 'cb-v60';
const KABUK = ['./', 'app.css?v=48', 'data.js?v=9', 'kutuphane.js?v=11', 'motor.js?v=14', 'rehber.js?v=1', 'app.js?v=55', 'gizlilik.html', 'ikon-192.png?v=20'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(SURUM).then((c) => c.addAll(KABUK)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((l) => Promise.all(l.filter((k) => k !== SURUM).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.indexOf('/api/') === 0) return; // API hep ağdan
  if (e.request.mode === 'navigate') {
    // sayfa: önce ağ, yoksa önbellek. Yalnızca uygulama kabuğu './' olarak saklanır (basla.html, gizlilik.html kabuğun yerine geçmesin)
    const kabuk = /\/comeback\/(index\.html)?$/.test(u.pathname);
    e.respondWith(fetch(e.request).then((r) => { if (kabuk && r.ok && !r.redirected) { const k = r.clone(); caches.open(SURUM).then((c) => c.put('./', k)); } return r; })
      .catch(() => (kabuk ? caches.match('./') : caches.match(e.request).then((v) => v || caches.match('./')))));
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
    if (!c) return self.clients.openWindow(hedef);
    return c.focus().then((w) => (e.notification.data && e.notification.data.url && w && w.navigate ? w.navigate(hedef).catch(() => w) : w));
  }));
});
// hatırlatıcılar (su, takviye, antrenman): sunucudan gelen Web Push
self.addEventListener('push', (e) => {
  let v = {}; try { v = e.data ? e.data.json() : {}; } catch (x) { v = { metin: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(v.baslik || 'COMEBACK.', { body: v.metin || '', icon: 'ikon-kobalt-192.png?v=20', badge: 'favicon-96.png?v=20', tag: 'cb-' + (v.tur || 'hatirlat'), renotify: true, data: { url: v.url || '/comeback/' } }));
});
