// Grind. — kişisel mesai kayıtları (cartemenusistemleri.com.tr/grind).
// İstemci, kullanıcının şifresinden PBKDF2 ile 64 haneli bir anahtar türetir ve
// x-grind-key başlığıyla gönderir. Burada yalnızca o anahtarın SHA-256'sı saklanır;
// şifre de anahtar da veritabanına yazılmaz.
//   GET  /api/grind                       → { ok, v, data } | 404
//   PUT  /api/grind  (x-grind-create: 1)  → yeni hesap; varsa 409
//   PUT  /api/grind  body { v, data }     → v eşleşirse yazar; eşleşmezse 409 + güncel veri
// Veri: D1 carte-istatistik (env.ISTATISTIK), tablo grind.

const H = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (b, s) => new Response(JSON.stringify(b), { status: s || 200, headers: H });
const MAX = 1500000;

async function sha(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return Array.from(new Uint8Array(d), x => x.toString(16).padStart(2, '0')).join('');
}
async function kimlik(request) {
  const k = (request.headers.get('x-grind-key') || '').trim();
  if (!/^[a-f0-9]{64}$/.test(k)) return null;
  return sha('grind:' + k);
}
async function tablo(env) {
  const db = env.ISTATISTIK;
  if (!db) return null;
  await db.prepare('CREATE TABLE IF NOT EXISTS grind (id TEXT PRIMARY KEY, data TEXT NOT NULL, v INTEGER NOT NULL, guncel INTEGER NOT NULL)').run();
  return db;
}

export async function onRequestGet({ request, env }) {
  const id = await kimlik(request);
  if (!id) return json({ ok: false, error: 'Anahtar geçersiz' }, 400);
  const db = await tablo(env);
  if (!db) return json({ ok: false, error: 'Veritabanı bağlı değil' }, 503);
  const r = await db.prepare('SELECT data, v FROM grind WHERE id = ?1').bind(id).first();
  if (!r) return json({ ok: false, error: 'Hesap bulunamadı' }, 404);
  return json({ ok: true, v: r.v, data: JSON.parse(r.data) });
}

export async function onRequestPut({ request, env }) {
  const id = await kimlik(request);
  if (!id) return json({ ok: false, error: 'Anahtar geçersiz' }, 400);
  const db = await tablo(env);
  if (!db) return json({ ok: false, error: 'Veritabanı bağlı değil' }, 503);
  const txt = await request.text();
  if (txt.length > MAX) return json({ ok: false, error: 'Kayıt çok büyük' }, 413);
  let b;
  try { b = JSON.parse(txt); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  if (!b || typeof b.data !== 'object' || b.data === null || typeof b.data.months !== 'object') {
    return json({ ok: false, error: 'Geçersiz veri' }, 400);
  }
  const data = JSON.stringify(b.data);
  const now = Date.now();

  if (request.headers.get('x-grind-create') === '1') {
    const r = await db.prepare('INSERT INTO grind (id, data, v, guncel) VALUES (?1, ?2, 1, ?3) ON CONFLICT(id) DO NOTHING').bind(id, data, now).run();
    if (!r.meta || !r.meta.changes) return json({ ok: false, error: 'Bu şifreyle bir hesap zaten var' }, 409);
    return json({ ok: true, v: 1 });
  }

  const v = parseInt(b.v, 10) || 0;
  const r = await db.prepare('UPDATE grind SET data = ?2, v = v + 1, guncel = ?3 WHERE id = ?1 AND v = ?4').bind(id, data, now, v).run();
  if (r.meta && r.meta.changes) return json({ ok: true, v: v + 1 });
  const cur = await db.prepare('SELECT data, v FROM grind WHERE id = ?1').bind(id).first();
  if (!cur) return json({ ok: false, error: 'Hesap bulunamadı' }, 404);
  return json({ ok: false, conflict: true, v: cur.v, data: JSON.parse(cur.data) }, 409);
}
