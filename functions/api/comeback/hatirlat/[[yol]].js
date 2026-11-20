// COMEBACK. — hatırlatıcılar (su, takviye, antrenman) için Web Push
//   GET  /api/comeback/hatirlat/anahtar            → { anahtar }  (VAPID genel anahtarı; ilk istekte üretilip D1'de saklanır)
//   POST /api/comeback/hatirlat/abone { abonelik, plan }  (giriş gerekli) → abonelik kaydı / plan güncelleme
//   POST /api/comeback/hatirlat/cik   { uc }             (giriş gerekli) → abonelik silinir
//   POST /api/comeback/hatirlat/dene  { uc }             (giriş gerekli) → deneme bildirimi
//   POST /api/comeback/hatirlat/gonder                   → zamanı gelen hatırlatıcıları gönderir (GitHub Actions her 10 dk çağırır;
//        gizli anahtar gerekmez: her abonelik için "son gönderim" tutulur, art arda çağrı çift bildirim yollamaz, dakikada bir kez çalışır)
// Plan istemcide hesaplanır (yerel saat + saat dilimi): { tz, su:{bas,bit,aralik}|null, takviye:[{saat,ad}], antrenman:{saat,gunler:{'YYYY-MM-DD':ad}}|null }
// Tablolar: hatirlat (uc, kullanici_id, p256dh, auth, plan, son, hata, guncelleme), ayar_kv (anahtar, deger)

const json = (veri, durum = 200) => new Response(JSON.stringify(veri), { status: durum, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const hata = (m, d) => json({ hata: m }, d);
// yalnızca tarayıcıların gerçek push servisleri (başka adrese istek atılmasın)
const PUSH_UC = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+(\.[a-z0-9-]+)*\.notify\.windows\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com)\/[^\s]{8,880}$/;
async function sinir(db, R, anahtar, n, sn) {
  const simdi = Date.now();
  const r = await db.prepare('INSERT INTO giris_deneme (anahtar, sayi, bitis) VALUES (?1, 1, ?2) ON CONFLICT(anahtar) DO UPDATE SET sayi = CASE WHEN bitis <= ?3 THEN 1 ELSE sayi + 1 END, bitis = CASE WHEN bitis <= ?3 THEN ?2 ELSE bitis END RETURNING sayi')
    .bind(anahtar, simdi + sn * 1000, simdi).first();
  const ok = !!r && r.sayi <= n;
  if (!ok && R) { const b = await db.prepare('SELECT bitis FROM giris_deneme WHERE anahtar = ?').bind(anahtar).first(); R.s = { limit: n, pencere: sn, yenilenme: b ? b.bitis : simdi }; }
  return ok;
}
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (a) => { const u = new Uint8Array(a); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const b64uCoz = (s) => { s = String(s).replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const birles = (...l) => { const n = l.reduce((a, x) => a + x.length, 0); const u = new Uint8Array(n); let o = 0; l.forEach((x) => { u.set(x, o); o += x.length; }); return u; };

async function kimDir(db, req) {
  const m = (req.headers.get('cookie') || '').match(/(?:^|;\s*)cb_oturum=([A-Za-z0-9_-]+)/); if (!m) return null;
  const th = hex(await crypto.subtle.digest('SHA-256', enc.encode(m[1])));
  const s = await db.prepare('SELECT k.id, k.rol, o.bitis FROM oturumlar o JOIN kullanicilar k ON k.id = o.kullanici_id WHERE o.token_hash = ?').bind(th).first();
  return s && s.bitis > Date.now() ? { id: s.id, rol: s.rol } : null;
}
const tablolar = (db) => db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS ayar_kv (anahtar TEXT PRIMARY KEY, deger TEXT NOT NULL)'),
  db.prepare('CREATE TABLE IF NOT EXISTS hatirlat (uc TEXT PRIMARY KEY, kullanici_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL, plan TEXT NOT NULL, son INTEGER NOT NULL DEFAULT 0, hata INTEGER NOT NULL DEFAULT 0, guncelleme INTEGER NOT NULL)')
]);

// VAPID anahtar çifti: yoksa üretilir (P-256), JWK olarak D1'de durur
async function vapid(db) {
  const r = await db.prepare("SELECT deger FROM ayar_kv WHERE anahtar = 'vapid'").first();
  if (r) return JSON.parse(r.deger);
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', k.privateKey);
  const ham = new Uint8Array(await crypto.subtle.exportKey('raw', k.publicKey));
  const v = { jwk: { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, genel: b64u(ham) };
  await db.prepare("INSERT OR IGNORE INTO ayar_kv (anahtar, deger) VALUES ('vapid', ?)").bind(JSON.stringify(v)).run();
  const s = await db.prepare("SELECT deger FROM ayar_kv WHERE anahtar = 'vapid'").first();
  return JSON.parse(s.deger);
}

async function hkdf(salt, ikm, info, uzunluk) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, uzunluk * 8));
}
// RFC 8291 (aes128gcm) şifreleme + RFC 8292 VAPID
async function pushGonder(v, ab, veri) {
  const uaGenel = b64uCoz(ab.p256dh); const auth = b64uCoz(ab.auth);
  const es = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asGenel = new Uint8Array(await crypto.subtle.exportKey('raw', es.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaGenel, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ortak = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, es.privateKey, 256));
  const ikm = await hkdf(auth, ortak, birles(enc.encode('WebPush: info\0'), uaGenel, asGenel), 32);
  const tuz = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(tuz, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(tuz, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const ak = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sifreli = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, ak, birles(enc.encode(JSON.stringify(veri)), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  const govde = birles(tuz, rs, new Uint8Array([65]), asGenel, sifreli);
  const aud = new URL(ab.uc).origin;
  const bas = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const yuk = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:destek@comeback.com.tr' })));
  const ozel = await crypto.subtle.importKey('jwk', Object.assign({ ext: true }, v.jwk), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const imza = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, ozel, enc.encode(bas + '.' + yuk)));
  if (!PUSH_UC.test(ab.uc)) return new Response(null, { status: 410 }); // eski, izin dışı adres: kayıt silinsin
  return fetch(ab.uc, { method: 'POST', signal: AbortSignal.timeout(6000), headers: { authorization: 'vapid t=' + bas + '.' + yuk + '.' + imza + ', k=' + v.genel, 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'normal' }, body: govde });
}

// saat dilimindeki yerel tarih/saat → UTC ms
function yerel(tz, t) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(t)).forEach((x) => { p[x.type] = x.value; });
  const saat = p.hour === '24' ? '00' : p.hour;
  const sanki = Date.UTC(+p.year, +p.month - 1, +p.day, +saat, +p.minute);
  return { gun: p.year + '-' + p.month + '-' + p.day, fark: sanki - Math.floor(t / 60000) * 60000 };
}
const dk = (hhmm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || ''); return m ? +m[1] * 60 + +m[2] : null; };
// (son, simdi] aralığına düşen hatırlatıcılar
function zamaniGelen(plan, son, simdi) {
  const tz = typeof plan.tz === 'string' && plan.tz.length < 60 ? plan.tz : 'Europe/Istanbul';
  let y; try { y = yerel(tz, simdi); } catch (e) { y = yerel('Europe/Istanbul', simdi); }
  const gunBas = Date.parse(y.gun + 'T00:00:00Z') - y.fark; // yerel gece yarısının UTC karşılığı
  const an = (d) => gunBas + d * 60000;
  const ici = (d) => d != null && an(d) > son && an(d) <= simdi;
  const l = [];
  const a = plan.antrenman; if (a && a.gunler && a.gunler[y.gun] && ici(dk(a.saat))) l.push({ tur: 'antrenman', baslik: 'Bugün antrenman günü', metin: String(a.gunler[y.gun]).slice(0, 60) + ' seni bekliyor. Planına sadık kal.', url: '/comeback/#/antrenman' });
  (Array.isArray(plan.takviye) ? plan.takviye.slice(0, 20) : []).forEach((t) => { if (Array.isArray(t.gunler) && t.gunler.indexOf(y.gun) < 0) return; if (ici(dk(t.saat))) l.push({ tur: 'takviye', baslik: 'Takviye zamanı', metin: String(t.ad || 'Takviye').slice(0, 40) + ' almayı unutma.', url: '/comeback/#/takviye' }); });
  const s = plan.su; if (s) { const b = dk(s.bas), e = dk(s.bit), ar = Math.max(30, Math.min(360, +s.aralik || 120)); if (b != null && e != null) for (let d = b; d <= e; d += ar) if (ici(d)) { l.push({ tur: 'su', baslik: 'Su vakti', metin: 'Bir bardak su iç. Gün boyu azar azar.', url: '/comeback/#/' }); break; } }
  if (!l.length) return null;
  if (l.length === 1) return l[0];
  return { tur: 'coklu', baslik: l[0].baslik, metin: l.map((x) => x.metin).join(' '), url: l[0].url };
}
function planTemizle(p) {
  if (!p || typeof p !== 'object') return null;
  const saat = (x) => (dk(x) != null ? String(x) : null);
  const o = { tz: String(p.tz || 'Europe/Istanbul').slice(0, 60) };
  if (p.su && saat(p.su.bas) && saat(p.su.bit)) o.su = { bas: p.su.bas, bit: p.su.bit, aralik: Math.max(30, Math.min(360, +p.su.aralik || 120)) };
  o.takviye = (Array.isArray(p.takviye) ? p.takviye : []).filter((t) => t && saat(t.saat)).slice(0, 20).map((t) => { const o2 = { saat: t.saat, ad: String(t.ad || '').replace(/[<>]/g, '').slice(0, 40) }; if (Array.isArray(t.gunler)) o2.gunler = t.gunler.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).slice(0, 21); return o2; });
  if (p.antrenman && saat(p.antrenman.saat) && p.antrenman.gunler && typeof p.antrenman.gunler === 'object') {
    const g = {}; Object.keys(p.antrenman.gunler).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).slice(0, 21).forEach((k) => { g[k] = String(p.antrenman.gunler[k]).replace(/[<>]/g, '').slice(0, 60); });
    o.antrenman = { saat: p.antrenman.saat, gunler: g };
  }
  return o;
}

async function onRequestIc(ctx, R) {
  const { request: req, env, params } = ctx;
  const db = env.COMEBACK_DB; if (!db) return hata('Kapalı.', 503);
  const yol = (Array.isArray(params.yol) ? params.yol : [params.yol]).filter(Boolean).join('/');
  const m = req.method;
  if (m !== 'GET' && req.headers.get('origin')) { try { if (new URL(req.headers.get('origin')).host !== new URL(req.url).host) return hata('İzin verilmeyen kaynak.', 403); } catch (e) { return hata('İzin verilmeyen kaynak.', 403); } }
  try {
    await tablolar(db);
    if (yol === 'anahtar' && m === 'GET') return json({ anahtar: (await vapid(db)).genel });

    if (yol === 'gonder' && (m === 'POST' || m === 'GET')) {
      const simdi = Date.now();
      // dakikada en fazla bir çalışma
      const k = await db.prepare("UPDATE ayar_kv SET deger = ? WHERE anahtar = 'hatirlat_son' AND CAST(deger AS INTEGER) < ?").bind(String(simdi), simdi - 55000).run();
      if (!k.meta.changes) { const var_ = await db.prepare("SELECT deger FROM ayar_kv WHERE anahtar = 'hatirlat_son'").first(); if (var_) return json({ ok: true, atlandi: true }); await db.prepare("INSERT OR IGNORE INTO ayar_kv (anahtar, deger) VALUES ('hatirlat_son', ?)").bind(String(simdi)).run(); }
      const v = await vapid(db);
      const l = await db.prepare('SELECT uc, p256dh, auth, plan, son FROM hatirlat WHERE hata < 5 LIMIT 2000').all();
      let gonderilen = 0; let guncel = [];
      const yaz = async () => { if (guncel.length) { const b = guncel; guncel = []; await db.batch(b); } };
      for (const ab of l.results || []) {
        if (Date.now() - simdi > 40000) break; // bir sonraki çalışmada kaldığı yerden (son sütunu sayesinde)
        if (guncel.length >= 25) await yaz();
        let plan; try { plan = JSON.parse(ab.plan); } catch (e) { continue; }
        const son = Math.max(ab.son, simdi - 30 * 60000); // aksama olursa en fazla 30 dk geriye bak
        const n = zamaniGelen(plan, son, simdi);
        if (!n) { guncel.push(db.prepare('UPDATE hatirlat SET son = ? WHERE uc = ?').bind(simdi, ab.uc)); continue; }
        try {
          const r = await pushGonder(v, ab, n);
          if (r.status === 404 || r.status === 410) guncel.push(db.prepare('DELETE FROM hatirlat WHERE uc = ?').bind(ab.uc));
          else if (r.ok) { gonderilen++; guncel.push(db.prepare('UPDATE hatirlat SET son = ?, hata = 0 WHERE uc = ?').bind(simdi, ab.uc)); }
          else guncel.push(db.prepare('UPDATE hatirlat SET son = ?, hata = hata + 1 WHERE uc = ?').bind(simdi, ab.uc));
        } catch (e) { guncel.push(db.prepare('UPDATE hatirlat SET hata = hata + 1 WHERE uc = ?').bind(ab.uc)); }
      }
      await yaz();
      return json({ ok: true, abone: (l.results || []).length, gonderilen });
    }

    const ben = await kimDir(db, req); if (!ben) return hata('Giriş yap.', 401);
    let g; try { g = await req.json(); } catch (e) { g = null; } if (!g) return hata('Geçersiz istek.', 400);

    if (yol === 'abone' && m === 'POST') {
      const a = g.abonelik || {}; const uc = String(a.endpoint || '');
      if (!(await sinir(db, R, 'hatabone:' + ben.id, 20, 3600))) return hata('Çok sık değiştirdin. Biraz sonra tekrar dene.', 429);
      if (!PUSH_UC.test(uc) || !a.keys || !/^[A-Za-z0-9_-]{80,100}$/.test(a.keys.p256dh || '') || !/^[A-Za-z0-9_-]{16,30}$/.test(a.keys.auth || '')) return hata('Bildirim aboneliği geçersiz.', 400);
      const plan = planTemizle(g.plan); if (!plan) return hata('Plan eksik.', 400);
      const say = await db.prepare('SELECT COUNT(*) n FROM hatirlat WHERE kullanici_id = ? AND uc != ?').bind(ben.id, uc).first();
      if (say && say.n >= 5) await db.prepare('DELETE FROM hatirlat WHERE uc IN (SELECT uc FROM hatirlat WHERE kullanici_id = ? ORDER BY guncelleme LIMIT 1)').bind(ben.id).run();
      const simdi = Date.now();
      await db.prepare('INSERT INTO hatirlat (uc, kullanici_id, p256dh, auth, plan, son, hata, guncelleme) VALUES (?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(uc) DO UPDATE SET kullanici_id = excluded.kullanici_id, p256dh = excluded.p256dh, auth = excluded.auth, plan = excluded.plan, hata = 0, guncelleme = excluded.guncelleme')
        .bind(uc, ben.id, a.keys.p256dh, a.keys.auth, JSON.stringify(plan), simdi, simdi).run();
      return json({ ok: true });
    }
    if (yol === 'cik' && m === 'POST') { await db.prepare('DELETE FROM hatirlat WHERE uc = ? AND kullanici_id = ?').bind(String(g.uc || ''), ben.id).run(); return json({ ok: true }); }
    if (yol === 'dene' && m === 'POST') {
      const ab = await db.prepare('SELECT uc, p256dh, auth FROM hatirlat WHERE uc = ? AND kullanici_id = ?').bind(String(g.uc || ''), ben.id).first();
      if (!ab) return hata('Önce hatırlatıcıları aç.', 404);
      if (!(await sinir(db, R, 'hatdene:' + ben.id, 5, 3600))) return hata('Saatte en fazla 5 deneme bildirimi.', 429);
      const r = await pushGonder(await vapid(db), ab, { tur: 'dene', baslik: 'COMEBACK.', metin: 'Hatırlatıcılar açık. Zamanı gelince buradan haber veririz.', url: '/comeback/#/profilim' });
      return r.ok ? json({ ok: true }) : hata('Bildirim gönderilemedi. Biraz sonra tekrar dene.', 502);
    }
    return hata('Bulunamadı.', 404);
  } catch (e) { return hata('Bir sorun oluştu.', 500); }
}

// sınıra takılınca istemciye ne kadar sonra yenileneceğini bildir (uygulama bilgilendirme kartı gösterir)
export async function onRequest(ctx) {
  const R = {};
  const yanit = await onRequestIc(ctx, R);
  if (yanit.status !== 429 || !R.s) return yanit;
  let g = {}; try { g = await yanit.clone().json(); } catch (e) { /* boş */ }
  return new Response(JSON.stringify(Object.assign(g, { sinir: R.s })), { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'retry-after': String(Math.max(1, Math.ceil((R.s.yenilenme - Date.now()) / 1000))) } });
}
