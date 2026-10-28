// Yönetim paneli: işletme kullanıcıları (yalnızca Carte yöneticisi)
// POST /api/kullanici  (x-admin-secret)
//   { k, list:true }                                                  -> { kullanicilar:[...], isletme }
//   { k, set:{ kullanici, ad, subeler:[..]|['*'], yetkiler:{..}, sifre? } } -> ekle / güncelle (yeni kullanıcıda şifre zorunlu)
//   { k, sil:'kullanici' }                                            -> sil (oturumları hemen düşer)

import { json, ISLETMELER, YETKILER, sadeAd, subeIdleri, kullanicilariOku, kullanicilariYaz, sifreOzeti } from './oturum.js';

function liste(d) {
  return Object.keys(d.u).sort().map(function (u) {
    const x = d.u[u];
    return { kullanici: u, ad: x.ad || '', subeler: x.subeler || [], yetkiler: x.yetkiler || {}, t: x.t || null };
  });
}

export async function onRequestPost({ request, env }) {
  const adm = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || adm !== env.ADMIN_SECRET) return json({ ok: false, error: 'Yönetici şifresi hatalı' }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(b.k || '');
  if (!ISLETMELER[k]) return json({ ok: false, error: 'İşletme bulunamadı' }, 404);
  const d = await kullanicilariOku(env, k);

  if (b.list) return json({ ok: true, kullanicilar: liste(d), isletme: ISLETMELER[k] });

  if (b.sil) {
    const u = sadeAd(b.sil);
    if (!d.u[u]) return json({ ok: false, error: 'Kullanıcı bulunamadı' }, 404);
    delete d.u[u];
    await kullanicilariYaz(env, k, d);
    return json({ ok: true, kullanicilar: liste(d) });
  }

  if (b.set && typeof b.set === 'object') {
    const s = b.set, u = sadeAd(s.kullanici);
    if (!/^[a-z0-9._-]{3,40}$/.test(u)) return json({ ok: false, error: 'Kullanıcı adı 3–40 karakter olmalı (harf, rakam, . _ -)' }, 400);
    const ad = String(s.ad || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const tum = subeIdleri(k);
    let subeler = Array.isArray(s.subeler) ? s.subeler.map(String) : [];
    subeler = subeler.indexOf('*') !== -1 ? ['*'] : tum.filter(function (x) { return subeler.indexOf(x) !== -1; });
    const yetkiler = {};
    YETKILER.forEach(function (y) { if (s.yetkiler && s.yetkiler[y]) yetkiler[y] = true; });
    if (!Object.keys(yetkiler).length) return json({ ok: false, error: 'En az bir yetki seçin' }, 400);
    if ((yetkiler.stok || yetkiler.oneri || yetkiler.istatistik) && !subeler.length) return json({ ok: false, error: 'En az bir şube seçin' }, 400);
    const eski = d.u[u];
    const sifre = s.sifre == null ? '' : String(s.sifre);
    if (!eski && !sifre) return json({ ok: false, error: 'Yeni kullanıcı için şifre girin' }, 400);
    if (sifre && (sifre.length < 6 || sifre.length > 64)) return json({ ok: false, error: 'Şifre 6–64 karakter olmalı' }, 400);
    if (!eski && Object.keys(d.u).length >= 200) return json({ ok: false, error: 'Kullanıcı sınırı doldu' }, 400);
    const x = eski ? Object.assign({}, eski) : { v: 1 };
    x.ad = ad; x.subeler = subeler; x.yetkiler = yetkiler; x.t = new Date().toISOString();
    if (sifre) { const oz = await sifreOzeti(sifre); x.tuz = oz.tuz; x.hash = oz.hash; if (eski) x.v = (eski.v || 1) + 1; }
    // yetki/şube değişikliği açık oturumlara anında yansır (her istekte kayıt okunur)
    d.u[u] = x;
    await kullanicilariYaz(env, k, d);
    return json({ ok: true, kullanici: u, kullanicilar: liste(d) });
  }
  return json({ ok: false, error: 'Geçersiz istek' }, 400);
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
