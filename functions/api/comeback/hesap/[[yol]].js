// COMEBACK. — hesap ve veri eşitleme
//   POST /api/comeback/hesap/basvuru { ad, eposta, sifre, yetiskin, riza, saglikRiza, kaynak, json } → beta başvurusu (hesap + profil; onaylanınca giriş)
//   POST /api/comeback/hesap/kayit   { ad, eposta, sifre, yetiskin, riza, saglikRiza }
//   POST /api/comeback/hesap/sil     { sifre }  → hesap ve bütün kayıtlar kalıcı silinir
//   POST /api/comeback/hesap/gorus   { tur, metin, ekran }  (girişsiz de olur)
//   POST /api/comeback/hesap/bekleme { ad, eposta, hedef, kaynak }  → kapalı beta bekleme listesi
//   POST /api/comeback/hesap/hata    { mesaj, yer, ekran, surum }  → istemci hata kaydı
//   Yönetim (rol admin): GET yonetim/ozet · GET yonetim/bekleme · POST yonetim/onay { eposta, durum } · GET yonetim/gorusler · GET yonetim/hatalar
//   POST /api/comeback/hesap/giris   { eposta, sifre }
//   POST /api/comeback/hesap/cikis
//   GET  /api/comeback/hesap/ben     → { kullanici }  (kadi = kullanıcı adı)
//   POST /api/comeback/hesap/kullanici-adi { ad } → { kadi }
//   GET  /api/comeback/hesap/veri    → { json, guncelleme }
//   PUT  /api/comeback/hesap/veri    { json, guncelleme }
// Veritabanı: D1 bağlaması COMEBACK_DB (tablolar: kullanicilar, oturumlar, veriler, giris_deneme)
// Şifreler PBKDF2-SHA256 (100.000 tur, kullanıcıya özel tuz); oturum çerezi HttpOnly, veritabanında yalnızca özeti tutulur.

const CEREZ = 'cb_oturum';
const OTURUM_SN = 60 * 60 * 24 * 30;
const TUR = 100000;

const json = (veri, durum = 200, ek = {}) => new Response(JSON.stringify(veri), {
  status: durum, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, ek)
});
const hata = (m, d) => json({ hata: m }, d);

const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const rastgele = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; };
const b64url = (a) => btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ozet = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function sifreHash(sifre, tuzHex) {
  const tuz = new Uint8Array(tuzHex.match(/../g).map((h) => parseInt(h, 16)));
  const anahtar = await crypto.subtle.importKey('raw', enc.encode(sifre), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: tuz, iterations: TUR }, anahtar, 256));
}
function esit(a, b) { // sabit süreli karşılaştırma
  if (a.length !== b.length) return false;
  let f = 0; for (let i = 0; i < a.length; i++) f |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return f === 0;
}
function cerezOku(req) {
  const c = req.headers.get('cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + CEREZ + '=([A-Za-z0-9_-]+)'));
  return m ? m[1] : null;
}
const cerezYaz = (token, sn) => CEREZ + '=' + token + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=' + sn;

async function oturumAc(db, kullaniciId) {
  const token = b64url(rastgele(32));
  const simdi = Date.now();
  await db.prepare('INSERT INTO oturumlar (token_hash, kullanici_id, bitis, olusturma) VALUES (?, ?, ?, ?)')
    .bind(await ozet(token), kullaniciId, simdi + OTURUM_SN * 1000, simdi).run();
  return token;
}
async function kimDir(db, req) {
  const token = cerezOku(req); if (!token) return null;
  const s = await db.prepare('SELECT k.id, k.ad, k.eposta, k.rol, k.kullanici_adi, k.foto_v, o.bitis FROM oturumlar o JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.token_hash = ?')
    .bind(await ozet(token)).first();
  if (!s || s.bitis < Date.now()) return null;
  return { id: s.id, ad: s.ad, eposta: s.eposta, rol: s.rol, kadi: s.kullanici_adi || null, foto: s.foto_v || 0 };
}
// basit sınır: anahtar başına pencere içinde en fazla n deneme
async function sinir(db, anahtar, n, pencereSn) {
  const simdi = Date.now();
  const r = await db.prepare('SELECT sayi, bitis FROM giris_deneme WHERE anahtar = ?').bind(anahtar).first();
  if (r && r.bitis > simdi && r.sayi >= n) return false;
  if (!r || r.bitis <= simdi) await db.prepare('INSERT OR REPLACE INTO giris_deneme (anahtar, sayi, bitis) VALUES (?, 1, ?)').bind(anahtar, simdi + pencereSn * 1000).run();
  else await db.prepare('UPDATE giris_deneme SET sayi = sayi + 1 WHERE anahtar = ?').bind(anahtar).run();
  return true;
}
async function govde(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) return null;
  try { return await req.json(); } catch (e) { return null; }
}
const OLAYLAR = new Set(['antrenman_bitti', 'ogun_foto', 'ogun_barkod', 'ogun_liste', 'ogun_elle', 'koc_mesaj', 'program_ozel', 'program_yorum', 'kurulum', 'su', 'paylas', 'off_gun', 'program_paylas', 'program_al', 'program_kur', 'antrenman_his', 'takviye', 'siralama', 'jam', 'bplan', 'gun_degis', 'haftaplan']);
const EPOSTA = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB;
  if (!db) return hata('Hesap sistemi şu an kapalı.', 503);
  const yol = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean).join('/');
  const ip = req.headers.get('cf-connecting-ip') || 'yok';
  const m = req.method;

  try {
    // Beta başvurusu: hesap + profil tek seferde. Onay gelene kadar rol 'aday' (giriş yapamaz); onaylanınca aynı şifreyle girer, profili hazırdır.
    if (yol === 'basvuru' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const ad = String(g.ad || '').trim().replace(/[<>]/g, '').slice(0, 40);
      const eposta = String(g.eposta || '').trim().toLowerCase();
      const sifre = String(g.sifre || '');
      const kisa = (v, n) => String(v || '').trim().replace(/[<>]/g, '').slice(0, n);
      if (ad.length < 2) return hata('Adını yaz.', 400);
      if (!EPOSTA.test(eposta)) return hata('Geçerli bir e-posta adresi yaz.', 400);
      if (sifre.length < 8 || sifre.length > 200) return hata('Şifre en az 8 karakter olmalı.', 400);
      if (g.yetiskin !== true) return hata('COMEBACK. 18 yaş ve üstü içindir.', 400);
      if (g.riza !== true) return hata('Verilerinin hesabında saklanmasına onay vermelisin.', 400);
      if (g.saglikRiza !== true) return hata('Sağlık verilerin için açık rıza vermelisin.', 400);
      if (typeof g.json !== 'string' || g.json.length > 200000) return hata('Profil bilgilerin eksik.', 400);
      let st; try { st = JSON.parse(g.json); } catch (e) { return hata('Profil bilgilerin eksik.', 400); }
      if (!st || !st.profil || !st.program) return hata('Profil bilgilerin eksik.', 400);
      if (!(await sinir(db, 'basvuru:' + ip, 8, 3600))) return hata('Çok fazla deneme yapıldı. Bir saat sonra tekrar dene.', 429);
      const var_ = await db.prepare('SELECT id, rol FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
      if (var_) return hata(var_.rol === 'aday' ? 'Bu e-postayla başvurun zaten alındı. Onaylanınca giriş yapabilirsin.' : 'Bu e-postayla zaten bir hesap var. Giriş yap.', 409);
      const simdi = Date.now();
      await db.prepare('INSERT OR IGNORE INTO bekleme (eposta, ad, hedef, kaynak, durum, zaman) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(eposta, ad, kisa(st.profil.hedef, 40), kisa(g.kaynak, 60), 'bekliyor', simdi).run();
      await db.prepare('UPDATE bekleme SET ad = ?, kaynak = COALESCE(NULLIF(?, \'\'), kaynak) WHERE eposta = ?').bind(ad, kisa(g.kaynak, 60), eposta).run();
      const b = await db.prepare('SELECT durum FROM bekleme WHERE eposta = ?').bind(eposta).first();
      if (b && b.durum === 'reddedildi') return hata('Bu e-postayla yapılan başvuru şu an onaylanmadı.', 403);
      const onayli = b && b.durum === 'onayli';
      const id = crypto.randomUUID(); const tuz = hex(rastgele(16));
      await db.batch([
        db.prepare('INSERT INTO kullanicilar (id, eposta, ad, sifre_hash, tuz, rol, onay_zamani, saglik_onay, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(id, eposta, ad, await sifreHash(sifre, tuz), tuz, onayli ? 'uye' : 'aday', simdi, simdi, simdi),
        db.prepare('INSERT INTO veriler (kullanici_id, json, guncelleme) VALUES (?, ?, ?)').bind(id, g.json, simdi)
      ]);
      if (!onayli) return json({ ok: true, durum: 'bekliyor' }, 201);
      const token = await oturumAc(db, id);
      return json({ ok: true, durum: 'onayli', kullanici: { id, ad, eposta, rol: 'uye' } }, 201, { 'set-cookie': cerezYaz(token, OTURUM_SN) });
    }

    if (yol === 'kayit' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const ad = String(g.ad || '').trim().replace(/[<>]/g, '').slice(0, 40);
      const eposta = String(g.eposta || '').trim().toLowerCase();
      const sifre = String(g.sifre || '');
      if (ad.length < 2) return hata('Adını yaz.', 400);
      if (!EPOSTA.test(eposta)) return hata('Geçerli bir e-posta adresi yaz.', 400);
      if (sifre.length < 8 || sifre.length > 200) return hata('Şifre en az 8 karakter olmalı.', 400);
      if (g.yetiskin !== true) return hata('COMEBACK. 18 yaş ve üstü içindir.', 400);
      if (g.riza !== true) return hata('Verilerinin hesabında saklanmasına onay vermelisin.', 400);
      if (g.saglikRiza !== true) return hata('Sağlık verilerin için açık rıza vermelisin.', 400);
      if (!(await sinir(db, 'kayit:' + ip, 10, 3600))) return hata('Çok fazla deneme yapıldı. Bir saat sonra tekrar dene.', 429);
      const beta = await db.prepare('SELECT durum FROM bekleme WHERE eposta = ?').bind(eposta).first();
      if (!beta || beta.durum !== 'onayli') return json({ hata: beta ? 'Beta başvurun alındı, onaylanınca kayıt olabileceksin.' : 'COMEBACK. şu an kapalı betada. Önce bekleme listesine katıl.', beta: beta ? 'bekliyor' : 'yok' }, 403);
      const var_ = await db.prepare('SELECT id FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
      if (var_) return hata('Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.', 409);
      const id = crypto.randomUUID(); const tuz = hex(rastgele(16)); const simdi = Date.now();
      await db.prepare('INSERT INTO kullanicilar (id, eposta, ad, sifre_hash, tuz, rol, onay_zamani, saglik_onay, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, eposta, ad, await sifreHash(sifre, tuz), tuz, 'uye', simdi, simdi, simdi).run();
      const token = await oturumAc(db, id);
      return json({ kullanici: { id, ad, eposta, rol: 'uye' } }, 201, { 'set-cookie': cerezYaz(token, OTURUM_SN) });
    }

    if (yol === 'giris' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const eposta = String(g.eposta || '').trim().toLowerCase(); const sifre = String(g.sifre || '');
      if (!(await sinir(db, 'giris:' + ip, 10, 900))) return hata('Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT id, ad, eposta, rol, kullanici_adi, sifre_hash, tuz FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
      if (!k || !esit(await sifreHash(sifre, k.tuz), k.sifre_hash)) return hata('E-posta ya da şifre hatalı.', 401);
      if (k.rol === 'aday') {
        const b = await db.prepare('SELECT durum FROM bekleme WHERE eposta = ?').bind(eposta).first();
        if (!b || b.durum !== 'onayli') return json({ hata: b && b.durum === 'reddedildi' ? 'Başvurun şu an onaylanmadı.' : 'Başvurun inceleniyor. Onaylanınca bu e-posta ve şifreyle giriş yapabileceksin.', beta: 'bekliyor' }, 403);
        await db.prepare("UPDATE kullanicilar SET rol = 'uye' WHERE id = ? AND rol = 'aday'").bind(k.id).run(); k.rol = 'uye';
      }
      await db.prepare('DELETE FROM giris_deneme WHERE anahtar = ?').bind('giris:' + ip).run();
      await db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ? AND bitis < ?').bind(k.id, Date.now()).run();
      const token = await oturumAc(db, k.id);
      return json({ kullanici: { id: k.id, ad: k.ad, eposta: k.eposta, rol: k.rol, kadi: k.kullanici_adi || null } }, 200, { 'set-cookie': cerezYaz(token, OTURUM_SN) });
    }

    if (yol === 'cikis' && m === 'POST') {
      const token = cerezOku(req);
      if (token) await db.prepare('DELETE FROM oturumlar WHERE token_hash = ?').bind(await ozet(token)).run();
      return json({ ok: true }, 200, { 'set-cookie': cerezYaz('', 0) });
    }

    if (yol === 'bekleme' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const eposta = String(g.eposta || '').trim().toLowerCase();
      if (!EPOSTA.test(eposta)) return hata('Geçerli bir e-posta adresi yaz.', 400);
      if (!(await sinir(db, 'bekleme:' + ip, 10, 3600))) return hata('Çok fazla deneme yapıldı. Biraz sonra tekrar dene.', 429);
      const kisa = (v, n) => String(v || '').trim().replace(/[<>]/g, '').slice(0, n);
      await db.prepare('INSERT OR IGNORE INTO bekleme (eposta, ad, hedef, kaynak, durum, zaman) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(eposta, kisa(g.ad, 40), kisa(g.hedef, 40), kisa(g.kaynak, 60), 'bekliyor', Date.now()).run();
      const r = await db.prepare('SELECT durum FROM bekleme WHERE eposta = ?').bind(eposta).first();
      return json({ ok: true, durum: r ? r.durum : 'bekliyor' }, 201);
    }

    const kim = await kimDir(db, req);

    if (yol === 'olay' && m === 'POST') {
      // kişisel veri olmadan günlük özellik sayaçları
      const g = await govde(req); const olay = String((g && g.olay) || '');
      if (!/^[a-z_]{2,30}$/.test(olay) || !OLAYLAR.has(olay)) return hata('Geçersiz.', 400);
      if (!(await sinir(db, 'olay:' + (kim ? kim.id : ip), 200, 3600))) return json({ ok: true });
      await db.prepare('INSERT INTO sayac (gun, olay, adet) VALUES (?, ?, 1) ON CONFLICT(gun, olay) DO UPDATE SET adet = adet + 1').bind(new Date().toISOString().slice(0, 10), olay).run();
      return json({ ok: true });
    }

    if (yol === 'hata' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      if (!(await sinir(db, 'hata:' + (kim ? kim.id : ip), 30, 3600))) return json({ ok: true });
      const k = (v, n) => String(v || '').slice(0, n);
      await db.prepare('INSERT INTO hatalar (kullanici_id, mesaj, yer, ekran, surum, cihaz, zaman) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(kim ? kim.id : null, k(g.mesaj, 500), k(g.yer, 300), k(g.ekran, 60), k(g.surum, 20), k(req.headers.get('user-agent'), 200), Date.now()).run();
      return json({ ok: true }, 201);
    }

    if (yol.startsWith('yonetim/')) {
      if (!kim || kim.rol !== 'admin') return hata('Yetkin yok.', 403);
      const alt = yol.slice(8);
      const hafta = Date.now() - 7 * 864e5;
      if (alt === 'ozet' && m === 'GET') {
        const say = async (sql, ...b) => ((await db.prepare(sql).bind(...b).first()) || {}).n || 0;
        return json({
          kullanici: await say("SELECT COUNT(*) n FROM kullanicilar WHERE rol != 'aday'"),
          yeniKullanici: await say("SELECT COUNT(*) n FROM kullanicilar WHERE rol != 'aday' AND olusturma > ?", hafta),
          aktif: await say('SELECT COUNT(*) n FROM veriler WHERE guncelleme > ?', hafta),
          bekleyen: await say("SELECT COUNT(*) n FROM bekleme WHERE durum = 'bekliyor'"),
          onayli: await say("SELECT COUNT(*) n FROM bekleme WHERE durum = 'onayli'"),
          gorus: await say('SELECT COUNT(*) n FROM gorusler WHERE zaman > ?', hafta),
          hata: await say('SELECT COUNT(*) n FROM hatalar WHERE zaman > ?', hafta),
          // ikinci hafta dönüşü: 7–28 gün önce kayıt olanlardan, kayıttan 7 gün sonra hâlâ veri yazanlar
          donusAday: await say('SELECT COUNT(*) n FROM kullanicilar WHERE olusturma < ? AND olusturma > ?', hafta, Date.now() - 28 * 864e5),
          donus: await say('SELECT COUNT(*) n FROM kullanicilar k JOIN veriler v ON v.kullanici_id = k.id WHERE k.olusturma < ? AND k.olusturma > ? AND v.guncelleme > k.olusturma + 7 * 86400000', hafta, Date.now() - 28 * 864e5),
          olaylar: ((await db.prepare('SELECT olay, SUM(adet) adet FROM sayac WHERE gun >= ? GROUP BY olay ORDER BY adet DESC').bind(new Date(hafta).toISOString().slice(0, 10)).all()).results || []),
          aiOy: ((await db.prepare('SELECT tur, SUM(CASE WHEN oy > 0 THEN 1 ELSE 0 END) iyi, SUM(CASE WHEN oy < 0 THEN 1 ELSE 0 END) kotu FROM ai_oy WHERE zaman > ? GROUP BY tur').bind(Date.now() - 30 * 864e5).all()).results || []),
          aiKotu: ((await db.prepare('SELECT tur, ornek, zaman FROM ai_oy WHERE oy < 0 AND zaman > ? ORDER BY zaman DESC LIMIT 15').bind(Date.now() - 30 * 864e5).all()).results || [])
        });
      }
      if (alt === 'yedek' && m === 'GET') {
        // yönetici için tam dışa aktarma (şifre özetleri ve oturumlar hariç)
        const t = async (sql) => (await db.prepare(sql).all()).results || [];
        const veri = {
          zaman: new Date().toISOString(),
          kullanicilar: await t('SELECT id, eposta, ad, rol, onay_zamani, saglik_onay, olusturma FROM kullanicilar'),
          veriler: await t('SELECT kullanici_id, json, guncelleme FROM veriler'),
          bekleme: await t('SELECT * FROM bekleme'), gorusler: await t('SELECT * FROM gorusler'), sayac: await t('SELECT * FROM sayac'),
          sablonlar: await t('SELECT * FROM sablonlar')
        };
        return new Response(JSON.stringify(veri), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'content-disposition': 'attachment; filename="comeback-yedek-' + veri.zaman.slice(0, 10) + '.json"' } });
      }
      if (alt === 'bekleme' && m === 'GET') {
        const r = await db.prepare('SELECT b.eposta, b.ad, b.hedef, b.kaynak, b.durum, b.zaman, b.onay_zamani, (SELECT CASE WHEN k.rol = \'aday\' THEN 2 ELSE 1 END FROM kullanicilar k WHERE k.eposta = b.eposta) kayitli FROM bekleme b ORDER BY CASE b.durum WHEN \'bekliyor\' THEN 0 ELSE 1 END, b.zaman DESC LIMIT 500').all();
        return json({ liste: r.results || [] });
      }
      if (alt === 'onay' && m === 'POST') {
        const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
        const eposta = String(g.eposta || '').trim().toLowerCase();
        const durum = ['onayli', 'bekliyor', 'reddedildi'].includes(g.durum) ? g.durum : null;
        if (!EPOSTA.test(eposta) || !durum) return hata('Geçersiz istek.', 400);
        await db.prepare('INSERT INTO bekleme (eposta, durum, zaman, onay_zamani) VALUES (?, ?, ?, ?) ON CONFLICT(eposta) DO UPDATE SET durum = excluded.durum, onay_zamani = excluded.onay_zamani')
          .bind(eposta, durum, Date.now(), durum === 'onayli' ? Date.now() : null).run();
        if (durum === 'onayli') await db.prepare("UPDATE kullanicilar SET rol = 'uye' WHERE eposta = ? AND rol = 'aday'").bind(eposta).run();
        return json({ ok: true });
      }
      if (alt === 'rol' && m === 'POST') {
        const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
        const eposta = String(g.eposta || '').trim().toLowerCase(); const rol = g.rol === 'koc' ? 'koc' : 'uye';
        const k = await db.prepare('SELECT id, rol FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
        if (!k) return hata('Bu e-postayla hesap yok. Önce hesap açmalı.', 404);
        if (k.rol === 'admin') return hata('Yönetici rolü değiştirilemez.', 400);
        await db.prepare('UPDATE kullanicilar SET rol = ? WHERE id = ?').bind(rol, k.id).run();
        return json({ ok: true, rol });
      }
      // Demo hesabı: Google Play / App Store incelemesi ya da yardım alınan geliştiriciler için. Şifreyi yönetici belirler.
      if (alt === 'demo' && m === 'GET') {
        const r = await db.prepare("SELECT k.ad, k.eposta, k.olusturma, (SELECT guncelleme FROM veriler v WHERE v.kullanici_id = k.id) son FROM kullanicilar k WHERE k.rol = 'demo' ORDER BY k.olusturma DESC").all();
        return json({ liste: r.results || [] });
      }
      if (alt === 'demo' && m === 'POST') {
        const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
        const eposta = String(g.eposta || '').trim().toLowerCase(); const sifre = String(g.sifre || '');
        const ad = String(g.ad || 'Demo Kullanıcı').trim().replace(/[<>]/g, '').slice(0, 40) || 'Demo Kullanıcı';
        if (!EPOSTA.test(eposta)) return hata('Geçerli bir e-posta yaz.', 400);
        const k = await db.prepare('SELECT id, rol FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
        if (k && k.rol !== 'demo') return hata('Bu e-posta gerçek bir hesaba ait; demo yapılamaz.', 409);
        if (g.sifirla && k) { await db.prepare('DELETE FROM veriler WHERE kullanici_id = ?').bind(k.id).run(); return json({ ok: true, sifirlandi: true }); }
        if (g.sil && k) {
          await db.batch([db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ?').bind(k.id), db.prepare('DELETE FROM veriler WHERE kullanici_id = ?').bind(k.id), db.prepare('DELETE FROM kullanicilar WHERE id = ?').bind(k.id)]);
          return json({ ok: true, silindi: true });
        }
        if (sifre.length < 8 || sifre.length > 200) return hata('Şifre en az 8 karakter olmalı.', 400);
        const tuz = hex(rastgele(16)); const simdi = Date.now(); const hs = await sifreHash(sifre, tuz);
        if (k) await db.prepare('UPDATE kullanicilar SET sifre_hash = ?, tuz = ?, ad = ? WHERE id = ?').bind(hs, tuz, ad, k.id).run();
        else await db.prepare('INSERT INTO kullanicilar (id, eposta, ad, sifre_hash, tuz, rol, onay_zamani, saglik_onay, olusturma) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), eposta, ad, hs, tuz, 'demo', simdi, simdi, simdi).run();
        return json({ ok: true, yeni: !k });
      }
      if (alt === 'hocalar' && m === 'GET') {
        const r = await db.prepare("SELECT k.ad, k.eposta, (SELECT COUNT(*) FROM hoca_ogrenci ho WHERE ho.koc_id = k.id AND ho.durum = 'aktif') ogrenci FROM kullanicilar k WHERE k.rol = 'koc' ORDER BY k.ad").all();
        return json({ liste: r.results || [] });
      }
      if (alt === 'gorusler' && m === 'GET') {
        const r = await db.prepare('SELECT g.id, g.tur, g.metin, g.ekran, g.zaman, k.ad, k.eposta FROM gorusler g LEFT JOIN kullanicilar k ON k.id = g.kullanici_id ORDER BY g.zaman DESC LIMIT 200').all();
        return json({ liste: r.results || [] });
      }
      if (alt === 'hatalar' && m === 'GET') {
        const r = await db.prepare('SELECT mesaj, yer, ekran, surum, COUNT(*) adet, MAX(zaman) son, COUNT(DISTINCT kullanici_id) kisi FROM hatalar GROUP BY mesaj, yer ORDER BY son DESC LIMIT 100').all();
        return json({ liste: r.results || [] });
      }
      return hata('Bulunamadı.', 404);
    }

    // yapay zekâ cevabına oy: yararlı (+1) / değil (-1); örnek olarak yalnızca cevabın başı saklanır
    if (yol === 'ai-oy' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const tur = String(g.tur || ''); if (['koc', 'yorum', 'yemek', 'foto', 'kur', 'bplan'].indexOf(tur) < 0) return hata('Geçersiz.', 400);
      if (!(await sinir(db, 'aioy:' + kim.id, 80, 3600))) return hata('Çok fazla oy.', 429);
      await db.prepare('INSERT INTO ai_oy (kullanici_id, tur, oy, ornek, zaman) VALUES (?, ?, ?, ?, ?)').bind(kim.id, tur, Number(g.oy) > 0 ? 1 : -1, String(g.ornek || '').replace(/[<>]/g, '').slice(0, 300), Date.now()).run();
      return json({ ok: true });
    }

    if (yol === 'gorus' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const metin = String(g.metin || '').trim().slice(0, 2000);
      if (metin.length < 3) return hata('Birkaç kelime yaz.', 400);
      const tur = ['oneri', 'hata', 'begeni', 'diger'].includes(g.tur) ? g.tur : 'diger';
      if (!(await sinir(db, 'gorus:' + (kim ? kim.id : ip), 20, 3600))) return hata('Çok fazla mesaj gönderildi. Biraz sonra tekrar dene.', 429);
      await db.prepare('INSERT INTO gorusler (kullanici_id, tur, metin, ekran, cihaz, zaman) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(kim ? kim.id : null, tur, metin, String(g.ekran || '').slice(0, 60), String(req.headers.get('user-agent') || '').slice(0, 200), Date.now()).run();
      return json({ ok: true }, 201);
    }

    if (yol === 'ben' && m === 'GET') return kim ? json({ kullanici: kim }) : hata('Giriş yapılmamış.', 401);
    if (!kim) return hata('Giriş yapılmamış.', 401);

    // Profil resmi: istemci 192×192 JPEG'e küçültüp data URL olarak yollar
    if (yol === 'foto' && m === 'POST') {
      const g = await govde(req); const f = String(g && g.foto || '');
      if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f) || f.length > 60000) return hata('Resim okunamadı ya da çok büyük.', 400);
      if (!(await sinir(db, 'foto:' + kim.id, 20, 3600))) return hata('Çok sık değiştirdin. Biraz sonra tekrar dene.', 429);
      const v = Date.now();
      await db.prepare('UPDATE kullanicilar SET foto = ?, foto_v = ? WHERE id = ?').bind(f, v, kim.id).run();
      return json({ foto: v });
    }
    if (yol === 'foto' && m === 'DELETE') {
      await db.prepare('UPDATE kullanicilar SET foto = NULL, foto_v = 0 WHERE id = ?').bind(kim.id).run();
      return json({ foto: 0 });
    }
    if (yol === 'kullanici-adi' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const ad = String(g.ad || '').trim().replace(/^@/, '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');
      if (!/^[a-z0-9_.]{3,20}$/.test(ad) || /^[._]|[._]$/.test(ad)) return hata('Kullanıcı adı 3–20 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanabilirsin.', 400);
      if (['admin', 'comeback', 'destek', 'yonetim', 'hoca', 'koc', 'resmi', 'official'].indexOf(ad) >= 0) return hata('Bu kullanıcı adı ayrılmış, başka bir tane dene.', 409);
      if (!(await sinir(db, 'kadi:' + kim.id, 10, 3600))) return hata('Çok fazla deneme. Biraz sonra tekrar dene.', 429);
      const var_ = await db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ? AND id != ?').bind(ad, kim.id).first();
      if (var_) return hata('Bu kullanıcı adı alınmış.', 409);
      await db.prepare('UPDATE kullanicilar SET kullanici_adi = ? WHERE id = ?').bind(ad, kim.id).run();
      return json({ kadi: ad });
    }

    if (yol === 'sil' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      if (!(await sinir(db, 'sil:' + kim.id, 5, 900))) return hata('Çok fazla deneme. 15 dakika sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT sifre_hash, tuz FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      if (!k || !esit(await sifreHash(String(g.sifre || ''), k.tuz), k.sifre_hash)) return hata('Şifre hatalı.', 401);
      await db.batch([
        db.prepare('DELETE FROM veriler WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('DELETE FROM paylasim WHERE gonderen_id = ? OR alici_id = ?').bind(kim.id, kim.id),
        db.prepare('DELETE FROM skor WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('UPDATE ai_oy SET kullanici_id = NULL WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('DELETE FROM jam_uye WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('UPDATE gorusler SET kullanici_id = NULL WHERE kullanici_id = ?').bind(kim.id),
        db.prepare('DELETE FROM kullanicilar WHERE id = ?').bind(kim.id)
      ]);
      return json({ ok: true }, 200, { 'set-cookie': cerezYaz('', 0) });
    }

    if (yol === 'veri' && m === 'GET') {
      const v = await db.prepare('SELECT json, guncelleme FROM veriler WHERE kullanici_id = ?').bind(kim.id).first();
      return json(v ? { json: v.json, guncelleme: v.guncelleme } : { json: null, guncelleme: 0 });
    }
    if (yol === 'veri' && m === 'PUT') {
      const g = await govde(req); if (!g || typeof g.json !== 'string') return hata('Geçersiz istek.', 400);
      if (g.json.length > 500000) return hata('Veri çok büyük.', 413);
      try { JSON.parse(g.json); } catch (e) { return hata('Geçersiz veri.', 400); }
      const zaman = Math.min(Number(g.guncelleme) || Date.now(), Date.now() + 60000);
      await db.prepare('INSERT INTO veriler (kullanici_id, json, guncelleme) VALUES (?, ?, ?) ON CONFLICT(kullanici_id) DO UPDATE SET json = excluded.json, guncelleme = excluded.guncelleme')
        .bind(kim.id, g.json, zaman).run();
      return json({ ok: true, guncelleme: zaman });
    }
    return hata('Bulunamadı.', 404);
  } catch (e) {
    return hata('Sunucuda bir sorun oluştu. Biraz sonra tekrar dene.', 500);
  }
}
