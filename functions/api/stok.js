// Anlık stok (var / tükendi) — Carte Menü Sistemleri
// GET  /api/stok?k=cafe-solen           -> { ok, out: { urunId: 1, ... }, t }
// POST /api/stok  (x-stok-pass başlığı) -> { k, check } | { k, id, out } | { k, id, alan:'fav'|'yeni', val } | { k, all: 'var' }
// fav = "Öneriyoruz", yeni = "Yeni" etiketi
// Veri: ODEME_LINKS KV içinde "stok:<k>" anahtarı (tek JSON). Miktar tutulmaz, sadece var/yok.

// İzinli menüler. İleride şubeye göre: 'cafe-solen:evka-3' gibi eklenir.
const MENULER = ['cafe-solen'];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function gecerliMenu(k) { return MENULER.indexOf(String(k || '')) !== -1; }

// Personel şifresi: ADMIN_SECRET + menü + sürüm'den türetilir, hiçbir yerde saklanmaz.
export async function stokSifresi(env, k) {
  const ver = (await env.ODEME_LINKS.get('stokver:' + k)) || '1';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('stok|' + k + '|' + ver)));
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += A[sig[i] % A.length];
  return s;
}

async function oku(env, k) {
  const raw = await env.ODEME_LINKS.get('stok:' + k);
  const bos = { out: {}, fav: {}, yeni: {}, t: null };
  if (!raw) return bos;
  try { const d = JSON.parse(raw); return { out: d.out || {}, fav: d.fav || {}, yeni: d.yeni || {}, t: d.t || null }; } catch (e) { return bos; }
}

export async function onRequestGet({ request, env }) {
  const k = new URL(request.url).searchParams.get('k');
  if (!gecerliMenu(k)) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  const d = await oku(env, k);
  return json({ ok: true, out: d.out, fav: d.fav, yeni: d.yeni, t: d.t });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SECRET) return json({ ok: false, error: 'Sunucu ayarı eksik' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(body.k || '');
  if (!gecerliMenu(k)) return json({ ok: false, error: 'Menü bulunamadı' }, 404);

  const pass = (request.headers.get('x-stok-pass') || '').trim();
  const ok = pass && (pass === env.ADMIN_SECRET || pass.toLowerCase() === await stokSifresi(env, k));
  if (!ok) return json({ ok: false, error: 'Şifre hatalı' }, 401);

  if (body.check) return json({ ok: true });

  const d = await oku(env, k);
  if (body.all === 'var') {
    d.out = {};
  } else {
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{1,64}$/.test(id)) return json({ ok: false, error: 'Geçersiz ürün' }, 400);
    const alan = body.alan === 'fav' || body.alan === 'yeni' ? body.alan : 'out';
    const val = alan === 'out' ? !!body.out : !!body.val;
    if (val) d[alan][id] = 1; else delete d[alan][id];
  }
  if (Object.keys(d.out).length + Object.keys(d.fav).length + Object.keys(d.yeni).length > 900) return json({ ok: false, error: 'Çok fazla kayıt' }, 400);
  d.t = new Date().toISOString();
  await env.ODEME_LINKS.put('stok:' + k, JSON.stringify(d));
  return json({ ok: true, out: d.out, fav: d.fav, yeni: d.yeni, t: d.t });
}
