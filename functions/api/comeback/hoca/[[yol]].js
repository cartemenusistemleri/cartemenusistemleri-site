// COMEBACK. — hoca paneli
// Hoca (rol koc ya da admin):
//   GET  /api/comeback/hoca/kod                 → { kod }  (yoksa üretir)
//   POST /api/comeback/hoca/kod                 → { kod }  (yeniler; eski kod geçersiz olur)
//   GET  /api/comeback/hoca/ogrenciler          → { liste: [{ id, ad, son_antrenman, haftalik, kilo, program }] }
//   GET  /api/comeback/hoca/ogrenci/<id>        → { ogrenci, ozet }
//   POST /api/comeback/hoca/ogrenci/<id>/program { program, not } → öğrenciye program gönderir
//   POST /api/comeback/hoca/ogrenci/<id>/cikar  → bağlantıyı koparır
// Öğrenci (herkes):
//   GET  /api/comeback/hoca/benim               → { hoca: { ad } | null, atanan: { id, program, not, hoca, zaman } | null }
//   POST /api/comeback/hoca/baglan { kod, riza } → hocaya bağlanır (verilerini görmesine açık onay)
//   POST /api/comeback/hoca/ayril               → hocadan ayrılır
//   POST /api/comeback/hoca/atanan/<id>/yanit { kabul } → gönderilen programı kabul / ret
const json = (v, d = 200) => new Response(JSON.stringify(v), { status: d, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const hata = (m, d) => json({ hata: m }, d);
const ozet = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
async function govde(req) { try { return await req.json(); } catch (e) { return null; } }
async function kimDir(db, req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)cb_oturum=([A-Za-z0-9_-]+)/); if (!m) return null;
  const s = await db.prepare('SELECT k.id, k.ad, k.rol, o.bitis FROM oturumlar o JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.token_hash = ?').bind(await ozet(m[1])).first();
  return s && s.bitis > Date.now() ? { id: s.id, ad: s.ad, rol: s.rol } : null;
}
const KOD_HARF = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
const kodUret = () => { const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a).map((x) => KOD_HARF[x % KOD_HARF.length]).join(''); };

// öğrencinin kayıtlı uygulama verisinden hocaya gösterilecek özet (yalnızca antrenmanla ilgili alanlar)
function ogrenciOzet(jsonMetin) {
  let S; try { S = JSON.parse(jsonMetin || '{}'); } catch (e) { S = {}; }
  const p = S.profil || {}; const gunluk = S.gunluk || {};
  const gunler = Object.keys(gunluk).sort();
  const son14 = gunler.filter((k) => k >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  const antr = gunler.filter((k) => gunluk[k] && gunluk[k].antrenman).map((k) => Object.assign({ tarih: k }, gunluk[k].antrenman));
  const kcal = son14.map((k) => (gunluk[k].ogun || []).reduce((a, o) => a + (Number(o.k) || 0), 0)).filter((x) => x > 0);
  const kilo = Array.isArray(S.kilo) ? S.kilo.slice(-10) : [];
  return {
    profil: { ad: p.ad, cinsiyet: p.cinsiyet, yas: p.yas, boy: p.boy, hedef: p.hedef, deneyim: p.deneyim, gun: p.gun, ortam: p.ortam, spor: p.spor, sakatlik: p.sakatlik || [] },
    hedef: S.hedef ? { kcal: S.hedef.kcal, protein: S.hedef.protein } : null,
    program: S.program ? { ad: S.program.ad, ozel: !!S.program.ozel, gunler: (S.program.gunler || []).map((g) => ({ ad: g.ad, hafta: g.hafta, hareketler: (g.hareketler || []).map((x) => ({ id: x.id, set: x.set, tekrar: x.tekrar, birim: x.birim, alt: x.alt, ust: x.ust, dinlenme: x.dinlenme, blok: x.blok, rir: x.rir, rol: x.rol })) })) } : null,
    antrenmanlar: antr.slice(-20).reverse(),
    son: S.son || {}, rekor: S.rekor || {},
    kilo, ortKcal14: kcal.length ? Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length) : null, kayitliGun14: kcal.length
  };
}

export async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB; if (!db) return hata('Kapalı.', 503);
  const p = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean);
  const m = req.method;
  const kim = await kimDir(db, req); if (!kim) return hata('Giriş yapılmamış.', 401);
  const hocaMi = kim.rol === 'koc' || kim.rol === 'admin';
  const simdi = Date.now();
  try {
    // ---- öğrenci tarafı ----
    if (p[0] === 'benim' && m === 'GET') {
      const h = await db.prepare("SELECT k.id, k.ad FROM hoca_ogrenci ho JOIN kullanicilar k ON k.id = ho.koc_id WHERE ho.ogrenci_id = ? AND ho.durum = 'aktif' ORDER BY ho.zaman DESC").bind(kim.id).first();
      const a = await db.prepare("SELECT a.id, a.json, a.not_, a.zaman, k.ad hoca FROM atanan a JOIN kullanicilar k ON k.id = a.koc_id WHERE a.ogrenci_id = ? AND a.durum = 'bekliyor' ORDER BY a.zaman DESC").bind(kim.id).first();
      let atanan = null; if (a) { try { atanan = { id: a.id, program: JSON.parse(a.json), not: a.not_ || '', hoca: a.hoca, zaman: a.zaman }; } catch (e) { /* bozuk */ } }
      return json({ hoca: h ? { id: h.id, ad: h.ad } : null, atanan });
    }
    if (p[0] === 'baglan' && m === 'POST') {
      const g = await govde(req); const kod = String((g && g.kod) || '').trim().toUpperCase();
      if (!g || g.riza !== true) return hata('Hocanın verilerini görmesine onay vermelisin.', 400);
      if (!/^[A-Z0-9]{6}$/.test(kod)) return hata('Kod 6 karakter olmalı.', 400);
      const h = await db.prepare('SELECT hk.koc_id, k.ad FROM hoca_kod hk JOIN kullanicilar k ON k.id = hk.koc_id WHERE hk.kod = ?').bind(kod).first();
      if (!h) return hata('Bu kodla bir hoca bulunamadı.', 404);
      if (h.koc_id === kim.id) return hata('Kendi kodunla bağlanamazsın.', 400);
      await db.batch([
        db.prepare("UPDATE hoca_ogrenci SET durum = 'ayrildi' WHERE ogrenci_id = ? AND koc_id != ?").bind(kim.id, h.koc_id),
        db.prepare("INSERT INTO hoca_ogrenci (koc_id, ogrenci_id, durum, zaman) VALUES (?, ?, 'aktif', ?) ON CONFLICT(koc_id, ogrenci_id) DO UPDATE SET durum = 'aktif', zaman = excluded.zaman").bind(h.koc_id, kim.id, simdi)
      ]);
      return json({ ok: true, hoca: { ad: h.ad } });
    }
    if (p[0] === 'ayril' && m === 'POST') {
      await db.prepare("UPDATE hoca_ogrenci SET durum = 'ayrildi' WHERE ogrenci_id = ?").bind(kim.id).run();
      await db.prepare("UPDATE atanan SET durum = 'iptal' WHERE ogrenci_id = ? AND durum = 'bekliyor'").bind(kim.id).run();
      return json({ ok: true });
    }
    if (p[0] === 'atanan' && p[2] === 'yanit' && m === 'POST') {
      const g = await govde(req);
      const r = await db.prepare("UPDATE atanan SET durum = ? WHERE id = ? AND ogrenci_id = ? AND durum = 'bekliyor'").bind(g && g.kabul ? 'kabul' : 'ret', parseInt(p[1], 10) || 0, kim.id).run();
      return json({ ok: !!(r.meta && r.meta.changes) });
    }

    // ---- hoca tarafı ----
    if (!hocaMi) return hata('Bu bölüm hocalar için.', 403);
    if (p[0] === 'kod') {
      let r = await db.prepare('SELECT kod FROM hoca_kod WHERE koc_id = ?').bind(kim.id).first();
      if (!r || m === 'POST') {
        for (let i = 0; i < 5; i++) {
          const kod = kodUret();
          try { await db.prepare('INSERT INTO hoca_kod (koc_id, kod, zaman) VALUES (?, ?, ?) ON CONFLICT(koc_id) DO UPDATE SET kod = excluded.kod, zaman = excluded.zaman').bind(kim.id, kod, simdi).run(); r = { kod }; break; } catch (e) { /* çakışma, yeniden dene */ }
        }
      }
      return json({ kod: r ? r.kod : null });
    }
    const bagli = async (oid) => !!(await db.prepare("SELECT 1 FROM hoca_ogrenci WHERE koc_id = ? AND ogrenci_id = ? AND durum = 'aktif'").bind(kim.id, oid).first());
    if (p[0] === 'ogrenciler' && m === 'GET') {
      const r = await db.prepare("SELECT k.id, k.ad, ho.zaman baglanma, v.json, v.guncelleme FROM hoca_ogrenci ho JOIN kullanicilar k ON k.id = ho.ogrenci_id LEFT JOIN veriler v ON v.kullanici_id = k.id WHERE ho.koc_id = ? AND ho.durum = 'aktif' ORDER BY v.guncelleme DESC").bind(kim.id).all();
      const hb = new Date(simdi - 7 * 864e5).toISOString().slice(0, 10);
      const liste = (r.results || []).map((x) => {
        const o = ogrenciOzet(x.json);
        return { id: x.id, ad: x.ad, baglanma: x.baglanma, guncelleme: x.guncelleme, hedef: o.profil.hedef, son_antrenman: o.antrenmanlar[0] || null, haftalik: o.antrenmanlar.filter((a) => a.tarih >= hb).length, gun: o.profil.gun, kilo: o.kilo.length ? o.kilo[o.kilo.length - 1].kg : o.profil.kilo, program: o.program ? o.program.ad : null };
      });
      return json({ liste });
    }
    if (p[0] === 'ogrenci' && p[1]) {
      const oid = p[1]; if (!(await bagli(oid))) return hata('Bu öğrenci sana bağlı değil.', 404);
      if (!p[2] && m === 'GET') {
        const k = await db.prepare('SELECT id, ad FROM kullanicilar WHERE id = ?').bind(oid).first();
        const v = await db.prepare('SELECT json, guncelleme FROM veriler WHERE kullanici_id = ?').bind(oid).first();
        const bekleyen = await db.prepare("SELECT id, zaman FROM atanan WHERE ogrenci_id = ? AND koc_id = ? AND durum = 'bekliyor' ORDER BY zaman DESC").bind(oid, kim.id).first();
        return json({ ogrenci: { id: k.id, ad: k.ad, guncelleme: v ? v.guncelleme : null }, ozet: ogrenciOzet(v ? v.json : null), bekleyen: bekleyen || null });
      }
      if (p[2] === 'program' && m === 'POST') {
        const g = await govde(req); if (!g || !g.program || !Array.isArray(g.program.gunler)) return hata('Geçersiz program.', 400);
        const metin = JSON.stringify(g.program); if (metin.length > 60000) return hata('Program çok büyük.', 413);
        await db.prepare("UPDATE atanan SET durum = 'iptal' WHERE ogrenci_id = ? AND koc_id = ? AND durum = 'bekliyor'").bind(oid, kim.id).run();
        await db.prepare('INSERT INTO atanan (koc_id, ogrenci_id, json, not_, durum, zaman) VALUES (?, ?, ?, ?, ?, ?)').bind(kim.id, oid, metin, String(g.not || '').slice(0, 500), 'bekliyor', simdi).run();
        return json({ ok: true });
      }
      if (p[2] === 'cikar' && m === 'POST') {
        await db.prepare("UPDATE hoca_ogrenci SET durum = 'ayrildi' WHERE koc_id = ? AND ogrenci_id = ?").bind(kim.id, oid).run();
        return json({ ok: true });
      }
    }
    return hata('Bulunamadı.', 404);
  } catch (e) {
    return hata('Sunucuda bir sorun oluştu.', 500);
  }
}
