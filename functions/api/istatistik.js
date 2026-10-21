// İşletme istatistiği — personel/işletme şifresiyle okunur.
// POST /api/istatistik (x-stok-pass) body: { k, gun: 7|30 }
import { stokSifresi } from './stok.js';
const MENULER = ['cafe-solen'];

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(b.k || '');
  if (MENULER.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  const pass = (request.headers.get('x-stok-pass') || '').trim();
  const yetki = env.ADMIN_SECRET && pass && (pass === env.ADMIN_SECRET || pass.toLowerCase() === await stokSifresi(env, k));
  if (!yetki) return json({ ok: false, error: 'Şifre hatalı' }, 401);
  if (!env.ISTATISTIK) return json({ ok: false, error: 'İstatistik veritabanı bağlı değil' }, 503);

  const gunSay = Math.min(Math.max(parseInt(b.gun, 10) || 7, 1), 90);
  const bas = new Date(Date.now() + 3 * 3600e3 - (gunSay - 1) * 86400e3).toISOString().slice(0, 10);
  const db = env.ISTATISTIK;
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS olay (gun TEXT NOT NULL, k TEXT NOT NULL, id TEXT NOT NULL, tur TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (gun, k, id, tur))').run();
    const [urun, gunluk] = await db.batch([
      db.prepare("SELECT id, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v, SUM(CASE WHEN tur='a' THEN n ELSE 0 END) AS a FROM olay WHERE k = ?1 AND gun >= ?2 AND id != '_oturum' GROUP BY id").bind(k, bas),
      db.prepare("SELECT gun, SUM(CASE WHEN tur='s' THEN n ELSE 0 END) AS s, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v FROM olay WHERE k = ?1 AND gun >= ?2 GROUP BY gun ORDER BY gun").bind(k, bas),
    ]);
    return json({ ok: true, bas, gun: gunSay, urunler: urun.results, gunluk: gunluk.results });
  } catch (e) {
    return json({ ok: false, error: 'Veritabanı hatası' }, 500);
  }
}
