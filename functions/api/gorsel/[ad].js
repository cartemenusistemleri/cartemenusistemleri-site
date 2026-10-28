// Ürün fotoğrafını servis eder — GET /api/gorsel/<hash>.webp
// İçerik değişmez (adres dosyanın özetidir), bu yüzden tarayıcı ve Cloudflare önbelleğinde 1 yıl tutulur.

export async function onRequestGet({ request, env, params, waitUntil }) {
  const m = /^([a-f0-9]{32})\.(webp|jpg|png)$/.exec(String(params.ad || ''));
  if (!m) return new Response('Bulunamadı', { status: 404 });
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) return hit;
  if (!env.ISTATISTIK) return new Response('Bulunamadı', { status: 404 });
  let row = null;
  try { row = await env.ISTATISTIK.prepare('SELECT tip, veri FROM gorsel WHERE id = ?').bind(m[1]).first(); } catch (e) { row = null; }
  if (!row) return new Response('Bulunamadı', { status: 404, headers: { 'cache-control': 'no-store' } });
  const res = new Response(new Uint8Array(row.veri), {
    headers: { 'content-type': row.tip, 'cache-control': 'public, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
  const p = cache.put(request, res.clone());
  if (waitUntil) waitUntil(p); else await p;
  return res;
}
