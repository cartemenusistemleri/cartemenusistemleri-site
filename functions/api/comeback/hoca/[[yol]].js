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

// öğrencinin yazdığı veri başka birinin (hocanın) ekranına gider: sayılar sayıya, yazılar kısa düz metne çevrilir
const say = (v, ust) => { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.min(ust, Math.round(x * 100) / 100) : 0; };
const yazi = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').slice(0, n);
const HID = /^[a-z0-9_]{1,40}$/;
// hocanın öğrenciye gönderdiği program: yalnızca bilinen alanlar, sınırlı boyut
function programTemizle(pr) {
  if (!pr || !Array.isArray(pr.gunler)) return null;
  const gunler = pr.gunler.slice(0, 7).map((g, i) => ({
    id: /^[A-Za-z0-9_-]{1,40}$/.test(String(g && g.id || '')) ? String(g.id) : 'h' + i, ad: yazi(g && g.ad, 60) || 'Gün ' + (i + 1),
    hafta: Math.max(0, Math.min(6, Math.round(Number(g && g.hafta)) || 0)), bolge: yazi(g && g.bolge, 20),
    hareketler: (Array.isArray(g && g.hareketler) ? g.hareketler : []).filter((x) => x && HID.test(String(x.id || ''))).slice(0, 20).map((x) => {
      const o = { id: x.id, set: Math.max(1, Math.min(10, Math.round(Number(x.set)) || 3)), tekrar: yazi(x.tekrar, 20), alt: say(x.alt, 600), ust: say(x.ust, 600), dinlenme: say(x.dinlenme, 600), birim: ['tekrar', 'sn', 'dk', 'm'].indexOf(x.birim) >= 0 ? x.birim : 'tekrar' };
      if (x.rir) o.rir = yazi(x.rir, 40); if (x.not) o.not = yazi(x.not, 60); if (x.blok) o.blok = yazi(x.blok, 12).replace(/[^a-z]/g, ''); if (x.rol) o.rol = yazi(x.rol, 12).replace(/[^a-z]/g, '');
      if (x.isinmaSet) o.isinmaSet = Math.max(0, Math.min(4, Math.round(Number(x.isinmaSet)) || 0)); if (x.isinma) o.isinma = true; o.sure = o.birim !== 'tekrar';
      return o;
    })
  }));
  return { ad: yazi(pr.ad, 60) || 'Hocamın programı', ozel: true, gunler };
}
// öğrencinin kayıtlı uygulama verisinden hocaya gösterilecek özet (yalnızca antrenmanla ilgili alanlar)
function ogrenciOzet(jsonMetin) {
  let S; try { S = JSON.parse(jsonMetin || '{}'); } catch (e) { S = {}; }
  const p = S.profil || {}; const gunluk = S.gunluk || {};
  const gunler = Object.keys(gunluk).sort();
  const son14 = gunler.filter((k) => k >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10));
  const antr = gunler.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && gunluk[k] && gunluk[k].antrenman).map((k) => { const a = gunluk[k].antrenman; return { tarih: k, ad: yazi(a.ad, 80), set: say(a.set, 999), dk: say(a.dk, 1440), hacim: say(a.hacim, 1e7) }; });
  const kcal = son14.map((k) => (gunluk[k].ogun || []).reduce((a, o) => a + (Number(o.k) || 0), 0)).filter((x) => x > 0);
  const kilo = (Array.isArray(S.kilo) ? S.kilo.slice(-10) : []).map((x) => ({ tarih: yazi(x && x.tarih, 10), kg: say(x && x.kg, 400) }));
  return {
    profil: { ad: yazi(p.ad, 30), cinsiyet: p.cinsiyet === 'k' ? 'k' : 'e', yas: say(p.yas, 120), boy: say(p.boy, 260), hedef: yazi(p.hedef, 12), deneyim: yazi(p.deneyim, 12), gun: Math.min(7, Math.round(say(p.gun, 7))), ortam: yazi(p.ortam, 12), spor: yazi(p.spor, 16), sakatlik: (Array.isArray(p.sakatlik) ? p.sakatlik : []).slice(0, 10).map((x) => yazi(x, 20)) },
    hedef: S.hedef ? { kcal: say(S.hedef.kcal, 10000), protein: say(S.hedef.protein, 1000) } : null,
    program: S.program ? { ad: yazi(S.program.ad, 60), ozel: !!S.program.ozel, gunler: (Array.isArray(S.program.gunler) ? S.program.gunler : []).slice(0, 7).map((g) => ({ ad: yazi(g && g.ad, 60), hafta: Math.round(say(g && g.hafta, 6)), hareketler: (Array.isArray(g && g.hareketler) ? g.hareketler : []).filter((x) => x && HID.test(String(x.id || ''))).slice(0, 20).map((x) => ({ id: x.id, set: Math.round(say(x.set, 20)), tekrar: yazi(x.tekrar, 20), birim: yazi(x.birim, 8), alt: say(x.alt, 600), ust: say(x.ust, 600) })) })) } : null,
    antrenmanlar: antr.slice(-20).reverse(),
    son: {}, rekor: Object.fromEntries(Object.keys(S.rekor && typeof S.rekor === 'object' ? S.rekor : {}).filter((h) => HID.test(h)).slice(0, 60).map((h) => [h, { kg: say(S.rekor[h].kg, 1000), tekrar: Math.round(say(S.rekor[h].tekrar, 1000)), tarih: yazi(S.rekor[h].tarih, 10) }])),
    kilo, ortKcal14: kcal.length ? Math.round(kcal.reduce((a, b) => a + b, 0) / kcal.length) : null, kayitliGun14: kcal.length
  };
}

export async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB; if (!db) return hata('Kapalı.', 503);
  const p = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean);
  const m = req.method;
  if (m !== 'GET' && req.headers.get('origin')) { try { if (new URL(req.headers.get('origin')).host !== new URL(req.url).host) return hata('İzin verilmeyen kaynak.', 403); } catch (e) { return hata('İzin verilmeyen kaynak.', 403); } }
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
      if (!g || g.riza !== true) return hata('Hocanın verilerini görebilmesi için onay kutusunu işaretle.', 400);
      if (!/^[A-Z0-9]{6}$/.test(kod)) return hata('Kod 6 karakter olmalı.', 400);
      // kod tahminine karşı: saatte en fazla 5 bağlanma denemesi
      { const r0 = await db.prepare('INSERT INTO giris_deneme (anahtar, sayi, bitis) VALUES (?1, 1, ?2) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN bitis <= ?3 THEN 1 ELSE sayi + 1 END, bitis = CASE WHEN bitis <= ?3 THEN ?2 ELSE bitis END RETURNING sayi').bind('hocabag:' + kim.id, simdi + 3600000, simdi).first();
        if (!r0 || r0.sayi > 5) { const b0 = await db.prepare('SELECT bitis FROM giris_deneme WHERE anahtar = ?').bind('hocabag:' + kim.id).first(); return json({ hata: 'Çok fazla deneme.', sinir: { limit: 5, pencere: 3600, yenilenme: b0 ? b0.bitis : simdi + 3600000 } }, 429); } }
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
        const g = await govde(req); const pr = g && programTemizle(g.program); if (!pr || !pr.gunler.length) return hata('Geçersiz program.', 400);
        const metin = JSON.stringify(pr); if (metin.length > 60000) return hata('Program çok büyük.', 413);
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
