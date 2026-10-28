// Menü verisi + yönetim panelinden girilen fiyatlar — Carte Menü Sistemleri
// GET /api/menu-data?k=cafe-solen  ->  JavaScript: window.CS_MENU=[...]; window.CS_FIYAT_T="..."
// Temel veri /<k>/data.js (statik dosya). Fiyat değişiklikleri KV'de "fiyat:<k>" = { p: { urunId: fiyat }, t }.
// Ürün bilgisi değişiklikleri (ad, açıklama, alerjen, kalori, görsel, gizle) KV'de "urun:<k>" = { o: { urunId: {...} }, t }.
// KV'ye ulaşılamazsa statik veri olduğu gibi döner; menü asla boş kalmaz.

import { ISLETMELER } from './oturum.js';

export async function temelMenu(env, request, k) {
  const r = await env.ASSETS.fetch(new URL('/' + k + '/data.js', request.url));
  if (!r.ok) throw new Error('data.js yok');
  const js = await r.text();
  const i = js.indexOf('[', js.indexOf('=')), j = js.lastIndexOf(']');
  return JSON.parse(js.slice(i, j + 1));
}

export async function fiyatlariOku(env, k) {
  try {
    const raw = await env.ODEME_LINKS.get('fiyat:' + k);
    if (!raw) return { p: {}, t: null };
    const d = JSON.parse(raw);
    return { p: d.p || {}, t: d.t || null };
  } catch (e) { return { p: {}, t: null }; }
}

async function urunOku(env, k) {
  try {
    const raw = await env.ODEME_LINKS.get('urun:' + k);
    if (!raw) return { o: {}, t: null };
    const d = JSON.parse(raw);
    return { o: d.o || {}, t: d.t || null };
  } catch (e) { return { o: {}, t: null }; }
}

export function uygula(menu, p, o) {
  o = o || {};
  menu.forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (!it.id) return;
      if (Object.prototype.hasOwnProperty.call(p, it.id)) it.p = p[it.id];
      const d = o[it.id];
      if (d) Object.keys(d).forEach(function (a) { it[a] = d[a]; });
    });
    s.items = (s.items || []).filter(function (it) { return !it.gizli; });
  });
  return menu.filter(function (s) { return s.items.length; });
}

function js(body, cache) {
  return new Response(body, {
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': cache || 'public, max-age=0, must-revalidate',
    },
  });
}

export async function onRequestGet({ request, env }) {
  const k = new URL(request.url).searchParams.get('k') || '';
  if (!ISLETMELER[k]) return js('/* menü bulunamadı */', 'no-store');
  const V = ISLETMELER[k].degisken || 'CS_MENU';
  let menu;
  try { menu = await temelMenu(env, request, k); }
  catch (e) { return js('/* temel veri okunamadı */', 'no-store'); }
  const f = await fiyatlariOku(env, k), u = await urunOku(env, k);
  menu = uygula(menu, f.p, u.o);
  let foto = {};
  try { foto = JSON.parse((await env.ODEME_LINKS.get('subefoto:' + k)) || '{}'); } catch (e) { foto = {}; }
  return js('window.' + V + '=' + JSON.stringify(menu) + ';window.CS_FIYAT_T=' + JSON.stringify(f.t) + ';window.CS_SUBE_FOTO=' + JSON.stringify(foto) + ';');
}
