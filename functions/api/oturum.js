// İşletme paneli oturumları ve yetkileri — Carte Menü Sistemleri
// POST /api/oturum  { k, kullanici, sifre }  -> { ok, token, ad, subeler, yetkiler }
// GET  /api/oturum  (x-oturum başlığı)       -> { ok, kullanici, ad, subeler, yetkiler }
//
// Kullanıcılar KV'de "kullanicilar:<k>" = { u: { kullaniciAdi: { ad, subeler:[..]|['*'], yetkiler:{stok,oneri,istatistik,fiyat}, tuz, hash, v, t } } }
// Şifreler PBKDF2-SHA256 ile özetlenir; düz şifre hiçbir yerde saklanmaz.
// Oturum anahtarı: imzalı (HMAC, ADMIN_SECRET) ve 30 gün geçerli. Şifre değişince / kullanıcı silinince eski oturumlar düşer.

export const ISLETMELER = {
  'cafe-solen': {
    ad: 'Cafe Şölen',
    subeler: [
      { id: 'merkez', ad: 'Bornova Merkez' },
      { id: 'bayrakli', ad: 'Bayraklı' },
      { id: 'evka-3', ad: 'Evka 3' },
      { id: 'folkart', ad: 'Folkart' },
      { id: 'bostanli', ad: 'Bostanlı', acik: false }, // henüz açılmadı: müşteri şube seçiminde görünmez
    ],
  },
};
export const YETKILER = ['stok', 'oneri', 'istatistik', 'fiyat'];
const GUN = 30;

export function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export function subeIdleri(k) { return ISLETMELER[k] ? ISLETMELER[k].subeler.map(function (s) { return s.id; }) : []; }

// "cafe-solen:bayrakli" -> { k:'cafe-solen', sube:'bayrakli' } ; geçersizse null
export function menuAnahtari(mk) {
  const m = /^([a-z0-9-]+):([a-z0-9-]+)$/.exec(String(mk || ''));
  if (!m || !ISLETMELER[m[1]] || subeIdleri(m[1]).indexOf(m[2]) === -1) return null;
  return { k: m[1], sube: m[2] };
}

// Kullanıcı adı: küçük harf, Türkçe harfler sadeleşir (ibrahimsırt == ibrahimsirt)
export function sadeAd(s) {
  return String(s || '').trim().toLocaleLowerCase('tr')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9._-]/g, '');
}

const enc = new TextEncoder();
function b64u(bytes) { let s = ''; bytes.forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function b64uStr(str) { return b64u(enc.encode(str)); }
function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; }
function hex(bytes) { let s = ''; bytes.forEach(function (b) { s += b.toString(16).padStart(2, '0'); }); return s; }

export async function sifreOzeti(sifre, tuzHex) {
  const tuz = tuzHex ? Uint8Array.from(tuzHex.match(/../g).map(function (h) { return parseInt(h, 16); })) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(String(sifre)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: tuz, iterations: 100000, hash: 'SHA-256' }, key, 256));
  return { tuz: hex(tuz), hash: hex(bits) };
}

function esitMi(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function imza(env, veri) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.ADMIN_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('oturum|' + veri))));
}

export async function kullanicilariOku(env, k) {
  try {
    const raw = await env.ODEME_LINKS.get('kullanicilar:' + k);
    const d = raw ? JSON.parse(raw) : {};
    return { u: d.u || {} };
  } catch (e) { return { u: {} }; }
}

export async function kullanicilariYaz(env, k, d) {
  await env.ODEME_LINKS.put('kullanicilar:' + k, JSON.stringify({ u: d.u }));
}

// İsteği yapanın kimliği: yönetici (ADMIN_SECRET) ya da geçerli oturum.
// Dönüş: { admin:true } | { k, kullanici, ad, subeler, yetkiler } | null
export async function kimlik(request, env) {
  if (!env.ADMIN_SECRET) return null;
  const adm = request.headers.get('x-admin-secret') || '';
  if (adm && esitMi(adm, env.ADMIN_SECRET)) return { admin: true };
  const tok = request.headers.get('x-oturum') || '';
  const p = tok.split('.');
  if (p.length !== 2) return null;
  if (!esitMi(p[1], await imza(env, p[0]))) return null;
  let d;
  try { d = JSON.parse(new TextDecoder().decode(unb64u(p[0]))); } catch (e) { return null; }
  if (!d || !d.k || !d.u || !(d.exp > Date.now())) return null;
  const list = await kullanicilariOku(env, d.k);
  const x = list.u[d.u];
  if (!x || x.v !== d.v) return null;
  return { k: d.k, kullanici: d.u, ad: x.ad || d.u, subeler: x.subeler || [], yetkiler: x.yetkiler || {} };
}

// Kimliğin bir şubede bir yetkisi var mı?  sube null ise şubeden bağımsız yetki (ör. fiyat)
export function izinli(kim, k, yetki, sube) {
  if (!kim) return false;
  if (kim.admin) return true;
  if (kim.k !== k) return false;
  if (!kim.yetkiler || !kim.yetkiler[yetki]) return false;
  if (sube == null) return true;
  if (sube === '*') return kim.subeler.indexOf('*') !== -1;
  return kim.subeler.indexOf('*') !== -1 || kim.subeler.indexOf(sube) !== -1;
}

export function acikSubeler(kim, k) {
  const tum = subeIdleri(k);
  if (kim.admin || kim.subeler.indexOf('*') !== -1) return tum;
  return tum.filter(function (s) { return kim.subeler.indexOf(s) !== -1; });
}

export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_SECRET) return json({ ok: false, error: 'Sunucu ayarı eksik' }, 500);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(b.k || '');
  if (!ISLETMELER[k]) return json({ ok: false, error: 'İşletme bulunamadı' }, 404);
  const u = sadeAd(b.kullanici), sifre = String(b.sifre || '');
  if (!u || !sifre) return json({ ok: false, error: 'Kullanıcı adı ve şifre girin' }, 400);
  const list = await kullanicilariOku(env, k);
  const x = list.u[u];
  // kullanıcı yoksa da aynı süre harcansın
  const oz = await sifreOzeti(sifre, x ? x.tuz : '00000000000000000000000000000000');
  if (!x || !esitMi(oz.hash, x.hash)) {
    await new Promise(function (r) { setTimeout(r, 400); });
    return json({ ok: false, error: 'Kullanıcı adı veya şifre hatalı' }, 401);
  }
  const veri = b64uStr(JSON.stringify({ k: k, u: u, v: x.v, exp: Date.now() + GUN * 86400e3 }));
  const token = veri + '.' + await imza(env, veri);
  return json({ ok: true, token: token, kullanici: u, ad: x.ad || u, subeler: acikSubeler({ subeler: x.subeler || [] }, k), yetkiler: x.yetkiler || {}, isletme: ISLETMELER[k] });
}

export async function onRequestGet({ request, env }) {
  const kim = await kimlik(request, env);
  if (!kim || kim.admin) return json({ ok: false, error: 'Oturum geçersiz' }, 401);
  return json({ ok: true, kullanici: kim.kullanici, ad: kim.ad, subeler: acikSubeler(kim, kim.k), yetkiler: kim.yetkiler, isletme: ISLETMELER[kim.k] });
}
