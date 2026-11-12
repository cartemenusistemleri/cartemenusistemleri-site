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
// Program paylaşımı (kullanıcı adıyla):
//   GET  kisi?ad=<kullanici_adi>    → { ad }  (gönder demeden önce kim olduğunu göster)
//   POST paylas { kime, program, not }
//   GET  paylasim                   → { liste }  (sana gelen, bekleyen)
//   POST paylasim/<id>/yanit { kabul }
// Ortak antrenman: POST jam/olustur { ad, program } → { kod } · POST jam/<kod>/katil · GET jam/<kod> · POST jam/<kod>/durum · POST jam/<kod>/ayril
// Sıralama: GET siralama?donem=hafta|ay&olcut=hacim|set|antr · POST siralama/katil { acik } · POST siralama/skor { hafta, ay }
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
    /* ---------- ortak antrenman (jam) ---------- */
    // kod ile katılınır; herkes kendi ilerlemesini (hareket, set) yazar, diğerleri birkaç saniyede bir okur
    if (p[0] === 'jam') {
      const kodOk = (k) => /^[A-Z0-9]{5}$/.test(k);
      if (p[1] === 'olustur' && m === 'POST') {
        const g = await govde(req) || {};
        if (!(await sinir(db, 'jam:' + kim.id, 20, 86400))) return hata('Bugün çok fazla ortak antrenman açtın.', 429);
        const harf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let kod = '';
        for (let d = 0; d < 5; d++) { kod = Array.from(crypto.getRandomValues(new Uint8Array(5))).map((b) => harf[b % harf.length]).join(''); if (!(await db.prepare('SELECT 1 FROM jam WHERE kod = ?').bind(kod).first())) break; }
        const program = g.program && Array.isArray(g.program.hareketler) ? JSON.stringify({ ad: temiz(g.program.ad, 30), hareketler: g.program.hareketler.slice(0, 20).filter((x) => x && /^[a-z0-9_]{2,40}$/.test(String(x.id))).map((x) => ({ id: String(x.id), set: Math.max(1, Math.min(10, Math.round(Number(x.set) || 3))), tekrar: temiz(x.tekrar, 9), birim: ['tekrar', 'sn', 'dk', 'm'].indexOf(x.birim) >= 0 ? x.birim : 'tekrar', alt: Math.round(Number(x.alt) || 0), ust: Math.round(Number(x.ust) || 0), dinlenme: Math.max(0, Math.min(600, Math.round(Number(x.dinlenme) || 90))) })) }) : null;
        await db.batch([
          db.prepare("DELETE FROM jam WHERE bitis < ?").bind(simdi),
          db.prepare('INSERT INTO jam (kod, sahip_id, ad, program, olusturma, bitis) VALUES (?, ?, ?, ?, ?, ?)').bind(kod, kim.id, temiz(g.ad, 30) || 'Ortak antrenman', program, simdi, simdi + 4 * 3600e3),
          db.prepare('INSERT OR REPLACE INTO jam_uye (kod, kullanici_id, ad, durum, guncelleme) VALUES (?, ?, ?, ?, ?)').bind(kod, kim.id, gorunen(kim.ad), '{}', simdi)
        ]);
        return json({ kod }, 201);
      }
      const kod = String(p[1] || '').toUpperCase(); if (!kodOk(kod)) return hata('Kod 5 karakter olmalı.', 400);
      const j = await db.prepare('SELECT * FROM jam WHERE kod = ? AND bitis > ?').bind(kod, simdi).first();
      if (!j) return hata('Bu kodla açık bir ortak antrenman yok ya da süresi doldu.', 404);
      const uyeMi = await db.prepare('SELECT 1 FROM jam_uye WHERE kod = ? AND kullanici_id = ?').bind(kod, kim.id).first();
      if (p[2] === 'katil' && m === 'POST') {
        const say = await db.prepare('SELECT COUNT(*) n FROM jam_uye WHERE kod = ?').bind(kod).first();
        if (!uyeMi && say && say.n >= 8) return hata('Bu ortak antrenman dolu (en fazla 8 kişi).', 409);
        await db.prepare('INSERT OR REPLACE INTO jam_uye (kod, kullanici_id, ad, durum, guncelleme) VALUES (?, ?, ?, ?, ?)').bind(kod, kim.id, gorunen(kim.ad), '{}', simdi).run();
        return json({ ok: true, ad: j.ad, program: j.program ? JSON.parse(j.program) : null });
      }
      if (!uyeMi) return hata('Önce bu ortak antrenmana katıl.', 403);
      if (!p[2] && m === 'GET') {
        const u = await db.prepare('SELECT kullanici_id, ad, durum, guncelleme FROM jam_uye WHERE kod = ? ORDER BY guncelleme DESC').bind(kod).all();
        return json({ kod, ad: j.ad, sahip: j.sahip_id === kim.id, bitis: j.bitis, program: j.program ? JSON.parse(j.program) : null, ortak: !!j.ortak,
          dinlenme: j.dinlenme_bitis ? { id: j.dinlenme_bitis, kalan: Math.max(0, Math.round((j.dinlenme_bitis - simdi) / 1000)), sn: j.dinlenme_sn, kim: j.dinlenme_kim } : null,
          uyeler: (u.results || []).map((x) => { let d = {}; try { d = JSON.parse(x.durum || '{}'); } catch (e) { /* bozuk */ } return { ad: x.ad, ben: x.kullanici_id === kim.id, durum: d, once: Math.round((simdi - x.guncelleme) / 1000) }; }) });
      }
      if (p[2] === 'durum' && m === 'POST') {
        const g = await govde(req) || {};
        const d = { hareket: temiz(g.hareket, 50), set: Math.max(0, Math.min(99, Math.round(Number(g.set) || 0))), toplam: Math.max(0, Math.min(200, Math.round(Number(g.toplam) || 0))), dinlenme: Math.max(0, Math.min(900, Math.round(Number(g.dinlenme) || 0))), bitti: !!g.bitti, tepki: temiz(g.tepki, 12), hacim: Math.max(0, Math.min(200000, Math.round(Number(g.hacim) || 0))), rekor: Math.max(0, Math.min(50, Math.round(Number(g.rekor) || 0))), sure: Math.max(0, Math.min(600, Math.round(Number(g.sure) || 0))) };
        await db.prepare('UPDATE jam_uye SET durum = ?, guncelleme = ? WHERE kod = ? AND kullanici_id = ?').bind(JSON.stringify(d), simdi, kod, kim.id).run();
        return json({ ok: true });
      }
      // ortak dinlenme: biri seti bitirince herkesin sayacı aynı bitiş anına ayarlanır
      if (p[2] === 'dinlen' && m === 'POST') {
        const g = await govde(req) || {};
        if (!j.ortak) return json({ ok: true, ortak: false });
        const sn = Math.max(0, Math.min(900, Math.round(Number(g.sn) || 0)));
        const bitis = g.iptal ? simdi : simdi + sn * 1000;
        await db.prepare('UPDATE jam SET dinlenme_bitis = ?, dinlenme_sn = ?, dinlenme_kim = ? WHERE kod = ?').bind(bitis, g.iptal ? 0 : (Number(g.toplam) > 0 ? Math.min(900, Math.round(Number(g.toplam))) : sn), gorunen(kim.ad), kod).run();
        return json({ ok: true, id: bitis });
      }
      if (p[2] === 'ortak' && m === 'POST') {
        if (j.sahip_id !== kim.id) return hata('Bunu yalnızca Jam\'i açan kişi değiştirebilir.', 403);
        const g = await govde(req) || {};
        await db.prepare('UPDATE jam SET ortak = ? WHERE kod = ?').bind(g.acik ? 1 : 0, kod).run();
        return json({ ok: true, ortak: !!g.acik });
      }
      if (p[2] === 'ayril' && m === 'POST') {
        await db.prepare('DELETE FROM jam_uye WHERE kod = ? AND kullanici_id = ?').bind(kod, kim.id).run();
        if (j.sahip_id === kim.id) await db.prepare('UPDATE jam SET bitis = ? WHERE kod = ?').bind(simdi, kod).run();
        return json({ ok: true });
      }
      return hata('Bulunamadı.', 404);
    }

    /* ---------- sıralama (haftalık / aylık hacim, set, antrenman) ---------- */
    // dönem anahtarları Türkiye saatine göre: H<pazartesi tarihi>, A<yıl-ay>
    const tr = new Date(Date.now() + 3 * 3600e3);
    const ayK = 'A' + tr.toISOString().slice(0, 7);
    const pzt = new Date(tr); pzt.setUTCDate(pzt.getUTCDate() - ((pzt.getUTCDay() + 6) % 7)); const haftaK = 'H' + pzt.toISOString().slice(0, 10);
    if (p[0] === 'siralama' && !p[1] && m === 'GET') {
      const donem = url.searchParams.get('donem') === 'ay' ? ayK : haftaK;
      const olc = { hacim: 'hacim', set: 'set_', antr: 'antr' }[url.searchParams.get('olcut')] || 'hacim';
      const r = await db.prepare('SELECT s.kullanici_id id, s.hacim, s.set_, s.antr, k.ad FROM skor s JOIN kullanicilar k ON k.id = s.kullanici_id WHERE s.donem = ? AND k.siralama = 1 AND s.' + olc + ' > 0 ORDER BY s.' + olc + ' DESC, s.guncelleme ASC LIMIT 200').bind(donem).all();
      const l = (r.results || []).map((x, i) => ({ sira: i + 1, ad: gorunen(x.ad), hacim: x.hacim, set: x.set_, antr: x.antr, ben: x.id === kim.id }));
      const ben = await db.prepare('SELECT siralama FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      return json({ liste: l.slice(0, 50), benim: l.find((x) => x.ben) || null, toplam: l.length, katildi: !!(ben && ben.siralama), donem });
    }
    if (p[0] === 'siralama' && p[1] === 'katil' && m === 'POST') {
      const g = await govde(req) || {};
      await db.prepare('UPDATE kullanicilar SET siralama = ? WHERE id = ?').bind(g.acik ? 1 : 0, kim.id).run();
      if (!g.acik) await db.prepare('DELETE FROM skor WHERE kullanici_id = ?').bind(kim.id).run();
      return json({ ok: true, katildi: !!g.acik });
    }
    if (p[0] === 'siralama' && p[1] === 'skor' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const ben = await db.prepare('SELECT siralama FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      if (!ben || !ben.siralama) return json({ ok: true, katildi: false });
      if (!(await sinir(db, 'skor:' + kim.id, 120, 3600))) return hata('Çok sık güncelleme.', 429);
      const n = (v, ust) => Math.max(0, Math.min(ust, Math.round(Number(v) || 0)));
      const yaz = (k, d, c) => db.prepare('INSERT INTO skor (kullanici_id, donem, hacim, set_, antr, guncelleme) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kullanici_id, donem) DO UPDATE SET hacim = excluded.hacim, set_ = excluded.set_, antr = excluded.antr, guncelleme = excluded.guncelleme')
        .bind(kim.id, k, n(d && d.hacim, 300000 * c), n(d && d.set, 400 * c), n(d && d.antr, 14 * c), simdi);
      await db.batch([yaz(haftaK, g.hafta, 1), yaz(ayK, g.ay, 5)]);
      return json({ ok: true, katildi: true });
    }

    /* ---------- program paylaşımı ---------- */
    const kadiTemiz = (v) => String(v || '').trim().replace(/^@/, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').slice(0, 20);
    if (p[0] === 'kisi' && m === 'GET') {
      if (!(await sinir(db, 'kisi:' + kim.id, 60, 3600))) return hata('Çok fazla arama. Biraz sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT id, ad, kullanici_adi FROM kullanicilar WHERE kullanici_adi = ?').bind(kadiTemiz(url.searchParams.get('ad'))).first();
      if (!k) return hata('Bu kullanıcı adında kimse yok.', 404);
      return json({ ad: gorunen(k.ad), kadi: k.kullanici_adi, ben: k.id === kim.id });
    }
    if (p[0] === 'paylas' && m === 'POST') {
      const g = await govde(req); if (!g || !g.program || !Array.isArray(g.program.gunler)) return hata('Geçersiz istek.', 400);
      const alici = await db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ?').bind(kadiTemiz(g.kime)).first();
      if (!alici) return hata('Bu kullanıcı adında kimse yok.', 404);
      if (alici.id === kim.id) return hata('Kendine program gönderemezsin.', 400);
      if (!(await sinir(db, 'paylas:' + kim.id, 20, 86400))) return hata('Bugün çok fazla program gönderdin. Yarın tekrar dene.', 429);
      const n = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));
      const BIR = ['tekrar', 'sn', 'dk', 'm'];
      const pr = {
        ad: temiz(g.program.ad, 40) || 'Paylaşılan program', ozel: true,
        gunler: g.program.gunler.slice(0, 7).map((d, i) => ({
          ad: temiz(d.ad, 24) || 'Gün ' + (i + 1), hafta: n(d.hafta, 0, 6),
          hareketler: (Array.isArray(d.hareketler) ? d.hareketler : []).slice(0, 30).filter((x) => x && /^[a-z0-9_]{2,40}$/.test(String(x.id))).map((x) => ({
            id: String(x.id), set: n(x.set, 1, 10), tekrar: temiz(x.tekrar, 9), birim: BIR.indexOf(x.birim) >= 0 ? x.birim : 'tekrar',
            alt: n(x.alt, 0, 999), ust: n(x.ust, 0, 999), dinlenme: n(x.dinlenme, 0, 600), blok: temiz(x.blok, 12), rir: temiz(x.rir, 20), not: temiz(x.not, 60), isinma: !!x.isinma
          }))
        })).filter((d) => d.hareketler.length)
      };
      if (!pr.gunler.length) return hata('Programda hareket yok.', 400);
      const not = temiz(g.not, 200);
      if (YASAK.test(not)) return hata('Notunda uygun olmayan bir ifade var.', 400);
      const eng = await db.prepare('SELECT 1 FROM engel WHERE kullanici_id = ? AND engellenen_id = ?').bind(alici.id, kim.id).first();
      if (!eng) {
        await db.batch([
          db.prepare("DELETE FROM paylasim WHERE gonderen_id = ? AND alici_id = ? AND durum = 'bekliyor'").bind(kim.id, alici.id),
          db.prepare("INSERT INTO paylasim (gonderen_id, alici_id, json, not_, durum, zaman) VALUES (?, ?, ?, ?, 'bekliyor', ?)").bind(kim.id, alici.id, JSON.stringify(pr), not, simdi)
        ]);
      }
      return json({ ok: true }, 201);
    }
    if (p[0] === 'paylasim' && !p[1] && m === 'GET') {
      const r = await db.prepare("SELECT s.id, s.json, s.not_, s.zaman, k.ad, k.kullanici_adi FROM paylasim s JOIN kullanicilar k ON k.id = s.gonderen_id WHERE s.alici_id = ? AND s.durum = 'bekliyor' AND s.gonderen_id NOT IN (SELECT engellenen_id FROM engel WHERE kullanici_id = ?) ORDER BY s.zaman DESC LIMIT 10").bind(kim.id, kim.id).all();
      const liste = [];
      (r.results || []).forEach((x) => { try { liste.push({ id: x.id, program: JSON.parse(x.json), not: x.not_ || '', zaman: x.zaman, gonderen: gorunen(x.ad), kadi: x.kullanici_adi }); } catch (e) { /* bozuk */ } });
      return json({ liste });
    }
    if (p[0] === 'paylasim' && p[1] && p[2] === 'yanit' && m === 'POST') {
      const g = await govde(req) || {};
      await db.prepare("UPDATE paylasim SET durum = ? WHERE id = ? AND alici_id = ? AND durum = 'bekliyor'").bind(g.kabul ? 'kabul' : 'ret', Number(p[1]) || 0, kim.id).run();
      return json({ ok: true });
    }

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
