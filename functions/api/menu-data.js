// Menü verisi + yönetim panelinden girilen fiyatlar — Carte Menü Sistemleri
// GET /api/menu-data?k=cafe-solen  ->  JavaScript: window.CS_MENU=[...]; window.CS_FIYAT_T="..."
// Temel veri /<k>/data.js (statik dosya). Fiyat değişiklikleri KV'de "fiyat:<k>" = { p: { urunId: fiyat }, t }.
// KV'ye ulaşılamazsa statik veri olduğu gibi döner; menü asla boş kalmaz.

const MENULER = ['cafe-solen'];

export async function temelMenu(env, request, k) {
  const r = await env.ASSETS.fetch(new URL('/' + k + '/data.js', request.url));
  if (!r.ok) throw new Error('data.js yok');
  const js = await r.text();
  const i = js.indexOf('['), j = js.lastIndexOf(']');
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

export function uygula(menu, p) {
  menu.forEach(function (s) {
    (s.items || []).forEach(function (it) {
      if (it.id && Object.prototype.hasOwnProperty.call(p, it.id)) it.p = p[it.id];
    });
  });
  return menu;
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
  if (MENULER.indexOf(k) === -1) return js('/* menü bulunamadı */', 'no-store');
  let menu;
  try { menu = await temelMenu(env, request, k); }
  catch (e) { return js('/* temel veri okunamadı */', 'no-store'); }
  const f = await fiyatlariOku(env, k);
  uygula(menu, f.p);
  return js('window.CS_MENU=' + JSON.stringify(menu) + ';window.CS_FIYAT_T=' + JSON.stringify(f.t) + ';');
}
