// COMEBACK. — hareket görselleri
// GET  /api/comeback/gorsel            → { dosyalar: ["squat_e_bas", ...] }  (hangi görseller var)
// GET  /api/comeback/gorsel/<ad>.webp  → görsel
// POST /api/comeback/gorsel/<ad>       → görseli kaydet (gövde: image/webp|png|jpeg)
//      Başlık x-yukleme: tek kullanımlık olmayan yükleme anahtarı; SHA-256 özeti D1 "yukleme_anahtar" tablosunda olmalı (bitis > şimdi)
// Saklama: KV (COMEBACK_KV yoksa ODEME_LINKS), anahtar "comeback:gorsel:<ad>"
// Dosya adı: <hareket>_<e|k>_<bas|bit|tut|hata>

const ONEK = 'comeback:gorsel:';
const AD = /^[a-z0-9_]{2,40}_(e|k)_(bas|bit|tut|hata)$/;
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
    const anahtar = request.headers.get('x-yukleme') || '';
    if (!env.COMEBACK_DB || anahtar.length < 24) return json({ hata: 'Yetkisiz.' }, 401, ek);
    const s = await env.COMEBACK_DB.prepare('SELECT bitis FROM yukleme_anahtar WHERE hash = ?').bind(await ozet(anahtar)).first();
    if (!s || s.bitis < Date.now()) return json({ hata: 'Yetkisiz.' }, 401, ek);
    const tur = (request.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(webp|png|jpeg)$/.test(tur)) return json({ hata: 'Yalnızca görsel.' }, 415, ek);
    const veri = await request.arrayBuffer();
    if (veri.byteLength < 1000 || veri.byteLength > 4_000_000) return json({ hata: 'Boyut uygun değil.' }, 413, ek);
    await kv.put(ONEK + yol, veri, { metadata: { tur, boyut: veri.byteLength, zaman: Date.now() } });
    return json({ tamam: true, ad: yol, boyut: veri.byteLength }, 200, ek);
  }
  return json({ hata: 'Desteklenmeyen istek.' }, 405, ek);
}
