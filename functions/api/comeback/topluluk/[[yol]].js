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
// Profil resmi: GET foto/<id>?v= (resim) · Mesaj kutusu: GET mesaj-kutu · Ana sayfa: GET siralama/ozet
// Sosyal: GET ara?q= · GET arkadas · POST arkadas/<id> { islem: ekle|kabul|sil } · GET akis|kesfet?once= · POST gonderi { tur, veri, metin, gorunur, gorsel } · GET gonderi/<id>[/gorsel] · POST gonderi/<id>/saygi|sil|sikayet
// Gelenler: GET bildirim → { istek, durt }
// Gruplar (2–8 kişi): GET grup · POST grup { ad, hedef } · POST grup/katil { kod } · GET grup/<id> · POST grup/<id>/durt|jam|ekle|kod|duzen|ayril
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
// tek ifadede artır-ve-oku: aynı anda gelen istekler sınırı aşamaz
async function sinir(db, R, anahtar, n, sn) {
  const simdi = Date.now();
  const r = await db.prepare('INSERT INTO giris_deneme (anahtar, sayi, bitis) VALUES (?1, 1, ?2) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN bitis <= ?3 THEN 1 ELSE sayi + 1 END, bitis = CASE WHEN bitis <= ?3 THEN ?2 ELSE bitis END RETURNING sayi')
    .bind(anahtar, simdi + sn * 1000, simdi).first();
  const ok = !!r && r.sayi <= n;
  if (!ok && R) { const b = await db.prepare('SELECT bitis FROM giris_deneme WHERE anahtar = ?').bind(anahtar).first(); R.s = { limit: n, pencere: sn, yenilenme: b ? b.bitis : simdi }; }
  return ok;
}
// başka siteden gelen çerezli yazma isteklerini reddet (SameSite'a ek savunma)
function yabanciKaynak(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return false;
  const o = req.headers.get('origin'); if (!o) return false;
  try { return new URL(o).host !== new URL(req.url).host; } catch (e) { return true; }
}
// üyelik askıdaysa (30 gün antrenman yok) topluluk kapalı; ayrıntı hesap/[[yol]].js
async function askidaMi(db, kim) {
  if (kim.rol === 'admin' || kim.rol === 'koc' || kim.rol === 'demo') return false;
  try {
    const u = await db.prepare('SELECT son, uzatma, askida, mazeret_bitis FROM uyelik WHERE kullanici_id = ?').bind(kim.id).first();
    if (!u) return false; if (u.askida) return true;
    const b = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10); if (u.mazeret_bitis && u.mazeret_bitis >= b) return false;
    return new Date(Date.parse(u.son + 'T00:00:00Z') + (30 + (u.uzatma || 0)) * 864e5).toISOString().slice(0, 10) < b;
  } catch (e) { return false; }
}
const temiz = (v, n) => String(v == null ? '' : v).replace(/\u0000/g, '').trim().slice(0, n);
// isim yanı: öne çıkan rozet (vt) ve unvan (un: kurucu, ekip, koc)
const rz = (x) => { const o = {}; if (x && x.vitrin) o.vt = x.vitrin; const un = x && (x.unvan || (x.rol === 'koc' ? 'koc' : '')); if (un) o.un = un; return o; };
const gorunen = (ad) => { const p = String(ad || 'Üye').trim().split(/\s+/); return p[0] + (p[1] ? ' ' + p[1][0] + '.' : ''); };
// basit küfür / iletişim bilgisi süzgeci: ilk savunma hattı, asıl koruma şikâyet + yönetici
const YASAK = /(amk|aq\b|orospu|siktir|sikerim|piç|yarrak|göt(ü|ün)|ibne|\bsik\b)/i;
const KATEGORI = ['genel', 'antrenman', 'beslenme', 'motivasyon', 'sakatlik'];
const MTUR = { antrenman: 'Antrenman sayısı', set: 'Toplam set', su: 'Su (L)', seri: 'Gün serisi', kayit: 'Öğün kaydı yapılan gün' };
const kodUret = () => { const h = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; const a = new Uint8Array(6); crypto.getRandomValues(a); return Array.from(a).map((x) => h[x % h.length]).join(''); };

async function onRequestIc(ctx, R) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB; if (!db) return hata('Kapalı.', 503);
  const p = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean);
  const m = req.method; const url = new URL(req.url);
  if (yabanciKaynak(req)) return hata('İzin verilmeyen kaynak.', 403);
  const kim = await kimDir(db, req); if (!kim) return hata('Giriş yapılmamış.', 401);
  const admin = kim.rol === 'admin';
  // askıdayken yalnızca hocayla mesajlaşma ve profil resimleri açık
  if (['foto', 'mesaj', 'mesaj-kutu', 'mesaj-ozet'].indexOf(p[0]) < 0 && await askidaMi(db, kim)) return json({ hata: 'Üyeliğin askıda. Comeback ile geri dönünce topluluk da açılır.', askida: true }, 403);
  const simdi = Date.now();
  try {
    /* ---------- ortak antrenman (jam) ---------- */
    // kod ile katılınır; herkes kendi ilerlemesini (hareket, set) yazar, diğerleri birkaç saniyede bir okur
    if (p[0] === 'jam') {
      const kodOk = (k) => /^[A-Z0-9]{5}$/.test(k);
      if (p[1] === 'olustur' && m === 'POST') {
        const g = await govde(req) || {};
        if (!(await sinir(db, R, 'jam:' + kim.id, 5, 86400))) return hata('Bugün çok fazla ortak antrenman açtın.', 429);
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
      // kod tahminine karşı: saatte en fazla 30 katılma denemesi (yanlış kodlar da sayılır)
      if (p[2] === 'katil' && m === 'POST' && !(await sinir(db, R, 'jamkatil:' + kim.id, 15, 3600))) return hata('Çok fazla deneme. Biraz sonra tekrar dene.', 429);
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
        const u = await db.prepare('SELECT j.kullanici_id, j.ad, j.durum, j.guncelleme, k.foto_v FROM jam_uye j LEFT JOIN kullanicilar k ON k.id = j.kullanici_id WHERE j.kod = ? ORDER BY j.guncelleme DESC').bind(kod).all();
        return json({ kod, ad: j.ad, sahip: j.sahip_id === kim.id, bitis: j.bitis, program: j.program ? JSON.parse(j.program) : null, ortak: !!j.ortak,
          dinlenme: j.dinlenme_bitis ? { id: j.dinlenme_bitis, kalan: Math.max(0, Math.round((j.dinlenme_bitis - simdi) / 1000)), sn: j.dinlenme_sn, kim: j.dinlenme_kim } : null,
          uyeler: (u.results || []).map((x) => { let d = {}; try { d = JSON.parse(x.durum || '{}'); } catch (e) { /* bozuk */ } return { ad: x.ad, ben: x.kullanici_id === kim.id, durum: d, once: Math.round((simdi - x.guncelleme) / 1000), fid: x.foto_v ? x.kullanici_id : undefined, fv: x.foto_v || undefined }; }) });
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
      const r = await db.prepare('SELECT s.kullanici_id id, s.hacim, s.set_, s.antr, k.ad, k.foto_v, k.vitrin, k.unvan, k.rol FROM skor s JOIN kullanicilar k ON k.id = s.kullanici_id WHERE s.donem = ? AND k.siralama = 1 AND s.' + olc + ' > 0 ORDER BY s.' + olc + ' DESC, s.guncelleme ASC LIMIT 200').bind(donem).all();
      const l = (r.results || []).map((x, i) => ({ sira: i + 1, ad: gorunen(x.ad), hacim: x.hacim, set: x.set_, antr: x.antr, ben: x.id === kim.id, kid: x.id, fid: x.foto_v ? x.id : undefined, fv: x.foto_v || undefined, ...rz(x) }));
      const ben = await db.prepare('SELECT siralama FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      return json({ liste: l.slice(0, 50), benim: l.find((x) => x.ben) || null, toplam: l.length, katildi: !!(ben && ben.siralama), donem });
    }
    // Ana sayfa kartı: bu hafta kaç kişi arasında kaçıncısın (hacim)
    if (p[0] === 'siralama' && p[1] === 'ozet' && m === 'GET') {
      const ben = await db.prepare('SELECT siralama FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      const katildi = !!(ben && ben.siralama);
      const t = await db.prepare('SELECT COUNT(*) n FROM skor s JOIN kullanicilar k ON k.id = s.kullanici_id WHERE s.donem = ? AND k.siralama = 1 AND s.hacim > 0').bind(haftaK).first();
      const uc = await db.prepare('SELECT s.kullanici_id id, s.hacim, k.ad, k.foto_v, k.vitrin, k.unvan, k.rol FROM skor s JOIN kullanicilar k ON k.id = s.kullanici_id WHERE s.donem = ? AND k.siralama = 1 AND s.hacim > 0 ORDER BY s.hacim DESC, s.guncelleme ASC LIMIT 3').bind(haftaK).all();
      let benim = null;
      if (katildi) {
        const b = await db.prepare('SELECT hacim, guncelleme FROM skor WHERE kullanici_id = ? AND donem = ?').bind(kim.id, haftaK).first();
        if (b && b.hacim > 0) {
          const ust = await db.prepare('SELECT COUNT(*) n FROM skor s JOIN kullanicilar k ON k.id = s.kullanici_id WHERE s.donem = ? AND k.siralama = 1 AND (s.hacim > ? OR (s.hacim = ? AND s.guncelleme < ?))').bind(haftaK, b.hacim, b.hacim, b.guncelleme).first();
          benim = { sira: (ust ? ust.n : 0) + 1, hacim: b.hacim };
        }
      }
      return json({ katildi, toplam: t ? t.n : 0, benim, ilk: (uc.results || []).map((x, i) => ({ sira: i + 1, ad: gorunen(x.ad), hacim: x.hacim, ben: x.id === kim.id, fid: x.foto_v ? x.id : undefined, fv: x.foto_v || undefined, ...rz(x) })) });
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
      if (!(await sinir(db, R, 'skor:' + kim.id, 60, 3600))) return hata('Çok sık güncelleme.', 429);
      const n = (v, ust) => Math.max(0, Math.min(ust, Math.round(Number(v) || 0)));
      const yaz = (k, d, c) => db.prepare('INSERT INTO skor (kullanici_id, donem, hacim, set_, antr, guncelleme) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(kullanici_id, donem) DO UPDATE SET hacim = excluded.hacim, set_ = excluded.set_, antr = excluded.antr, guncelleme = excluded.guncelleme')
        .bind(kim.id, k, n(d && d.hacim, 300000 * c), n(d && d.set, 400 * c), n(d && d.antr, 14 * c), simdi);
      await db.batch([yaz(haftaK, g.hafta, 1), yaz(ayK, g.ay, 5)]);
      return json({ ok: true, katildi: true });
    }

    /* ---------- program paylaşımı ---------- */
    const kadiTemiz = (v) => String(v || '').trim().replace(/^@/, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').slice(0, 20);
    // Açık profil: başkasının profili (biyografi, ilgi, rozetler ve kazanma tarihleri). Engellenen görünmez.
    /* ---------- arkadaşlar, akış, keşfet, gruplar ---------- */
    // arkadaşlık iki taraflı: a istek atar, b kabul edince durum 'tamam'
    // gönderi görünürlüğü: herkes (keşfet dahil) · arkadas (arkadaşlar + grup üyeleri) · grup (yalnızca grup üyeleri)
    const ARK_CTE = "WITH ark AS (SELECT CASE WHEN a = ?1 THEN b ELSE a END k FROM arkadas WHERE (a = ?1 OR b = ?1) AND durum = 'tamam'), grp AS (SELECT DISTINCT u2.kullanici_id k FROM grup_uye u1 JOIN grup_uye u2 ON u1.grup_id = u2.grup_id WHERE u1.kullanici_id = ?1) ";
    const GORUR = "(g.kullanici_id = ?1 OR g.gorunur = 'herkes' OR (g.gorunur = 'arkadas' AND (g.kullanici_id IN (SELECT k FROM ark) OR g.kullanici_id IN (SELECT k FROM grp))) OR (g.gorunur = 'grup' AND g.kullanici_id IN (SELECT k FROM grp)))";
    const ENGEL = '(g.kullanici_id NOT IN (SELECT engellenen_id FROM engel WHERE kullanici_id = ?1) AND g.kullanici_id NOT IN (SELECT kullanici_id FROM engel WHERE engellenen_id = ?1))';
    const GSEC = 'SELECT g.id, g.kullanici_id, g.tur, g.veri, g.metin, g.gorunur, g.gorsel, g.zaman, g.saygi, g.gizli, k.ad, k.kullanici_adi, k.vitrin, k.unvan, k.rol, k.foto_v, (SELECT 1 FROM saygi WHERE gonderi_id = g.id AND kullanici_id = ?1) ben FROM gonderi g JOIN kullanicilar k ON k.id = g.kullanici_id ';
    const gYaz = (x) => { let v = {}; try { v = JSON.parse(x.veri || '{}') || {}; } catch (e) { /* bozuk */ } return Object.assign({ id: x.id, kid: x.kullanici_id, ad: gorunen(x.ad), kadi: x.kullanici_adi || null, tur: x.tur, veri: v, metin: x.metin || '', gorunur: x.gorunur, gorsel: !!x.gorsel, zaman: x.zaman, saygi: x.saygi || 0, sen: !!x.ben, benim: x.kullanici_id === kim.id, fid: x.foto_v ? x.kullanici_id : undefined, fv: x.foto_v || undefined }, rz(x)); };
    const kisiYaz = (x) => Object.assign({ id: x.id, ad: gorunen(x.ad), kadi: x.kullanici_adi || null, fid: x.foto_v ? x.id : undefined, fv: x.foto_v || undefined }, rz(x));
    const KSEC = 'k.id, k.ad, k.kullanici_adi, k.vitrin, k.unvan, k.rol, k.foto_v';
    const arkDurum = async (o) => { const r = await db.prepare('SELECT a, durum FROM arkadas WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(kim.id, o, o, kim.id).first(); return !r ? 'yok' : r.durum === 'tamam' ? 'tamam' : r.a === kim.id ? 'giden' : 'gelen'; };
    const engelli = async (o) => !!(await db.prepare('SELECT 1 FROM engel WHERE (kullanici_id = ? AND engellenen_id = ?) OR (kullanici_id = ? AND engellenen_id = ?)').bind(kim.id, o, o, kim.id).first());
    const haftaBas = () => { const t = new Date(simdi + 3 * 3600e3); const gun = (t.getUTCDay() + 6) % 7; return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - gun * 864e5 - 3 * 3600e3; };
    const sayiN = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, Math.round(n))) : 0; };

    if (p[0] === 'ara' && m === 'GET') {
      if (!(await sinir(db, R, 'ara:' + kim.id, 60, 3600))) return hata('Çok fazla arama. Biraz sonra tekrar dene.', 429);
      const q = temiz(url.searchParams.get('q'), 30).replace(/^@/, ''); if (q.length < 2) return json({ liste: [] });
      const kq = kadiTemiz(q).replace(/[%_]/g, '');
      const r = await db.prepare('SELECT ' + KSEC + " FROM kullanicilar k WHERE k.id != ?1 AND k.rol != 'demo' AND (k.kullanici_adi LIKE ?2 OR k.ad LIKE ?3) AND k.id NOT IN (SELECT engellenen_id FROM engel WHERE kullanici_id = ?1) AND k.id NOT IN (SELECT kullanici_id FROM engel WHERE engellenen_id = ?1) LIMIT 20")
        .bind(kim.id, kq + '%', q.replace(/[%_]/g, '') + '%').all();
      const l = r.results || []; const out = [];
      for (const x of l) out.push(Object.assign(kisiYaz(x), { ark: await arkDurum(x.id) }));
      return json({ liste: out });
    }
    // Gelenler kutusu: bekleyen arkadaşlık istekleri + son 3 günde gruptan "Bekliyoruz." diyenler (yalnızca sayı ve adlar)
    if (p[0] === 'bildirim' && m === 'GET') {
      const i = await db.prepare("SELECT COUNT(*) n FROM arkadas WHERE b = ? AND durum != 'tamam'").bind(kim.id).first();
      const d = await db.prepare('SELECT d.grup_id, g.ad grup, k.ad, d.zaman FROM grup_durt d JOIN grup g ON g.id = d.grup_id JOIN kullanicilar k ON k.id = d.kimden WHERE d.kime = ? AND d.zaman > ? ORDER BY d.zaman DESC LIMIT 10').bind(kim.id, simdi - 3 * 864e5).all();
      return json({ istek: i ? i.n : 0, durt: (d.results || []).map((x) => ({ grup: x.grup_id, grupAd: x.grup, ad: gorunen(x.ad), zaman: x.zaman })) });
    }
    if (p[0] === 'arkadas' && !p[1] && m === 'GET') {
      const r = await db.prepare('SELECT a.a, a.b, a.durum, a.zaman, ' + KSEC + " FROM arkadas a JOIN kullanicilar k ON k.id = CASE WHEN a.a = ?1 THEN a.b ELSE a.a END WHERE a.a = ?1 OR a.b = ?1 ORDER BY a.zaman DESC LIMIT 300").bind(kim.id).all();
      const l = r.results || [];
      return json({ liste: l.filter((x) => x.durum === 'tamam').map(kisiYaz), gelen: l.filter((x) => x.durum !== 'tamam' && x.b === kim.id).map(kisiYaz), giden: l.filter((x) => x.durum !== 'tamam' && x.a === kim.id).map(kisiYaz) });
    }
    if (p[0] === 'arkadas' && p[1] && m === 'POST') {
      const o = temiz(p[1], 64); const g = await govde(req) || {}; const is = g.islem;
      if (!o || o === kim.id) return hata('Geçersiz.', 400);
      const k = await db.prepare('SELECT id FROM kullanicilar WHERE id = ?').bind(o).first(); if (!k || await engelli(o)) return hata('Bulunamadı.', 404);
      const d = await arkDurum(o);
      if (is === 'ekle') {
        if (d === 'tamam' || d === 'giden') return json({ ark: d });
        if (d === 'gelen') { await db.prepare("UPDATE arkadas SET durum = 'tamam', zaman = ? WHERE a = ? AND b = ?").bind(simdi, o, kim.id).run(); return json({ ark: 'tamam' }); }
        if (!(await sinir(db, R, 'ark:' + kim.id, 40, 86400))) return hata('Bugün çok fazla istek gönderdin.', 429);
        const n = await db.prepare('SELECT COUNT(*) n FROM arkadas WHERE a = ? OR b = ?').bind(kim.id, kim.id).first(); if (n && n.n >= 500) return hata('Arkadaş sınırına ulaştın.', 400);
        await db.prepare("INSERT OR IGNORE INTO arkadas (a, b, durum, zaman) VALUES (?, ?, 'bekle', ?)").bind(kim.id, o, simdi).run(); return json({ ark: 'giden' });
      }
      if (is === 'kabul') { if (d !== 'gelen') return json({ ark: d }); await db.prepare("UPDATE arkadas SET durum = 'tamam', zaman = ? WHERE a = ? AND b = ?").bind(simdi, o, kim.id).run(); return json({ ark: 'tamam' }); }
      if (is === 'sil') { await db.prepare('DELETE FROM arkadas WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(kim.id, o, o, kim.id).run(); return json({ ark: 'yok' }); }
      return hata('Geçersiz.', 400);
    }
    if ((p[0] === 'akis' || p[0] === 'kesfet') && m === 'GET') {
      const once = Math.min(Number(url.searchParams.get('once')) || simdi + 1, simdi + 1);
      const kosul = p[0] === 'akis'
        ? "(g.kullanici_id = ?1 OR (g.gorunur IN ('herkes', 'arkadas') AND (g.kullanici_id IN (SELECT k FROM ark) OR g.kullanici_id IN (SELECT k FROM grp))) OR (g.gorunur = 'grup' AND g.kullanici_id IN (SELECT k FROM grp)))"
        : "g.gorunur = 'herkes'";
      const r = await db.prepare(ARK_CTE + GSEC + 'WHERE ' + kosul + ' AND g.gizli = 0 AND g.zaman < ?2 AND ' + ENGEL + ' ORDER BY g.zaman DESC LIMIT 20').bind(kim.id, once).all();
      const l = (r.results || []).map(gYaz);
      const ek = {};
      if (p[0] === 'akis' && !url.searchParams.get('once')) { const n = await db.prepare("SELECT COUNT(*) n FROM arkadas WHERE b = ? AND durum = 'bekle'").bind(kim.id).first(); ek.istek = n ? n.n : 0; }
      return json(Object.assign({ liste: l, son: l.length === 20 ? l[19].zaman : null }, ek));
    }
    if (p[0] === 'gonderi' && !p[1] && m === 'POST') {
      const g = await govde(req) || {}; const tur = ['antrenman', 'kart'].indexOf(g.tur) >= 0 ? g.tur : '';
      const gorunur = ['herkes', 'arkadas', 'grup'].indexOf(g.gorunur) >= 0 ? g.gorunur : 'arkadas';
      if (!tur) return hata('Geçersiz.', 400);
      if (!(await sinir(db, R, 'gonderi:' + kim.id, 20, 86400))) return hata('Bugün yeterince paylaştın.', 429);
      const metin = temiz(g.metin, 280).replace(/[<>]/g, ''); if (YASAK.test(metin)) return hata('Uygunsuz ifade var.', 400);
      const v = g.veri || {}; let veri;
      if (tur === 'antrenman') veri = { ad: temiz(v.ad, 40), dk: sayiN(v.dk, 0, 600), set: sayiN(v.set, 0, 200), hacim: sayiN(v.hacim, 0, 200000), rekor: sayiN(v.rekor, 0, 50), hareket: (Array.isArray(v.hareket) ? v.hareket : []).slice(0, 4).map((x) => temiz(x, 40)) };
      else veri = { baslik: temiz(v.baslik, 60) };
      let gorsel = null;
      if (g.gorsel) { const mt = String(g.gorsel).match(/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/); if (!mt || g.gorsel.length > 700000) return hata('Görsel uygun değil.', 400); gorsel = g.gorsel; }
      if (tur === 'kart' && !gorsel) return hata('Kart görseli yok.', 400);
      // aynı antrenman iki kez düşmesin (çift dokunuş / yeniden deneme)
      if (tur === 'antrenman') { const ayni = await db.prepare("SELECT id FROM gonderi WHERE kullanici_id = ? AND tur = 'antrenman' AND zaman > ? AND veri = ?").bind(kim.id, simdi - 3600e3, JSON.stringify(veri)).first(); if (ayni) return json({ id: ayni.id }); }
      const r = await db.prepare('INSERT INTO gonderi (kullanici_id, tur, veri, metin, gorunur, gorsel, zaman) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id').bind(kim.id, tur, JSON.stringify(veri), metin || null, gorunur, gorsel ? 1 : 0, simdi).first();
      if (gorsel) await db.prepare('INSERT INTO gonderi_gorsel (gonderi_id, veri) VALUES (?, ?)').bind(r.id, gorsel).run();
      return json({ id: r.id });
    }
    if (p[0] === 'gonderi' && p[1]) {
      const id = parseInt(p[1], 10) || 0;
      const x = await db.prepare(ARK_CTE + GSEC + 'WHERE g.id = ?2 AND ' + GORUR + ' AND ' + ENGEL).bind(kim.id, id).first();
      if (!x || (x.gizli && x.kullanici_id !== kim.id && !admin)) return hata('Bulunamadı.', 404);
      if (p[2] === 'gorsel' && m === 'GET') {
        const r = await db.prepare('SELECT veri FROM gonderi_gorsel WHERE gonderi_id = ?').bind(id).first();
        const mt = r && String(r.veri).match(/^data:(image\/(?:jpeg|webp));base64,(.+)$/);
        if (!mt) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
        return new Response(Uint8Array.from(atob(mt[2]), (c) => c.charCodeAt(0)), { headers: { 'content-type': mt[1], 'cache-control': 'private, max-age=604800', 'x-content-type-options': 'nosniff' } });
      }
      if (!p[2] && m === 'GET') return json({ gonderi: gYaz(x) });
      if (p[2] === 'saygi' && m === 'POST') {
        if (x.kullanici_id === kim.id) return hata('Kendine saygı zaten var.', 400);
        if (!(await sinir(db, R, 'saygi:' + kim.id, 200, 3600))) return hata('Biraz yavaş.', 429);
        if (x.ben) await db.batch([db.prepare('DELETE FROM saygi WHERE gonderi_id = ? AND kullanici_id = ?').bind(id, kim.id), db.prepare('UPDATE gonderi SET saygi = MAX(0, saygi - 1) WHERE id = ?').bind(id)]);
        else await db.batch([db.prepare('INSERT OR IGNORE INTO saygi (gonderi_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(id, kim.id, simdi), db.prepare('UPDATE gonderi SET saygi = saygi + 1 WHERE id = ?').bind(id)]);
        return json({ sen: !x.ben, saygi: Math.max(0, (x.saygi || 0) + (x.ben ? -1 : 1)) });
      }
      if (p[2] === 'sil' && m === 'POST') {
        if (x.kullanici_id !== kim.id && !admin) return hata('Silemezsin.', 403);
        await db.batch([db.prepare('DELETE FROM saygi WHERE gonderi_id = ?').bind(id), db.prepare('DELETE FROM gonderi_gorsel WHERE gonderi_id = ?').bind(id), db.prepare('DELETE FROM gonderi WHERE id = ?').bind(id)]);
        return json({ ok: true });
      }
      if (p[2] === 'sikayet' && m === 'POST') {
        if (!(await sinir(db, R, 'sikayet:' + kim.id, 10, 3600))) return hata('Çok fazla şikâyet.', 429);
        const g = await govde(req) || {};
        await db.prepare("INSERT OR IGNORE INTO sikayet (tur, hedef_id, kullanici_id, neden, zaman) VALUES ('gonderi', ?, ?, ?, ?)").bind(id, kim.id, temiz(g.neden, 200), simdi).run();
        const n = await db.prepare("SELECT COUNT(DISTINCT kullanici_id) n FROM sikayet WHERE tur = 'gonderi' AND hedef_id = ? AND durum = 'acik'").bind(id).first();
        if (n && n.n >= 3) await db.prepare('UPDATE gonderi SET gizli = 1 WHERE id = ?').bind(id).run();
        return json({ ok: true });
      }
      return hata('Bulunamadı.', 404);
    }
    if (p[0] === 'grup') {
      const uyeMi = async (gid) => !!(await db.prepare('SELECT 1 FROM grup_uye WHERE grup_id = ? AND kullanici_id = ?').bind(gid, kim.id).first());
      const hb = haftaBas();
      if (!p[1] && m === 'GET') {
        const r = await db.prepare('SELECT g.id, g.ad, g.hedef, g.kod, (SELECT COUNT(*) FROM grup_uye WHERE grup_id = g.id) n, (SELECT COUNT(*) FROM gonderi o WHERE o.tur = \'antrenman\' AND o.zaman >= ?2 AND o.kullanici_id IN (SELECT kullanici_id FROM grup_uye WHERE grup_id = g.id)) hafta FROM grup g JOIN grup_uye u ON u.grup_id = g.id WHERE u.kullanici_id = ?1 ORDER BY u.zaman').bind(kim.id, hb).all();
        return json({ liste: r.results || [] });
      }
      if (!p[1] && m === 'POST') {
        const g = await govde(req) || {}; const ad = temiz(g.ad, 30).replace(/[<>]/g, ''); const hedef = sayiN(g.hedef || 12, 2, 60);
        if (ad.length < 2) return hata('Gruba bir ad ver.', 400); if (YASAK.test(ad)) return hata('Uygunsuz ifade var.', 400);
        const n = await db.prepare('SELECT COUNT(*) n FROM grup_uye WHERE kullanici_id = ?').bind(kim.id).first(); if (n && n.n >= 5) return hata('En fazla 5 grupta olabilirsin.', 400);
        if (!(await sinir(db, R, 'grup:' + kim.id, 5, 86400))) return hata('Bugün yeterince grup açtın.', 429);
        let kod = ''; for (let d = 0; d < 5; d++) { kod = kodUret(); if (!(await db.prepare('SELECT 1 FROM grup WHERE kod = ?').bind(kod).first())) break; }
        const id = crypto.randomUUID();
        await db.batch([db.prepare('INSERT INTO grup (id, ad, kod, sahip, hedef, olusturma) VALUES (?, ?, ?, ?, ?, ?)').bind(id, ad, kod, kim.id, hedef, simdi), db.prepare('INSERT INTO grup_uye (grup_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(id, kim.id, simdi)]);
        return json({ id, kod });
      }
      if (p[1] === 'katil' && m === 'POST') {
        if (!(await sinir(db, R, 'grupkatil:' + kim.id, 20, 3600))) return hata('Biraz yavaş.', 429);
        const g = await govde(req) || {}; const gr = await db.prepare('SELECT id, ad FROM grup WHERE kod = ?').bind(temiz(g.kod, 8).toUpperCase()).first();
        if (!gr) return hata('Bu kodla bir grup yok.', 404);
        if (await uyeMi(gr.id)) return json({ id: gr.id, ad: gr.ad });
        const n = await db.prepare('SELECT (SELECT COUNT(*) FROM grup_uye WHERE grup_id = ?) g, (SELECT COUNT(*) FROM grup_uye WHERE kullanici_id = ?) b').bind(gr.id, kim.id).first();
        if (n.g >= 8) return hata('Grup dolu (8 kişi).', 400); if (n.b >= 5) return hata('En fazla 5 grupta olabilirsin.', 400);
        await db.prepare('INSERT OR IGNORE INTO grup_uye (grup_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(gr.id, kim.id, simdi).run();
        return json({ id: gr.id, ad: gr.ad });
      }
      const gid = temiz(p[1], 64); const gr = await db.prepare('SELECT * FROM grup WHERE id = ?').bind(gid).first();
      if (!gr || !(await uyeMi(gid))) return hata('Grup bulunamadı.', 404);
      if (!p[2] && m === 'GET') {
        const u = await db.prepare('SELECT ' + KSEC + ', u.zaman katilim FROM grup_uye u JOIN kullanicilar k ON k.id = u.kullanici_id WHERE u.grup_id = ? ORDER BY u.zaman').bind(gid).all();
        const uyeler = u.results || []; const ids = uyeler.map((x) => x.id);
        const ph = ids.map(() => '?').join(',');
        const a = await db.prepare("SELECT kullanici_id, zaman FROM gonderi WHERE tur = 'antrenman' AND zaman >= ? AND kullanici_id IN (" + ph + ')').bind(hb, ...ids).all();
        const son = await db.prepare("SELECT kullanici_id, MAX(zaman) z FROM gonderi WHERE tur = 'antrenman' AND kullanici_id IN (" + ph + ') GROUP BY kullanici_id').bind(...ids).all();
        const sonM = {}; (son.results || []).forEach((x) => { sonM[x.kullanici_id] = x.z; });
        const gunler = {}; (a.results || []).forEach((x) => { const gi = Math.floor((x.zaman - hb) / 864e5); (gunler[x.kullanici_id] = gunler[x.kullanici_id] || [0, 0, 0, 0, 0, 0, 0])[Math.max(0, Math.min(6, gi))]++; });
        const ak = await db.prepare(ARK_CTE + GSEC + "WHERE g.kullanici_id IN (SELECT kullanici_id FROM grup_uye WHERE grup_id = ?2) AND g.gorunur IN ('herkes', 'arkadas', 'grup') AND g.gizli = 0 AND g.zaman > ?3 ORDER BY g.zaman DESC LIMIT 30").bind(kim.id, gid, simdi - 21 * 864e5).all();
        const durt = await db.prepare('SELECT d.kimden, k.ad, d.zaman FROM grup_durt d JOIN kullanicilar k ON k.id = d.kimden WHERE d.grup_id = ? AND d.kime = ? AND d.zaman > ? ORDER BY d.zaman DESC LIMIT 5').bind(gid, kim.id, simdi - 3 * 864e5).all();
        return json({ grup: { id: gr.id, ad: gr.ad, kod: gr.kod, hedef: gr.hedef, sahip: gr.sahip === kim.id, hafta: (a.results || []).length, haftaBas: hb,
          jam: gr.jam && gr.jam_zaman > simdi - 4 * 3600e3 ? { kod: gr.jam, zaman: gr.jam_zaman } : null,
          uyeler: uyeler.map((x) => Object.assign(kisiYaz(x), { ben: x.id === kim.id, gunler: gunler[x.id] || [0, 0, 0, 0, 0, 0, 0], son: sonM[x.id] || null })),
          akis: (ak.results || []).map(gYaz), durt: (durt.results || []).map((x) => ({ ad: gorunen(x.ad), zaman: x.zaman })) } });
      }
      if (p[2] === 'durt' && m === 'POST') {
        const g = await govde(req) || {}; const kime = temiz(g.kime, 64);
        if (!kime || kime === kim.id || !(await db.prepare('SELECT 1 FROM grup_uye WHERE grup_id = ? AND kullanici_id = ?').bind(gid, kime).first())) return hata('Geçersiz.', 400);
        if (!(await sinir(db, R, 'durt:' + kim.id + ':' + kime, 1, 86400))) return hata('Bugün zaten haber verdin.', 429);
        await db.prepare('INSERT OR REPLACE INTO grup_durt (grup_id, kime, kimden, zaman) VALUES (?, ?, ?, ?)').bind(gid, kime, kim.id, simdi).run();
        return json({ ok: true });
      }
      if (p[2] === 'jam' && m === 'POST') {
        const g = await govde(req) || {}; const kod = String(g.kod || '').toUpperCase();
        if (kod && !/^[A-Z0-9]{5}$/.test(kod)) return hata('Geçersiz.', 400);
        if (kod && !(await db.prepare('SELECT 1 FROM jam WHERE kod = ? AND sahip_id = ? AND bitis > ?').bind(kod, kim.id, simdi).first())) return hata('Ortak antrenman bulunamadı.', 404);
        await db.prepare('UPDATE grup SET jam = ?, jam_zaman = ? WHERE id = ?').bind(kod || null, kod ? simdi : null, gid).run();
        return json({ ok: true });
      }
      if (p[2] === 'ekle' && m === 'POST') {
        const g = await govde(req) || {}; const kime = temiz(g.kime, 64);
        if ((await arkDurum(kime)) !== 'tamam') return hata('Yalnızca arkadaşlarını ekleyebilirsin.', 400);
        const n = await db.prepare('SELECT (SELECT COUNT(*) FROM grup_uye WHERE grup_id = ?) g, (SELECT COUNT(*) FROM grup_uye WHERE kullanici_id = ?) b').bind(gid, kime).first();
        if (n.g >= 8) return hata('Grup dolu (8 kişi).', 400); if (n.b >= 5) return hata('O kişi zaten 5 grupta.', 400);
        await db.prepare('INSERT OR IGNORE INTO grup_uye (grup_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(gid, kime, simdi).run();
        return json({ ok: true });
      }
      // davet kodunu yenile: eski kod ve paylaşılmış bağlantılar geçersiz olur (yalnızca kuran)
      if (p[2] === 'kod' && m === 'POST') {
        if (gr.sahip !== kim.id) return hata('Yalnızca kuran yenileyebilir.', 403);
        if (!(await sinir(db, R, 'grkod:' + kim.id, 10, 86400))) return hata('Bugün yeterince yeniledin.', 429);
        let kod = ''; for (let d = 0; d < 5; d++) { kod = kodUret(); if (!(await db.prepare('SELECT 1 FROM grup WHERE kod = ?').bind(kod).first())) break; }
        await db.prepare('UPDATE grup SET kod = ? WHERE id = ?').bind(kod, gid).run(); return json({ kod });
      }
      if (p[2] === 'duzen' && m === 'POST') {
        if (gr.sahip !== kim.id) return hata('Yalnızca kuran değiştirebilir.', 403);
        const g = await govde(req) || {}; const ad = temiz(g.ad, 30).replace(/[<>]/g, ''); if (ad.length < 2 || YASAK.test(ad)) return hata('Geçersiz ad.', 400);
        await db.prepare('UPDATE grup SET ad = ?, hedef = ? WHERE id = ?').bind(ad, sayiN(g.hedef || gr.hedef, 2, 60), gid).run(); return json({ ok: true });
      }
      if (p[2] === 'ayril' && m === 'POST') {
        await db.batch([db.prepare('DELETE FROM grup_uye WHERE grup_id = ? AND kullanici_id = ?').bind(gid, kim.id), db.prepare('DELETE FROM grup_durt WHERE grup_id = ? AND (kime = ? OR kimden = ?)').bind(gid, kim.id, kim.id)]);
        const kalan = await db.prepare('SELECT kullanici_id FROM grup_uye WHERE grup_id = ? ORDER BY zaman LIMIT 1').bind(gid).first();
        if (!kalan) await db.batch([db.prepare('DELETE FROM grup_durt WHERE grup_id = ?').bind(gid), db.prepare('DELETE FROM grup WHERE id = ?').bind(gid)]);
        else if (gr.sahip === kim.id) await db.prepare('UPDATE grup SET sahip = ? WHERE id = ?').bind(kalan.kullanici_id, gid).run();
        return json({ ok: true });
      }
      return hata('Bulunamadı.', 404);
    }
    /* ---------- etkinlikler: "Bostanlı'da koşu", "halı saha", herkes görür, isteyen katılır ---------- */
    if (p[0] === 'etkinlik') {
      const BRANS = ['fitness', 'kalistenik', 'crossfit', 'hiit', 'kosu', 'yuruyus', 'bisiklet', 'yuzme', 'yoga', 'pilates', 'kayak', 'futbol', 'basketbol', 'voleybol', 'tenis', 'padel', 'boks', 'kickboks', 'dovus', 'tirmanis'];
      const kisiler = async (id) => (await db.prepare('SELECT k.id, k.ad, k.vitrin, k.unvan, k.rol FROM etkinlik_katilim e JOIN kullanicilar k ON k.id = e.kullanici_id WHERE e.etkinlik_id = ? ORDER BY e.zaman LIMIT 200').bind(id).all()).results || [];
      if (!p[1] && m === 'GET') {
        const r = await db.prepare('SELECT e.*, k.ad, k.vitrin, k.unvan, k.rol, (SELECT COUNT(*) FROM etkinlik_katilim WHERE etkinlik_id = e.id) n, (SELECT 1 FROM etkinlik_katilim WHERE etkinlik_id = e.id AND kullanici_id = ?) ben FROM etkinlik e JOIN kullanicilar k ON k.id = e.kullanici_id WHERE e.iptal = 0 AND e.zaman > ? AND e.kullanici_id NOT IN (SELECT engellenen_id FROM engel WHERE kullanici_id = ?) ORDER BY e.zaman LIMIT 60')
          .bind(kim.id, simdi - 3 * 3600e3, kim.id).all();
        return json({ liste: (r.results || []).map((x) => ({ id: x.id, brans: x.brans, baslik: x.baslik, yer: x.yer, zaman: x.zaman, kontenjan: x.kontenjan, n: x.n, katildim: !!x.ben, benim: x.kullanici_id === kim.id, acan: gorunen(x.ad), acanId: x.kullanici_id, arz: rz(x) })) });
      }
      if (!p[1] && m === 'POST') {
        if (!(await sinir(db, R, 'etkinlik:' + kim.id, 5, 86400))) return hata('Bugün yeterince etkinlik açtın.', 429);
        const g = await req.json().catch(() => ({}));
        const brans = BRANS.indexOf(g.brans) >= 0 ? g.brans : '';
        const baslik = String(g.baslik || '').replace(/[<>]/g, '').trim().slice(0, 60); const yer = String(g.yer || '').replace(/[<>]/g, '').trim().slice(0, 80);
        const aciklama = String(g.aciklama || '').replace(/[<>]/g, '').trim().slice(0, 300); const zaman = Math.floor(Number(g.zaman));
        const kont = g.kontenjan ? Math.max(2, Math.min(200, Math.floor(Number(g.kontenjan)) || 0)) : null;
        if (!brans || baslik.length < 3 || yer.length < 2) return hata('Branş, başlık ve yer gerekli.', 400);
        if (!(zaman > simdi && zaman < simdi + 60 * 864e5)) return hata('Tarih bugünden sonra ve en çok 60 gün içinde olmalı.', 400);
        if (YASAK.test(baslik + ' ' + yer + ' ' + aciklama)) return hata('Uygunsuz ifade var.', 400);
        const id = crypto.randomUUID();
        await db.batch([db.prepare('INSERT INTO etkinlik (id, kullanici_id, brans, baslik, yer, zaman, kontenjan, aciklama, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, kim.id, brans, baslik, yer, zaman, kont, aciklama || null, simdi),
          db.prepare('INSERT INTO etkinlik_katilim (etkinlik_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(id, kim.id, simdi)]);
        return json({ id });
      }
      const e = await db.prepare('SELECT e.*, k.ad, k.vitrin, k.unvan, k.rol FROM etkinlik e JOIN kullanicilar k ON k.id = e.kullanici_id WHERE e.id = ?').bind(String(p[1]).slice(0, 64)).first();
      if (!e || (e.iptal && e.kullanici_id !== kim.id)) return hata('Etkinlik bulunamadı.', 404);
      if (!p[2] && m === 'GET') {
        const l = await kisiler(e.id);
        return json({ etkinlik: { id: e.id, brans: e.brans, baslik: e.baslik, yer: e.yer, zaman: e.zaman, kontenjan: e.kontenjan, aciklama: e.aciklama || '', iptal: !!e.iptal, benim: e.kullanici_id === kim.id, acan: gorunen(e.ad), acanId: e.kullanici_id, arz: rz(e),
          katilimci: l.map((x) => Object.assign({ id: x.id, ad: gorunen(x.ad) }, rz(x))), katildim: l.some((x) => x.id === kim.id) } });
      }
      if (p[2] === 'katil' && m === 'POST') {
        if (!(await sinir(db, R, 'etkatil:' + kim.id, 40, 3600))) return hata('Biraz yavaş.', 429);
        if (e.iptal || e.zaman < simdi) return hata('Bu etkinliğe artık katılınamaz.', 400);
        const n = await db.prepare('SELECT COUNT(*) n FROM etkinlik_katilim WHERE etkinlik_id = ?').bind(e.id).first();
        if (e.kontenjan && n && n.n >= e.kontenjan) return hata('Kontenjan doldu.', 400);
        await db.prepare('INSERT OR IGNORE INTO etkinlik_katilim (etkinlik_id, kullanici_id, zaman) VALUES (?, ?, ?)').bind(e.id, kim.id, simdi).run();
        return json({ ok: true });
      }
      if (p[2] === 'ayril' && m === 'POST') {
        if (e.kullanici_id === kim.id) return hata('Açan kişi ayrılamaz; istersen iptal et.', 400);
        await db.prepare('DELETE FROM etkinlik_katilim WHERE etkinlik_id = ? AND kullanici_id = ?').bind(e.id, kim.id).run(); return json({ ok: true });
      }
      if (p[2] === 'iptal' && m === 'POST') {
        if (e.kullanici_id !== kim.id && !admin) return hata('Yetkin yok.', 403);
        await db.prepare('UPDATE etkinlik SET iptal = 1 WHERE id = ?').bind(e.id).run(); return json({ ok: true });
      }
      return hata('Bulunamadı.', 404);
    }
    if (p[0] === 'profil' && m === 'GET') {
      const id = String(url.searchParams.get('id') || '').slice(0, 64);
      const k = await db.prepare('SELECT id, ad, kullanici_adi, foto_v, bio, ilgi, vitrin, unvan, rol, acik FROM kullanicilar WHERE id = ?').bind(id).first();
      if (!k) return hata('Bulunamadı.', 404);
      const eng = await db.prepare('SELECT 1 FROM engel WHERE (kullanici_id = ? AND engellenen_id = ?) OR (kullanici_id = ? AND engellenen_id = ?)').bind(kim.id, k.id, k.id, kim.id).first();
      if (eng) return hata('Bulunamadı.', 404);
      let ac = {}; try { ac = JSON.parse(k.acik || '{}') || {}; } catch (e) { /* bozuk */ }
      let ilgi = []; try { ilgi = JSON.parse(k.ilgi || '[]') || []; } catch (e) { /* bozuk */ }
      const ark = k.id === kim.id ? 'ben' : await (async () => { const r = await db.prepare('SELECT a, durum FROM arkadas WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)').bind(kim.id, k.id, k.id, kim.id).first(); return !r ? 'yok' : r.durum === 'tamam' ? 'tamam' : r.a === kim.id ? 'giden' : 'gelen'; })();
      const an = await db.prepare("SELECT COUNT(*) n FROM arkadas WHERE (a = ? OR b = ?) AND durum = 'tamam'").bind(k.id, k.id).first();
      const gl = await db.prepare("WITH ark AS (SELECT CASE WHEN a = ?1 THEN b ELSE a END k FROM arkadas WHERE (a = ?1 OR b = ?1) AND durum = 'tamam'), grp AS (SELECT DISTINCT u2.kullanici_id k FROM grup_uye u1 JOIN grup_uye u2 ON u1.grup_id = u2.grup_id WHERE u1.kullanici_id = ?1) " +
        "SELECT g.id, g.tur, g.veri, g.metin, g.gorsel, g.zaman, g.saygi, (SELECT 1 FROM saygi WHERE gonderi_id = g.id AND kullanici_id = ?1) ben FROM gonderi g WHERE g.kullanici_id = ?2 AND g.gizli = 0 AND (g.kullanici_id = ?1 OR g.gorunur = 'herkes' OR (g.gorunur = 'arkadas' AND (?2 IN (SELECT k FROM ark) OR ?2 IN (SELECT k FROM grp))) OR (g.gorunur = 'grup' AND ?2 IN (SELECT k FROM grp))) ORDER BY g.zaman DESC LIMIT 12").bind(kim.id, k.id).all();
      const gonderi = (gl.results || []).map((x) => { let v = {}; try { v = JSON.parse(x.veri || '{}') || {}; } catch (e) { /* bozuk */ } return { id: x.id, kid: k.id, ad: gorunen(k.ad), tur: x.tur, veri: v, metin: x.metin || '', gorsel: !!x.gorsel, zaman: x.zaman, saygi: x.saygi || 0, sen: !!x.ben, benim: k.id === kim.id }; });
      return json({ kisi: Object.assign({ id: k.id, ad: gorunen(k.ad), kadi: k.kullanici_adi || null, bio: k.bio || '', ilgi, rozet: ac.rozet || {}, ozet: ac.ozet || {}, ben: k.id === kim.id, fid: k.foto_v ? k.id : undefined, fv: k.foto_v || undefined, ark, arkSayi: an ? an.n : 0, gonderi }, rz(k)) });
    }
    if (p[0] === 'kisi' && m === 'GET') {
      if (!(await sinir(db, R, 'kisi:' + kim.id, 30, 3600))) return hata('Çok fazla arama. Biraz sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT id, ad, kullanici_adi FROM kullanicilar WHERE kullanici_adi = ?').bind(kadiTemiz(url.searchParams.get('ad'))).first();
      if (!k) return hata('Bu kullanıcı adında kimse yok.', 404);
      return json({ ad: gorunen(k.ad), kadi: k.kullanici_adi, ben: k.id === kim.id });
    }
    if (p[0] === 'paylas' && m === 'POST') {
      const g = await govde(req); if (!g || !g.program || !Array.isArray(g.program.gunler)) return hata('Geçersiz istek.', 400);
      const alici = await db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ?').bind(kadiTemiz(g.kime)).first();
      if (!alici) return hata('Bu kullanıcı adında kimse yok.', 404);
      if (alici.id === kim.id) return hata('Kendine program gönderemezsin.', 400);
      if (!(await sinir(db, R, 'paylas:' + kim.id, 5, 86400))) return hata('Bugün çok fazla program gönderdin. Yarın tekrar dene.', 429);
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
    if (p[0] === 'foto' && p[1] && m === 'GET') {
      const r = await db.prepare('SELECT foto FROM kullanicilar WHERE id = ?').bind(p[1]).first();
      const mt = r && r.foto && String(r.foto).match(/^data:(image\/(?:jpeg|webp));base64,(.+)$/);
      if (!mt) return new Response('', { status: 404, headers: { 'cache-control': 'no-store' } });
      const bin = Uint8Array.from(atob(mt[2]), (c) => c.charCodeAt(0));
      return new Response(bin, { headers: { 'content-type': mt[1], 'cache-control': 'private, max-age=31536000, immutable', 'x-content-type-options': 'nosniff' } });
    }
    if (p[0] === 'mesaj-kutu' && m === 'GET') {
      const r = await db.prepare("SELECT h.koc_id, h.ogrenci_id, k.id kid, k.ad, k.foto_v, (SELECT metin FROM mesajlar WHERE koc_id = h.koc_id AND ogrenci_id = h.ogrenci_id ORDER BY zaman DESC LIMIT 1) son, (SELECT zaman FROM mesajlar WHERE koc_id = h.koc_id AND ogrenci_id = h.ogrenci_id ORDER BY zaman DESC LIMIT 1) zaman, (SELECT gonderen_id FROM mesajlar WHERE koc_id = h.koc_id AND ogrenci_id = h.ogrenci_id ORDER BY zaman DESC LIMIT 1) gonderen, (SELECT COUNT(*) FROM mesajlar WHERE koc_id = h.koc_id AND ogrenci_id = h.ogrenci_id AND gonderen_id != ? AND okundu = 0) yeni FROM hoca_ogrenci h JOIN kullanicilar k ON k.id = CASE WHEN h.koc_id = ? THEN h.ogrenci_id ELSE h.koc_id END WHERE h.durum = 'aktif' AND (h.koc_id = ? OR h.ogrenci_id = ?) ORDER BY zaman DESC").bind(kim.id, kim.id, kim.id, kim.id).all();
      return json({ liste: (r.results || []).map((x) => ({ id: x.kid, ad: x.ad, foto: x.foto_v || 0, hoca: x.koc_id === x.kid, son: x.son ? String(x.son).slice(0, 120) : '', benden: x.gonderen === kim.id, zaman: x.zaman || 0, yeni: x.yeni || 0 })) });
    }
    if (p[0] === 'mesaj-ozet' && m === 'GET') {
      const r = await db.prepare('SELECT COUNT(*) n FROM mesajlar WHERE (koc_id = ? OR ogrenci_id = ?) AND gonderen_id != ? AND okundu = 0').bind(kim.id, kim.id, kim.id).first();
      return json({ okunmamis: r ? r.n : 0 });
    }
    if (p[0] === 'mesaj' && p[1]) {
      const karsi = p[1];
      const cift = await db.prepare("SELECT koc_id, ogrenci_id FROM hoca_ogrenci WHERE durum = 'aktif' AND ((koc_id = ? AND ogrenci_id = ?) OR (koc_id = ? AND ogrenci_id = ?))").bind(kim.id, karsi, karsi, kim.id).first();
      if (!cift) return hata('Yalnızca bağlı olduğun hocanla ya da öğrencinle yazışabilirsin.', 403);
      if (m === 'GET') {
        const r = await db.prepare('SELECT id, gonderen_id, metin, zaman, okundu FROM mesajlar WHERE koc_id = ? AND ogrenci_id = ? ORDER BY zaman DESC LIMIT 100').bind(cift.koc_id, cift.ogrenci_id).all();
        await db.prepare('UPDATE mesajlar SET okundu = 1 WHERE koc_id = ? AND ogrenci_id = ? AND gonderen_id != ? AND okundu = 0').bind(cift.koc_id, cift.ogrenci_id, kim.id).run();
        const k = await db.prepare('SELECT ad, foto_v FROM kullanicilar WHERE id = ?').bind(karsi).first();
        return json({ liste: (r.results || []).reverse().map((x) => ({ id: x.id, ben: x.gonderen_id === kim.id, metin: x.metin, zaman: x.zaman, okundu: !!x.okundu })), karsi: { id: karsi, ad: k ? k.ad : '', foto: k && k.foto_v || 0, hoca: cift.koc_id === karsi } });
      }
      if (m === 'POST') {
        const g = await govde(req); const metin = temiz(g && g.metin, 2000);
        if (!metin) return hata('Bir şey yaz.', 400);
        if (!(await sinir(db, R, 'mesaj:' + kim.id, 60, 3600))) return hata('Çok hızlı mesaj gönderiyorsun.', 429);
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
      const r = await db.prepare('SELECT k.id, k.kategori, k.baslik, substr(k.metin, 1, 160) ozet, k.zaman, k.son, k.cevap, k.kullanici_id, u.ad, u.vitrin, u.unvan, u.rol FROM konular k JOIN kullanicilar u ON u.id = k.kullanici_id WHERE k.gizli = 0' + (kat ? ' AND k.kategori = ?' : '') + ' ORDER BY k.son DESC LIMIT 30 OFFSET ?')
        .bind(...(kat ? [kat, sayfa * 30] : [sayfa * 30])).all();
      return json({ liste: (r.results || []).filter((x) => eng.indexOf(x.kullanici_id) < 0).map((x) => ({ id: x.id, kategori: x.kategori, baslik: x.baslik, ozet: x.ozet, zaman: x.zaman, son: x.son, cevap: x.cevap, yazar: gorunen(x.ad), yrz: rz(x), benim: x.kullanici_id === kim.id })) });
    }
    if (p[0] === 'forum' && !p[1] && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const baslik = temiz(g.baslik, 120), metin = temiz(g.metin, 4000), kat = KATEGORI.includes(g.kategori) ? g.kategori : 'genel';
      if (baslik.length < 4 || metin.length < 4) return hata('Başlık ve metin biraz daha uzun olmalı.', 400);
      if (YASAK.test(baslik + ' ' + metin)) return hata('Yazında topluluk kurallarına uymayan ifade var.', 400);
      if (!(await sinir(db, R, 'konu:' + kim.id, 3, 3600)) || !(await sinir(db, R, 'konu-g:' + kim.id, 8, 86400))) return hata('Saatte en fazla 3, günde en fazla 8 konu açabilirsin.', 429);
      const r = await db.prepare('INSERT INTO konular (kullanici_id, kategori, baslik, metin, zaman, son) VALUES (?, ?, ?, ?, ?, ?)').bind(kim.id, kat, baslik, metin, simdi, simdi).run();
      return json({ ok: true, id: r.meta.last_row_id }, 201);
    }
    if (p[0] === 'forum' && p[1]) {
      const id = parseInt(p[1], 10) || 0;
      const konu = await db.prepare('SELECT k.*, u.ad, u.vitrin, u.unvan, u.rol FROM konular k JOIN kullanicilar u ON u.id = k.kullanici_id WHERE k.id = ?').bind(id).first();
      if (!konu || (konu.gizli && !admin)) return hata('Konu bulunamadı.', 404);
      if (m === 'GET') {
        const eng = await engelliler();
        const c = await db.prepare('SELECT c.id, c.metin, c.zaman, c.kullanici_id, c.gizli, u.ad, u.vitrin, u.unvan, u.rol FROM cevaplar c JOIN kullanicilar u ON u.id = c.kullanici_id WHERE c.konu_id = ? ORDER BY c.zaman LIMIT 300').bind(id).all();
        return json({
          konu: { id: konu.id, kategori: konu.kategori, baslik: konu.baslik, metin: konu.metin, zaman: konu.zaman, yazar: gorunen(konu.ad), yrz: rz(konu), yazarId: konu.kullanici_id, benim: konu.kullanici_id === kim.id, gizli: !!konu.gizli },
          cevaplar: (c.results || []).filter((x) => (!x.gizli || admin) && eng.indexOf(x.kullanici_id) < 0).map((x) => ({ id: x.id, metin: x.metin, zaman: x.zaman, yazar: gorunen(x.ad), yrz: rz(x), yazarId: x.kullanici_id, benim: x.kullanici_id === kim.id, gizli: !!x.gizli }))
        });
      }
      if (m === 'POST') {
        const g = await govde(req); const metin = temiz(g && g.metin, 3000);
        if (metin.length < 2) return hata('Bir şey yaz.', 400);
        if (YASAK.test(metin)) return hata('Yazında topluluk kurallarına uymayan ifade var.', 400);
        if (!(await sinir(db, R, 'cevap:' + kim.id, 20, 3600))) return hata('Biraz yavaşla, saatte en fazla 20 cevap.', 429);
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
      if (!(await sinir(db, R, 'sikayet:' + kim.id, 10, 3600))) return hata('Çok fazla şikâyet.', 429);
      await db.prepare('INSERT OR IGNORE INTO sikayet (tur, hedef_id, kullanici_id, neden, zaman) VALUES (?, ?, ?, ?, ?)').bind(tur, id, kim.id, temiz(g.neden, 200), simdi).run();
      const n = await db.prepare("SELECT COUNT(DISTINCT kullanici_id) n FROM sikayet WHERE tur = ? AND hedef_id = ? AND durum = 'acik'").bind(tur, id).first();
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
      const g = await govde(req); if (!g || !Object.prototype.hasOwnProperty.call(MTUR, g.tur)) return hata('Geçersiz istek.', 400);
      const ad = temiz(g.ad, 60); const hedef = Math.max(1, Math.min(10000, parseInt(g.hedef, 10) || 0)); const gun = Math.max(3, Math.min(90, parseInt(g.gun, 10) || 30));
      if (ad.length < 3) return hata('Meydan okumaya bir ad ver.', 400);
      if (YASAK.test(ad)) return hata('Adda uygun olmayan ifade var.', 400);
      if (!(await sinir(db, R, 'meydan:' + kim.id, 3, 86400))) return hata('Günde en fazla 3 meydan okuma.', 429);
      const bas = new Date(simdi + 3 * 3600e3).toISOString().slice(0, 10); const bit = new Date(simdi + 3 * 3600e3 + (gun - 1) * 864e5).toISOString().slice(0, 10);
      let kod, id;
      for (let i = 0; i < 5 && !id; i++) { kod = kodUret(); try { const r = await db.prepare('INSERT INTO meydan (olusturan_id, ad, tur, hedef, baslangic, bitis, kod, zaman) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(kim.id, ad, g.tur, hedef, bas, bit, kod, simdi).run(); id = r.meta.last_row_id; } catch (e) { /* kod çakıştı */ } }
      await db.prepare('INSERT INTO katilim (meydan_id, kullanici_id, ilerleme, guncelleme) VALUES (?, ?, 0, ?)').bind(id, kim.id, simdi).run();
      return json({ ok: true, id, kod }, 201);
    }
    if (p[0] === 'meydan' && p[1] === 'katil' && m === 'POST') {
      if (!(await sinir(db, R, 'meydankatil:' + kim.id, 15, 3600))) return hata('Çok fazla deneme. Biraz sonra tekrar dene.', 429);
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
      const r = await db.prepare("SELECT s.tur, s.hedef_id, COUNT(*) adet, MAX(s.zaman) son, group_concat(s.neden, ' · ') nedenler, CASE s.tur WHEN 'konu' THEN (SELECT baslik || ': ' || substr(metin, 1, 200) FROM konular WHERE id = s.hedef_id) WHEN 'gonderi' THEN (SELECT 'Gönderi: ' || coalesce(metin, '') || ' ' || coalesce(veri, '') FROM gonderi WHERE id = s.hedef_id) ELSE (SELECT substr(metin, 1, 240) FROM cevaplar WHERE id = s.hedef_id) END metin, CASE s.tur WHEN 'konu' THEN (SELECT gizli FROM konular WHERE id = s.hedef_id) WHEN 'gonderi' THEN (SELECT gizli FROM gonderi WHERE id = s.hedef_id) ELSE (SELECT gizli FROM cevaplar WHERE id = s.hedef_id) END gizli FROM sikayet s WHERE s.durum = 'acik' GROUP BY s.tur, s.hedef_id ORDER BY son DESC LIMIT 100").all();
      return json({ liste: r.results || [] });
    }
    if (p[0] === 'moderasyon' && m === 'POST') {
      if (!admin) return hata('Yetkin yok.', 403);
      const g = await govde(req); const tur = g && (g.tur === 'konu' || g.tur === 'cevap' || g.tur === 'gonderi') ? g.tur : null; const id = parseInt(g && g.id, 10) || 0;
      if (!tur || !id) return hata('Geçersiz istek.', 400);
      await db.batch([
        db.prepare('UPDATE ' + (tur === 'konu' ? 'konular' : tur === 'gonderi' ? 'gonderi' : 'cevaplar') + ' SET gizli = ? WHERE id = ?').bind(g.gizli ? 1 : 0, id),
        db.prepare("UPDATE sikayet SET durum = 'kapali' WHERE tur = ? AND hedef_id = ?").bind(tur, id)
      ]);
      return json({ ok: true });
    }
    return hata('Bulunamadı.', 404);
  } catch (e) {
    return hata('Sunucuda bir sorun oluştu.', 500);
  }
}

// sınıra takılınca istemciye ne kadar sonra yenileneceğini bildir (uygulama bilgilendirme kartı gösterir)
export async function onRequest(ctx) {
  const R = {};
  const yanit = await onRequestIc(ctx, R);
  if (yanit.status !== 429 || !R.s) return yanit;
  let g = {}; try { g = await yanit.clone().json(); } catch (e) { /* boş */ }
  return new Response(JSON.stringify(Object.assign(g, { sinir: R.s })), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(Math.max(1, Math.ceil((R.s.yenilenme - Date.now()) / 1000))) } });
}
