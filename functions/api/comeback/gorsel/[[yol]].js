// COMEBACK. — hareket görselleri
// GET  /api/comeback/gorsel            → { dosyalar: ["squat_e_bas", ...] }  (hangi görseller var)
// GET  /api/comeback/gorsel/<ad>.webp  → görsel
// POST /api/comeback/gorsel/<ad>       → görseli kaydet (gövde: image/webp|png|jpeg)
//      Başlık x-yukleme: tek kullanımlık olmayan yükleme anahtarı; SHA-256 özeti D1 "yukleme_anahtar" tablosunda olmalı (bitis > şimdi)
// Saklama: KV (COMEBACK_KV yoksa ODEME_LINKS), anahtar "comeback:gorsel:<ad>"
// Dosya adı: <hareket>_<e|k>_<bas|bit|tut|hata> ya da rozet_<ad>

const ONEK = 'comeback:gorsel:';
const AD = /^(?:[a-z0-9_]{2,40}_(e|k)_(bas|bit|tut|hata)|rozet_[a-z0-9_]{2,40})$/;
// rozet_<ad>: rozet sahneleri (Dreamina'dan aktarılan, 22 Kasım)
const IZINLI = ['https://dreamina.capcut.com'];

function cors(request) {
  const o = request.headers.get('origin') || '';
  return IZINLI.includes(o) ? { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type, x-yukleme', 'access-control-max-age': '600', vary: 'origin' } : {};
}
const json = (veri, durum, ek) => new Response(JSON.stringify(veri), { status: durum || 200, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, ek || {}) });
const ozet = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const kv = env.COMEBACK_KV || env.ODEME_LINKS;
  const yol = (params.yol || []).join('/');
  const ek = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: ek });
  if (!kv) return json({ hata: 'Depolama yok.' }, 503, ek);

  if (request.method === 'GET') {
    if (!yol) {
      const dosyalar = []; let imlec;
      do { const l = await kv.list({ prefix: ONEK, cursor: imlec }); l.keys.forEach((k) => dosyalar.push(k.name.slice(ONEK.length))); imlec = l.list_complete ? null : l.cursor; } while (imlec);
      return new Response(JSON.stringify({ dosyalar }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' } });
    }
    const ad = yol.replace(/\.(webp|png|jpe?g)$/, '');
    if (!AD.test(ad)) return new Response('Bulunamadı', { status: 404 });
    const r = await kv.getWithMetadata(ONEK + ad, { type: 'stream' });
    if (!r || !r.value) return new Response('Bulunamadı', { status: 404 });
    return new Response(r.value, { headers: { 'content-type': (r.metadata && r.metadata.tur) || 'image/webp', 'cache-control': 'public, max-age=86400' } });
  }

  if (request.method === 'POST') {
    if (!AD.test(yol)) return json({ hata: 'Geçersiz dosya adı.' }, 400, ek);
    // Form ile gönderim (Dreamina sayfası artık pencere bağlantısını kesiyor): alanlar tok + dosya, cevap kısa bir sayfa
    const form = (request.headers.get('content-type') || '').indexOf('multipart/form-data') === 0;
    let fd = null; if (form) { try { fd = await request.formData(); } catch (e) { return json({ hata: 'Form okunamadı.' }, 400, ek); } }
    const sayfa = (m, d) => new Response('<!doctype html><meta charset="utf-8"><title>Aktarım</title><p style="font:16px system-ui">' + m + '</p>', { status: d || 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
    const anahtar = (fd ? String(fd.get('tok') || '') : request.headers.get('x-yukleme')) || '';
    if (!env.COMEBACK_DB || anahtar.length < 24) return fd ? sayfa('Yetkisiz.', 401) : json({ hata: 'Yetkisiz.' }, 401, ek);
    const s = await env.COMEBACK_DB.prepare('SELECT bitis FROM yukleme_anahtar WHERE hash = ?').bind(await ozet(anahtar)).first();
    if (!s || s.bitis < Date.now()) return fd ? sayfa('Yetkisiz.', 401) : json({ hata: 'Yetkisiz.' }, 401, ek);
    const dosya = fd ? fd.get('dosya') : null;
    const tur = fd ? String((dosya && dosya.type) || '') : (request.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(webp|png|jpeg)$/.test(tur)) return fd ? sayfa('Yalnızca görsel.', 415) : json({ hata: 'Yalnızca görsel.' }, 415, ek);
    const veri = fd ? await dosya.arrayBuffer() : await request.arrayBuffer();
    if (veri.byteLength < 1000 || veri.byteLength > 4_000_000) return fd ? sayfa('Boyut uygun değil.', 413) : json({ hata: 'Boyut uygun değil.' }, 413, ek);
    await kv.put(ONEK + yol, veri, { metadata: { tur, boyut: veri.byteLength, zaman: Date.now() } });
    return fd ? sayfa(yol + ' kaydedildi (' + Math.round(veri.byteLength / 1024) + ' KB). Bu sekmeyi kapatabilirsin.') : json({ tamam: true, ad: yol, boyut: veri.byteLength }, 200, ek);
  }
  return json({ hata: 'Desteklenmeyen istek.' }, 405, ek);
}
