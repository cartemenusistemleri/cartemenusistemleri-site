// Yönetim: şube seçim ekranındaki şube fotoğrafları (yalnızca Carte yöneticisi)
// POST /api/sube-foto (x-admin-secret)  { k, get:true } | { k, sube, img: '/api/gorsel/<hash>.webp' | '' }
// Veri: ODEME_LINKS KV -> "subefoto:<k>" = { subeId: url }
import { json, ISLETMELER, subeIdleri } from './oturum.js';

export async function onRequestPost({ request, env }) {
  const adm = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || adm !== env.ADMIN_SECRET) return json({ ok: false, error: 'Yönetici şifresi hatalı' }, 401);
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(b.k || '');
  if (!ISLETMELER[k]) return json({ ok: false, error: 'İşletme bulunamadı' }, 404);
  let d = {};
  try { d = JSON.parse((await env.ODEME_LINKS.get('subefoto:' + k)) || '{}'); } catch (e) { d = {}; }
  if (b.get) return json({ ok: true, foto: d, subeler: ISLETMELER[k].subeler });
  const sube = String(b.sube || '');
  if (subeIdleri(k).indexOf(sube) === -1) return json({ ok: false, error: 'Şube bulunamadı' }, 404);
  const img = String(b.img || '');
  if (img && !/^\/api\/gorsel\/[a-f0-9]{32}\.(webp|jpg|png)$/.test(img)) return json({ ok: false, error: 'Görsel adresi hatalı' }, 400);
  if (img) d[sube] = img; else delete d[sube];
  await env.ODEME_LINKS.put('subefoto:' + k, JSON.stringify(d));
  return json({ ok: true, foto: d });
}

export async function onRequestGet() { return json({ ok: false, error: 'Method not allowed' }, 405); }
