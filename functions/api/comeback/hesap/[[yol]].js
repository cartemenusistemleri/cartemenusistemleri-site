// COMEBACK. — hesap ve veri eşitleme
import { gmailGonder } from '../../eposta.js';
//   POST /api/comeback/hesap/basvuru { ad, eposta, sifre, yetiskin, riza, saglikRiza, kaynak, json } → beta başvurusu (hesap + profil; onaylanınca giriş)
//   POST /api/comeback/hesap/kayit   { ad, eposta, sifre, yetiskin, riza, saglikRiza }
//   POST /api/comeback/hesap/sil     { sifre }  → hesap ve bütün kayıtlar kalıcı silinir
//   POST /api/comeback/hesap/gorus   { tur, metin, ekran }  (girişsiz de olur)
//   POST /api/comeback/hesap/bekleme { ad, eposta, hedef, kaynak }  → kapalı beta bekleme listesi
//   POST /api/comeback/hesap/hata    { mesaj, yer, ekran, surum }  → istemci hata kaydı
//   Yönetim (rol admin): GET yonetim/ozet · GET yonetim/bekleme · POST yonetim/onay { eposta, durum } · GET yonetim/gorusler · GET yonetim/hatalar
//   POST /api/comeback/hesap/giris   { eposta, sifre }
//   POST /api/comeback/hesap/cikis
//   POST /api/comeback/hesap/sifre-unuttum { eposta }        → (hesap varsa) 30 dk geçerli tek kullanımlık bağlantı e-postayla gider; cevap hep aynı
//   POST /api/comeback/hesap/sifre-yenile  { token, sifre }  → şifre değişir, bütün oturumlar kapanır, yeni oturum açılır
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
// tek ifadede artır-ve-oku: aynı anda gelen istekler sınırı aşamaz
async function sinir(db, R, anahtar, n, pencereSn) {
  const simdi = Date.now();
  const r = await db.prepare('INSERT INTO giris_deneme (anahtar, sayi, bitis) VALUES (?1, 1, ?2) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN bitis <= ?3 THEN 1 ELSE sayi + 1 END, bitis = CASE WHEN bitis <= ?3 THEN ?2 ELSE bitis END RETURNING sayi')
    .bind(anahtar, simdi + pencereSn * 1000, simdi).first();
  const ok = !!r && r.sayi <= n;
  if (!ok && R) { const b = await db.prepare('SELECT bitis FROM giris_deneme WHERE anahtar = ?').bind(anahtar).first(); R.s = { limit: n, pencere: pencereSn, yenilenme: b ? b.bitis : simdi }; }
  return ok;
}
// başka siteden gelen çerezli yazma isteklerini reddet (SameSite'a ek savunma)
function yabanciKaynak(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  const o = req.headers.get('origin'); if (!o) return false;
  try { return new URL(o).host !== new URL(req.url).host; } catch (e) { return true; }
}
async function govde(req) {
  if ((req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return null;
  try { return await req.json(); } catch (e) { return null; }
}
// Bir kullanıcıya ait BÜTÜN kişisel kayıtları silen adımlar (hesap silme + demo silme aynı listeyi kullanır).
// Aydınlatma metnindeki "bütün kayıtların kalıcı olarak silinir" sözünü karşılar; geride yetim satır bırakmaz.
// gorusler ve ai_oy isimsizleştirilir (geliştirme için saklanır), gerisi tamamen silinir.
function hesapSilAdimlari(db, id) {
  return [
    db.prepare('DELETE FROM bekleme WHERE eposta = (SELECT eposta FROM kullanicilar WHERE id = ?)').bind(id),
    db.prepare('DELETE FROM uyelik WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM veriler WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM paylasim WHERE gonderen_id = ? OR alici_id = ?').bind(id, id),
    db.prepare('DELETE FROM skor WHERE kullanici_id = ?').bind(id),
    db.prepare('UPDATE ai_oy SET kullanici_id = NULL WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM jam_uye WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM mesajlar WHERE koc_id = ? OR ogrenci_id = ?').bind(id, id),
    db.prepare('DELETE FROM hoca_ogrenci WHERE koc_id = ? OR ogrenci_id = ?').bind(id, id),
    db.prepare('DELETE FROM hoca_kod WHERE koc_id = ?').bind(id),
    db.prepare('DELETE FROM atanan WHERE koc_id = ? OR ogrenci_id = ?').bind(id, id),
    db.prepare('DELETE FROM cevaplar WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM cevaplar WHERE konu_id IN (SELECT id FROM konular WHERE kullanici_id = ?)').bind(id),
    db.prepare('DELETE FROM konular WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM katilim WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM engel WHERE kullanici_id = ? OR engellenen_id = ?').bind(id, id),
    db.prepare('DELETE FROM sikayet WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM sablonlar WHERE koc_id = ?').bind(id),
    db.prepare('UPDATE gorusler SET kullanici_id = NULL WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM sifre_sifirla WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM hatirlat WHERE kullanici_id = ?').bind(id),
    db.prepare('DELETE FROM kullanicilar WHERE id = ?').bind(id)
  ];
}
/* ---------- üyelik: askı, mazeret, Comeback ----------
   30 gün antrenman kaydı yoksa üyelik askıya alınır (veri durur; yapay zekâ ve topluluk kapanır).
   Ara vermeden önce mazeret: yılda en çok 2 kez, her biri en çok 14 gün; süre askı tarihine eklenir.
   Askıdan dönüş: Comeback'e başla, 7 gün içinde 2 antrenman yap, her şey açılır. Yönetici, koç ve demo muaf. */
const ASKI_GUN = 30, UYARI_GUN = 7, MAZERET_MAKS = 14, MAZERET_YIL = 2, CB_HEDEF = 2, CB_PENCERE = 7;
const MAZERET_TUR = { sakatlik: 'Sakatlık', hastalik: 'Hastalık', tatil: 'Tatil / seyahat', yogunluk: 'Sınav ya da iş yoğunluğu', diger: 'Başka bir neden' };
const MUAF = new Set(['admin', 'koc', 'demo']);
const bugunTR = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const gunEkle = (t, n) => new Date(Date.parse(t + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const gunFark = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const jsonOku = (s, v) => { try { const o = JSON.parse(s); return o == null ? v : o; } catch (e) { return v; } };
let uyelikHazir = false;
async function uyelikTablo(db) {
  if (uyelikHazir) return;
  await db.prepare('CREATE TABLE IF NOT EXISTS uyelik (kullanici_id TEXT PRIMARY KEY, son TEXT, tarihler TEXT, uzatma INTEGER NOT NULL DEFAULT 0, mazeret_bitis TEXT, mazeret_tur TEXT, mazeretler TEXT, askida TEXT, cb_bas TEXT, cb_soz INTEGER, guncelleme INTEGER)').run();
  uyelikHazir = true;
}
const HOSGELDIN_GUN = 14;
function uyelikDurum(u, bugun) {
  const tarihler = jsonOku(u.tarihler, []);
  const mazeretler = jsonOku(u.mazeretler, []);
  const yil = bugun.slice(0, 4);
  const o = { durum: 'aktif', son: u.son, sonTarih: gunEkle(u.son, ASKI_GUN + (u.uzatma || 0)), mazeretHak: Math.max(0, MAZERET_YIL - mazeretler.filter((x) => String(x.bas || '').slice(0, 4) === yil).length), mazeretMaks: MAZERET_MAKS };
  o.kalan = gunFark(bugun, o.sonTarih);
  if (u.askida) {
    o.durum = 'askida'; o.askidaBas = u.askida;
    if (u.cb_bas) {
      const bitis = gunEkle(u.cb_bas, CB_PENCERE - 1);
      o.comeback = { bas: u.cb_bas, bitis, hedef: CB_HEDEF, soz: u.cb_soz || CB_HEDEF, yapilan: tarihler.filter((t) => t >= u.cb_bas && t <= bitis).length, kalan: gunFark(bugun, bitis) };
      if (o.comeback.kalan >= 0) o.durum = 'comeback';
    }
    return o;
  }
  if (u.mazeret_bitis && u.mazeret_bitis >= bugun) { o.durum = 'mazeret'; o.mazeret = { tur: u.mazeret_tur, ad: MAZERET_TUR[u.mazeret_tur] || 'Mazeret', bitis: u.mazeret_bitis }; return o; }
  if (o.kalan < 0) o.durum = 'askiya-gec';
  else if (o.kalan <= UYARI_GUN) o.durum = 'uyari';
  return o;
}
async function uyelikSatir(db, kim) {
  let u = await db.prepare('SELECT * FROM uyelik WHERE kullanici_id = ?').bind(kim.id).first();
  if (!u) { // ilk kez: süre bugünden başlar; yeni üyeye ilk antrenmana kadar HOSGELDIN_GUN ek süre (ilk antrenmanla sıfırlanır)
    const b = bugunTR();
    await db.prepare('INSERT OR IGNORE INTO uyelik (kullanici_id, son, tarihler, uzatma, guncelleme) VALUES (?, ?, ?, ?, ?)').bind(kim.id, b, '[]', HOSGELDIN_GUN, Date.now()).run();
    u = { kullanici_id: kim.id, son: b, tarihler: '[]', uzatma: HOSGELDIN_GUN };
  }
  return u;
}
async function uyelikOku(db, kim) {
  if (MUAF.has(kim.rol) || kim.rol === 'aday') return { durum: 'muaf' };
  const u = await uyelikSatir(db, kim); const bugun = bugunTR();
  let o = uyelikDurum(u, bugun);
  if (o.durum === 'askiya-gec') {
    await db.prepare('UPDATE uyelik SET askida = ?, cb_bas = NULL, guncelleme = ? WHERE kullanici_id = ? AND askida IS NULL').bind(bugun, Date.now(), kim.id).run();
    u.askida = bugun; u.cb_bas = null; o = uyelikDurum(u, bugun);
  } else if (o.durum === 'askida' && u.cb_bas) { // süresi geçen Comeback yeniden başlatılabilsin
    await db.prepare('UPDATE uyelik SET cb_bas = NULL WHERE kullanici_id = ? AND cb_bas = ?').bind(kim.id, u.cb_bas).run();
    u.cb_bas = null; o = uyelikDurum(u, bugun); o.comebackKacti = true;
  }
  return o;
}
// eşitlenen veriden antrenman günlerini çıkar; son antrenman ilerlerse mazeret uzatması biter; Comeback hedefi tutunca askı kalkar
async function uyelikIsle(db, kim, veri) {
  if (MUAF.has(kim.rol) || kim.rol === 'aday') return { durum: 'muaf' };
  const u = await uyelikSatir(db, kim); const bugun = bugunTR(); const yarin = gunEkle(bugun, 1);
  const gl = veri && typeof veri.gunluk === 'object' && veri.gunluk ? veri.gunluk : {};
  const yeni = Object.keys(gl).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k <= yarin && gl[k] && gl[k].antrenman).sort().slice(-60);
  const eski = jsonOku(u.tarihler, []);
  const tarihler = Array.from(new Set(eski.concat(yeni))).sort().slice(-60);
  const enSon = tarihler.length ? tarihler[tarihler.length - 1] : null;
  const ilerledi = enSon && enSon > (u.son || '');
  const son = ilerledi ? enSon : u.son;
  let askida = u.askida, cbBas = u.cb_bas;
  if (askida && cbBas) {
    const bitis = gunEkle(cbBas, CB_PENCERE - 1);
    if (tarihler.filter((t) => t >= cbBas && t <= bitis).length >= CB_HEDEF) { askida = null; cbBas = null; }
  }
  const donus = !!u.askida && !askida;
  await db.prepare('UPDATE uyelik SET son = ?, tarihler = ?, uzatma = ?, askida = ?, cb_bas = ?, cb_soz = CASE WHEN ? IS NULL THEN NULL ELSE cb_soz END, guncelleme = ? WHERE kullanici_id = ?')
    .bind(son, JSON.stringify(tarihler), ilerledi || donus ? 0 : (u.uzatma || 0), askida, cbBas, cbBas, Date.now(), kim.id).run();
  const o = await uyelikOku(db, kim); if (donus) o.dondu = true;
  return o;
}
const OLAYLAR = new Set(['antrenman_bitti', 'ogun_foto', 'ogun_barkod', 'ogun_liste', 'ogun_elle', 'koc_mesaj', 'program_ozel', 'program_yorum', 'kurulum', 'su', 'paylas', 'off_gun', 'program_paylas', 'program_al', 'program_kur', 'antrenman_his', 'takviye', 'siralama', 'jam', 'bplan', 'gun_degis', 'haftaplan', 'kisa', 'giris_afis', 'giris_wa', 'giris_ig', 'giris_qr']);
const EPOSTA = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

async function onRequestIc(ctx, R) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB;
  if (!db) return hata('Hesap sistemi şu an kapalı.', 503);
  const yol = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean).join('/');
  const ip = req.headers.get('cf-connecting-ip') || 'yok';
  const m = req.method;
  if (yabanciKaynak(req)) return hata('İzin verilmeyen kaynak.', 403);

  try {
    await uyelikTablo(db);
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
      if (g.riza !== true) return hata('Verilerinin hesabında saklanması için onay kutusunu işaretle.', 400);
      if (g.saglikRiza !== true) return hata('Sağlık verilerin için açık rıza kutusunu işaretle.', 400);
      if (typeof g.json !== 'string' || g.json.length > 200000) return hata('Profil bilgilerin eksik.', 400);
      let st; try { st = JSON.parse(g.json); } catch (e) { return hata('Profil bilgilerin eksik.', 400); }
      if (!st || !st.profil || !st.program) return hata('Profil bilgilerin eksik.', 400);
      if (!(await sinir(db, R, 'basvuru:' + ip, 5, 3600))) return hata('Çok fazla deneme yapıldı. Bir saat sonra tekrar dene.', 429);
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
      if (g.riza !== true) return hata('Verilerinin hesabında saklanması için onay kutusunu işaretle.', 400);
      if (g.saglikRiza !== true) return hata('Sağlık verilerin için açık rıza kutusunu işaretle.', 400);
      if (!(await sinir(db, R, 'kayit:' + ip, 5, 3600))) return hata('Çok fazla deneme yapıldı. Bir saat sonra tekrar dene.', 429);
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
      if (!(await sinir(db, R, 'giris:' + ip, 10, 900)) || !(await sinir(db, R, 'giris-e:' + eposta, 8, 900))) return hata('Çok fazla hatalı deneme. 15 dakika sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT id, ad, eposta, rol, kullanici_adi, sifre_hash, tuz FROM kullanicilar WHERE eposta = ?').bind(eposta).first();
      if (!k || !esit(await sifreHash(sifre, k.tuz), k.sifre_hash)) return hata('E-posta ya da şifre hatalı.', 401);
      if (k.rol === 'aday') {
        const b = await db.prepare('SELECT durum FROM bekleme WHERE eposta = ?').bind(eposta).first();
        if (!b || b.durum !== 'onayli') return json({ hata: b && b.durum === 'reddedildi' ? 'Başvurun şu an onaylanmadı.' : 'Başvurun inceleniyor. Onaylanınca bu e-posta ve şifreyle giriş yapabileceksin.', beta: 'bekliyor' }, 403);
        await db.prepare("UPDATE kullanicilar SET rol = 'uye' WHERE id = ? AND rol = 'aday'").bind(k.id).run(); k.rol = 'uye';
      }
      // kendi deneme sayacını sıfırla + süresi dolmuş sayaçları temizle (tablo sınırsız büyümesin)
      await db.prepare('DELETE FROM giris_deneme WHERE anahtar = ? OR bitis < ?').bind('giris-e:' + eposta, Date.now()).run();
      await db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ? AND bitis < ?').bind(k.id, Date.now()).run();
      const token = await oturumAc(db, k.id);
      return json({ kullanici: { id: k.id, ad: k.ad, eposta: k.eposta, rol: k.rol, kadi: k.kullanici_adi || null } }, 200, { 'set-cookie': cerezYaz(token, OTURUM_SN) });
    }

    // Şifre sıfırlama: hesabın var olup olmadığı dışarıya sızmasın diye cevap her durumda aynı
    if (yol === 'sifre-unuttum' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const eposta = String(g.eposta || '').trim().toLowerCase();
      if (!EPOSTA.test(eposta)) return hata('Geçerli bir e-posta adresi yaz.', 400);
      if (!(await sinir(db, R, 'sifirla:' + ip, 5, 3600)) || !(await sinir(db, R, 'sifirla-e:' + eposta, 3, 3600))) return hata('Çok fazla istek yapıldı. Bir saat sonra tekrar dene.', 429);
      const tamam = json({ ok: true, mesaj: 'Bu e-postayla bir hesap varsa şifre yenileme bağlantısı gönderdik. Gelen kutunu ve gereksiz klasörünü kontrol et.' });
      const k = await db.prepare("SELECT id, ad, rol FROM kullanicilar WHERE eposta = ? AND rol != 'demo'").bind(eposta).first();
      if (!k) return tamam;
      const token = b64url(rastgele(32)); const simdi = Date.now();
      await db.batch([
        db.prepare('DELETE FROM sifre_sifirla WHERE kullanici_id = ? OR bitis < ?').bind(k.id, simdi),
        db.prepare('INSERT INTO sifre_sifirla (token_hash, kullanici_id, bitis, olusturma) VALUES (?, ?, ?, ?)').bind(await ozet(token), k.id, simdi + 30 * 60 * 1000, simdi)
      ]);
      const baglanti = new URL(req.url).origin + '/comeback/#/sifre/' + token;
      const ad = String(k.ad || '').replace(/[<>&"]/g, '');
      const html = '<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#16161A">' +
        '<p style="font-size:26px;font-weight:900;letter-spacing:-1px;margin:0 0 20px">COMEBACK<span style="color:#2E4BFF">.</span></p>' +
        '<p style="font-size:16px;line-height:1.5">Merhaba ' + ad + ',</p><p style="font-size:16px;line-height:1.5">Şifreni yenilemek için aşağıdaki düğmeye dokun. Bağlantı 30 dakika geçerli ve tek kullanımlık.</p>' +
        '<p style="margin:24px 0"><a href="' + baglanti + '" style="display:inline-block;background:#2E4BFF;color:#fff;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:26px">Şifremi yenile</a></p>' +
        '<p style="font-size:13px;line-height:1.5;color:#6B6A66">Bu isteği sen yapmadıysan bu e-postayı yok sayabilirsin; şifren değişmez.</p></div>';
      const text = 'Merhaba ' + ad + ',\n\nŞifreni yenilemek için bu bağlantıyı aç (30 dakika geçerli, tek kullanımlık):\n' + baglanti + '\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.\n\nCOMEBACK.';
      await gmailGonder(env, { to: eposta, subject: 'COMEBACK. şifre yenileme', html, text, name: 'COMEBACK.' });
      return tamam;
    }

    if (yol === 'sifre-yenile' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const token = String(g.token || ''); const sifre = String(g.sifre || '');
      if (!/^[A-Za-z0-9_-]{30,60}$/.test(token)) return hata('Bağlantı geçersiz. Yeni bir bağlantı iste.', 400);
      if (sifre.length < 8 || sifre.length > 200) return hata('Şifre en az 8 karakter olmalı.', 400);
      if (!(await sinir(db, R, 'yenile:' + ip, 6, 3600))) return hata('Çok fazla deneme yapıldı. Bir saat sonra tekrar dene.', 429);
      const th = await ozet(token);
      const t = await db.prepare('SELECT kullanici_id, bitis FROM sifre_sifirla WHERE token_hash = ?').bind(th).first();
      if (!t || t.bitis < Date.now()) return hata('Bağlantının süresi dolmuş ya da kullanılmış. Yeni bir bağlantı iste.', 400);
      const k = await db.prepare('SELECT id, ad, eposta, rol, kullanici_adi FROM kullanicilar WHERE id = ?').bind(t.kullanici_id).first();
      if (!k) return hata('Bağlantı geçersiz.', 400);
      const tuz = hex(rastgele(16));
      await db.batch([
        db.prepare('UPDATE kullanicilar SET sifre_hash = ?, tuz = ? WHERE id = ?').bind(await sifreHash(sifre, tuz), tuz, k.id),
        db.prepare('DELETE FROM sifre_sifirla WHERE kullanici_id = ?').bind(k.id),
        db.prepare('DELETE FROM oturumlar WHERE kullanici_id = ?').bind(k.id)
      ]);
      if (k.rol === 'aday') return json({ ok: true, durum: 'bekliyor' });
      const yeni = await oturumAc(db, k.id);
      return json({ ok: true, kullanici: { id: k.id, ad: k.ad, eposta: k.eposta, rol: k.rol, kadi: k.kullanici_adi || null } }, 200, { 'set-cookie': cerezYaz(yeni, OTURUM_SN) });
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
      if (!(await sinir(db, R, 'bekleme:' + ip, 5, 3600))) return hata('Çok fazla deneme yapıldı. Biraz sonra tekrar dene.', 429);
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
      if (!(await sinir(db, R, 'olay:' + (kim ? kim.id : ip), 120, 3600))) return json({ ok: true });
      await db.prepare('INSERT INTO sayac (gun, olay, adet) VALUES (?, ?, 1) ON CONFLICT(gun, olay) DO UPDATE SET adet = adet + 1').bind(new Date().toISOString().slice(0, 10), olay).run();
      return json({ ok: true });
    }

    if (yol === 'hata' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      if (!(await sinir(db, R, 'hata:' + (kim ? kim.id : ip), 20, 3600))) return json({ ok: true });
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
          await db.batch(hesapSilAdimlari(db, k.id));
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
      if (!kim) return hata('Giriş yapılmamış.', 401);
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const tur = String(g.tur || ''); if (['koc', 'yorum', 'yemek', 'foto', 'kur', 'bplan'].indexOf(tur) < 0) return hata('Geçersiz.', 400);
      if (!(await sinir(db, R, 'aioy:' + kim.id, 40, 3600))) return hata('Çok fazla oy.', 429);
      await db.prepare('INSERT INTO ai_oy (kullanici_id, tur, oy, ornek, zaman) VALUES (?, ?, ?, ?, ?)').bind(kim.id, tur, Number(g.oy) > 0 ? 1 : -1, String(g.ornek || '').replace(/[<>]/g, '').slice(0, 300), Date.now()).run();
      return json({ ok: true });
    }

    if (yol === 'gorus' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const metin = String(g.metin || '').trim().slice(0, 2000);
      if (metin.length < 3) return hata('Birkaç kelime yaz.', 400);
      const tur = ['oneri', 'hata', 'begeni', 'diger'].includes(g.tur) ? g.tur : 'diger';
      if (!(await sinir(db, R, 'gorus:' + (kim ? kim.id : ip), 10, 3600))) return hata('Çok fazla mesaj gönderildi. Biraz sonra tekrar dene.', 429);
      await db.prepare('INSERT INTO gorusler (kullanici_id, tur, metin, ekran, cihaz, zaman) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(kim ? kim.id : null, tur, metin, String(g.ekran || '').slice(0, 60), String(req.headers.get('user-agent') || '').slice(0, 200), Date.now()).run();
      return json({ ok: true }, 201);
    }

    if (yol === 'ben' && m === 'GET') return kim ? json({ kullanici: Object.assign({}, kim, { uyelik: await uyelikOku(db, kim) }) }) : hata('Giriş yapılmamış.', 401);
    if (!kim) return hata('Giriş yapılmamış.', 401);

    // Üyelik: 30 gün antrenman yoksa askı; ara vermeden önce mazeret; askıdan Comeback ile dönülür
    if (yol === 'uyelik' && m === 'GET') return json({ uyelik: await uyelikOku(db, kim) });
    if (yol === 'uyelik/mazeret' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      if (MUAF.has(kim.rol)) return hata('Hesabın için gerekmiyor.', 400);
      const tur = String(g.tur || ''); if (!MAZERET_TUR[tur]) return hata('Bir neden seç.', 400);
      const gun = Math.round(Number(g.gun)); if (!(gun >= 1 && gun <= MAZERET_MAKS)) return hata('Mazeret en fazla ' + MAZERET_MAKS + ' gün olabilir.', 400);
      const u0 = await uyelikOku(db, kim);
      if (u0.durum === 'askida' || u0.durum === 'comeback') return hata('Üyeliğin askıda. Geri dönmek için Comeback\'e başla.', 409);
      if (u0.durum === 'mazeret') return hata('Zaten bir mazeretin açık.', 409);
      if (u0.mazeretHak <= 0) return hata('Bu yılki mazeret hakların doldu.', 409);
      const bugun = bugunTR(); const bitis = gunEkle(bugun, gun);
      const r = await db.prepare('SELECT mazeretler FROM uyelik WHERE kullanici_id = ?').bind(kim.id).first();
      const l = jsonOku(r && r.mazeretler, []); l.push({ bas: bugun, gun, tur }); 
      await db.prepare('UPDATE uyelik SET mazeret_bitis = ?, mazeret_tur = ?, uzatma = uzatma + ?, mazeretler = ?, guncelleme = ? WHERE kullanici_id = ?').bind(bitis, tur, gun, JSON.stringify(l.slice(-20)), Date.now(), kim.id).run();
      return json({ uyelik: await uyelikOku(db, kim) });
    }
    if (yol === 'uyelik/comeback' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      const u0 = await uyelikOku(db, kim);
      if (u0.durum !== 'askida') return hata(u0.durum === 'comeback' ? 'Comeback\'in zaten başladı.' : 'Üyeliğin askıda değil.', 409);
      const soz = Math.max(CB_HEDEF, Math.min(7, Math.round(Number(g.soz)) || CB_HEDEF));
      await db.prepare('UPDATE uyelik SET cb_bas = ?, cb_soz = ?, guncelleme = ? WHERE kullanici_id = ?').bind(bugunTR(), soz, Date.now(), kim.id).run();
      return json({ uyelik: await uyelikOku(db, kim) });
    }

    // Profil resmi: istemci 192×192 JPEG'e küçültüp data URL olarak yollar
    if (yol === 'foto' && m === 'POST') {
      const g = await govde(req); const f = String(g && g.foto || '');
      if (!/^data:image\/(jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(f) || f.length > 60000) return hata('Resim okunamadı ya da çok büyük.', 400);
      if (!(await sinir(db, R, 'foto:' + kim.id, 6, 3600))) return hata('Çok sık değiştirdin. Biraz sonra tekrar dene.', 429);
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
      if (!(await sinir(db, R, 'kadi:' + kim.id, 5, 3600))) return hata('Çok fazla deneme. Biraz sonra tekrar dene.', 429);
      const var_ = await db.prepare('SELECT id FROM kullanicilar WHERE kullanici_adi = ? AND id != ?').bind(ad, kim.id).first();
      if (var_) return hata('Bu kullanıcı adı alınmış.', 409);
      await db.prepare('UPDATE kullanicilar SET kullanici_adi = ? WHERE id = ?').bind(ad, kim.id).run();
      return json({ kadi: ad });
    }

    if (yol === 'sil' && m === 'POST') {
      const g = await govde(req); if (!g) return hata('Geçersiz istek.', 400);
      if (!(await sinir(db, R, 'sil:' + kim.id, 5, 900))) return hata('Çok fazla deneme. 15 dakika sonra tekrar dene.', 429);
      const k = await db.prepare('SELECT sifre_hash, tuz FROM kullanicilar WHERE id = ?').bind(kim.id).first();
      if (!k || !esit(await sifreHash(String(g.sifre || ''), k.tuz), k.sifre_hash)) return hata('Şifre hatalı.', 401);
      await db.batch(hesapSilAdimlari(db, kim.id));
      return json({ ok: true }, 200, { 'set-cookie': cerezYaz('', 0) });
    }

    if (yol === 'veri' && m === 'GET') {
      const v = await db.prepare('SELECT json, guncelleme FROM veriler WHERE kullanici_id = ?').bind(kim.id).first();
      return json(v ? { json: v.json, guncelleme: v.guncelleme } : { json: null, guncelleme: 0 });
    }
    if (yol === 'veri' && m === 'PUT') {
      const g = await govde(req); if (!g || typeof g.json !== 'string') return hata('Geçersiz istek.', 400);
      if (g.json.length > 500000) return hata('Veri çok büyük.', 413);
      let veri; try { veri = JSON.parse(g.json); } catch (e) { return hata('Geçersiz veri.', 400); }
      const zaman = Math.min(Number(g.guncelleme) || Date.now(), Date.now() + 60000);
      await db.prepare('INSERT INTO veriler (kullanici_id, json, guncelleme) VALUES (?, ?, ?) ON CONFLICT(kullanici_id) DO UPDATE SET json = excluded.json, guncelleme = excluded.guncelleme')
        .bind(kim.id, g.json, zaman).run();
      return json({ ok: true, guncelleme: zaman, uyelik: await uyelikIsle(db, kim, veri) });
    }
    return hata('Bulunamadı.', 404);
  } catch (e) {
    return hata('Sunucuda bir sorun oluştu. Biraz sonra tekrar dene.', 500);
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
