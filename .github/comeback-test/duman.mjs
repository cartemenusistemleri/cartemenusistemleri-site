// COMEBACK. duman testi: yayından önce çalıştır →  node .github/comeback-test/duman.mjs
// Depoyu yerelde sunar, API'yi sahte yanıtlarla taklit eder, ana akışları gerçek tarayıcıda gezer.
// Herhangi bir JS hatası ya da beklenen öğe yoksa çıkış kodu 1 olur.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const { chromium } = require('playwright');
const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TUR = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const sunucu = http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
  const d = path.join(KOK, p); if (!d.startsWith(KOK) || !fs.existsSync(d)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': TUR[path.extname(d)] || 'application/octet-stream' }); fs.createReadStream(d).pipe(r);
}).listen(0);
const ADRES = 'http://localhost:' + sunucu.address().port + '/comeback/';
const sorun = []; const tamam = (ad) => console.log('  ✓ ' + ad); const hata = (ad) => { sorun.push(ad); console.log('  ✗ ' + ad); };
const bekle = (p, ms) => p.waitForTimeout(ms);

async function sayfa(b, { hesap = true, acilis = false, boy = 844 } = {}) {
  const c = await b.newContext({ viewport: { width: 390, height: boy }, locale: 'tr-TR', hasTouch: true }); const p = await c.newPage();
  p.hatalar = []; p.on('pageerror', (e) => p.hatalar.push(e.message));
  await p.addInitScript((a) => { try { if (!a) sessionStorage.setItem('cb-acilis', '1'); } catch (e) { /* yok */ } }, acilis);
  await p.route('**/api/comeback/**', (r) => { const y = new URL(r.request().url()).pathname.replace('/api/comeback/', '');
    if (y === 'hesap/ben') return hesap ? r.fulfill({ json: { kullanici: { id: 't1', ad: 'Deniz', eposta: 'd@d.co', rol: 'demo', kadi: 'deniz', foto: 0 } } }) : r.fulfill({ status: 401, json: { hata: 'giriş yok' } });
    if (y === 'hesap/veri') return r.fulfill({ json: { json: null, guncelleme: 0 } });
    return r.fulfill({ json: { ok: true, liste: [] } }); });
  return p;
}
const temizle = (p) => p.evaluate(() => { const k = document.getElementById('kapanis'); if (k) k.remove(); document.body.classList.remove('kilit'); });

(async () => {
  const b = await chromium.launch();
  console.log('Karşılama');
  { const p = await sayfa(b, { hesap: false }); await p.goto(ADRES); await bekle(p, 1200);
    (await p.$('.kr-kural')) ? tamam('askı kuralı açıklaması görünüyor') : hata('karşılamada askı kuralı yok');
    p.hatalar.length ? hata('karşılama JS hatası: ' + p.hatalar.join(' | ')) : tamam('hata yok'); await p.context().close(); }

  console.log('Açılış animasyonu');
  { const p = await sayfa(b, { acilis: true }); await p.goto(ADRES); await bekle(p, 400);
    (await p.$('#acilis')) ? tamam('perde açıldı') : hata('açılış perdesi görünmedi');
    await bekle(p, 2300); (await p.$('#acilis')) ? hata('açılış perdesi kalktı mı: hayır') : tamam('perde kendini kaldırdı'); await p.context().close(); }

  console.log('Sayfalar');
  { const p = await sayfa(b); await p.goto(ADRES); await bekle(p, 1200); await temizle(p);
    for (const r of ['#/', '#/antrenman', '#/beslenme', '#/ilerleme', '#/profil', '#/ayar/gorunum', '#/comeback', '#/mazeret']) {
      await p.evaluate((h) => { location.hash = h; }, r); await bekle(p, 350); await temizle(p);
      const n = await p.evaluate(() => document.getElementById('app').children.length); n ? tamam(r + ' açıldı') : hata(r + ' boş');
    }
    (await p.evaluate(() => { location.hash = '#/'; return true; })) && await bekle(p, 400);
    (await p.$('.seri-kutu .nd')) ? tamam('ana sayfada hafta noktaları') : hata('hafta noktaları yok');
    p.hatalar.length ? hata('sayfa JS hatası: ' + p.hatalar.join(' | ')) : tamam('hata yok'); await p.context().close(); }

  console.log('Gezinme ve menü');
  { const p = await sayfa(b); await p.goto(ADRES); await bekle(p, 1200); await temizle(p);
    (await p.$('.ust-profil')) ? tamam('sağ üstte profil resmi') : hata('sağ üstte profil resmi yok');
    (await p.$$eval('#nav a[data-tab]', (l) => l.length)) === 4 ? tamam('alt çubukta 4 sekme') : hata('alt çubuk 4 sekme değil');
    await p.click('.ust-profil'); await bekle(p, 450);
    (await p.$$eval('a[href^="#/menu/"]', (l) => l.length)) === 5 ? tamam('menüde 5 kategori') : hata('menü kategorileri eksik');
    for (const k of ['antrenman', 'beslenme', 'topluluk', 'uygulama', 'comeback']) { await p.evaluate((h) => { location.hash = h; }, '#/menu/' + k); await bekle(p, 300); (await p.$('.mn-satir')) ? tamam('menü/' + k + ' açıldı') : hata('menü/' + k + ' boş'); }
    await p.evaluate(() => { location.hash = '#/antrenman'; }); await bekle(p, 500);
    await p.click('[data-act="uc-ac"]'); await bekle(p, 350);
    (await p.$('.uc-kap.acik')) ? tamam('üç nokta menüsü açıldı') : hata('üç nokta menüsü açılmadı');
    await p.click('h1.baslik'); await bekle(p, 350);
    (await p.$('.uc-kap.acik')) ? hata('üç nokta menüsü dışarı dokununca kapanmadı') : tamam('üç nokta menüsü kapandı');
    await p.click('[data-act="ak-ac"]'); await bekle(p, 500);
    (await p.$('.ak-liste.acik')) ? tamam('günün hareketleri açıldı') : hata('günün hareketleri açılmadı');
    await p.evaluate(() => { location.hash = '#/topluluk'; }); await bekle(p, 1300);
    await p.evaluate(() => { const y = document.querySelector('#app .yatay'); y.scrollLeft = y.scrollWidth; }); await bekle(p, 100);
    const once = await p.evaluate(() => { const y = document.querySelector('#app .yatay'); return { sol: y.scrollLeft, ust: y.getBoundingClientRect().top }; });
    await p.click('#app .yatay a[href="#/topluluk/meydan"]'); await bekle(p, 600);
    const sonra = await p.evaluate(() => { const y = document.querySelector('#app .yatay'); return { sol: y.scrollLeft, ust: y.getBoundingClientRect().top }; });
    sonra.sol > 0 && Math.abs(sonra.ust - once.ust) < 3 ? tamam('topluluk sekmesinde yer korunuyor') : hata('topluluk sekmesi başa atıyor (' + JSON.stringify([once, sonra]) + ')');
    await p.evaluate(() => { location.hash = '#/bgecmis'; }); await bekle(p, 400);
    (await p.$('.gc-satir')) ? tamam('beslenme geçmişi dolu') : hata('beslenme geçmişi boş');
    p.hatalar.length ? hata('gezinme JS hatası: ' + p.hatalar.join(' | ')) : tamam('hata yok'); await p.context().close(); }

  console.log('Antrenman odak akışı');
  for (const boy of [844, 667]) {
    const p = await sayfa(b, { boy }); await p.goto(ADRES + '#/antrenman'); await bekle(p, 1200); await temizle(p);
    await p.click('.buyuk-btn[data-act="basla"]'); await bekle(p, 3800);
    (await p.$('[data-act="od-isindim"]')) ? tamam(boy + ' · ısınma sayfası') : hata(boy + ' · ısınma sayfası yok');
    await p.click('[data-act="od-isindim"]'); await bekle(p, 600);
    const art = '.od-adim-btn[data-alan="kg"]:not([data-d^="-"])'; await p.click(art); await bekle(p, 200);
    const c = await p.evaluate(() => { const d = document.querySelector('.od-adim'); if (!d) return null; const v = d.querySelector('.od-adim-in').getBoundingClientRect(); const bt = d.querySelectorAll('button');
      return { kg: d.querySelector('.od-adim-in').value, cak: v.left < bt[0].getBoundingClientRect().right || v.right > bt[1].getBoundingClientRect().left, tasma: document.documentElement.scrollHeight > innerHeight + 1 }; });
    if (!c) hata(boy + ' · kilo girişi yok'); else { c.cak ? hata(boy + ' · kilo ' + c.kg + ' butonlarla çakışıyor') : tamam(boy + ' · kilo ' + c.kg + ' çakışmıyor'); c.tasma ? hata(boy + ' · ekran kayıyor') : tamam(boy + ' · ekran tek sayfa'); }
    const kgIn = '.od-adim-in[data-in="kg"]'; await p.click(kgIn); await bekle(p, 80); await p.keyboard.type('47.5'); await p.keyboard.press('Enter'); await bekle(p, 250);
    (await p.$eval(kgIn, (e) => e.value)) === '47,5' ? tamam(boy + ' · kilo elle yazıldı (47,5)') : hata(boy + ' · elle kilo yazılamadı');
    await p.click('[data-act="tik"]'); await bekle(p, 500);
    (await p.$('.od-set.ok')) ? tamam(boy + ' · set bitti') : hata(boy + ' · set bitmedi');
    const dn = await p.evaluate(() => { const d = document.getElementById('dinlenme'); const a = document.querySelector('.od-alt'); if (!d || !a) return null; const r1 = d.getBoundingClientRect(), r2 = a.getBoundingClientRect(); return Math.abs(r1.top - r2.top) < 2 && Math.abs(r1.height - r2.height) < 2; });
    dn ? tamam(boy + ' · dinlenme sayacı Seti bitir yerinde') : hata(boy + ' · dinlenme sayacı yerinde değil');
    await p.evaluate(() => { const d = document.getElementById('dinlenme'); if (d) d.remove(); });
    await p.click('[data-act="od-menu"]'); await bekle(p, 450);
    await p.evaluate(() => { const s = document.querySelector('.od-sayfa'); s.scrollTop = s.scrollHeight; }); const once = await p.evaluate(() => document.querySelector('.od-sayfa').scrollTop);
    await p.click('.od-sayfa [data-act="iptal"]'); await bekle(p, 200); const sonra = await p.evaluate(() => document.querySelector('.od-sayfa').scrollTop);
    Math.abs(once - sonra) < 2 ? tamam(boy + ' · Kaydetmeden çık yerinde kalıyor') : hata(boy + ' · menü başa kaydı');
    const n0 = await p.evaluate(() => document.querySelectorAll('.od-n').length);
    await p.click('[data-act="od-ekle-ac"]'); await bekle(p, 400); await p.fill('#odAra', 'curl'); await bekle(p, 150);
    await p.click('[data-act="od-ekle-sec"]'); await bekle(p, 500);
    (await p.evaluate(() => document.querySelectorAll('.od-n').length)) === n0 + 1 ? tamam(boy + ' · antrenmana hareket eklendi') : hata(boy + ' · hareket eklenemedi');
    p.hatalar.length ? hata(boy + ' · JS hatası: ' + p.hatalar.join(' | ')) : tamam(boy + ' · hata yok'); await p.context().close();
  }
  await b.close(); sunucu.close();
  console.log(sorun.length ? '\n' + sorun.length + ' sorun var.' : '\nHepsi geçti.'); process.exit(sorun.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
