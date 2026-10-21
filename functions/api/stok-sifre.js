// Yönetici: personel stok şifresini gösterir / yeniler.
// POST /api/stok-sifre  (x-admin-secret başlığı)  body: { k, yenile? }
import { stokSifresi } from './stok.js';

const MENULER = ['cafe-solen'];

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export async function onRequestPost({ request, env }) {
  const auth = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || auth !== env.ADMIN_SECRET) return json({ ok: false, error: 'Yetkisiz' }, 401);
  let body;
  try { body = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(body.k || '');
  if (MENULER.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  if (body.yenile) {
    const ver = parseInt((await env.ODEME_LINKS.get('stokver:' + k)) || '1', 10) + 1;
    await env.ODEME_LINKS.put('stokver:' + k, String(ver));
  }
  return json({ ok: true, k, sifre: await stokSifresi(env, k) });
}

export async function onRequestGet() {
  return json({ ok: false, error: 'Method not allowed' }, 405);
}
