// Yönetim paneli: ürün fotoğrafı yükleme — Carte Menü Sistemleri
// POST /api/gorsel-yukle?k=cafe-solen  (x-admin-secret başlığı, gövde: görsel baytları, content-type image/webp|jpeg|png)
//   -> { ok, url: '/api/gorsel/<hash>.webp' }
// Görseller D1 (ISTATISTIK bağlaması) içinde "gorsel" tablosunda tutulur; aynı dosya iki kez yüklenirse tek kayıt olur.

const MENULER = ['cafe-solen'];
const TIPLER = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
const MAX = 1500000;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function tabloHazirla(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS gorsel (id TEXT PRIMARY KEY, k TEXT NOT NULL, tip TEXT NOT NULL, boyut INTEGER NOT NULL, veri BLOB NOT NULL, t TEXT NOT NULL)').run();
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || auth !== env.ADMIN_SECRET) return json({ ok: false, error: 'Yönetici şifresi hatalı' }, 401);
  if (!env.ISTATISTIK) return json({ ok: false, error: 'Görsel deposu bağlı değil' }, 500);
  const k = new URL(request.url).searchParams.get('k') || '';
  if (MENULER.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  const tip = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!TIPLER[tip]) return json({ ok: false, error: 'Sadece WebP, JPEG veya PNG yüklenebilir' }, 400);
  const buf = new Uint8Array(await request.arrayBuffer());
  if (!buf.length) return json({ ok: false, error: 'Dosya boş' }, 400);
  if (buf.length > MAX) return json({ ok: false, error: 'Görsel çok büyük (en fazla 1,5 MB)' }, 400);

  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let id = '';
  for (let i = 0; i < 16; i++) id += h[i].toString(16).padStart(2, '0');

  try {
    await tabloHazirla(env.ISTATISTIK);
    await env.ISTATISTIK.prepare('INSERT OR IGNORE INTO gorsel (id, k, tip, boyut, veri, t) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, k, tip, buf.length, buf, new Date().toISOString()).run();
  } catch (e) {
    return json({ ok: false, error: 'Görsel kaydedilemedi' }, 500);
  }
  return json({ ok: true, url: '/api/gorsel/' + id + '.' + TIPLER[tip], boyut: buf.length });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
