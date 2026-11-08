// COMEBACK. — topluluk: hoca mesajları, forum (şikâyet / engelleme / otomatik gizleme), meydan okumalar
//
// Hoca ↔ öğrenci mesajları (yalnızca bağlı çiftler):
//   GET  mesaj/<karsiId>            → { liste, karsi }      (okundu işaretler)
//   POST mesaj/<karsiId> { metin }
//   GET  mesaj-ozet                 → { okunmamis }
// Forum:
//   GET  forum?kategori=&sayfa=     → { liste }
//   POST forum { kategori, baslik, metin }
//   GET  forum/<id>                 → { konu, cevaplar }
//   POST forum/<id> { metin }       → cevap
//   POST sikayet { tur: konu|cevap, id, neden }   (3 şikâyette otomatik gizlenir)
//   POST engel { kullanici }        → o kişinin yazıları sana görünmez
//   POST sil { tur, id }            → kendi yazını sil (admin herkesinkini)
// Meydan okuma:
//   GET  meydan                     → { liste }  (katıldıkların)
//   POST meydan { ad, tur, hedef, gun }  → { kod }
//   POST meydan/katil { kod }
//   GET  meydan/<id>                → { meydan, sira }
//   POST meydan/<id>/ilerleme { deger }
//   POST meydan/<id>/ayril
// Yönetim (admin): GET sikayetler · POST moderasyon { tur, id, gizli }

const json = (v, d = 200) => new Response(JSON.stringify(v), { status: d, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const hata = (m, d) => json({ hata: m }, d);
const ozet = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((b) => b.toString(16).padStart(2, '0')).join('');
async function govde(req) { try { return await req.json(); } catch (e) { return null; } }
async function kimDir(db, req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)cb_oturum=([A-Za-z0-9_-]+)/); if (!m) return null;
  const s = await db.prepare('SELECT k.id, k.ad, k.rol, o.bitis FROM oturumlar o JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.token_hash = ?').bind(await ozet(m[1])).first();
  return s && s.bitis > Date.now() ? { id: s.id, ad: s.ad, rol: s.rol } : null;
}
async function sinir(db, anahtar, n, sn) {
  const simdi = Date.now();
  const r = await db.prepare('SELECT sayi, bitis FROM giris_deneme WHERE anahtar = ?').bind(anahtar).first();
  if (r && r.bitis > simdi && r.sayi >= n) return false;
  if (!r || r.bitis <= simdi) await db.prepare('INSERT OR REPLACE INTO giris_deneme (anahtar, sayi, bitis) VALUES (?, 1, ?)').bind(anahtar, simdi + sn * 1000).run();
  else await db.prepare('UPDATE giris_deneme SET sayi = sayi + 1 WHERE anahtar = ?').bind(anahtar).run();
  return true;
}
const temiz = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);
const gorunen = (ad) => { const p = String(ad || 'Üye').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
// basit küfür / iletişim bilgisi süzgeci: ilk savunma hattı, asıl koruma şikâyet + yönetici
const YASAK = /(amk|aq\b|orospu|siktir|sikerim|piç|yarrak|göt(ü|ün)|ibne|\bsik\b)/i;
const KATEGORI = ['genel', 'antrenman', 'beslenme', 'motivasyon', 'sakatlik'];
const MTUR = { antrenman: 'Antrenman sayısı', set: 'Toplam set', su: 'Su (L)', seri: 'Gün serisi', kayit: 'Öğün kaydı yapılan gün' };
const kodUret = () => { const h = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a).map((x) => h[x % h.length]).join(''); };

export async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB; if (!db) return hata('Kapalı.', 503);
  const p = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean);
  const m = req.method; const url = new URL(req.url);
  const kim = await kimDir(db, req); if (!kim) return hata('Giriş yapılmamış.', 401);
  const admin = kim.rol === 'admin';
  const simdi = Date.now();
  try {
    /* ---------- hoca mesajları ---------- */
    if (p[0] === 'mesaj-ozet' && m === 'GET') {
      const r = await db.prepare('SELECT COUNT(*) n FROM mesajlar WHERE (koc_id = ? OR ogrenci_id = ?) AND gonderen_id != ? AND okundu = 0').bind(kim.id, kim.id, kim.id).first();
      return json({ okunmamis: r ? r.n : 0 });
    }
    if (p[0] === 'mesaj' && p[1]) {
      const karsi = p[1];
      const cift = await db.prepare("SELECT koc_id, ogrenci_id FROM hoca_ogrenci WHERE durum = 'aktif' AND ((koc_id = ? AND ogrenci_id = ?) OR (koc_id = ? AND ogrenci_id = ?))").bind(kim.id, karsi, karsi, kim.id).first();
      if (!cift) return hata('Yalnızca bağlı olduğun hocanla ya da öğrencinle yazışabilirsin.', 403);
      if (m === 'GET') {
        const r = await db.prepare('SELECT id, gonderen_id, metin, zaman FROM mesajlar WHERE koc_id = ? AND ogrenci_id = ? ORDER BY zaman DESC LIMIT 100').bind(cift.koc_id, cift.ogrenci_id).all();
        await db.prepare('UPDATE mesajlar SET okundu = 1 WHERE koc_id = ? AND ogrenci_id = ? AND gonderen_id != ? AND okundu = 0').bind(cift.koc_id, cift.ogrenci_id, kim.id).run();
        const k = await db.prepare('SELECT ad FROM kullanicilar WHERE id = ?').bind(karsi).first();
        return json({ liste: (r.results || []).reverse().map((x) => ({ id: x.id, ben: x.gonderen_id === kim.id, metin: x.metin, zaman: x.zaman })), karsi: { ad: k ? k.ad : '', hoca: cift.koc_id === karsi } });
      }
      if (m === 'POST') {
        const g = await govde(req); const metin = temiz(g && g.metin, 2000);
        if (!metin) return hata('Bir şey yaz.', 400);
        if (!(await sinir(db, 'mesaj:' + kim.id, 120, 3600))) return hata('Çok hızlı mesaj gönderiyorsun.', 429);
        await db.prepare('INSERT INTO mesajlar (koc_id, ogrenci_id, gonderen_id, metin, zaman) VALUES (?, ?, ?, ?, ?)').bind(cift.koc_id, cift.ogrenci_id, kim.id, metin, simdi).run();
        return json({ ok: true }, 201);
      }
    }

    /* ---------- forum ---------- */
    const engelliler = async () => ((await db.prepare('SELECT engellenen_id FROM engel WHERE kullanici_id = ?').bind(kim.id).all()).results || []).map((x) => x.engellenen_id);
    if (p[0] === 'forum' && !p[1] && m === 'GET') {
      const kat = KATEGORI.includes(url.searchParams.get('kategori')) ? url.searchParams.get('kategori') : null;
      const sayfa = Math.max(0, parseInt(url.searchParams.get('sayfa') || '0', 10) || 0);
      const eng = await engelliler();
      const r = await db.prepare('SELECT k.id, k.kategori, k.baslik, substr(k.metin, 1, 160) ozet, k.zaman, k.son, k.cevap, k.kullanici_id, u.ad FROM konular k JOIN kullanicilar u ON u.id = k.kullanici_id WHERE k.gizli = 0' + (kat ? ' AND k.kategori = ?' : '') + ' ORDER BY k.son DESC LIMIT 30 OFFSET ?')
        .bind(...(kat ? [kat, sayfa * 30] : [sayfa * 30])).all();
      return json({ liste: (r.results || []).filter((x) => eng.indexOf(x.kullanici_id) < 0).map((x) => ({ id: x.id, kategori: x.kategori, baslik: x.baslik, ozet: x.ozet, zaman: x.zaman, son: x.son, cevap: x.cevap, yazar: gorunen(x.ad), benim: x.kullanici_id === kim.id })) });
    }
    if (p[0] === 'forum' && !p[1] && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const baslik = temiz(g.baslik, 120), metin = temiz(g.metin, 4000), kat = KATEGORI.includes(g.kategori) ? g.kategori : 'genel';
      if (baslik.length < 4 || metin.length < 4) return hata('Başlık ve metin biraz daha uzun olmalı.', 400);
      if (YASAK.test(baslik + ' ' + metin)) return hata('Yazında topluluk kurallarına uymayan ifade var.', 400);
      if (!(await sinir(db, 'konu:' + kim.id, 5, 3600))) return hata('Saatte en fazla 5 konu açabilirsin.', 429);
      const r = await db.prepare('INSERT INTO konular (kullanici_id, kategori, baslik, metin, zaman, son) VALUES (?, ?, ?, ?, ?, ?)').bind(kim.id, kat, baslik, metin, simdi, simdi).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
    if (p[0] === 'forum' && p[1]) {
      const id = parseInt(p[1], 10) || 0;
      const konu = await db.prepare('SELECT k.*, u.ad FROM konular k JOIN kullanicilar u ON u.id = k.kullanici_id WHERE k.id = ?').bind(id).first();
      if (!konu || (konu.gizli && !admin)) return hata('Konu bulunamadı.', 404);
      if (m === 'GET') {
        const eng = await engelliler();
        const c = await db.prepare('SELECT c.id, c.metin, c.zaman, c.kullanici_id, c.gizli, u.ad FROM cevaplar c JOIN kullanicilar u ON u.id = c.kullanici_id WHERE c.konu_id = ? ORDER BY c.zaman LIMIT 300').bind(id).all();
        return json({
          konu: { id: konu.id, kategori: konu.kategori, baslik: konu.baslik, metin: konu.metin, zaman: konu.zaman, yazar: gorunen(konu.ad), yazarId: konu.kullanici_id, benim: konu.kullanici_id === kim.id, gizli: !!konu.gizli },
          cevaplar: (c.results || []).filter((x) => (!x.gizli || admin) && eng.indexOf(x.kullanici_id) < 0).map((x) => ({ id: x.id, metin: x.metin, zaman: x.zaman, yazar: gorunen(x.ad), yazarId: x.kullanici_id, benim: x.kullanici_id === kim.id, gizli: !!x.gizli }))
        });
      }
      if (m === 'POST') {
        const g = await govde(req); const metin = temiz(g && g.metin, 3000);
        if (metin.length < 2) return hata('Bir şey yaz.', 400);
        if (YASAK.test(metin)) return hata('Yazında topluluk kurallarına uymayan ifade var.', 400);
        if (!(await sinir(db, 'cevap:' + kim.id, 30, 3600))) return hata('Biraz yavaşla, saatte en fazla 30 cevap.', 429);
        await db.batch([
          db.prepare('INSERT INTO cevaplar (konu_id, kullanici_id, metin, zaman) VALUES (?, ?, ?, ?)').bind(id, kim.id, metin, simdi),
          db.prepare('UPDATE konular SET cevap = cevap + 1, son = ? WHERE id = ?').bind(simdi, id)
        ]);
        return json({ ok: true }, 201);
      }
    }
    if (p[0] === 'sikayet' && m === 'POST') {
      const g = await govde(req); const tur = g && (g.tur === 'konu' || g.tur === 'cevap') ? g.tur : null; const id = parseInt(g && g.id, 10) || 0;
      if (!tur || !id) return hata('Geçersiz istek.', 400);
      if (!(await sinir(db, 'sikayet:' + kim.id, 20, 3600))) return hata('Çok fazla şikâyet.', 429);
      await db.prepare('INSERT OR IGNORE INTO sikayet (tur, hedef_id, kullanici_id, neden, zaman) VALUES (?, ?, ?, ?, ?)').bind(tur, id, kim.id, temiz(g.neden, 200), simdi).run();
      const n = await db.prepare("SELECT COUNT(*) n FROM sikayet WHERE tur = ? AND hedef_id = ? AND durum = 'acik'").bind(tur, id).first();
      if (n && n.n >= 3) await db.prepare('UPDATE ' + (tur === 'konu' ? 'konular' : 'cevaplar') + ' SET gizli = 1 WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (p[0] === 'engel' && m === 'POST') {
      const g = await govde(req); const hedef = temiz(g && g.kullanici, 60);
      if (!hedef || hedef === kim.id) return hata('Geçersiz.', 400);
      await db.prepare('INSERT OR IGNORE INTO engel (kullanici_id, engellenen_id, zaman) VALUES (?, ?, ?)').bind(kim.id, hedef, simdi).run();
      return json({ ok: true });
    }
    if (p[0] === 'sil' && m === 'POST') {
      const g = await govde(req); const tur = g && (g.tur === 'konu' || g.tur === 'cevap') ? g.tur : null; const id = parseInt(g && g.id, 10) || 0;
      if (!tur || !id) return hata('Geçersiz istek.', 400);
      const tablo = tur === 'konu' ? 'konular' : 'cevaplar';
      const r = await db.prepare('SELECT kullanici_id' + (tur === 'cevap' ? ', konu_id' : '') + ' FROM ' + tablo + ' WHERE id = ?').bind(id).first();
      if (!r || (r.kullanici_id !== kim.id && !admin)) return hata('Silemezsin.', 403);
      if (tur === 'konu') await db.batch([db.prepare('DELETE FROM cevaplar WHERE konu_id = ?').bind(id), db.prepare('DELETE FROM konular WHERE id = ?').bind(id)]);
      else await db.batch([db.prepare('DELETE FROM cevaplar WHERE id = ?').bind(id), db.prepare('UPDATE konular SET cevap = MAX(0, cevap - 1) WHERE id = ?').bind(r.konu_id)]);
      return json({ ok: true });
    }

    /* ---------- meydan okuma ---------- */
    if (p[0] === 'meydan' && !p[1] && m === 'GET') {
      const r = await db.prepare('SELECT md.id, md.ad, md.tur, md.hedef, md.baslangic, md.bitis, md.kod, k.ilerleme, (SELECT COUNT(*) FROM katilim x WHERE x.meydan_id = md.id) kisi FROM katilim k JOIN meydan md ON md.id = k.meydan_id WHERE k.kullanici_id = ? ORDER BY md.bitis DESC').bind(kim.id).all();
      return json({ liste: (r.results || []).map((x) => Object.assign(x, { turAd: MTUR[x.tur] })) });
    }
    if (p[0] === 'meydan' && !p[1] && m === 'POST') {
      const g = await govde(req); if (!g || !MTUR[g.tur]) return hata('Geçersiz istek.', 400);
      const ad = temiz(g.ad, 60); const hedef = Math.max(1, Math.min(10000, parseInt(g.hedef, 10) || 0)); const gun = Math.max(3, Math.min(90, parseInt(g.gun, 10) || 30));
      if (ad.length < 3) return hata('Meydan okumaya bir ad ver.', 400);
      if (YASAK.test(ad)) return hata('Adda uygun olmayan ifade var.', 400);
      if (!(await sinir(db, 'meydan:' + kim.id, 10, 86400))) return hata('Günde en fazla 10 meydan okuma.', 429);
      const bas = new Date(simdi + 3 * 3600e3).toISOString().slice(0, 10); const bit = new Date(simdi + 3 * 3600e3 + (gun - 1) * 864e5).toISOString().slice(0, 10);
      let kod, id;
      for (let i = 0; i < 5 && !id; i++) { kod = kodUret(); try { const r = await db.prepare('INSERT INTO meydan (olusturan_id, ad, tur, hedef, baslangic, bitis, kod, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(kim.id, ad, g.tur, hedef, bas, bit, kod, simdi).run(); id = r.meta.last_row_id; } catch (e) { /* kod çakıştı */ } }
      await db.prepare('INSERT INTO katilim (meydan_id, kullanici_id, ilerleme, guncelleme) VALUES (?, ?, 0, ?)').bind(id, kim.id, simdi).run();
      return json({ ok: true, id, kod }, 201);
    }
    if (p[0] === 'meydan' && p[1] === 'katil' && m === 'POST') {
      const g = await govde(req); const kod = temiz(g && g.kod, 6).toUpperCase();
      const md = await db.prepare('SELECT id, ad, bitis FROM meydan WHERE kod = ?').bind(kod).first();
      if (!md) return hata('Bu kodla bir meydan okuma yok.', 404);
      if (md.bitis < new Date(simdi + 3 * 3600e3).toISOString().slice(0, 10)) return hata('Bu meydan okuma bitmiş.', 400);
      const say = await db.prepare('SELECT COUNT(*) n FROM katilim WHERE meydan_id = ?').bind(md.id).first();
      if (say && say.n >= 50) return hata('Meydan okuma dolu (50 kişi).', 400);
      await db.prepare('INSERT OR IGNORE INTO katilim (meydan_id, kullanici_id, ilerleme, guncelleme) VALUES (?, ?, 0, ?)').bind(md.id, kim.id, simdi).run();
      return json({ ok: true, id: md.id, ad: md.ad });
    }
    if (p[0] === 'meydan' && p[1]) {
      const id = parseInt(p[1], 10) || 0;
      const k = await db.prepare('SELECT 1 FROM katilim WHERE meydan_id = ? AND kullanici_id = ?').bind(id, kim.id).first();
      if (!k) return hata('Bu meydan okumaya katılmadın.', 404);
      if (!p[2] && m === 'GET') {
        const md = await db.prepare('SELECT id, ad, tur, hedef, baslangic, bitis, kod FROM meydan WHERE id = ?').bind(id).first();
        const eng = await engelliler();
        const s = await db.prepare('SELECT k.kullanici_id, k.ilerleme, u.ad FROM katilim k JOIN kullanicilar u ON u.id = k.kullanici_id WHERE k.meydan_id = ? ORDER BY k.ilerleme DESC, k.guncelleme LIMIT 50').bind(id).all();
        return json({ meydan: Object.assign(md, { turAd: MTUR[md.tur] }), sira: (s.results || []).filter((x) => eng.indexOf(x.kullanici_id) < 0 || x.kullanici_id === kim.id).map((x) => ({ ad: gorunen(x.ad), ilerleme: x.ilerleme, ben: x.kullanici_id === kim.id })) });
      }
      if (p[2] === 'ilerleme' && m === 'POST') {
        const g = await govde(req); const d = Math.max(0, Math.min(100000, Number(g && g.deger) || 0));
        await db.prepare('UPDATE katilim SET ilerleme = ?, guncelleme = ? WHERE meydan_id = ? AND kullanici_id = ?').bind(Math.round(d * 10) / 10, simdi, id, kim.id).run();
        return json({ ok: true });
      }
      if (p[2] === 'ayril' && m === 'POST') {
        await db.prepare('DELETE FROM katilim WHERE meydan_id = ? AND kullanici_id = ?').bind(id, kim.id).run();
        return json({ ok: true });
      }
    }

    /* ---------- yönetim: moderasyon ---------- */
    if (p[0] === 'sikayetler' && m === 'GET') {
      if (!admin) return hata('Yetkin yok.', 403);
      const r = await db.prepare("SELECT s.tur, s.hedef_id, COUNT(*) adet, MAX(s.zaman) son, group_concat(s.neden, ' · ') nedenler, CASE s.tur WHEN 'konu' THEN (SELECT baslik || ': ' || substr(metin, 1, 200) FROM konular WHERE id = s.hedef_id) ELSE (SELECT substr(metin, 1, 240) FROM cevaplar WHERE id = s.hedef_id) END metin, CASE s.tur WHEN 'konu' THEN (SELECT gizli FROM konular WHERE id = s.hedef_id) ELSE (SELECT gizli FROM cevaplar WHERE id = s.hedef_id) END gizli FROM sikayet s WHERE s.durum = 'acik' GROUP BY s.tur, s.hedef_id ORDER BY son DESC LIMIT 100").all();
      return json({ liste: r.results || [] });
    }
    if (p[0] === 'moderasyon' && m === 'POST') {
      if (!admin) return hata('Yetkin yok.', 403);
      const g = await govde(req); const tur = g && (g.tur === 'konu' || g.tur === 'cevap') ? g.tur : null; const id = parseInt(g && g.id, 10) || 0;
      if (!tur || !id) return hata('Geçersiz istek.', 400);
      await db.batch([
        db.prepare('UPDATE ' + (tur === 'konu' ? 'konular' : 'cevaplar') + ' SET gizli = ? WHERE id = ?').bind(g.gizli ? 1 : 0, id),
        db.prepare("UPDATE sikayet SET durum = 'kapali' WHERE tur = ? AND hedef_id = ?").bind(tur, id)
      ]);
      return json({ ok: true });
    }
    return hata('Bulunamadı.', 404);
  } catch (e) {
    return hata('Sunucuda bir sorun oluştu.', 500);
  }
}
