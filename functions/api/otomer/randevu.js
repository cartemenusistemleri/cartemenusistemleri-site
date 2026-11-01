// Otomer randevu API — Cloudflare Pages Function
// POST /api/otomer/randevu        → yeni talep kaydeder, { code, status } döner
// GET  /api/otomer/randevu?code=  → müşterinin kartı için yalnızca durum ve saat döner
// Veri: KV OTOMER_RANDEVU bağlıysa o, yoksa sitenin mevcut ODEME_LINKS KV'si (anahtar öneki "otomer:")

const J = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const clean = (v, n) => String(v ?? '').trim().slice(0, n);
const ALPHA = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
const kv = env => env.OTOMER_RANDEVU || env.ODEME_LINKS;
const K = code => 'otomer:randevu:' + code;

export async function onRequestPost({ request, env }) {
  if (!kv(env)) return J({ error: 'Kayıt sistemi hazır değil' }, 503);
  let b;
  try { b = await request.json(); } catch { return J({ error: 'Geçersiz istek' }, 400); }
  const r = {
    brand: clean(b.brand, 20), year: clean(b.year, 12), job: clean(b.job, 40),
    day: clean(b.day, 10), slot: clean(b.slot, 5), when: clean(b.when, 60),
    vin: clean(b.vin, 17).toUpperCase(), km: clean(b.km, 12), name: clean(b.name, 80), tel: clean(b.tel, 24)
  };
  if (!['Mercedes-Benz', 'BMW'].includes(r.brand) || !r.job || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) ||
      !/^\d{2}\.\d{2}$/.test(r.slot) || !r.name || r.tel.replace(/\D/g, '').length < 10)
    return J({ error: 'Eksik ya da hatalı bilgi' }, 422);
  if (r.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(r.vin)) return J({ error: 'Şase numarası hatalı' }, 422);

  // basit sınır: aynı IP'den 10 dakikada en fazla 5 talep
  const ip = request.headers.get('cf-connecting-ip') || 'yok';
  const rk = 'otomer:rl:' + ip;
  const n = +(await kv(env).get(rk) || 0);
  if (n >= 5) return J({ error: 'Çok fazla deneme; lütfen 0232 386 33 88\'i arayın' }, 429);
  await kv(env).put(rk, String(n + 1), { expirationTtl: 600 });

  const rnd = crypto.getRandomValues(new Uint8Array(4));
  const code = 'OT-' + r.day.slice(5).replace('-', '') + '-' + [...rnd].map(x => ALPHA[x % ALPHA.length]).join('');
  const rec = { ...r, code, status: 'bekliyor', createdAt: new Date().toISOString() };
  await kv(env).put(K(code), JSON.stringify(rec), {
    metadata: { day: r.day, slot: r.slot, status: 'bekliyor', name: r.name, brand: r.brand, job: r.job }
  });
  return J({ code, status: 'bekliyor' }, 201);
}

export async function onRequestGet({ request, env }) {
  if (!kv(env)) return J({ error: 'Kayıt sistemi hazır değil' }, 503);
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!/^OT-\d{4}-[A-Z0-9]{4}$/.test(code)) return J({ error: 'Kod hatalı' }, 400);
  const v = await kv(env).get(K(code), 'json');
  if (!v) return J({ error: 'Bulunamadı' }, 404);
  return J({ code, status: v.status, when: v.when }); // kişisel bilgiler dönmez
}
