// Yönetim paneli: fiyat güncelleme — Carte Menü Sistemleri
// POST /api/fiyat  (x-admin-secret başlığı)
//   { k, check:true }                     -> şifre kontrolü
//   { k, get:true }                       -> { p: değişen fiyatlar, t, log }
//   { k, set:{ urunId: fiyat, ... } }     -> fiyatları kaydet (temel fiyata eşitse kayıt silinir)
//   { k, reset:true }                     -> tüm fiyatları data.js'teki hallerine döndür
// Veri: ODEME_LINKS KV -> "fiyat:<k>" = { p, t }, "fiyatlog:<k>" = son 30 değişiklik

import { temelMenu, fiyatlariOku } from './menu-data.js';
import { kimlik, izinli, ISLETMELER } from './oturum.js';

const MENULER = Object.keys(ISLETMELER);

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function logOku(env, k) {
  try { return JSON.parse((await env.ODEME_LINKS.get('fiyatlog:' + k)) || '[]'); } catch (e) { return []; }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(body.k || '');
  if (MENULER.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  const kim = await kimlik(request, env);
  if (!izinli(kim, k, 'fiyat', null)) return json({ ok: false, error: kim ? 'Fiyat yetkiniz yok' : 'Şifre hatalı veya oturum süresi doldu' }, kim ? 403 : 401);
  if (body.reset && !kim.admin) return json({ ok: false, error: 'Bu işlem yalnızca yöneticiye açık' }, 403);
  const kimAdi = kim.admin ? 'Carte' : kim.ad;

  if (body.check) return json({ ok: true });

  const f = await fiyatlariOku(env, k);
  if (body.get) return json({ ok: true, p: f.p, t: f.t, log: await logOku(env, k) });

  let menu;
  try { menu = await temelMenu(env, request, k); } catch (e) { return json({ ok: false, error: 'Menü verisi okunamadı' }, 500); }
  const temel = {};
  menu.forEach(function (s) { (s.items || []).forEach(function (it) { if (it.id) temel[it.id] = it.p; }); });

  const degisen = [];
  if (body.reset) {
    Object.keys(f.p).forEach(function (id) { degisen.push([id, f.p[id], temel[id] != null ? temel[id] : null]); });
    f.p = {};
  } else if (body.set && typeof body.set === 'object') {
    const ids = Object.keys(body.set);
    if (!ids.length) return json({ ok: false, error: 'Değişiklik yok' }, 400);
    if (ids.length > 600) return json({ ok: false, error: 'Çok fazla ürün' }, 400);
    for (const id of ids) {
      if (!Object.prototype.hasOwnProperty.call(temel, id)) return json({ ok: false, error: 'Ürün bulunamadı: ' + id }, 400);
      const v = Number(body.set[id]);
      if (!isFinite(v) || v < 0 || v > 100000) return json({ ok: false, error: 'Geçersiz fiyat: ' + id }, 400);
      const yeni = Math.round(v * 100) / 100;
      const eski = Object.prototype.hasOwnProperty.call(f.p, id) ? f.p[id] : temel[id];
      if (yeni === eski) continue;
      if (yeni === temel[id]) delete f.p[id]; else f.p[id] = yeni;
      degisen.push([id, eski, yeni]);
    }
  } else {
    return json({ ok: false, error: 'Geçersiz istek' }, 400);
  }

  const log = await logOku(env, k);
  if (degisen.length) {
    f.t = new Date().toISOString();
    await env.ODEME_LINKS.put('fiyat:' + k, JSON.stringify({ p: f.p, t: f.t }));
    log.unshift({ t: f.t, d: degisen.slice(0, 300), n: degisen.length, kaynak: String(body.kaynak || '').slice(0, 60), kim: kimAdi });
    await env.ODEME_LINKS.put('fiyatlog:' + k, JSON.stringify(log.slice(0, 30)));
  }
  return json({ ok: true, p: f.p, t: f.t, n: degisen.length, log: log.slice(0, 30) });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
