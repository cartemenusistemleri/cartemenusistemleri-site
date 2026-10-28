// Anlık stok (var / tükendi) — Carte Menü Sistemleri
// GET  /api/stok?k=cafe-solen           -> { ok, out: { urunId: 1, ... }, t }
// POST /api/stok  (x-stok-pass başlığı) -> { k, check } | { k, id, out } | { k, id, alan:'fav'|'yeni', val } | { k, all: 'var' }
// fav = "Öneriyoruz", yeni = "Yeni" etiketi
// Veri: ODEME_LINKS KV içinde "stok:<k>" anahtarı (tek JSON). Miktar tutulmaz, sadece var/yok.

// Şube bazlı anahtarlar: 'cafe-solen:bayrakli' gibi (liste oturum.js -> ISLETMELER).
// Eski tek anahtar 'cafe-solen' geriye dönük uyumluluk için duruyor (eski personel şifresiyle).
import { menuAnahtari, kimlik, izinli } from './oturum.js';
const ESKI = ['cafe-solen'];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

function gecerliMenu(k) { return ESKI.indexOf(String(k || '')) !== -1 || !!menuAnahtari(k); }

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

let tabloHazir = false;
async function logTablo(db) {
  if (tabloHazir) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS stoklog (t TEXT NOT NULL, k TEXT NOT NULL, u TEXT NOT NULL, id TEXT NOT NULL, islem TEXT NOT NULL)').run();
  await db.prepare('CREATE INDEX IF NOT EXISTS stoklog_k_t ON stoklog (k, t)').run();
  tabloHazir = true;
}
export async function onRequestPost({ request, env, waitUntil }) {
  const ctxWait = waitUntil || null;
  if (!env.ADMIN_SECRET) return json({ ok: false, error: 'Sunucu ayarı eksik' }, 500);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(body.k || '');
  if (!gecerliMenu(k)) return json({ ok: false, error: 'Menü bulunamadı' }, 404);

  const mk = menuAnahtari(k);
  let kim = null;
  // işlem kaydı (kim, ne zaman, neyi) — şube müdürü / patron (istatistik yetkisi) görür
  if (body.log) {
    kim = mk ? await kimlik(request, env) : null;
    if (!mk || !izinli(kim, mk.k, 'istatistik', mk.sube)) return json({ ok: false, error: kim ? 'Kayıtları görme yetkiniz yok' : 'Oturum geçersiz, tekrar giriş yapın' }, kim ? 403 : 401);
    if (!env.ISTATISTIK) return json({ ok: true, kayit: [] });
    try {
      await logTablo(env.ISTATISTIK);
      const r = await env.ISTATISTIK.prepare('SELECT t, u, id, islem FROM stoklog WHERE k = ?1 ORDER BY t DESC LIMIT 200').bind(k).all();
      return json({ ok: true, kayit: r.results || [] });
    } catch (e) { return json({ ok: false, error: 'Kayıtlar okunamadı' }, 500); }
  }
  const alan0 = body.all === 'var' ? 'out' : (body.alan === 'fav' || body.alan === 'yeni' ? body.alan : 'out');
  const yetki = alan0 === 'out' ? 'stok' : 'oneri';
  let ok = false;
  if (mk) {
    kim = await kimlik(request, env);
    ok = body.check ? (izinli(kim, mk.k, 'stok', mk.sube) || izinli(kim, mk.k, 'oneri', mk.sube)) : izinli(kim, mk.k, yetki, mk.sube);
    if (!ok && kim) return json({ ok: false, error: 'Bu işlem için yetkiniz yok' }, 403);
  } else {
    const pass = (request.headers.get('x-stok-pass') || '').trim();
    ok = pass && (pass === env.ADMIN_SECRET || pass.toLowerCase() === await stokSifresi(env, k));
  }
  if (!ok) return json({ ok: false, error: 'Oturum geçersiz, tekrar giriş yapın' }, 401);

  if (body.check) return json({ ok: true });

  const d = await oku(env, k);
  let islem = '', lid = '';
  if (body.all === 'var') {
    d.out = {}; islem = 'hepsi-var'; lid = '*';
  } else {
    const id = String(body.id || '');
    if (!/^[a-z0-9-]{1,64}$/.test(id)) return json({ ok: false, error: 'Geçersiz ürün' }, 400);
    const alan = body.alan === 'fav' || body.alan === 'yeni' ? body.alan : 'out';
    const val = alan === 'out' ? !!body.out : !!body.val;
    if (val) d[alan][id] = 1; else delete d[alan][id];
    islem = alan === 'out' ? (val ? 'tukendi' : 'var') : alan + (val ? '+' : '-'); lid = id;
  }
  if (Object.keys(d.out).length + Object.keys(d.fav).length + Object.keys(d.yeni).length > 900) return json({ ok: false, error: 'Çok fazla kayıt' }, 400);
  d.t = new Date().toISOString();
  await env.ODEME_LINKS.put('stok:' + k, JSON.stringify(d));
  if (mk && env.ISTATISTIK) {
    const u = kim && !kim.admin ? (kim.ad || kim.kullanici) : 'Carte';
    const yaz = logTablo(env.ISTATISTIK).then(function () {
      return env.ISTATISTIK.prepare('INSERT INTO stoklog (t, k, u, id, islem) VALUES (?1, ?2, ?3, ?4, ?5)').bind(d.t, k, u.slice(0, 60), lid, islem).run();
    }).catch(function () {});
    if (ctxWait) ctxWait(yaz); else await yaz;
  }
  return json({ ok: true, out: d.out, fav: d.fav, yeni: d.yeni, t: d.t });
}
