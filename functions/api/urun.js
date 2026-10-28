// Yönetim paneli: ürün bilgisi düzenleme — Carte Menü Sistemleri
// POST /api/urun  (x-admin-secret başlığı)
//   { k, get:true }                 -> { o: { urunId: { alan: değer } }, t }
//   { k, id, set:{ alanlar } }      -> ürünün alanlarını kaydet (data.js'teki haliyle aynıysa kayıt silinir)
//   { k, id, reset:true }           -> ürünü ilk haline döndür
// Alanlar: n, d, i (TR ad/açıklama/içindekiler), en:[ad, açıklama, içindekiler], a:[alerjen], v:[diyet],
//          k:[kcal, porsiyonTR, porsiyonEN] | null, img: '' | '/api/gorsel/<hash>.webp' | orijinal ad, gizli: bool
// Veri: ODEME_LINKS KV -> "urun:<k>" = { o, t }; geçmiş "fiyatlog:<k>" içine tur:'urun' olarak yazılır.

import { temelMenu } from './menu-data.js';

const MENULER = ['cafe-solen'];
const ALERJEN = ['g', 's', 'y', 'k', 'yf', 'su', 'so', 'ke', 'h', 'sl', 'b'];
const DIYET = ['v', 'vg', 'gf'];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function urunleriOku(env, k) {
  try {
    const raw = await env.ODEME_LINKS.get('urun:' + k);
    if (!raw) return { o: {}, t: null };
    const d = JSON.parse(raw);
    return { o: d.o || {}, t: d.t || null };
  } catch (e) { return { o: {}, t: null }; }
}

function str(v, max) {
  if (v == null) return '';
  if (typeof v !== 'string') throw new Error('metin bekleniyor');
  v = v.replace(/\s+/g, ' ').trim();
  if (v.length > max) throw new Error('çok uzun');
  return v;
}

// Gelen değeri temizler; geçersizse hata fırlatır.
function temizle(alan, v) {
  switch (alan) {
    case 'n': { const s = str(v, 80); if (!s) throw new Error('ürün adı boş olamaz'); return s; }
    case 'd': return str(v, 400);
    case 'i': return str(v, 400);
    case 'en': {
      if (v == null) return null;
      if (!Array.isArray(v)) throw new Error('İngilizce alanlar hatalı');
      const a = [str(v[0], 80), str(v[1], 400), str(v[2], 400)];
      return a[0] || a[1] || a[2] ? a : null;
    }
    case 'a': case 'v': {
      const izin = alan === 'a' ? ALERJEN : DIYET;
      if (!Array.isArray(v)) throw new Error('liste bekleniyor');
      return izin.filter(function (x) { return v.indexOf(x) !== -1; }).join(',');
    }
    case 'k': {
      if (v == null) return null;
      if (!Array.isArray(v)) throw new Error('kalori hatalı');
      const kc = v[0] === '' || v[0] == null ? null : Math.round(Number(v[0]));
      if (kc != null && (!isFinite(kc) || kc < 0 || kc > 5000)) throw new Error('kalori 0–5000 arası olmalı');
      const pt = str(v[1], 40), pe = str(v[2], 40);
      if (kc == null) return null;
      return [kc, pt, pe || pt];
    }
    case 'img': {
      const s = str(v, 120);
      if (s === '' || /^\/api\/gorsel\/[a-f0-9]{16,64}\.(webp|jpg|png)$/.test(s) || /^[a-z0-9_\-]{1,80}$/i.test(s)) return s;
      throw new Error('görsel adresi hatalı');
    }
    case 'gizli': return !!v;
  }
  throw new Error('bilinmeyen alan');
}

// data.js'teki ürünün aynı alanının karşılaştırılabilir hali
function temelDeger(it, alan) {
  switch (alan) {
    case 'n': return it.n || '';
    case 'd': return it.d || '';
    case 'i': return it.i || '';
    case 'en': return it.en && (it.en[0] || it.en[1] || it.en[2]) ? [it.en[0] || '', it.en[1] || '', it.en[2] || ''] : null;
    case 'a': return ALERJEN.filter(function (x) { return (it.a || '').split(',').indexOf(x) !== -1; }).join(',');
    case 'v': return DIYET.filter(function (x) { return (it.v || '').split(',').indexOf(x) !== -1; }).join(',');
    case 'k': return it.k && it.k[0] != null ? [it.k[0], it.k[1] || '', it.k[2] || it.k[1] || ''] : null;
    case 'img': return it.img || '';
    case 'gizli': return false;
  }
}

const ALANLAR = ['n', 'd', 'i', 'en', 'a', 'v', 'k', 'img', 'gizli'];
const ESIT = function (a, b) { return JSON.stringify(a) === JSON.stringify(b); };

async function logOku(env, k) {
  try { return JSON.parse((await env.ODEME_LINKS.get('fiyatlog:' + k)) || '[]'); } catch (e) { return []; }
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || auth !== env.ADMIN_SECRET) return json({ ok: false, error: 'Yönetici şifresi hatalı' }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(body.k || '');
  if (MENULER.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);

  const u = await urunleriOku(env, k);
  if (body.get) return json({ ok: true, o: u.o, t: u.t });

  const id = String(body.id || '');
  let menu;
  try { menu = await temelMenu(env, request, k); } catch (e) { return json({ ok: false, error: 'Menü verisi okunamadı' }, 500); }
  let it = null;
  menu.forEach(function (s) { (s.items || []).forEach(function (x) { if (x.id === id) it = x; }); });
  if (!it) return json({ ok: false, error: 'Ürün bulunamadı' }, 404);

  const once = u.o[id] ? JSON.parse(JSON.stringify(u.o[id])) : {};
  const yeni = JSON.parse(JSON.stringify(once));

  if (body.reset) {
    Object.keys(yeni).forEach(function (a) { delete yeni[a]; });
  } else if (body.set && typeof body.set === 'object') {
    for (const alan of Object.keys(body.set)) {
      if (ALANLAR.indexOf(alan) === -1) return json({ ok: false, error: 'Bilinmeyen alan: ' + alan }, 400);
      let v;
      try { v = temizle(alan, body.set[alan]); } catch (e) { return json({ ok: false, error: e.message }, 400); }
      if (ESIT(v, temelDeger(it, alan))) delete yeni[alan]; else yeni[alan] = v;
    }
  } else {
    return json({ ok: false, error: 'Geçersiz istek' }, 400);
  }

  const degisen = ALANLAR.filter(function (a) { return !ESIT(once[a], yeni[a]); });
  if (!degisen.length) return json({ ok: true, o: u.o, t: u.t, n: 0 });

  if (Object.keys(yeni).length) u.o[id] = yeni; else delete u.o[id];
  u.t = new Date().toISOString();
  const raw = JSON.stringify({ o: u.o, t: u.t });
  if (raw.length > 4000000) return json({ ok: false, error: 'Kayıt çok büyük' }, 400);
  await env.ODEME_LINKS.put('urun:' + k, raw);

  const log = await logOku(env, k);
  log.unshift({ t: u.t, tur: 'urun', id: id, alanlar: degisen, once: once, sonra: yeni, n: 1, kaynak: String(body.kaynak || 'Ürün düzenleme').slice(0, 60) });
  await env.ODEME_LINKS.put('fiyatlog:' + k, JSON.stringify(log.slice(0, 30)));
  return json({ ok: true, o: u.o, t: u.t, n: degisen.length, log: log.slice(0, 30) });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
