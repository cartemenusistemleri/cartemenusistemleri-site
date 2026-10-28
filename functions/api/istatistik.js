// İşletme istatistiği — personel/işletme şifresiyle okunur.
// POST /api/istatistik (x-stok-pass) body: { k, gun: 7|30 }
import { stokSifresi } from './stok.js';
import { menuAnahtari, kimlik, izinli, ISLETMELER } from './oturum.js';
const ESKI = ['cafe-solen'];

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
}

export async function onRequestPost({ request, env }) {
  let b;
  try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Geçersiz istek' }, 400); }
  const k = String(b.k || '');
  // 'cafe-solen:bayrakli' tek şube, 'cafe-solen:*' tüm şubeler toplamı
  const tumMu = /^([a-z0-9-]+):\*$/.exec(k);
  const mk = tumMu ? (ISLETMELER[tumMu[1]] ? { k: tumMu[1], sube: '*' } : null) : menuAnahtari(k);
  if (!mk && ESKI.indexOf(k) === -1) return json({ ok: false, error: 'Menü bulunamadı' }, 404);
  let yetki = false;
  if (mk) {
    const kim = await kimlik(request, env);
    yetki = izinli(kim, mk.k, 'istatistik', mk.sube);
    if (!yetki && kim) return json({ ok: false, error: 'İstatistik yetkiniz yok' }, 403);
  } else {
    const pass = (request.headers.get('x-stok-pass') || '').trim();
    yetki = env.ADMIN_SECRET && pass && (pass === env.ADMIN_SECRET || pass.toLowerCase() === await stokSifresi(env, k));
  }
  if (!yetki) return json({ ok: false, error: 'Oturum geçersiz, tekrar giriş yapın' }, 401);
  const kosul = mk && mk.sube === '*' ? 'k LIKE ?1' : 'k = ?1', kv = mk && mk.sube === '*' ? mk.k + ':%' : k;
  if (!env.ISTATISTIK) return json({ ok: false, error: 'İstatistik veritabanı bağlı değil' }, 503);

  const gunSay = Math.min(Math.max(parseInt(b.gun, 10) || 7, 1), 90);
  const bas = new Date(Date.now() + 3 * 3600e3 - (gunSay - 1) * 86400e3).toISOString().slice(0, 10);
  const db = env.ISTATISTIK;
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS olay (gun TEXT NOT NULL, k TEXT NOT NULL, id TEXT NOT NULL, tur TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (gun, k, id, tur))').run();
    const [urun, gunluk] = await db.batch([
      db.prepare("SELECT id, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v, SUM(CASE WHEN tur='a' THEN n ELSE 0 END) AS a FROM olay WHERE " + kosul + " AND gun >= ?2 AND id != '_oturum' GROUP BY id").bind(kv, bas),
      db.prepare("SELECT gun, SUM(CASE WHEN tur='s' THEN n ELSE 0 END) AS s, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v FROM olay WHERE " + kosul + " AND gun >= ?2 GROUP BY gun ORDER BY gun").bind(kv, bas),
    ]);
    let ozet = null;
    // tüm şubeler: şube şube özet + önceki dönemle karşılaştırma
    if (mk && mk.sube === '*') {
      const bas2 = new Date(Date.now() + 3 * 3600e3 - (2 * gunSay - 1) * 86400e3).toISOString().slice(0, 10);
      const [cur, prev, top] = await db.batch([
        db.prepare("SELECT k, SUM(CASE WHEN tur='s' THEN n ELSE 0 END) AS s, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v, SUM(CASE WHEN tur='a' THEN n ELSE 0 END) AS a FROM olay WHERE k LIKE ?1 AND gun >= ?2 GROUP BY k").bind(kv, bas),
        db.prepare("SELECT k, SUM(CASE WHEN tur='s' THEN n ELSE 0 END) AS s, SUM(CASE WHEN tur='v' THEN n ELSE 0 END) AS v, SUM(CASE WHEN tur='a' THEN n ELSE 0 END) AS a FROM olay WHERE k LIKE ?1 AND gun >= ?2 AND gun < ?3 GROUP BY k").bind(kv, bas2, bas),
        db.prepare("SELECT k, id, SUM(n) AS n FROM olay WHERE k LIKE ?1 AND gun >= ?2 AND tur = 'v' AND id != '_oturum' GROUP BY k, id ORDER BY k, n DESC").bind(kv, bas),
      ]);
      let tk = [];
      try { tk = (await db.prepare("SELECT k, COUNT(*) AS c FROM stoklog WHERE k LIKE ?1 AND t >= ?2 AND islem = 'tukendi' GROUP BY k").bind(kv, bas + 'T00:00:00').all()).results || []; } catch (e) { tk = []; }
      const by = {};
      const al = function (k) { return by[k] || (by[k] = { k: k, s: 0, v: 0, a: 0, ps: 0, pv: 0, pa: 0, top: null, tk: 0 }); };
      (cur.results || []).forEach(function (r) { const x = al(r.k); x.s = r.s || 0; x.v = r.v || 0; x.a = r.a || 0; });
      (prev.results || []).forEach(function (r) { const x = al(r.k); x.ps = r.s || 0; x.pv = r.v || 0; x.pa = r.a || 0; });
      (top.results || []).forEach(function (r) { const x = al(r.k); if (!x.top) x.top = { id: r.id, n: r.n }; });
      tk.forEach(function (r) { al(r.k).tk = r.c || 0; });
      ozet = Object.keys(by).map(function (k) { return by[k]; });
    }
    return json({ ok: true, bas, gun: gunSay, urunler: urun.results, gunluk: gunluk.results, ozet });
  } catch (e) {
    return json({ ok: false, error: 'Veritabanı hatası' }, 500);
  }
}
