// Menü istatistiği — hangi ürüne bakıldı / listeye eklendi.
// POST /api/olay  body (sendBeacon, text/plain JSON): { k, s?:1, v:[urunId...], a:[urunId...] }
// Veri: D1 (binding: ISTATISTIK). Kişisel veri tutulmaz; sadece günlük sayaç.
import { menuAnahtari } from './oturum.js';
const ESKI = ['cafe-solen'];
const ID = /^[a-z0-9-]{1,64}$/;

export async function onRequestPost({ request, env }) {
  const ok = new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  if (!env.ISTATISTIK) return ok;
  let b;
  try { b = JSON.parse(await request.text()); } catch (e) { return ok; }
  const k = String(b.k || '');
  if (ESKI.indexOf(k) === -1 && !menuAnahtari(k)) return ok;
  // Türkiye saatine göre gün
  const gun = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  const say = {};
  const ekle = (id, tur) => { if (!ID.test(id)) return; const key = id + '|' + tur; say[key] = Math.min((say[key] || 0) + 1, 20); };
  (Array.isArray(b.v) ? b.v.slice(0, 60) : []).forEach(id => ekle(String(id), 'v'));
  (Array.isArray(b.a) ? b.a.slice(0, 60) : []).forEach(id => ekle(String(id), 'a'));
  if (b.s) say['_oturum|s'] = 1;
  const keys = Object.keys(say);
  if (!keys.length) return ok;
  const db = env.ISTATISTIK;
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS olay (gun TEXT NOT NULL, k TEXT NOT NULL, id TEXT NOT NULL, tur TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (gun, k, id, tur))').run();
    const st = db.prepare('INSERT INTO olay (gun, k, id, tur, n) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(gun, k, id, tur) DO UPDATE SET n = n + excluded.n');
    await db.batch(keys.map(key => { const [id, tur] = key.split('|'); return st.bind(gun, k, id, tur, say[key]); }));
  } catch (e) {}
  return ok;
}
