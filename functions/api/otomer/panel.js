// Otomer panel API — Cloudflare Pages Function
// Her istekte başlık:  x-admin-secret: <anahtar>   (ya da Authorization: Bearer <anahtar>)
// Anahtar: OTOMER_PANEL_KEY tanımlıysa o; değilse sitenin ADMIN_SECRET'ı
// GET  /api/otomer/panel?day=2026-11-02   → o günün (ya da tüm) talepleri
// POST /api/otomer/panel  { code, status, day?, slot?, when?, not? }
//      status: "bekliyor" | "onaylandi" | "iptal"   (müşterinin kartı bu durumu gösterir)
// Veri: KV OTOMER_RANDEVU bağlıysa o, yoksa ODEME_LINKS (anahtar öneki "otomer:randevu:")

const J = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const kv = env => env.OTOMER_RANDEVU || env.ODEME_LINKS;
const PFX = 'otomer:randevu:';
function authed(request, env) {
  const got = request.headers.get('x-admin-secret') || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const want = env.OTOMER_PANEL_KEY || env.ADMIN_SECRET || '';
  if (!want || got.length !== want.length) return false;
  let diff = 0; for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

export async function onRequestGet({ request, env }) {
  if (!authed(request, env)) return J({ error: 'Yetkisiz' }, 401);
  const day = new URL(request.url).searchParams.get('day');
  const out = []; let cursor;
  do {
    const page = await kv(env).list({ prefix: PFX, cursor });
    for (const k of page.keys) if (!day || k.metadata?.day === day) out.push({ code: k.name.slice(PFX.length), ...k.metadata });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort((a, b) => (a.day + a.slot).localeCompare(b.day + b.slot));
  return J({ items: out });
}

export async function onRequestPost({ request, env }) {
  if (!authed(request, env)) return J({ error: 'Yetkisiz' }, 401);
  let b; try { b = await request.json(); } catch { return J({ error: 'Geçersiz istek' }, 400); }
  if (!/^OT-\d{4}-[A-Z0-9]{4}$/.test(b.code || '')) return J({ error: 'Kod hatalı' }, 400);
  if (b.status && !['bekliyor', 'onaylandi', 'iptal'].includes(b.status)) return J({ error: 'Durum hatalı' }, 400);
  const key = PFX + b.code;
  const rec = await kv(env).get(key, 'json');
  if (!rec) return J({ error: 'Bulunamadı' }, 404);
  for (const f of ['status', 'day', 'slot', 'when', 'not']) if (b[f] !== undefined) rec[f] = String(b[f]).slice(0, 200);
  rec.updatedAt = new Date().toISOString();
  await kv(env).put(key, JSON.stringify(rec), {
    metadata: { day: rec.day, slot: rec.slot, status: rec.status, name: rec.name, brand: rec.brand, job: rec.job }
  });
  return J({ ok: true, item: rec });
}
