/* COMEBACK. — web uygulaması (1. aşama: veriler bu cihazda saklanır) */
(function () {
  'use strict';

  const D = window.CB_DATA;
  const K = window.CB_KUTUPHANE, M = window.CB_MOTOR;
  // Hareket kütüphanesi: eski kayıtlardaki hareketler (D.HAREKET) korunur, yenileri kütüphaneden gelir
  Object.keys(K.HAREKET).forEach((id) => {
    const h = K.HAREKET[id];
    D.HAREKET[id] = Object.assign({}, h, { kas: h.birincil.map((m) => K.KAS[m]).join(', '), bolge: M.bolgeOf(h.kalip) });
  });
  const BLOK = { guc: 'Güç ve sürat', ana: 'Ana hareket', yard: 'Yardımcı', izo: 'İzolasyon', core: 'Karın', vurgu: 'Spora özel', odak: 'Odak', onleme: 'Sakatlık önleme', kardiyo: 'Kardiyo' };
  const BIRIM = { tekrar: 'Tekrar', sn: 'Sn', dk: 'Dk', m: 'Metre' };
  const birimOf = (x) => x.birim || (x.sure ? (x.id === 'bike' ? 'dk' : 'sn') : 'tekrar');
  const ANAHTAR = 'comeback:v1';
  const app = document.getElementById('app');
  const nav = document.getElementById('nav');

  /* ---------- yardımcılar ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sayi = (n, d) => Number(n || 0).toLocaleString('tr-TR', { maximumFractionDigits: d || 0 });
  const oku = (v) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : NaN; };
  const tarihKey = (dt) => { const d = dt || new Date(); const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const haftaGunu = (dt) => ((dt || new Date()).getDay() + 6) % 7;
  const GUN_AD = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const GUN_KISA = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  const AY = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const tarihYazi = (dt) => { const d = dt || new Date(); return GUN_AD[haftaGunu(d)] + ', ' + d.getDate() + ' ' + AY[d.getMonth()]; };
  const saat = () => { const d = new Date(); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };
  const kimlik = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const IK = {
    degis: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
    ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    geri: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    kapat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    tik: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    kamera: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    ara: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
    barkod: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6v12M7 6v12M10 6v12M14 6v12M16 6v12M20 6v12"/></svg>',
    arti: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  let toastZaman;
  function toast(m) {
    const t = document.getElementById('toast');
    t.textContent = m; t.hidden = false;
    clearTimeout(toastZaman); toastZaman = setTimeout(() => { t.hidden = true; }, 2800);
  }

  /* ---------- veri ---------- */
  function bos() { return { v: 1, profil: null, hedef: null, program: null, gunluk: {}, son: {}, rekor: {}, kilo: [], seans: null }; }
  function yukle() {
    try { const v = JSON.parse(localStorage.getItem(ANAHTAR)); if (v && v.v === 1) return Object.assign(bos(), v); } catch (e) { /* depolama kapalı */ }
    return bos();
  }
  let S = yukle();
  let kayitZaman;
  function kaydet(hemen) {
    clearTimeout(kayitZaman);
    S.guncelleme = Date.now();
    const yaz = () => { try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { /* depolama kapalı; hesapla eşitleniyor */ } senkronPlanla(); };
    if (hemen) yaz(); else kayitZaman = setTimeout(yaz, 300);
  }

  /* ---------- hesap ve eşitleme ---------- */
  let hesap = null;        // { id, ad, eposta, rol }
  let cevrimdisi = false;  // sunucuya ulaşılamazsa cihazda devam
  const API = '/api/comeback/hesap/';
  async function istek(yol, yontem, veri) {
    const r = await fetch(API + yol, { method: yontem || 'GET', credentials: 'same-origin', headers: veri ? { 'content-type': 'application/json' } : {}, body: veri ? JSON.stringify(veri) : undefined });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, durum: r.status, j };
  }
  // hata takibi: aynı hata oturumda bir kez, en fazla 10 kayıt
  const SURUM = '14'; const gonderilenHata = new Set();
  function hataBildir(mesaj, yer) {
    try {
      const anahtar = String(mesaj).slice(0, 200) + '|' + String(yer || '').slice(0, 120);
      if (gonderilenHata.has(anahtar) || gonderilenHata.size >= 10) return; gonderilenHata.add(anahtar);
      const govde = JSON.stringify({ mesaj: String(mesaj).slice(0, 500), yer: String(yer || '').slice(0, 300), ekran: (location.hash || '#/').slice(0, 60), surum: SURUM });
      fetch(API + 'hata', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: govde, keepalive: true }).catch(() => {});
    } catch (e) { /* sessiz */ }
  }
  function olay(ad) { try { if (hesap) fetch(API + 'olay', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ olay: ad }), keepalive: true }).catch(() => {}); } catch (e) { /* sessiz */ } }
  window.addEventListener('error', (e) => { if (e.message) hataBildir(e.message, (e.filename || '').split('/').pop() + ':' + e.lineno + ':' + e.colno); });
  window.addEventListener('unhandledrejection', (e) => { const r = e.reason || {}; hataBildir('Promise: ' + (r.message || String(r)), (r.stack || '').split('\n')[1] || ''); });
  let senkronZaman = null; let senkronda = false;
  function senkronPlanla() {
    if (!hesap) return;
    clearTimeout(senkronZaman); senkronZaman = setTimeout(senkronGonder, 1200);
  }
  async function senkronGonder() {
    if (!hesap || senkronda) return;
    senkronda = true;
    try { await istek('veri', 'PUT', { json: JSON.stringify(Object.assign({}, S, { seans: S.seans })), guncelleme: S.guncelleme || Date.now() }); } catch (e) { /* sonra tekrar */ }
    senkronda = false;
  }
  // Sunucudaki veri ile cihazdakini birleştir: yeni olan kazanır; sunucu boşsa cihazdaki gönderilir
  async function veriCek() {
    const r = await istek('veri');
    if (!r.ok) return;
    const sunucu = r.j.json ? (() => { try { return JSON.parse(r.j.json); } catch (e) { return null; } })() : null;
    if (sunucu && sunucu.v === 1 && (!S.profil || (r.j.guncelleme || 0) > (S.guncelleme || 0))) {
      S = Object.assign(bos(), sunucu); S.guncelleme = r.j.guncelleme;
      try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { /* yok */ }
      gocEt();
    } else if (S.profil) {
      await senkronGonder();
    }
  }
  async function hesapYukle() {
    try {
      const r = await istek('ben');
      if (r.ok) { hesap = r.j.kullanici; await veriCek(); }
      else if (r.durum >= 500) cevrimdisi = true;
    } catch (e) { cevrimdisi = true; }
  }
  window.addEventListener('pagehide', () => { if (hesap && senkronZaman) { clearTimeout(senkronZaman); try { fetch(API + 'veri', { method: 'PUT', keepalive: true, credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ json: JSON.stringify(S), guncelleme: S.guncelleme }) }); } catch (e) { /* yok */ } } });
  const gun = (k) => { const key = k || tarihKey(); if (!S.gunluk[key]) S.gunluk[key] = { ogun: [], antrenman: null }; return S.gunluk[key]; };

  /* ---------- program motoru (motor.js + kutuphane.js) ---------- */
  const hedefHesapla = (p) => M.hedefHesapla(p);
  const programOlustur = (p) => M.programOlustur(p);
  // Eski sürüm programları yeni motorla yeniden kur (profil korunur)
  function gocEt() {
    if (S.profil && S.program && S.program.surum !== 2) {
      S.profil = Object.assign({ ortam: 'salon', sure: 60, sezon: 'disi' }, S.profil);
      S.hedef = hedefHesapla(S.profil); S.program = programOlustur(S.profil); S.seans = null;
      try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { /* yok */ }
    }
  }

  const bugunkuGun = () => (S.program ? S.program.gunler.find((g) => g.hafta === haftaGunu()) : null);
  function sonrakiGun() {
    if (!S.program) return null;
    const bugun = haftaGunu();
    for (let i = 1; i <= 7; i++) { const g = S.program.gunler.find((x) => x.hafta === (bugun + i) % 7); if (g) return { gun: g, kac: i }; }
    return null;
  }
  function hedefKilo(h) {
    const son = S.son[h]; const hr = D.HAREKET[h];
    if (!son || !son.setler.length) return '';
    const dz = (S.program && S.program.gunler.flatMap((g) => g.hareketler).find((x) => x.id === h)) || { ust: 99 };
    const kg = Math.max.apply(null, son.setler.map((s) => s.kg || 0));
    if (!kg) return '';
    const hepsi = son.setler.every((s) => s.tekrar >= dz.ust);
    const artis = hr.artis != null ? hr.artis : (hr.bolge === 'alt' ? 5 : 2.5);
    return hepsi && artis ? kg + artis : kg;
  }
  const e1rm = (kg, t) => kg * (1 + t / 30);

  function seri() {
    let n = 0; const d = new Date();
    const dolu = (k) => { const g = S.gunluk[k]; return g && (g.ogun.length || g.antrenman); };
    if (!dolu(tarihKey(d))) d.setDate(d.getDate() - 1);
    while (dolu(tarihKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function toplam(liste) {
    return liste.reduce((a, o) => ({ k: a.k + o.k, p: a.p + o.p, kh: a.kh + o.kh, y: a.y + o.y }), { k: 0, p: 0, kh: 0, y: 0 });
  }
  const yuzde = (a, b) => Math.max(0, Math.min(100, b ? Math.round((a / b) * 100) : 0));
  const ogunTuru = () => { const h = new Date().getHours(); return h < 11 ? 'kahvalti' : h < 15 ? 'ogle' : h < 18 ? 'ara' : 'aksam'; };
  const OGUN_AD = { kahvalti: 'Kahvaltı', ogle: 'Öğle', ara: 'Ara öğün', aksam: 'Akşam' };

  /* ---------- ortak parçalar ---------- */
  const ust = (sol, sag) => '<header class="ust">' + sol + (sag || '') + '</header>';
  const logo = '<a class="logo" href="#/" aria-label="COMEBACK. ana sayfa">COMEBACK<i>.</i></a>';
  const geri = (h, etiket) => '<a class="ikon-btn" href="' + h + '" aria-label="' + (etiket || 'Geri') + '">' + IK.geri + '</a>';

  /* ---------- ekranlar ---------- */
  function ekranKarsilama() {
    return ust(logo) +
      '<div class="karsilama"><div class="sol">' +
      '<h1 class="baslik" style="font-size:52px;padding-top:28px">Bıraktığın<br>yerden<br>başla<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:4px 4px 8px;font-size:16px;max-width:36ch">Sana göre kurulan program, fotoğrafla kalori ve set set antrenman kaydı. Tek uygulamada.</p>' +
      (hesap || cevrimdisi
        ? '<a class="btn ana buyuk-btn" href="#/kurulum" style="margin-top:6px">Programımı oluştur' + IK.ok + '</a>'
        : '<span class="etiket" style="align-self:flex-start;margin:2px 4px 4px">Kapalı beta</span>' +
          '<a class="btn ana buyuk-btn" href="#/bekleme" style="margin-top:6px">Bekleme listesine katıl' + IK.ok + '</a>' +
          '<a class="btn cerceve" href="#/kayit">Onaylandım · Hesap oluştur</a>' +
          '<a class="metin-btn" href="#/giris" style="align-self:center;color:var(--murekkep)">Zaten hesabım var ·&nbsp;<span style="color:var(--kobalt)">Giriş yap</span></a>') +
      (S.profil && !hesap && !cevrimdisi ? '<div class="uyari">Bu cihazda kayıtların var. Hesap oluşturursan hepsi hesabına aktarılır ve her cihazdan erişirsin.</div>' : '') +
      '<p class="not">18 yaş ve üstü içindir.' + (cevrimdisi ? ' Sunucuya şu an ulaşılamıyor; kayıtların bu cihazda tutuluyor.' : '') + '</p>' +
      '</div><div class="izgara">' +
      '<div class="t kobalt genis h130"><span class="k">Kişiye özel program</span><span class="orta">Yaşın, kilon, hedefin ve sporuna göre.</span></div>' +
      '<div class="t limon h150"><span class="k">Beslenme</span><span class="orta">Fotoğrafla, barkodla, listeden.</span></div>' +
      '<div class="t koyu h150"><span class="k">Antrenman</span><span class="orta">Set, kilo, tekrar, rekor.</span></div>' +
      '</div></div>';
  }

  const gozIkon = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const sifreAlani = (ad, oto, yazi) => '<label class="t genis alan"><span>' + yazi + '</span><div class="satir"><input name="' + ad + '" type="password" autocomplete="' + oto + '" minlength="8" required style="font-size:22px;letter-spacing:.02em" placeholder="••••••••"><button type="button" class="ikon-btn" data-act="sifre-goster" aria-label="Şifreyi göster" style="background:var(--zemin)">' + gozIkon + '</button></div></label>';
  let beklemeSonuc = null; let beklemeHedef = '';
  function ekranBekleme() {
    if (hesap) { location.hash = '#/'; return ''; }
    if (beklemeSonuc) {
      const onayli = beklemeSonuc === 'onayli';
      return ust(geri('#/', 'Başa dön'), '<span class="alt">Kapalı beta</span>') +
        '<h1 class="baslik">' + (onayli ? 'Onaylısın' : 'Listedesin') + '<span class="nokta">.</span></h1>' +
        '<div class="izgara"><div class="t ' + (onayli ? 'limon' : 'kobalt') + ' genis" style="gap:8px"><span class="k">' + (onayli ? 'Hazır' : 'Sıradasın') + '</span><span style="font-size:17px;font-weight:600;line-height:1.45">' +
        (onayli ? 'Bu e-postayla hemen hesap oluşturabilirsin.' : 'COMEBACK. şu an küçük bir grupla deneniyor. Yer açılınca başvurunu onaylayacağız; onaylandığında aynı e-postayla hesap oluşturabileceksin.') + '</span></div></div>' +
        (onayli ? '<a class="btn ana buyuk-btn" href="#/kayit">Hesap oluştur' + IK.ok + '</a>' : '<a class="btn cerceve" href="#/">Başa dön</a>');
    }
    const hedefler = [['yag', 'Kilo vermek'], ['kas', 'Kas yapmak'], ['guc', 'Güçlenmek'], ['spor', 'Sporuma hazırlanmak'], ['donus', 'Spora geri dönmek']];
    return ust(geri('#/', 'Başa dön'), '<span class="alt">Kapalı beta</span>') +
      '<h1 class="baslik">İlk sen dene<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:0 4px 6px;font-size:15px">COMEBACK. şu an kapalı betada. E-postanı bırak, yer açılınca seni içeri alalım.</p>' +
      '<form data-form="bekleme" class="izgara" novalidate>' +
      '<label class="t genis alan"><span>Adın</span><input name="ad" autocomplete="given-name" maxlength="40" placeholder="Deniz" style="font-size:22px"></label>' +
      '<label class="t genis alan"><span>E-posta</span><input name="eposta" type="email" autocomplete="email" inputmode="email" required placeholder="ornek@eposta.com" style="font-size:20px;letter-spacing:-.01em"></label>' +
      '<div class="t genis"><span class="k">Hedefin ne?</span><div class="haplar">' + hedefler.map((x) => '<button type="button" class="hap" data-act="bekleme-hedef" data-deger="' + x[0] + '" aria-pressed="' + (beklemeHedef === x[0]) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<label class="t genis alan"><span>Bizi nereden duydun? · isteğe bağlı</span><input name="kaynak" maxlength="60" placeholder="Instagram, arkadaşım, salonum…" style="font-size:18px"></label>' +
      '<p class="hata genis" id="formHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Listeye katıl' + IK.ok + '</button>' +
      '<p class="not genis" style="padding:0 4px">E-postanı yalnızca beta davetin ve COMEBACK. duyuruları için kullanırız. <a href="gizlilik.html" target="_blank" rel="noopener" style="color:var(--kobalt)">Aydınlatma metni</a></p>' +
      '</form>';
  }

  // yönetim (yalnızca admin)
  let yon = { sekme: 'bekleme', veri: null, yukleniyor: false };
  async function yonetimYukle() {
    if (yon.yukleniyor) return; yon.yukleniyor = true;
    try {
      const [o, b, g, h] = await Promise.all(['ozet', 'bekleme', 'gorusler', 'hatalar'].map((x) => istek('yonetim/' + x)));
      yon.veri = o.ok ? { ozet: o.j, bekleme: b.j.liste || [], gorusler: g.j.liste || [], hatalar: h.j.liste || [] } : { hata: o.j.hata || 'Yüklenemedi.' };
    } catch (e) { yon.veri = { hata: 'Bağlantı kurulamadı.' }; }
    yon.yukleniyor = false; if (location.hash.indexOf('#/yonetim') === 0) render();
  }
  function ekranYonetim() {
    if (!hesap || hesap.rol !== 'admin') { location.hash = '#/'; return ''; }
    const V = yon.veri;
    if (!V) { yonetimYukle(); return ust(geri('#/profil'), '<span class="alt">Yönetim</span>') + '<h1 class="baslik">Yönetim<span class="nokta">.</span></h1><p class="ik" style="padding:0 4px">Yükleniyor…</p>'; }
    if (V.hata) return ust(geri('#/profil'), '<span class="alt">Yönetim</span>') + '<h1 class="baslik">Yönetim<span class="nokta">.</span></h1><div class="t"><span>' + esc(V.hata) + '</span></div>';
    const o = V.ozet;
    const tarih = (z) => z ? new Date(z).toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
    const kutu = (k, n, ek) => '<div class="t' + (ek ? ' ' + ek : '') + '"><span class="k">' + k + '</span><span class="dev num" style="font-size:40px">' + n + '</span></div>';
    const DUR = { bekliyor: 'Bekliyor', onayli: 'Onaylı', reddedildi: 'Reddedildi' };
    const HED = { yag: 'Kilo vermek', kas: 'Kas', guc: 'Güç', spor: 'Spor', donus: 'Geri dönüş' };
    const sekmeler = [['bekleme', 'Bekleme listesi · ' + o.bekleyen], ['gorusler', 'Görüşler · ' + V.gorusler.length], ['hatalar', 'Hatalar · ' + V.hatalar.length]];
    let govde = '';
    if (yon.sekme === 'bekleme') govde = V.bekleme.length ? V.bekleme.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad || '—') + '</b><span class="ik">' + esc(x.eposta) + '</span><span class="ik">' + [HED[x.hedef] || x.hedef, x.kaynak, tarih(x.zaman)].filter(Boolean).map(esc).join(' · ') + (x.kayitli ? ' · <b>hesap açtı</b>' : '') + '</span></div><div class="yon-is"><span class="etiket">' + DUR[x.durum] + '</span>' +
      (x.durum !== 'onayli' ? '<button class="btn ana kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="onayli">Onayla</button>' : '') +
      (x.durum === 'bekliyor' ? '<button class="btn cerceve kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="reddedildi">Reddet</button>' : '') + '</div></div>').join('') : '<p class="ik">Henüz başvuru yok.</p>';
    else if (yon.sekme === 'gorusler') govde = V.gorusler.length ? V.gorusler.map((x) => '<div class="yon-satir"><div class="yigin"><span class="ik">' + esc([x.tur, x.ad || 'isimsiz', x.ekran, tarih(x.zaman)].filter(Boolean).join(' · ')) + '</span><span style="white-space:pre-wrap;line-height:1.5">' + esc(x.metin) + '</span></div></div>').join('') : '<p class="ik">Henüz görüş yok.</p>';
    else govde = V.hatalar.length ? V.hatalar.map((x) => '<div class="yon-satir"><div class="yigin"><b style="font-size:14px;word-break:break-word">' + esc(x.mesaj) + '</b><span class="ik" style="word-break:break-all">' + esc([x.yer, x.ekran, 'sürüm ' + x.surum].filter(Boolean).join(' · ')) + '</span><span class="ik">' + x.adet + ' kez · ' + x.kisi + ' kişi · son ' + tarih(x.son) + '</span></div></div>').join('') : '<p class="ik">Hata kaydı yok.</p>';
    return ust(geri('#/profil'), '<button class="ikon-btn" data-act="yon-yenile" aria-label="Yenile" style="background:#fff">' + IK.degis + '</button>') +
      '<h1 class="baslik">Yönetim<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + kutu('Kullanıcı', o.kullanici, 'kobalt') + kutu('Son 7 gün aktif', o.aktif) + kutu('Yeni (7 gün)', o.yeniKullanici) + kutu('Bekleyen', o.bekleyen, o.bekleyen ? 'limon' : '') +
      '<div class="t genis"><span class="k">İkinci hafta dönüşü</span><span class="orta num">' + (o.donusAday ? Math.round(o.donus / o.donusAday * 100) + '%' : '—') + '</span><span class="ik">' + (o.donusAday ? o.donusAday + ' kişiden ' + o.donus + ' kişi kayıttan 1 hafta sonra hâlâ kullanıyor' : 'Hesap açalı en az 1 hafta olan kullanıcı yok') + '</span></div>' +
      '<div class="t genis"><span class="k">Son 7 günde ne kullanıldı</span>' + ((o.olaylar || []).length ? (o.olaylar || []).map((x) => '<div class="satir num"><span>' + esc(({ antrenman_bitti: 'Antrenman bitirildi', ogun_foto: 'Fotoğrafla öğün', ogun_barkod: 'Barkodla öğün', ogun_liste: 'Listeden öğün', ogun_elle: 'Elle öğün', koc_mesaj: 'Koç mesajı', program_ozel: 'Kendi programını kaydetti', program_yorum: 'Program yorumu', kurulum: 'Kurulum', su: 'Su', paylas: 'Paylaşım' })[x.olay] || x.olay) + '</span><b>' + x.adet + '</b></div>').join('') : '<span class="ik">Henüz kayıt yok.</span>') + '</div>' +
      '<a class="t genis" href="/api/comeback/hesap/yonetim/yedek" download style="flex-direction:row;justify-content:space-between;align-items:center"><span><b>Yedeği indir</b><br><span class="ik">Tüm kullanıcı verisi (şifreler hariç), JSON. Veritabanı ayrıca 7 gün geriye otomatik geri yüklenebilir.</span></span>' + IK.ok + '</a>' +
      '</div>' +
      '<div class="yatay" role="tablist">' + sekmeler.map((x) => '<button class="hap" role="tab" data-act="yon-sekme" data-deger="' + x[0] + '" aria-pressed="' + (yon.sekme === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
      '<div class="t genis" style="padding:6px 16px">' + govde + '</div>';
  }

  function ekranKayit() {
    if (hesap) { location.hash = S.profil ? '#/' : '#/kurulum'; return ''; }
    return ust(geri('#/', 'Başa dön'), '<span class="alt">Hesap oluştur</span>') +
      '<h1 class="baslik">Aramıza katıl<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:0 4px 6px;font-size:15px">Hesabınla programın, öğünlerin ve rekorların her cihazda seninle olur.</p>' +
      '<form data-form="kayit" class="izgara" novalidate>' +
      '<label class="t genis alan"><span>Adın</span><input name="ad" autocomplete="given-name" maxlength="40" required placeholder="Deniz" style="font-size:22px" value="' + esc(S.profil ? S.profil.ad : '') + '"></label>' +
      '<label class="t genis alan"><span>E-posta</span><input name="eposta" type="email" autocomplete="email" inputmode="email" required placeholder="ornek@eposta.com" style="font-size:20px;letter-spacing:-.01em"></label>' +
      sifreAlani('sifre', 'new-password', 'Şifre · en az 8 karakter') +
      '<label class="t genis onay"><input type="checkbox" name="yetiskin"><span>18 yaşından büyüğüm.</span></label>' +
      '<label class="t genis onay"><input type="checkbox" name="riza"><span>Antrenman ve beslenme kayıtlarımın programımı hazırlamak için hesabımda saklanmasına onay veriyorum. Programın ve kalori hedeflerinin tıbbi tavsiye olmadığını biliyorum.</span></label>' +
      '<label class="t genis onay"><input type="checkbox" name="saglikRiza"><span><b>Açık rıza:</b> Kilo, boy, sakatlık bölgelerim ve sağlık kontrolü cevabım gibi sağlık verilerimin yalnızca programımı ve kalori hedefimi hesaplamak için işlenmesine açık rıza veriyorum. Rızamı hesabımı silerek her zaman geri alabilirim.</span></label>' +
      '<a class="metin-btn genis" href="gizlilik.html" target="_blank" rel="noopener" style="text-align:left;color:var(--kobalt);padding-top:0">Aydınlatma metnini oku →</a>' +
      '<p class="hata genis" id="formHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Hesabımı oluştur' + IK.ok + '</button>' +
      '<a class="metin-btn genis" href="#/giris" style="text-align:center;color:var(--murekkep)">Zaten hesabım var · <span style="color:var(--kobalt)">Giriş yap</span></a>' +
      '</form>';
  }
  function ekranGiris() {
    if (hesap) { location.hash = '#/'; return ''; }
    return ust(geri('#/', 'Başa dön'), '<span class="alt">Giriş</span>') +
      '<h1 class="baslik">Tekrar hoş geldin<span class="nokta">.</span></h1>' +
      '<form data-form="giris" class="izgara" novalidate>' +
      '<label class="t genis alan"><span>E-posta</span><input name="eposta" type="email" autocomplete="email" inputmode="email" required placeholder="ornek@eposta.com" style="font-size:20px;letter-spacing:-.01em"></label>' +
      sifreAlani('sifre', 'current-password', 'Şifre') +
      '<p class="hata genis" id="formHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Giriş yap' + IK.ok + '</button>' +
      '<button type="button" class="metin-btn genis" data-act="sifremi-unuttum" style="color:var(--ikincil)">Şifremi unuttum</button>' +
      '<a class="metin-btn genis" href="#/kayit" style="text-align:center;color:var(--murekkep)">Hesabın yok mu? <span style="color:var(--kobalt)">Hesap oluştur</span></a>' +
      '</form>';
  }

  function ekranKurulum() {
    const p = S.profil || { ad: hesap ? hesap.ad : '', cinsiyet: 'e', yas: '', boy: '', kilo: '', hedef: 'kas', spor: 'fitness', deneyim: 'orta', gun: 4, sakatlik: [], odak: [], ortam: 'salon', sure: 60, sezon: 'disi', saglik: false };
    const hap = (grup, deger, yazi, secili, coklu) => '<button type="button" class="hap' + (coklu ? ' siyah' : '') + '" data-act="hap" data-grup="' + grup + '" data-deger="' + deger + '"' + (coklu ? ' data-coklu="1"' : '') + ' aria-pressed="' + (secili ? 'true' : 'false') + '">' + yazi + '</button>';
    const tekli = (grup, liste, secili) => liste.map((x) => hap(grup, x[0], x[1], x[0] === secili)).join('');
    return ust(S.profil ? geri('#/profil') : logo, '<span class="alt">Program kurulumu</span>') +
      '<h1 class="baslik">Seni tanıyalım<span class="nokta">.</span></h1>' +
      '<form data-form="kurulum" class="izgara" novalidate>' +
      '<label class="t genis alan"><span>Adın</span><input name="ad" autocomplete="given-name" maxlength="30" value="' + esc(p.ad) + '" placeholder="Deniz" style="font-size:24px"></label>' +
      '<fieldset class="t genis"><legend>Cinsiyet</legend><div class="haplar">' + tekli('cinsiyet', [['e', 'Erkek'], ['k', 'Kadın']], p.cinsiyet) + '</div><span class="ik">Kalori hesabı için gerekiyor.</span></fieldset>' +
      '<div class="genis" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--ara)">' +
      '<label class="t alan"><span>Yaş</span><input name="yas" inputmode="numeric" value="' + esc(p.yas) + '" placeholder="24"></label>' +
      '<label class="t alan"><span>Boy, cm</span><input name="boy" inputmode="numeric" value="' + esc(p.boy) + '" placeholder="178"></label>' +
      '<label class="t alan"><span>Kilo, kg</span><input name="kilo" inputmode="decimal" value="' + esc(p.kilo ? String(p.kilo).replace('.', ',') : '') + '" placeholder="76,4"></label>' +
      '</div>' +
      '<fieldset class="t genis"><legend>Hedefin</legend><div class="haplar">' + tekli('hedef', [['kas', 'Kas kazanmak'], ['yag', 'Yağ yakmak'], ['guc', 'Güçlenmek'], ['kondisyon', 'Kondisyon']], p.hedef) + '</div></fieldset>' +
      '<fieldset class="t genis"><legend>Uğraştığın spor</legend><div class="haplar">' + tekli('spor', [['fitness', 'Fitness'], ['futbol', 'Futbol'], ['basketbol', 'Basketbol'], ['kosu', 'Koşu'], ['yuzme', 'Yüzme'], ['tenis', 'Tenis'], ['dovus', 'Dövüş sporları']], p.spor) + '</div><span class="ik">Spora özel güç, sürat ve sakatlık önleme hareketleri eklenir.</span></fieldset>' +
      '<fieldset class="t genis" id="sezonAlan"' + (p.spor === 'fitness' ? ' hidden' : '') + '><legend>Şu an sezonda mısın?</legend><div class="haplar">' + tekli('sezon', [['disi', 'Sezon dışı / hazırlık'], ['ici', 'Sezon içi, maçlar var']], p.sezon || 'disi') + '</div><span class="ik">Sezon içinde set sayısı azalır, amaç kuvveti korumak olur.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Nerede çalışacaksın?</legend><div class="haplar">' + tekli('ortam', [['salon', 'Spor salonu'], ['ev', 'Evde, dambılla'], ['vucut', 'Ekipmansız'], ['dis', 'Dışarıda, parkta']], p.ortam || 'salon') + '</div><span class="ik">' + 'Ev: dambıl ve lastik bant. Ekipmansız: yalnızca vücut ağırlığı ve bir sandalye. Park: barfiks ve paralel bar.' + '</span></fieldset>' +
      '<fieldset class="t genis"><legend>Bir antrenman ne kadar sürsün?</legend><div class="haplar">' + tekli('sure', [['45', '45 dk'], ['60', '60 dk'], ['75', '75 dk'], ['90', '90 dk']], String(p.sure || 60)) + '</div></fieldset>' +
      '<fieldset class="t"><legend>Deneyim</legend><div class="haplar">' + tekli('deneyim', [['baslangic', 'Yeni'], ['orta', 'Orta'], ['ileri', 'İleri']], p.deneyim) + '</div></fieldset>' +
      '<div class="t limon ara-sb"><span class="k">Haftada</span><div class="satir"><button type="button" class="yuvarlak" data-act="gun" data-yon="-1" aria-label="Gün azalt">−</button><span class="buyuk num" id="gunSay">' + p.gun + '</span><button type="button" class="yuvarlak" data-act="gun" data-yon="1" aria-label="Gün artır">+</button></div><span class="k">gün antrenman</span></div>' +
      '<fieldset class="t genis"><legend>Programını kim yazsın?</legend><div class="haplar">' + tekli('yazan', [['biz', 'COMEBACK. kursun'], ['ben', 'Kendim yazacağım']], S.program && S.program.ozel ? 'ben' : 'biz') + '</div><span class="ik">Kendin yazarsan hareketleri kütüphaneden seçersin; istersen yapay zekâ yorumlar. Hazır programı da sonradan düzenleyebilirsin.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Üzerine gitmek istediğin bölge</legend><div class="haplar">' + Object.keys(M.ODAK).map((k) => hap('odak', k, M.ODAK[k].ad, (p.odak || []).indexOf(k) >= 0, true)).join('') + '</div><span class="ik">En fazla 2 bölge. Seçtiğin bölgeye haftada 2 gün ek hareket koyarız. İstemezsen boş bırak.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Ağrı ya da sakatlık var mı?</legend><div class="haplar">' + K.SAKATLIK.map((x) => hap('sakatlik', x[0], x[1], (p.sakatlik || []).indexOf(x[0]) >= 0, true)).join('') + '</div><span class="ik">Seçersen o bölgeyi zorlayan hareketlerin yerine güvenli olanları koyarız.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Sağlık kontrolü</legend><span style="font-size:14px;line-height:1.5">Doktorun kalp rahatsızlığın olduğunu söyledi mi? Egzersizde ya da dinlenirken göğüs ağrısı, baş dönmesi veya bayılma yaşıyor musun? Hareketle kötüleşebilecek bir kemik ya da eklem sorunun, tansiyon veya kalp için düzenli kullandığın bir ilacın var mı?</span><div class="haplar">' + tekli('saglik', [['hayir', 'Hayır, hiçbiri'], ['evet', 'Evet, en az biri']], p.saglik ? 'evet' : 'hayir') + '</div><span class="ik">Ayrıntı saklanmaz; yalnızca evet/hayır cevabı, doktor onayı uyarısı için tutulur.</span></fieldset>' +
      '<label class="t genis onay"><input type="checkbox" name="yetiskin"' + (S.profil || hesap ? ' checked' : '') + '><span>18 yaşından büyüğüm. Programın ve kalori hedeflerinin genel bilgi olduğunu, tıbbi tavsiye yerine geçmediğini biliyorum.</span></label>' +
      '<p class="hata genis" id="kurulumHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit">Programımı oluştur' + IK.ok + '</button>' +
      '</form>';
  }

  // Haftalık kas başına set: hedef aralık 10–20 (Schoenfeld 2017)
  function planHacim(pr) {
    if (!pr.hacim) return '';
    const ust = 22; const [alt, tavan] = pr.hacimHedef || [10, 20];
    const satir = Object.keys(pr.hacim).map((m) => {
      const v = pr.hacim[m]; const w = Math.min(100, (v / ust) * 100);
      const durum = v >= alt ? (v > tavan ? 'fazla' : 'iyi') : (v >= alt * 0.6 ? 'az' : 'cokaz');
      return '<div class="hacim-satir ' + durum + '"><span>' + esc(K.KAS[m]) + '</span><div class="hacim-cubuk" aria-hidden="true"><span style="width:' + w + '%"></span><i style="left:' + (alt / ust * 100) + '%"></i></div><b class="num">' + sayi(v, 1) + '</b></div>';
    }).join('');
    return '<div class="t genis tum"><div class="satir"><span class="k">Haftalık set, kas başına</span><span class="ik">çizgi: ' + alt + ' set</span></div><div class="hacim">' + satir + '</div><span class="ik">Ana kas için set 1, destek kas için 0,5 sayıldı. Kas kazanımı için haftada 10–20 set önerilir.</span></div>';
  }

  /* ---------- koç (yapay zekâ) ---------- */
  let kocYuk = false; let kocAcil = false;
  const KOC_HIZLI = ['Dizimde ağrı var, antrenmana devam edeyim mi?', 'Bugün çok yorgun ve isteksizim.', 'Bu hareketi yaparken belimde zorlanma hissettim.', 'Antrenmandan önce ve sonra ne yemeliyim?'];
  function kocBaglam() {
    const p = S.profil || {};
    const son = Object.keys(S.gunluk).sort().reverse().filter((k) => S.gunluk[k].antrenman).slice(0, 5).map((k) => ({ tarih: k, ad: S.gunluk[k].antrenman.ad, set: S.gunluk[k].antrenman.set, dk: S.gunluk[k].antrenman.dk }));
    const bugun = S.gunluk[tarihKey()]; const tp = bugun ? toplam(bugun.ogun) : null;
    return {
      profil: { ad: p.ad, cinsiyet: p.cinsiyet === 'k' ? 'kadın' : 'erkek', yas: p.yas, boy: p.boy, kilo: S.kilo.length ? S.kilo[S.kilo.length - 1].kg : p.kilo, hedef: p.hedef, deneyim: p.deneyim, spor: p.spor, ortam: p.ortam, sakatlik: (p.sakatlik || []).map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]) },
      hedefler: S.hedef ? { kcal: S.hedef.kcal, protein: S.hedef.protein } : null,
      bugun: { tarih: tarihYazi(), yenen_kcal: tp ? Math.round(tp.k) : 0, antrenman_suruyor: !!S.seans },
      program: S.program ? S.program.gunler.map((g) => GUN_AD[g.hafta] + ' · ' + g.ad + ': ' + g.hareketler.map((x) => (D.HAREKET[x.id] || { ad: x.id }).ad + ' ' + x.set + 'x' + x.tekrar).join(', ')) : [],
      son_antrenmanlar: son
    };
  }
  function ekranKoc() {
    if (!S.profil) return ekranKarsilama();
    const l = S.koc || [];
    const bicim = (t) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•]\s+/gm, '• ').replace(/^#+\s*/gm, '').replace(/\n/g, '<br>');
    const balon = (m) => '<div class="koc-balon ' + (m.rol === 'koc' ? 'koc' : 'ben') + '">' + (m.rol === 'koc' ? bicim(m.metin) : esc(m.metin).replace(/\n/g, '<br>')) + '</div>';
    return ust(geri('#/'), '<span class="alt">Koç · yapay zekâ</span>') +
      '<h1 class="baslik">Koça danış<span class="nokta">.</span></h1>' +
      '<div class="t koyu" style="gap:6px"><span style="font-size:15px;line-height:1.5">Sakatlık, ağrı, yorgunluk, program ya da beslenme: aklına takılanı yaz. Programını ve son antrenmanlarını bilerek cevap verir.</span><span class="ik" style="color:var(--koyu-ikincil)">Doktor değildir, teşhis koymaz. Göğüs ağrısı, nefes darlığı, bayılma gibi durumlarda antrenmanı bırak ve 112\'yi ara.</span></div>' +
      (kocAcil ? '<div class="koc-acil" role="alert"><b>Bu belirti acil olabilir.</b> Antrenmanı hemen bırak. Kendini iyi hissetmiyorsan <a href="tel:112">112\'yi ara</a> ya da en yakın acile git.</div>' : '') +
      '<div class="koc-akis" id="kocAkis" aria-live="polite">' + (l.length ? l.map(balon).join('') : '<div class="haplar">' + KOC_HIZLI.map((q) => '<button class="hap" data-act="koc-hizli" data-metin="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>') +
      (kocYuk ? '<div class="koc-balon koc yaziyor" aria-label="Koç yazıyor"><i></i><i></i><i></i></div>' : '') + '</div>' +
      '<form data-form="koc" class="koc-yaz" novalidate><label class="gizli" for="kocMetin">Koça mesajın</label><textarea id="kocMetin" name="metin" rows="1" maxlength="1200" placeholder="Örnek: Squat yaparken dizimin içi ağrıdı." ' + (kocYuk ? 'disabled' : '') + '></textarea><button class="btn ana" type="submit" aria-label="Gönder" ' + (kocYuk ? 'disabled' : '') + '>' + IK.ok + '</button></form>' +
      (l.length ? '<button class="metin-btn" data-act="koc-temizle" style="align-self:center;color:var(--ikincil)">Sohbeti temizle</button>' : '');
  }
  async function kocGonder(metin) {
    metin = String(metin || '').trim(); if (!metin || kocYuk) return;
    if (!hesap) { toast('Koçla konuşmak için giriş yapmalısın.'); return; }
    S.koc = (S.koc || []).concat([{ rol: 'ben', metin: metin.slice(0, 1200), zaman: Date.now() }]).slice(-40);
    kocYuk = true; kaydet(); render(); kocKaydir();
    try {
      const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'sohbet', mesajlar: S.koc.slice(-12).map((m) => ({ rol: m.rol, metin: m.metin })), baglam: kocBaglam() }) });
      const j = await r.json().catch(() => ({}));
      if (j.acil) kocAcil = true;
      if (r.ok && j.metin) olay('koc_mesaj');
      if (r.ok && j.metin) S.koc.push({ rol: 'koc', metin: j.metin, zaman: Date.now() });
      else toast(j.hata || 'Koç şu an cevap veremiyor.');
    } catch (e) { toast('Bağlantı kurulamadı.'); }
    kocYuk = false; kaydet(); render(); kocKaydir();
  }
  function kocKaydir() { const a = document.getElementById('kocAkis'); if (a && a.lastElementChild) a.lastElementChild.scrollIntoView({ block: 'end', behavior: azHareket ? 'auto' : 'smooth' }); }

  /* ---------- kendi programım: düzenleyici ---------- */
  let ptaslak = null; let pSecGun = 0; let pAra = ''; let pBolge = ''; let pYorumYuk = false;
  const PBOLGE = [['gogus', 'Göğüs', ['yatay_itme', 'egimli_itme', 'dips']], ['sirt', 'Sırt', ['yatay_cekme', 'dikey_cekme']], ['omuz', 'Omuz', ['dikey_itme', 'yan_omuz', 'arka_omuz', 'rotator']], ['kol', 'Kol', ['biceps', 'triceps']], ['bacak', 'Bacak', ['diz', 'tek_bacak', 'quad_izo', 'hamstring_izo', 'adduktor', 'abduktor', 'baldir']], ['kalca', 'Kalça', ['kalca']], ['karin', 'Karın', ['core_anti_ext', 'core_anti_rot', 'core_lat', 'core_rot', 'tasima', 'kavrama', 'boyun']], ['kondisyon', 'Kondisyon', ['kardiyo', 'surat', 'ceviklik', 'plyo_dikey', 'plyo_inis', 'plyo_yatay', 'plyo_ust']]];
  const VARSAYILAN_GUN = { 1: [2], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 4, 5], 6: [0, 1, 2, 3, 4, 5] };
  function bosOzelProgram(n) {
    const gunler = (VARSAYILAN_GUN[n] || VARSAYILAN_GUN[3]).map((h, i) => ({ id: 'ozel-' + kimlik() + i, gid: 'ozel', ad: 'Gün ' + String.fromCharCode(65 + i), hafta: h, bolge: 'ozel', hareketler: [] }));
    return { surum: 2, ozel: true, ad: 'Kendi programım', gunler, notlar: [], kaynaklar: ['acsm', 'hacim'] };
  }
  function ptaslakAl() {
    if (!ptaslak) {
      ptaslak = JSON.parse(JSON.stringify(S.program || bosOzelProgram(S.profil ? S.profil.gun : 3)));
      if (!ptaslak.ozel) { ptaslak.ad = ptaslak.ad + ' · düzenlendi'; }
    }
    return ptaslak;
  }
  function ekranProgramDuzen() {
    if (!S.profil) return ekranKarsilama();
    const pr = ptaslakAl();
    const an = M.ozelAnaliz(pr.gunler, S.profil);
    const gunler = pr.gunler.map((g, gi) => {
      const satirlar = g.hareketler.map((x, i) => {
        const h = D.HAREKET[x.id] || { ad: x.id, kas: '' };
        return '<div class="pd-hareket"><div class="yigin" style="min-width:0"><b>' + esc(h.ad) + '</b><span class="ik">' + esc(h.kas || '') + (x.birim !== 'tekrar' ? ' · ' + BIRIM[x.birim].toLowerCase() : '') + '</span></div>' +
          '<div class="pd-kontrol"><div class="pd-sayac" role="group" aria-label="Set sayısı"><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="-1" aria-label="Set azalt">−</button><span class="num">' + x.set + '<small>set</small></span><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="1" aria-label="Set artır">+</button></div>' +
          '<label class="pd-tekrar"><span class="gizli">' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '</span><input data-pd="tekrar" data-g="' + gi + '" data-i="' + i + '" value="' + esc(x.tekrar) + '" inputmode="text" maxlength="7" aria-label="' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '"><small>' + BIRIM[x.birim].toLowerCase() + '</small></label>' +
          '<div class="pd-is"><button type="button" class="pd-ikon" data-act="pd-tasi" data-g="' + gi + '" data-i="' + i + '" data-yon="-1" aria-label="Yukarı taşı"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="pd-ikon" data-act="pd-tasi" data-g="' + gi + '" data-i="' + i + '" data-yon="1" aria-label="Aşağı taşı"' + (i === g.hareketler.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><button type="button" class="pd-ikon" data-act="pd-sil" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(h.ad) + ' çıkar">' + IK.kapat + '</button></div></div></div>';
      }).join('');
      return '<section class="t genis pd-gun" aria-label="' + esc(g.ad) + '">' +
        '<div class="satir" style="gap:8px"><input class="pd-gunad" data-pd="gunad" data-g="' + gi + '" value="' + esc(g.ad) + '" maxlength="24" aria-label="Gün adı"><span class="ik num">~' + an.dk[gi] + ' dk</span>' +
        (pr.gunler.length > 1 ? '<button type="button" class="pd-ikon" data-act="pd-gunsil" data-g="' + gi + '" aria-label="' + esc(g.ad) + ' gününü sil">' + IK.kapat + '</button>' : '') + '</div>' +
        '<div class="haplar pd-hafta" role="group" aria-label="Haftanın günü">' + GUN_KISA.map((k, h) => { const dolu = pr.gunler.some((y, yi) => yi !== gi && y.hafta === h); return '<button type="button" class="hap" data-act="pd-hafta" data-g="' + gi + '" data-h="' + h + '" aria-pressed="' + (g.hafta === h) + '"' + (dolu ? ' disabled' : '') + '>' + k + '</button>'; }).join('') + '</div>' +
        (satirlar || '<p class="ik" style="padding:6px 0">Bu güne henüz hareket eklemedin.</p>') +
        '<a class="btn cerceve" href="#/program/ekle/' + gi + '" style="min-height:46px">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Hareket ekle</a></section>';
    }).join('');
    const yorum = pr.yorum ? '<div class="t genis koyu"><span class="k">Yapay zekâ yorumu</span>' + pr.yorum.ozet.map((x) => '<p style="font-size:15px;line-height:1.5">' + esc(x) + '</p>').join('') +
      (pr.yorum.oneriler && pr.yorum.oneriler.length ? '<ul class="madde" style="color:var(--koyu-yazi)">' + pr.yorum.oneriler.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '<span class="ik" style="color:var(--koyu-ikincil)">Genel bilgidir, tıbbi tavsiye değildir.</span></div>' : '';
    return ust(geri(S.program && S.program.gunler.some((g) => g.hareketler.length) ? '#/antrenman' : '#/profil'), '<span class="alt">' + (pr.ozel ? 'Kendi programın' : 'Programı düzenle') + '</span>') +
      '<h1 class="baslik">Programın<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<label class="t genis alan"><span>Program adı</span><input data-pd="ad" value="' + esc(pr.ad) + '" maxlength="40" style="font-size:22px"></label>' +
      gunler +
      (pr.gunler.length < 7 ? '<button type="button" class="btn cerceve genis" data-act="pd-gunekle">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Gün ekle</button>' : '') +
      planHacim({ hacim: an.hacim, hacimHedef: an.hacimHedef }) +
      (an.uyari.length ? '<div class="t genis"><span class="k">Dikkat</span><ul class="madde">' + an.uyari.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul></div>' : '') +
      yorum +
      '<button type="button" class="btn siyah genis" data-act="pd-yorum"' + (pYorumYuk ? ' disabled' : '') + '>' + (pYorumYuk ? 'Yorumlanıyor…' : (pr.yorum ? 'Yeniden yorumlat' : 'Yapay zekâya yorumlat')) + IK.ok + '</button>' +
      '</div>' +
      '<button class="btn ana buyuk-btn" data-act="pd-kaydet">Programı kaydet' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="pd-vazgec" style="align-self:center;color:var(--ikincil)">Değişiklikleri at</button>';
  }
  function ekranProgramEkle(gi) {
    const pr = ptaslakAl(); const g = pr.gunler[gi];
    if (!g) { location.hash = '#/program'; return ''; }
    pSecGun = gi;
    const ekip = S.profil && K.ORTAM[S.profil.ortam] ? K.ORTAM[S.profil.ortam].ekipman : null;
    const q = pAra.trim().toLocaleLowerCase('tr');
    const bol = PBOLGE.find((b) => b[0] === pBolge);
    const var_ = new Set(g.hareketler.map((x) => x.id));
    const liste = Object.keys(K.HAREKET).map((id) => K.HAREKET[id])
      .filter((h) => !bol || bol[2].indexOf(h.kalip) >= 0)
      .filter((h) => !q || h.ad.toLocaleLowerCase('tr').indexOf(q) >= 0 || D.HAREKET[h.id].kas.toLocaleLowerCase('tr').indexOf(q) >= 0)
      .sort((a, b) => { const u = (h) => (ekip && !h.ekipman.every((e) => ekip.indexOf(e) >= 0) ? 1 : 0); return u(a) - u(b) || a.seviye - b.seviye; });
    const satir = (h) => {
      const uygunDegil = ekip && !h.ekipman.every((e) => ekip.indexOf(e) >= 0);
      const sakat = (S.profil.sakatlik || []).some((b) => (h.kontra || []).indexOf(b) >= 0);
      return '<button type="button" class="pd-sec" data-act="pd-ekle" data-id="' + h.id + '"' + (var_.has(h.id) ? ' disabled' : '') + '><span class="yigin"><b>' + esc(h.ad) + '</b><span class="ik">' + esc(D.HAREKET[h.id].kas) + ' · ' + h.ekipman.map((e) => K.EKIPMAN[e]).join(', ') + '</span>' +
        (uygunDegil || sakat ? '<span class="pd-not">' + [uygunDegil ? 'ortamında ekipmanı yok' : '', sakat ? 'sakatlık bölgeni zorlayabilir' : ''].filter(Boolean).join(' · ') + '</span>' : '') + '</span>' +
        (var_.has(h.id) ? '<span class="ik">ekli</span>' : IK.arti.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:var(--kobalt);stroke-width:2.4;flex:none"')) + '</button>';
    };
    return ust(geri('#/program'), '<span class="alt">' + esc(g.ad) + ' · hareket ekle</span>') +
      '<h1 class="baslik">Hareket seç<span class="nokta">.</span></h1>' +
      '<label class="t alan"><span>Ara</span><input id="pdAra" type="search" value="' + esc(pAra) + '" placeholder="Squat, göğüs, dambıl…" autocomplete="off" style="font-size:20px"></label>' +
      '<div class="yatay" role="group" aria-label="Bölge">' + '<button class="hap" data-act="pd-bolge" data-deger="" aria-pressed="' + (!pBolge) + '">Hepsi</button>' + PBOLGE.map((b) => '<button class="hap" data-act="pd-bolge" data-deger="' + b[0] + '" aria-pressed="' + (pBolge === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' +
      '<div class="t" style="padding:4px 12px" id="pdListe">' + (liste.length ? liste.map(satir).join('') : '<p class="ik" style="padding:12px 4px">Bu aramada hareket yok.</p>') + '</div>';
  }

  function ekranPlan() {
    const p = S.profil, h = S.hedef, pr = S.program;
    if (!p) return ekranKarsilama();
    const uyarilar = [];
    if (p.yas >= 60) uyarilar.push('60 yaş üstünde yeni bir programa başlamadan önce doktoruna danışmanı öneririz.');
    if ((p.sakatlik || []).length) uyarilar.push('Ağrın artarsa o hareketi bırak ve bir fizyoterapiste danış.');
    return ust(logo, '<span class="alt">Programın hazır</span>') +
      '<h1 class="baslik">' + esc(p.ad || 'Hazırsın') + (p.ad ? ', hazırsın' : '') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t kobalt genis"><span class="k">Antrenman</span><span class="orta">' + p.gun + ' gün · ' + esc(pr.ad) + '</span><span class="ik">' + pr.gunler.map((g) => GUN_KISA[g.hafta] + ' ' + esc(g.ad)).join(' · ') + '</span></div>' +
      '<div class="t limon h130"><span class="k">Günlük kalori</span><span class="buyuk num">' + sayi(h.kcal) + '</span><span class="k">kcal</span></div>' +
      '<div class="t h130 num"><span class="k">Makrolar</span><div class="satir"><span>Protein</span><b>' + h.protein + ' g</b></div><div class="satir"><span>Karb.</span><b>' + h.karb + ' g</b></div><div class="satir"><span>Yağ</span><b>' + h.yag + ' g</b></div></div>' +
      '<div class="t koyu genis tum num"><span class="k">Nasıl hesapladık</span><span style="font-size:14px;line-height:1.5">Bazal metabolizman ' + sayi(h.bmr) + ' kcal (Mifflin-St Jeor). Haftada ' + p.gun + ' gün antrenmanla günlük harcaman yaklaşık ' + sayi(h.tdee) + ' kcal. Hedefine göre ' + sayi(h.kcal) + ' kcal ayarladık' + (h.haftalikKg ? ' (haftada yaklaşık ' + sayi(Math.abs(h.haftalikKg), 2) + ' kg ' + (h.haftalikKg < 0 ? 'kayıp' : 'artış') + ')' : '') + '. Protein vücut ağırlığının kilosu başına ' + sayi(h.protein / p.kilo, 1) + ' g.</span></div>' +
      planHacim(pr) +
      (pr.notlar && pr.notlar.length ? '<div class="t genis"><span class="k">Senin için notlar</span><ul class="madde">' + pr.notlar.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
      (pr.kurallar ? '<div class="t genis"><span class="k">Antrenman kuralları</span><ul class="madde">' + pr.kurallar.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
      (pr.kaynaklar ? '<div class="t genis tum"><span class="k">Dayandığımız kaynaklar</span><ul class="madde kaynak">' + pr.kaynaklar.filter((k) => K.KAYNAK[k]).map((k) => '<li><a href="' + esc(K.KAYNAK[k].url) + '" target="_blank" rel="noopener">' + esc(K.KAYNAK[k].ad) + '</a></li>').join('') + '</ul></div>' : '') +
      '</div>' +
      uyarilar.map((u) => '<div class="uyari">' + esc(u) + '</div>').join('') +
      '<a class="btn ana buyuk-btn" href="#/">Başlayalım' + IK.ok + '</a>';
  }

  function ekranBugun() {
    if (!S.profil) return ekranKarsilama();
    const g = gun(); const tp = toplam(g.ogun); const h = S.hedef;
    const bugunku = bugunkuGun(); const sonra = sonrakiGun();
    const kalan = h.kcal - tp.k;
    let antr;
    if (S.seans) {
      const sg = S.program.gunler.find((x) => x.id === S.seans.gunId);
      antr = '<a class="t kobalt genis ana-kutu h150" href="#/antrenman" style="min-height:210px"><div class="k satir"><span>Devam eden antrenman</span><span class="num">' + Math.round((Date.now() - S.seans.baslangic) / 60000) + ' dk</span></div><span class="dev">' + esc(sg ? sg.ad : 'Antrenman') + '<span style="color:var(--koyu)">.</span></span><span class="btn beyaz" style="align-self:flex-start;min-height:44px">Devam et' + IK.ok + '</span></a>';
    } else if (g.antrenman) {
      antr = '<a class="t koyu genis ana-kutu h150" href="#/antrenman" style="min-height:190px"><span class="k">Bugün tamamlandı</span><span class="dev">' + esc(g.antrenman.ad) + '<span style="color:var(--mavi-gece)">.</span></span><span class="ik num">' + g.antrenman.set + ' set · ' + sayi(g.antrenman.hacim) + ' kg hacim · ' + g.antrenman.dk + ' dk</span></a>';
    } else if (bugunku && !bugunku.hareketler.length) {
      antr = '<a class="t kobalt genis ana-kutu h150" href="#/program" style="min-height:190px"><span class="k">Programın</span><span class="dev">Programını yaz<span style="color:var(--koyu)">.</span></span><span class="btn beyaz" style="align-self:flex-start;min-height:44px">Başla' + IK.ok + '</span></a>';
    } else if (bugunku) {
      antr = '<a class="t kobalt genis ana-kutu h150" href="#/antrenman" style="min-height:230px"><div class="k satir num"><span>Bugünün antrenmanı</span><span>' + bugunku.hareketler.length + ' hareket</span></div><span class="dev">' + esc(bugunku.ad) + '<span style="color:var(--koyu)">.</span></span><span class="btn beyaz" style="align-self:flex-start;min-height:44px">Başla' + IK.ok + '</span></a>';
    } else {
      antr = '<a class="t koyu genis ana-kutu h150" href="#/antrenman" style="min-height:190px"><span class="k">Bugün dinlenme günü</span><span class="dev">Dinlen<span style="color:var(--mavi-gece)">.</span></span><span class="ik">' + (sonra ? 'Sıradaki: ' + (sonra.kac === 1 ? 'yarın' : GUN_AD[sonra.gun.hafta]) + ' · ' + esc(sonra.gun.ad) : '') + '</span></a>';
    }
    const ana = ['bench', 'squat', 'deadlift', 'ohp', 'db_bench', 'goblet', 'legpress'].find((x) => S.rekor[x]);
    const rekorKutu = ana
      ? '<a class="t h150" href="#/ilerleme"><span class="k">' + esc(D.HAREKET[ana].ad) + ' rekoru</span><span class="orta num">' + sayi(S.rekor[ana].kg, 1) + '<span class="ik" style="font-weight:600"> kg × ' + S.rekor[ana].tekrar + '</span></span><span class="ik">' + esc(S.rekor[ana].tarih) + '</span></a>'
      : '<a class="t h150" href="#/ilerleme"><span class="k">Kilo</span><span class="orta num">' + sayi(S.kilo.length ? S.kilo[S.kilo.length - 1].kg : S.profil.kilo, 1) + '<span class="ik" style="font-weight:600"> kg</span></span><span class="ik">Tart, ekle, gelişimi gör</span></a>';
    const sa = new Date().getHours();
    const selam = sa < 5 ? 'İyi geceler' : sa < 12 ? 'Günaydın' : sa < 18 ? 'İyi günler' : 'İyi akşamlar';
    return ust(logo, '<span class="alt">' + tarihYazi() + '</span>') +
      '<h1 class="baslik">' + selam + (S.profil.ad ? ', ' + esc(S.profil.ad) : '') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + antr +
      '<a class="t limon h150" href="#/beslenme"><span class="k">' + (kalan >= 0 ? 'Kalan kalori' : 'Hedefin üstünde') + '</span><span class="buyuk num" data-say="' + Math.round(Math.abs(kalan)) + '">' + sayi(Math.abs(kalan)) + '</span><span class="k" style="display:inline-flex;align-items:center;gap:6px">' + sayi(tp.k) + ' / ' + sayi(h.kcal) + ' kcal</span></a>' +
      '<a class="t koyu h150" href="#/ilerleme"><span class="k">Seri</span><span class="buyuk num"><span data-say="' + seri() + '">' + seri() + '</span><span style="color:var(--mavi-gece)">.</span></span><span class="ik">gün üst üste</span></a>' +
      '<a class="t h150" href="#/beslenme"><span class="k">Protein</span><span class="orta num">' + sayi(tp.p) + '<span class="ik" style="font-weight:600"> / ' + h.protein + ' g</span></span><div class="cubuk" role="img" aria-label="Protein hedefinin yüzde ' + yuzde(tp.p, h.protein) + '\'i"><span style="width:' + yuzde(tp.p, h.protein) + '%"></span></div></a>' +
      rekorKutu +
      '<a class="t koyu genis koc-kutu" href="#/koc"><span class="k">Koç · yapay zekâ</span><b style="font-size:20px;letter-spacing:-.02em">Bir yerin mi ağrıyor, keyfin mi yok?</b><span class="ik" style="color:var(--koyu-ikincil)">Koça danış, programına göre cevap versin.</span></a>' +
      '<div class="t genis tum"><span class="k">Öğün ekle</span><div class="haplar"><a class="hap" href="#/ekle/foto">' + IK.kamera.replace('<svg', '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2"') + 'Fotoğrafla</a><a class="hap" href="#/ekle/ara">Listeden</a><a class="hap" href="#/ekle/barkod">Barkod</a><a class="hap" href="#/ekle/elle">Elle</a></div></div>' +
      '</div>';
  }

  /* --- antrenman --- */
  let secilenGun = null;
  let degisAcik = null;
  function ekranAntrenman() {
    if (!S.profil) return ekranKarsilama();
    if (S.seans) return ekranSeans();
    const pr = S.program;
    if (!pr.gunler.some((g) => g.hareketler.length)) return ust(logo, '<span class="alt">' + esc(pr.ad) + '</span>') + '<h1 class="baslik">Antrenman<span class="nokta">.</span></h1><div class="t kobalt"><span class="k">Programın boş</span><span style="font-size:18px;font-weight:700;line-height:1.4">Günlerini ve hareketlerini seç, set ve tekrarlarını yaz. İstersen yapay zekâ yorumlasın.</span></div><a class="btn ana buyuk-btn" href="#/program">Programımı yaz' + IK.ok + '</a>';
    const bugunku = bugunkuGun();
    const sg = pr.gunler.find((x) => x.id === secilenGun) || bugunku || pr.gunler[0];
    const bitti = gun().antrenman;
    return ust(logo, '<span class="alt">' + esc(pr.ad) + '</span>') +
      '<h1 class="baslik">Antrenman<span class="nokta">.</span></h1>' +
      '<div class="yatay" role="tablist" aria-label="Program günleri">' + pr.gunler.map((g) => '<button class="hap" role="tab" data-act="gunsec" data-id="' + g.id + '" aria-pressed="' + (g.id === sg.id) + '">' + GUN_KISA[g.hafta] + ' · ' + esc(g.ad) + (g === bugunku ? ' · bugün' : '') + '</button>').join('') + '</div>' +
      '<div class="izgara"><div class="t kobalt genis ara-sb" style="min-height:150px"><div class="k satir num"><span>' + GUN_AD[sg.hafta] + '</span><span>' + sg.hareketler.reduce((a, x) => a + x.set, 0) + ' set' + (sg.dk ? ' · ~' + sg.dk + ' dk' : '') + '</span></div><span class="dev" style="font-size:46px">' + esc(sg.ad) + '<span style="color:var(--koyu)">.</span></span></div>' +
      '<div class="t genis" style="padding:4px 16px"><div class="liste">' + sg.hareketler.map((x, i) => {
        const hk = hedefKilo(x.id);
        const acik = degisAcik === sg.id + ':' + i;
        const alt = acik ? M.alternatifler(S.profil, x, sg.hareketler.map((y) => y.id)) : [];
        return '<div class="hareket-satir' + (acik ? ' acik' : '') + '"><div class="ad"><b>' + esc(D.HAREKET[x.id].ad) + '</b><span class="ik">' + (x.blok && ['ana', 'yard', 'izo'].indexOf(x.blok) < 0 ? BLOK[x.blok] + ' · ' : '') + esc(D.HAREKET[x.id].kas) + (x.not ? ' · ' + esc(x.not) : '') + '</span></div><span class="num" style="font-weight:800;font-size:14px;text-align:right">' + x.set + ' × ' + esc(x.tekrar) + (hk ? '<br><span class="ik" style="font-weight:600">' + sayi(hk, 1) + ' kg</span>' : '') + '</span>' +
          '<button class="degis-btn" data-act="degisac" data-id="' + sg.id + ':' + i + '" aria-expanded="' + acik + '" aria-label="' + esc(D.HAREKET[x.id].ad) + ' yerine başka hareket seç">' + IK.degis + '</button>' +
          (acik ? '<div class="degis-liste"><span class="ik">Bu hareket yoksa ya da yapamıyorsan, aynı kası çalıştıran biriyle değiştir:</span><div class="haplar">' +
            (alt.length ? alt.map((id) => '<button class="hap" data-act="degissec" data-id="' + sg.id + ':' + i + ':' + id + '">' + esc(D.HAREKET[id].ad) + '</button>').join('') : '<span class="ik">Ortamına uygun başka hareket bulunamadı.</span>') +
            '</div></div>' : '') + '</div>';
      }).join('') + '</div></div></div>' +
      (bitti ? '<div class="t limon"><span class="k">Bugün ' + esc(bitti.ad) + ' tamamlandı</span><span style="font-weight:700">İstersen yine de yeni bir antrenman başlatabilirsin.</span></div>' : '') +
      '<button class="btn ana buyuk-btn" data-act="basla" data-id="' + sg.id + '">' + esc(sg.ad) + ' başlat' + IK.ok + '</button>' +
      '<a class="metin-btn" href="#/program" style="align-self:center;color:var(--murekkep)">' + (pr.ozel ? 'Programımı düzenle' : 'Programı düzenle ya da kendi programını yaz') + '</a>';
  }

  // hareket görseli: kullanıcının cinsiyetine göre (yoksa diğeri); başlangıç ve bitiş üst üste, yavaşça geçiş yapar
  function hareketGorsel(id) {
    const g = (window.CB_GORSEL || {})[id]; if (!g) return '';
    const tam = (l) => l && (l.indexOf('tut') >= 0 || (l.indexOf('bas') >= 0 && l.indexOf('bit') >= 0));
    const c0 = S.profil && S.profil.cinsiyet === 'k' ? 'k' : 'e';
    const c = tam(g[c0]) ? c0 : tam(g[c0 === 'k' ? 'e' : 'k']) ? (c0 === 'k' ? 'e' : 'k') : null;
    if (!c) return '';
    const ad = esc(D.HAREKET[id] ? D.HAREKET[id].ad : id);
    const src = (k) => 'gorsel/' + id + '_' + c + '_' + k + '.webp';
    if (g[c].indexOf('tut') >= 0) return '<figure class="hg"><img src="' + src('tut') + '" alt="' + ad + ' doğru duruş" loading="lazy" decoding="async" width="960" height="720"></figure>';
    return '<figure class="hg dongu"><img src="' + src('bas') + '" alt="' + ad + ' başlangıç" loading="lazy" decoding="async" width="960" height="720"><img class="ust" src="' + src('bit') + '" alt="' + ad + ' bitiş" loading="lazy" decoding="async" width="960" height="720"><figcaption><span>Başlangıç</span><span>Bitiş</span></figcaption></figure>';
  }

  function ekranSeans() {
    const s = S.seans; const sg = S.program.gunler.find((x) => x.id === s.gunId);
    const dk = Math.round((Date.now() - s.baslangic) / 60000);
    const tamam = Object.values(s.setler).reduce((a, l) => a + l.filter((x) => x.ok).length, 0);
    const toplamSet = Object.values(s.setler).reduce((a, l) => a + l.length, 0);
    return ust('<a class="ikon-btn" href="#/" aria-label="Ana sayfa">' + IK.geri + '</a>', '<span class="alt num">' + tamam + ' / ' + toplamSet + ' set · ' + dk + ' dk</span>') +
      '<h1 class="baslik">' + esc(sg.ad) + '<span class="nokta">.</span></h1>' +
      '<div class="seans-izgara">' + sg.hareketler.map((x) => {
        const hr = D.HAREKET[x.id]; const l = s.setler[x.id]; const once = S.son[x.id];
        const aktifIdx = l.findIndex((y) => !y.ok);
        return '<section class="t" aria-label="' + esc(hr.ad) + '" style="padding-bottom:6px"><div class="satir"><div class="yigin"><b style="font-size:18px;letter-spacing:-.01em">' + esc(hr.ad) + '</b><span class="ik num">Hedef ' + x.set + ' × ' + esc(x.tekrar) + (x.rir ? ' · ' + esc(x.rir) : '') + (S.rekor[x.id] ? ' · rekor ' + sayi(S.rekor[x.id].kg, 1) + ' × ' + S.rekor[x.id].tekrar : '') + '</span></div>' + (x.blok && x.blok !== 'ana' && x.blok !== 'yard' ? '<span class="etiket">' + BLOK[x.blok] + '</span>' : '') + '</div>' +
          hareketGorsel(x.id) +
          (x.isinma ? '<p class="ipucu"><b>Önce ısın:</b> çok hafif × 8, sonra orta × 4.</p>' : '') +
          (hr.ipucu ? '<p class="ipucu">' + esc(hr.ipucu) + (x.not ? ' <b>' + esc(x.not) + '.</b>' : '') + '</p>' : '') +
          '<div class="setler"><div class="set bas"><span>Set</span><span>Önceki</span><span style="text-align:center">Kg</span><span style="text-align:center">' + BIRIM[birimOf(x)] + '</span><span></span></div>' +
          l.map((y, i) => {
            const o = once && once.setler[i];
            return '<div class="set' + (i === aktifIdx ? ' aktif' : '') + '"><span class="no num">' + (i + 1) + '</span><span class="once num">' + (o ? sayi(o.kg, 1) + ' × ' + o.tekrar : '—') + '</span>' +
              '<input aria-label="' + (i + 1) + '. set kilo" inputmode="decimal" data-in="kg" data-h="' + x.id + '" data-i="' + i + '" value="' + esc(y.kg) + '" placeholder="—">' +
              '<input aria-label="' + (i + 1) + '. set ' + BIRIM[birimOf(x)].toLowerCase() + '" inputmode="numeric" data-in="tekrar" data-h="' + x.id + '" data-i="' + i + '" value="' + esc(y.tekrar) + '" placeholder="' + (x.alt || '') + '">' +
              '<button class="tik" data-act="tik" data-h="' + x.id + '" data-i="' + i + '" aria-pressed="' + (y.ok ? 'true' : 'false') + '" aria-label="' + (i + 1) + '. seti ' + (y.ok ? 'geri al' : 'tamamla') + '">' + IK.tik + '</button></div>';
          }).join('') + '</div></section>';
      }).join('') + '</div>' +
      '<a class="t koyu" href="#/koc" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px"><span style="font-weight:700">Bir yerin mi ağrıdı? Koça danış</span>' + IK.ok.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>' +
      '<button class="btn siyah buyuk-btn" data-act="bitir">Antrenmanı bitir' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="iptal" style="align-self:center;color:var(--ikincil)">' + (iptalOnay ? 'Emin misin? Kaydetmeden çıkmak için tekrar bas' : 'Kaydetmeden çık') + '</button>';
  }
  let iptalOnay = false;

  /* dinlenme sayacı */
  let dinlenme = null; let dinlenmeZaman = null;
  function dinlenmeBaslat(sn) {
    if (!sn) return;
    dinlenme = { bitis: Date.now() + sn * 1000, toplam: sn };
    clearInterval(dinlenmeZaman);
    dinlenmeZaman = setInterval(dinlenmeCiz, 1000);
    dinlenmeCiz();
  }
  function dinlenmeCiz() {
    let el = document.getElementById('dinlenme');
    if (!dinlenme || !S.seans) { if (el) el.remove(); clearInterval(dinlenmeZaman); return; }
    const kalan = Math.max(0, Math.round((dinlenme.bitis - Date.now()) / 1000));
    if (!el) {
      el = document.createElement('div'); el.id = 'dinlenme'; el.className = 'dinlenme'; el.setAttribute('role', 'timer'); el.setAttribute('aria-label', 'Dinlenme sayacı');
      el.innerHTML = '<span class="sure"></span><div class="cubuk"><span></span></div><button data-act="dinlenme-ek">+30 sn</button><button data-act="dinlenme-atla">Atla</button>';
      document.body.appendChild(el);
    }
    el.querySelector('.sure').textContent = Math.floor(kalan / 60) + ':' + String(kalan % 60).padStart(2, '0');
    el.querySelector('.cubuk>span').style.width = (100 - yuzde(kalan, dinlenme.toplam)) + '%';
    if (kalan === 0) {
      dinlenme = null; clearInterval(dinlenmeZaman); el.remove();
      if (navigator.vibrate) navigator.vibrate([120, 80, 120]);
      toast('Dinlenme bitti. Bir set daha.');
    }
  }

  /* --- beslenme --- */
  function ekranBeslenme() {
    if (!S.profil) return ekranKarsilama();
    const g = gun(); const tp = toplam(g.ogun); const h = S.hedef;
    const kalan = h.kcal - tp.k;
    const grup = ['kahvalti', 'ogle', 'ara', 'aksam'].map((t) => {
      const l = g.ogun.filter((o) => o.ogun === t); if (!l.length) return '';
      return '<div class="t genis" style="padding:12px 16px 4px;align-self:start"><div class="satir"><span style="font-size:13px;font-weight:800">' + OGUN_AD[t] + '</span><span class="satir" style="gap:10px"><span class="ik num">' + sayi(toplam(l).k) + ' kcal</span><button class="metin-btn kucuk-metin" data-act="ogun-kaydet" data-tur="' + t + '">Kaydet</button></span></div><div class="liste">' +
        l.map((o) => '<div><div class="ad"><b>' + esc(o.ad) + '</b><span class="ik num">' + sayi(o.g) + ' g · ' + sayi(o.k) + ' kcal · P ' + sayi(o.p) + ' g</span></div><button class="sil" data-act="ogun-sil" data-id="' + o.id + '" aria-label="' + esc(o.ad) + ' kaydını sil">' + IK.kapat + '</button></div>').join('') + '</div></div>';
    }).join('');
    return ust(logo, '<span class="alt">' + tarihYazi() + '</span>') +
      '<h1 class="baslik">Beslenme<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t limon h150"><span class="k">' + (kalan >= 0 ? 'Kalan' : 'Hedefin üstünde') + '</span><span class="buyuk num" data-say="' + Math.round(Math.abs(kalan)) + '">' + sayi(Math.abs(kalan)) + '</span><span class="k num">' + sayi(tp.k) + ' / ' + sayi(h.kcal) + ' kcal</span></div>' +
      '<div class="t h150 num" style="gap:6px">' + [['Protein', tp.p, h.protein], ['Karb.', tp.kh, h.karb], ['Yağ', tp.y, h.yag]].map((m) => '<div class="yigin" style="gap:3px"><div class="satir" style="font-size:13px"><span>' + m[0] + '</span><b>' + sayi(m[1]) + '/' + m[2] + ' g</b></div><div class="cubuk' + (m[1] > m[2] * 1.1 ? ' asim' : '') + '" style="height:6px"><span style="width:' + yuzde(m[1], m[2]) + '%"></span></div></div>').join('') + '</div>' +
      '<a class="t kobalt genis" href="#/ekle/foto" style="flex-direction:row;align-items:center;justify-content:space-between;min-height:76px"><div class="yigin"><span class="k">Hızlı ekle</span><b style="font-size:18px">Tabağının fotoğrafını çek</b></div><span class="ikon-btn" style="background:#fff;color:var(--kobalt)">' + IK.kamera + '</span></a>' +
      '<a class="t h130" href="#/ekle/ara" style="min-height:100px"><span class="ik" style="color:var(--murekkep)">' + IK.ara.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2"') + '</span><b>Listeden ya da markadan ara</b></a>' +
      '<a class="t h130" href="#/ekle/barkod" style="min-height:100px"><span style="color:var(--murekkep)">' + IK.barkod.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2"') + '</span><b>Barkod okut</b></a>' +
      suKutu(g) + tekrarKutu(g) + oneriKutu(h.kcal - tp.k, h.protein - tp.p) +
      (grup || '<div class="t bos genis" style="align-items:flex-start"><b>Bugün henüz bir şey eklemedin.</b><span class="ik">Fotoğraf çek, listeden seç ya da <a href="#/ekle/elle" style="color:var(--kobalt);font-weight:700">elle gir</a>.</span></div>') +
      '</div>';
  }

  /* su, tekrar, kayıtlı öğün, yemek önerisi */
  const suHedef = () => Math.round(((S.kilo.length ? S.kilo[S.kilo.length - 1].kg : S.profil.kilo) * 35) / 250) * 250; // ~35 ml/kg
  function suKutu(g) {
    const ml = g.su || 0; const h = suHedef(); const bardak = Math.round(ml / 250);
    return '<div class="t genis su-kutu"><div class="satir"><span class="k">Su</span><span class="ik num">hedef ~' + sayi(h / 1000, 1) + ' L</span></div>' +
      '<div class="satir" style="align-items:center"><span class="orta num">' + sayi(ml / 1000, 2) + '<span class="ik" style="font-weight:600"> L · ' + bardak + ' bardak</span></span>' +
      '<div class="satir" style="gap:8px"><button class="yuvarlak" data-act="su" data-ml="-250" aria-label="Bir bardak çıkar"' + (ml ? '' : ' disabled') + '>−</button><button class="btn ana" data-act="su" data-ml="250" style="min-height:44px">+ 1 bardak</button></div></div>' +
      '<div class="cubuk" role="img" aria-label="Su hedefinin yüzde ' + yuzde(ml, h) + '\'i"><span style="width:' + yuzde(ml, h) + '%;background:var(--kobalt)"></span></div></div>';
  }
  function dunKey() { const d = new Date(); d.setDate(d.getDate() - 1); return tarihKey(d); }
  function tekrarKutu(g) {
    const dun = S.gunluk[dunKey()];
    const dunTur = dun ? ['kahvalti', 'ogle', 'ara', 'aksam'].filter((t) => dun.ogun.some((o) => o.ogun === t) && !g.ogun.some((o) => o.ogun === t)) : [];
    const kayitli = S.kayitliOgun || [];
    if (!dunTur.length && !kayitli.length) return '';
    return '<div class="t genis"><span class="k">Tek dokunuşla ekle</span><div class="haplar">' +
      dunTur.map((t) => '<button class="hap" data-act="dunden" data-tur="' + t + '">Dünkü ' + OGUN_AD[t].toLocaleLowerCase('tr') + ' · ' + sayi(toplam(dun.ogun.filter((o) => o.ogun === t)).k) + ' kcal</button>').join('') +
      kayitli.map((k, i) => '<span class="hap-grup"><button class="hap siyah" data-act="kayitli-ekle" data-i="' + i + '">' + esc(k.ad) + ' · ' + sayi(toplam(k.kalemler).k) + ' kcal</button><button class="hap-sil" data-act="kayitli-sil" data-i="' + i + '" aria-label="' + esc(k.ad) + ' kayıtlı öğününü sil">' + IK.kapat + '</button></span>').join('') +
      '</div></div>';
  }
  let oneri = null; let oneriYuk = false;
  function oneriKutu(kalanK, kalanP) {
    const tur = ogunTuru();
    const baslik = tur === 'aksam' ? 'Akşam ne yesem?' : tur === 'kahvalti' ? 'Kahvaltıda ne yesem?' : tur === 'ogle' ? 'Öğlen ne yesem?' : 'Ara öğün ne olsun?';
    let ic = '<span class="ik" style="color:var(--koyu-ikincil)">Kalan ' + sayi(Math.max(0, kalanK)) + ' kcal ve ' + sayi(Math.max(0, kalanP)) + ' g proteinine göre Türk mutfağından öneri ve kısa tarif.</span>';
    if (oneri && oneri.liste.length) ic = oneri.liste.map((x, i) => '<div class="oneri"><div class="satir"><b>' + esc(x.ad) + '</b><button class="btn beyaz kucuk-btn" data-act="oneri-ekle" data-i="' + i + '">Ekle</button></div><span class="ik num" style="color:var(--koyu-ikincil)">~' + sayi(x.k) + ' kcal · P ' + sayi(x.p) + ' g · ' + sayi(x.g) + ' g</span>' + (x.tarif ? '<p class="oneri-tarif">' + esc(x.tarif) + '</p>' : '') + '</div>').join('');
    return '<div class="t koyu genis" style="gap:10px"><div class="satir"><span class="k">' + baslik + '</span>' + (oneri ? '<button class="metin-btn kucuk-metin" data-act="oneri" style="color:var(--mavi-gece)">Başka öner</button>' : '') + '</div>' + ic +
      (!oneri ? '<button class="btn beyaz" data-act="oneri"' + (oneriYuk ? ' disabled' : '') + ' style="align-self:flex-start;min-height:44px">' + (oneriYuk ? 'Düşünüyor…' : 'Öner') + IK.ok + '</button>' : '') + '</div>';
  }

  /* öğün ekleme */
  let taslak = null;      // porsiyon ekranı için seçilen ürün (100 g değerleri)
  let aramaSonuc = null;  // marka araması sonuçları
  let fotoSonuc = null;   // fotoğraf analizi
  function ekleSekme(aktif) {
    const s = [['foto', 'Fotoğraf'], ['ara', 'Ara'], ['barkod', 'Barkod'], ['elle', 'Elle']];
    return '<div class="yatay" role="tablist" aria-label="Ekleme yolu">' + s.map((x) => '<a class="hap" role="tab" href="#/ekle/' + x[0] + '" aria-pressed="' + (x[0] === aktif) + '" style="text-decoration:none">' + x[1] + '</a>').join('') + '</div>';
  }
  function ekranEkle(yol) {
    if (!S.profil) return ekranKarsilama();
    const bas = ust(geri('#/beslenme', 'Beslenmeye dön'), '<span class="alt">' + OGUN_AD[ogunTuru()] + ' · ' + saat() + '</span>') + '<h1 class="baslik">Öğün ekle<span class="nokta">.</span></h1>' + ekleSekme(yol);
    if (yol === 'ara') {
      return bas + '<form data-form="ara" class="t" role="search"><label class="alan"><span>Yemek ya da ürün adı</span><input name="q" id="araQ" autocomplete="off" placeholder="ör. tavuk, ayran, Ülker" style="font-size:24px" value="' + esc(aramaQ) + '"></label></form>' +
        '<div class="t" style="padding:4px 16px"><div class="liste" id="yerelListe">' + yerelListe(aramaQ) + '</div></div>' +
        '<button class="btn cerceve" data-act="marka-ara"' + (aramaQ.trim().length < 2 ? ' disabled' : '') + ' id="markaBtn">' + IK.ara + 'Marketteki ürünlerde ara</button>' +
        '<div id="markaSonuc">' + markaListe() + '</div>' +
        '<p class="not">Marka ürünleri Open Food Facts açık veritabanından gelir; her ürün kayıtlı olmayabilir.</p>';
    }
    if (yol === 'barkod') {
      const kamera = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) && typeof WebAssembly === 'object';
      return bas + (kamera ? '<div class="foto barkod-alan" id="barkodAlan"><video id="barkodVideo" playsinline muted></video><span class="barkod-cerceve" aria-hidden="true"><i></i></span><span class="durum" id="barkodDurum">Kamera kapalı</span><button class="barkod-fener" id="barkodFener" data-act="fener" aria-pressed="false" aria-label="Fener" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6l-1 6h3l-7 14 1-9H8z"/></svg></button></div><button class="btn ana" data-act="barkod-kamera">' + IK.kamera + 'Kamerayla okut</button>' : '<div class="uyari">Bu tarayıcı kamerayla barkod okumayı desteklemiyor. Barkodun altındaki numarayı yazabilirsin.</div>') +
        '<form data-form="barkod" class="t"><label class="alan"><span>Barkod numarası</span><input name="kod" inputmode="numeric" autocomplete="off" placeholder="8690000000000" style="font-size:26px"></label><button class="btn siyah" type="submit">Ürünü bul</button></form><div id="barkodSonuc"></div>';
    }
    if (yol === 'elle') {
      return bas + '<form data-form="elle" class="izgara">' +
        '<label class="t genis alan"><span>Ne yedin?</span><input name="ad" maxlength="60" placeholder="Ev yapımı mantı" style="font-size:22px" required></label>' +
        '<label class="t alan"><span>Kalori, kcal</span><input name="k" inputmode="numeric" placeholder="450"></label>' +
        '<label class="t alan"><span>Miktar, g</span><input name="g" inputmode="numeric" placeholder="250"></label>' +
        '<div class="t genis"><span class="k">Biliyorsan makrolar (g)</span><div class="form-satir" style="grid-template-columns:repeat(3,minmax(0,1fr))"><label class="mini"><span>Protein</span><input name="p" inputmode="decimal"></label><label class="mini"><span>Karb.</span><input name="kh" inputmode="decimal"></label><label class="mini"><span>Yağ</span><input name="y" inputmode="decimal"></label></div></div>' +
        '<p class="hata genis" id="elleHata" role="alert" hidden></p>' +
        '<button class="btn ana buyuk-btn genis" type="submit">Ekle' + IK.ok + '</button></form>';
    }
    // foto
    return bas +
      '<label class="foto" style="cursor:pointer" id="fotoAlan">' + (fotoSonuc && fotoSonuc.resim ? '<img src="' + fotoSonuc.resim + '" alt="Çektiğin tabak fotoğrafı">' : '') +
      '<span class="durum" id="fotoDurum">' + (fotoSonuc ? esc(fotoSonuc.durum) : 'Fotoğraf çek ya da seç') + '</span>' +
      '<input type="file" accept="image/*" capture="environment" data-in="foto" style="position:absolute;width:1px;height:1px;opacity:0" aria-label="Tabak fotoğrafı"></label>' +
      (fotoSonuc && fotoSonuc.kalemler ? fotoKalemler() : '<p class="not">Yapay zekâ tabağındaki yemekleri ve gramajları tahmin eder; sen düzeltip kaydedersin.</p>');
  }
  let aramaQ = '';
  const kucuk = (s) => s.toLocaleLowerCase('tr-TR');
  function yerelListe(q) {
    const s = kucuk(q.trim());
    const l = (s ? D.YEMEK.filter((y) => kucuk(y.ad).indexOf(s) >= 0) : D.YEMEK.slice(0, 8)).slice(0, 12);
    if (!l.length) return '<div><span class="ik">Listemizde yok. Marketteki ürünlerde arayabilir ya da elle girebilirsin.</span></div>';
    return l.map((y) => '<button data-act="yerel-sec" data-ad="' + esc(y.ad) + '" style="border:none;background:none;text-align:left;width:100%;padding:0"><div class="ad"><b>' + esc(y.ad) + '</b><span class="ik num">' + y.birim + ' (' + y.g + ' g) · ' + sayi((y.k * y.g) / 100) + ' kcal</span></div><span class="yuvarlak" aria-hidden="true">+</span></button>').join('');
  }
  function markaListe() {
    if (!aramaSonuc) return '';
    if (aramaSonuc.yukleniyor) return '<div class="t"><span class="ik">Aranıyor…</span></div>';
    if (aramaSonuc.hata) return '<div class="t"><span class="hata">' + esc(aramaSonuc.hata) + '</span></div>';
    if (!aramaSonuc.urunler.length) return '<div class="t"><span class="ik">Bu adla ürün bulunamadı. Barkodla deneyebilirsin.</span></div>';
    return '<div class="t" style="padding:4px 16px"><div class="liste">' + aramaSonuc.urunler.map((u, i) => '<button data-act="marka-sec" data-i="' + i + '" style="border:none;background:none;text-align:left;width:100%;padding:0"><div class="ad"><b>' + esc(u.ad) + '</b><span class="ik num">' + esc(u.marka || '') + (u.marka ? ' · ' : '') + sayi(u.k) + ' kcal / 100 g</span></div><span class="yuvarlak" aria-hidden="true">+</span></button>').join('') + '</div></div>';
  }
  function fotoKalemler() {
    const t = fotoSonuc.kalemler.reduce((a, x) => a + x.k, 0);
    return '<div class="izgara"><div class="t limon h130"><span class="k">Bu tabak</span><span class="buyuk num">' + sayi(t) + '</span><span class="k">kcal · tahmini</span></div>' +
      '<div class="t h130 num"><div class="satir"><span>Protein</span><b style="color:var(--kobalt)">' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.p, 0)) + ' g</b></div><div class="satir"><span>Karb.</span><b>' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.kh, 0)) + ' g</b></div><div class="satir"><span>Yağ</span><b>' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.y, 0)) + ' g</b></div></div></div>' +
      '<div class="t" style="padding:4px 16px"><div class="liste">' + fotoSonuc.kalemler.map((x, i) => '<div><div class="ad"><b>' + esc(x.ad) + '</b><span class="ik num">' + sayi(x.k) + ' kcal</span></div><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="-1" aria-label="' + esc(x.ad) + ' porsiyonunu azalt">−</button><span class="num" style="min-width:52px;text-align:center;font-weight:800">' + sayi(x.g) + ' g</span><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="1" aria-label="' + esc(x.ad) + ' porsiyonunu artır">+</button></div>').join('') + '</div></div>' +
      '<button class="btn ana buyuk-btn" data-act="foto-kaydet">Öğüne kaydet<span class="num" style="font-weight:600;color:var(--kobalt-yumusak)">' + sayi(S.hedef.kcal - toplam(gun().ogun).k - t) + ' kcal kalır</span></button>';
  }

  function ekranPorsiyon() {
    if (!taslak) { location.hash = '#/ekle/ara'; return ''; }
    const u = taslak; const g = u.secilenG || u.g || 100;
    const k = (u.k * g) / 100;
    const hizli = [u.g, 50, 100, 150, 200, 250].filter((x, i, a) => x && a.indexOf(x) === i).sort((a, b) => a - b);
    return ust(geri(taslak.donus || '#/ekle/ara'), '<span class="alt">Porsiyon</span>') +
      '<h1 class="baslik" style="font-size:32px">' + esc(u.ad) + '<span class="nokta">.</span></h1>' +
      (u.marka ? '<p class="not">' + esc(u.marka) + '</p>' : '') +
      '<div class="izgara">' +
      '<div class="t limon h130"><span class="k">Bu porsiyon</span><span class="buyuk num" id="porK">' + sayi(k) + '</span><span class="k">kcal</span></div>' +
      '<div class="t h130 num" id="porM"><div class="satir"><span>Protein</span><b style="color:var(--kobalt)">' + sayi((u.p * g) / 100, 1) + ' g</b></div><div class="satir"><span>Karb.</span><b>' + sayi((u.kh * g) / 100, 1) + ' g</b></div><div class="satir"><span>Yağ</span><b>' + sayi((u.y * g) / 100, 1) + ' g</b></div></div>' +
      '<label class="t genis alan"><span>Miktar, gram' + (u.birim ? ' · ' + esc(u.birim) + ' = ' + u.g + ' g' : '') + '</span><input id="porG" data-in="porsiyon" inputmode="numeric" value="' + g + '"></label>' +
      '<div class="t genis"><span class="k">Hızlı seç</span><div class="haplar">' + hizli.map((x) => '<button class="hap" data-act="por-hizli" data-g="' + x + '" aria-pressed="' + (x === g) + '">' + x + ' g</button>').join('') + '</div></div>' +
      '<fieldset class="t genis"><legend>Öğün</legend><div class="haplar">' + Object.keys(OGUN_AD).map((t) => '<button type="button" class="hap siyah" data-act="hap" data-grup="ogun" data-deger="' + t + '" aria-pressed="' + (t === (u.ogun || ogunTuru())) + '">' + OGUN_AD[t] + '</button>').join('') + '</div></fieldset>' +
      '</div>' +
      '<p class="not">Değerler 100 g başına ' + sayi(u.k) + ' kcal üzerinden hesaplanır' + (u.kaynak === 'off' ? ' (Open Food Facts).' : ' ve yaklaşıktır.') + '</p>' +
      '<button class="btn ana buyuk-btn" data-act="por-ekle">Öğüne ekle' + IK.ok + '</button>';
  }

  /* --- ilerleme --- */
  function ekranIlerleme() {
    if (!S.profil) return ekranKarsilama();
    const kilolar = S.kilo.slice(-12);
    const gunler = Object.keys(S.gunluk).sort();
    const haftaBas = new Date(); haftaBas.setDate(haftaBas.getDate() - haftaGunu()); const hb = tarihKey(haftaBas);
    const buHafta = gunler.filter((k) => k >= hb && S.gunluk[k].antrenman).length;
    const rekorlar = Object.keys(S.rekor).sort((a, b) => (S.rekor[b].tarih > S.rekor[a].tarih ? 1 : -1));
    let grafik = '<p class="ik">Grafiği görmek için en az iki tartı kaydı ekle.</p>';
    if (kilolar.length >= 2) {
      const min = Math.min.apply(null, kilolar.map((x) => x.kg)) - 0.5, max = Math.max.apply(null, kilolar.map((x) => x.kg)) + 0.5;
      const W = 320, H = 110;
      const pts = kilolar.map((x, i) => [8 + (i * (W - 16)) / (kilolar.length - 1), 12 + (H - 26) * (1 - (x.kg - min) / (max - min))]);
      grafik = '<svg class="grafik" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Kilo ' + sayi(kilolar[0].kg, 1) + ' kilogramdan ' + sayi(kilolar[kilolar.length - 1].kg, 1) + ' kilograma"><line class="izgara-c" x1="0" y1="' + (H - 6) + '" x2="' + W + '" y2="' + (H - 6) + '"/><polyline class="cizgi" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/><circle class="son" cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="5"/></svg>';
    }
    const fark = kilolar.length >= 2 ? kilolar[kilolar.length - 1].kg - kilolar[0].kg : 0;
    return ust(logo) + '<h1 class="baslik">İlerleme<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t koyu h150"><span class="k">Seri</span><span class="buyuk num">' + seri() + '<span style="color:var(--mavi-gece)">.</span></span><span class="ik">gün üst üste</span></div>' +
      '<div class="t kobalt h150"><span class="k">Bu hafta</span><span class="buyuk num">' + buHafta + '<span style="font-size:20px;letter-spacing:0;color:var(--kobalt-yumusak)"> / ' + S.profil.gun + '</span></span><span class="k">antrenman</span></div>' +
      '<div class="t genis"><div class="satir"><span class="k">Kilo</span><span class="num" style="font-weight:800">' + (kilolar.length ? sayi(kilolar[kilolar.length - 1].kg, 1) + ' kg' : '') + (kilolar.length >= 2 ? ' <span style="color:var(--kobalt)">' + (fark > 0 ? '+' : '') + sayi(fark, 1) + '</span>' : '') + '</span></div>' + grafik +
      '<form data-form="kilo" class="satir" style="margin-top:4px"><label class="mini" style="flex:1"><span>Bugünkü tartın, kg</span><input name="kg" inputmode="decimal" placeholder="' + sayi(S.profil.kilo, 1) + '"></label><button class="btn siyah" type="submit" style="align-self:flex-end;min-height:44px">Kaydet</button></form></div>' +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Rekorların</span><div class="liste">' + (rekorlar.length ? rekorlar.slice(0, 8).map((h) => '<div><div class="ad"><b>' + esc(D.HAREKET[h].ad) + '</b><span class="ik">' + esc(S.rekor[h].tarih) + '</span></div><b class="num">' + sayi(S.rekor[h].kg, 1) + ' kg × ' + S.rekor[h].tekrar + '</b></div>').join('') : '<div><span class="ik">İlk antrenmanını bitirince rekorların burada görünür.</span></div>') + '</div></div>' +
      '</div>';
  }

  /* --- profil --- */
  let sifirOnay = false; let silAcik = false; let gorusTur = 'oneri';
  function ekranGorus() {
    const turler = [['oneri', 'Öneri'], ['hata', 'Hata'], ['begeni', 'Beğendim'], ['diger', 'Diğer']];
    return ust(geri('#/profil'), '<span class="alt">Görüş bildir</span>') +
      '<h1 class="baslik">Ne düşünüyorsun<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:0 4px 6px;font-size:15px">COMEBACK. şu an deneme sürümünde. Yazdığın her şeyi okuyoruz.</p>' +
      '<form data-form="gorus" class="izgara" novalidate>' +
      '<div class="t genis"><span class="k">Konu</span><div class="haplar">' + turler.map((x) => '<button type="button" class="hap" data-act="gorus-tur" data-deger="' + x[0] + '" aria-pressed="' + (x[0] === gorusTur) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<label class="t genis alan"><span>Mesajın</span><textarea name="metin" rows="6" maxlength="2000" required placeholder="Örnek: Barkod okurken kamera geç açılıyor." style="font:inherit;font-size:17px;line-height:1.5;border:0;background:transparent;resize:vertical;color:inherit;outline:none;width:100%"></textarea></label>' +
      '<p class="hata genis" id="formHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Gönder' + IK.ok + '</button>' +
      '</form>';
  }
  function ekranProfil() {
    if (!S.profil) return ekranKarsilama();
    const p = S.profil;
    const ad = { kas: 'Kas kazanmak', yag: 'Yağ yakmak', guc: 'Güçlenmek', kondisyon: 'Kondisyon' }[p.hedef];
    const spor = { fitness: 'Fitness', futbol: 'Futbol', basketbol: 'Basketbol', kosu: 'Koşu', yuzme: 'Yüzme', dovus: 'Dövüş sporları' }[p.spor];
    return ust(logo) + '<h1 class="baslik">' + esc(p.ad || 'Profil') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t koyu genis num"><span class="k">Bilgilerin</span><span style="font-weight:700;font-size:15px">' + (p.cinsiyet === 'k' ? 'Kadın' : 'Erkek') + ' · ' + p.yas + ' yaş · ' + p.boy + ' cm · ' + sayi(p.kilo, 1) + ' kg</span><span class="ik">' + ad + ' · ' + spor + ' · haftada ' + p.gun + ' gün' + ((p.odak || []).length ? ' · odak: ' + p.odak.map((o) => (M.ODAK[o] ? M.ODAK[o].ad : o).toLowerCase()).join(', ') : '') + ((p.sakatlik || []).length ? ' · dikkat: ' + p.sakatlik.map((k) => (K.SAKATLIK.find((x) => x[0] === k) || [k, k])[1].toLowerCase()).join(', ') : '') + '</span></div>' +
      '<div class="t limon h130"><span class="k">Günlük hedef</span><span class="buyuk num" style="font-size:40px">' + sayi(S.hedef.kcal) + '</span><span class="k">kcal · ' + S.hedef.protein + ' g protein</span></div>' +
      '<a class="t kobalt h130" href="#/plan"><span class="k">Program</span><span class="orta" style="font-size:22px">' + esc(S.program.ad) + '</span><span class="k">Ayrıntılar →</span></a>' +
      '<a class="btn siyah genis" href="#/program">' + (S.program && S.program.ozel ? 'Kendi programımı düzenle' : 'Programı düzenle · kendi programımı yaz') + '</a>' +
      '<a class="btn cerceve genis" href="#/kurulum">Bilgilerimi güncelle, programı yeniden kur</a>' +
      (hesap ? '<div class="t genis satir" style="flex-direction:row"><div class="yigin" style="min-width:0"><span class="k">Hesap</span><b style="overflow:hidden;text-overflow:ellipsis">' + esc(hesap.eposta) + '</b><span class="ik">Kayıtların hesabında saklanıyor.</span></div><button class="btn cerceve" data-act="cikis" style="min-height:44px;flex-shrink:0">Çıkış yap</button></div>' : '') +
      (hesap && hesap.rol === 'admin' ? '<a class="t koyu genis" href="#/yonetim"><span class="k">Yalnızca sen görürsün</span><b style="font-size:20px">Yönetim</b><span style="opacity:.8">Bekleme listesi, görüşler, hatalar, kullanıcılar.</span></a>' : '') +
      '<a class="t kobalt genis" href="#/gorus"><span class="k">Deneme sürümü</span><b style="font-size:20px">Görüş bildir</b><span class="ik" style="color:inherit;opacity:.8">Hata, öneri, beğendiğin bir şey: bize yaz.</span></a>' +
      '<div class="t bos h130"><span class="k">Hocam</span><b>Hoca bağlantısı</b><span class="ik">Yakında: davet koduyla hocana bağlan.</span></div>' +
      '<div class="t bos h130"><span class="k">Topluluk</span><b>Forum ve meydan okumalar</b><span class="ik">Yakında açılıyor.</span></div>' +
      '</div>' +
      (hesap ? (silAcik ? '<form data-form="hesap-sil" class="t genis" novalidate style="gap:10px"><span class="k" style="color:var(--hata)">Hesabı kalıcı sil</span><span style="font-size:14px;line-height:1.5">Hesabın, programın, öğün ve antrenman kayıtların ile sağlık verilerin sunucudan kalıcı olarak silinir. Bu geri alınamaz.</span>' + sifreAlani('sifre', 'current-password', 'Onay için şifren') + '<p class="hata" id="formHata" role="alert" hidden></p><div class="satir" style="flex-direction:row;gap:8px"><button type="button" class="btn cerceve" data-act="sil-kapat" style="flex:1">Vazgeç</button><button class="btn" id="formBtn" type="submit" style="flex:1;background:var(--hata);color:#fff">Kalıcı sil</button></div></form>' : '<button class="metin-btn" data-act="sil-ac" style="align-self:center;color:var(--ikincil)">Hesabımı sil</button>') : '') +
      '<button class="metin-btn" data-act="sifirla" style="align-self:center;color:var(--hata)">' + (sifirOnay ? 'Emin misin? Bütün kayıtlar silinecek, tekrar bas' : 'Bu cihazdaki verileri sıfırla') + '</button>';
  }

  /* ---------- yönlendirme ---------- */
  function render() {
    const yol = (location.hash.slice(1) || '/').split('?')[0];
    const parca = yol.split('/').filter(Boolean);
    let html = ''; let sekme = '';
    const acik = !!hesap || cevrimdisi; // hesapsız yalnızca karşılama, kayıt ve giriş
    if (parca[0] === 'kayit') html = ekranKayit();
    else if (parca[0] === 'bekleme') html = ekranBekleme();
    else if (parca[0] === 'giris') html = ekranGiris();
    else if (!acik) { html = ekranKarsilama(); parca.length = 0; }
    else if (!parca.length) { html = ekranBugun(); sekme = 'bugun'; }
    else if (parca[0] === 'kurulum') html = ekranKurulum();
    else if (parca[0] === 'plan') { html = ekranPlan(); sekme = 'profil'; }
    else if (parca[0] === 'program') { html = parca[1] === 'ekle' ? ekranProgramEkle(+parca[2] || 0) : ekranProgramDuzen(); sekme = 'antrenman'; }
    else if (parca[0] === 'antrenman') { html = ekranAntrenman(); sekme = 'antrenman'; }
    else if (parca[0] === 'beslenme') { html = ekranBeslenme(); sekme = 'beslenme'; }
    else if (parca[0] === 'ekle') { html = ekranEkle(parca[1] || 'foto'); sekme = 'beslenme'; }
    else if (parca[0] === 'porsiyon') { html = ekranPorsiyon(); sekme = 'beslenme'; }
    else if (parca[0] === 'ilerleme') { html = ekranIlerleme(); sekme = 'ilerleme'; }
    else if (parca[0] === 'profil') { html = ekranProfil(); sekme = 'profil'; }
    else if (parca[0] === 'gorus') { html = ekranGorus(); sekme = 'profil'; }
    else if (parca[0] === 'koc') { html = ekranKoc(); sekme = 'bugun'; }
    else if (parca[0] === 'yonetim') { html = ekranYonetim(); sekme = 'profil'; }
    else { html = ekranBugun(); sekme = 'bugun'; }
    app.innerHTML = html;
    const menu = acik && !!S.profil && ['kurulum', 'kayit', 'giris', 'bekleme'].indexOf(parca[0]) < 0;
    nav.hidden = !menu; app.classList.toggle('tam', !menu);
    app.classList.toggle('dar', ['kurulum', 'ekle', 'porsiyon', 'kayit', 'giris', 'bekleme'].indexOf(parca[0]) >= 0);
    nav.querySelectorAll('a[data-tab]').forEach((a) => { if (a.dataset.tab === sekme) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (S.seans && dinlenme) dinlenmeCiz(); else { const d = document.getElementById('dinlenme'); if (d) d.remove(); }

    // hareket: yalnızca sayfa değişince
    const rota = parca.join('/');
    const yeni = rota !== sonRota; sonRota = rota;
    if (yeni) {
      app.classList.remove('gec'); void app.offsetWidth; app.classList.add('gec');
      let s = 0;
      app.querySelectorAll('.baslik, .t, .btn.buyuk-btn').forEach((el) => { el.style.setProperty('--s', Math.min(s++, 9)); });
      clearTimeout(gecZaman); gecZaman = setTimeout(() => app.classList.remove('gec'), 1100);
      if (!azHareket) app.querySelectorAll('[data-say]').forEach(say);
    }
    pilKonum(yeni && pilIlk);
  }
  let sonRota = null; let gecZaman; let pilIlk = false;
  const azHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function say(el) {
    const hedef = parseInt(el.dataset.say, 10); if (!(hedef > 0)) return;
    const bas = performance.now(); const sure = 650;
    const adim = (t) => {
      const o = Math.min(1, (t - bas) / sure); const e = 1 - Math.pow(1 - o, 3);
      el.textContent = sayi(Math.round(hedef * e));
      if (o < 1) requestAnimationFrame(adim);
    };
    el.textContent = '0'; requestAnimationFrame(adim);
  }
  // iPhone tarzı sekme çubuğu: seçili sekmenin arkasındaki hap yerine kayar
  function pilKonum(animasyon) {
    const pil = nav.querySelector('.nav-pil'); const a = nav.querySelector('a[aria-current="page"]');
    if (nav.hidden || !a) { pil.classList.remove('hazir'); return; }
    if (!animasyon || !pil.classList.contains('hazir')) pil.style.transition = 'none';
    pil.style.width = a.offsetWidth + 'px'; pil.style.height = a.offsetHeight + 'px';
    pil.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
    pil.classList.add('hazir'); pilIlk = true;
    void pil.offsetWidth; pil.style.transition = '';
  }
  let boyutZaman;
  window.addEventListener('resize', () => { clearTimeout(boyutZaman); boyutZaman = setTimeout(() => pilKonum(false), 80); });
  function git(h) { if (location.hash === h) render(); else location.hash = h; }
  window.addEventListener('hashchange', () => { iptalOnay = false; sifirOnay = false; if (barkodAkis) barkodDurdur(); render(); window.scrollTo(0, 0); });

  /* ---------- eylemler ---------- */
  const EYLEM = {
    hap(el) {
      const grup = el.dataset.grup;
      if (el.dataset.coklu) {
        const ac = el.getAttribute('aria-pressed') !== 'true';
        if (ac && grup === 'odak' && document.querySelectorAll('[data-grup="odak"][aria-pressed="true"]').length >= 2) { toast('En fazla 2 bölge seçebilirsin.'); return; }
        el.setAttribute('aria-pressed', String(ac)); return;
      }
      document.querySelectorAll('[data-grup="' + grup + '"]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
      if (grup === 'ogun' && taslak) taslak.ogun = el.dataset.deger;
      if (grup === 'spor') { const z = document.getElementById('sezonAlan'); if (z) z.hidden = el.dataset.deger === 'fitness'; }
    },
    gun(el) {
      const s = document.getElementById('gunSay');
      s.textContent = Math.max(2, Math.min(6, parseInt(s.textContent, 10) + parseInt(el.dataset.yon, 10)));
    },
    gunsec(el) { secilenGun = el.dataset.id; degisAcik = null; render(); },
    degisac(el) { degisAcik = degisAcik === el.dataset.id ? null : el.dataset.id; render(); },
    degissec(el) {
      const [gid, i, yeni] = el.dataset.id.split(':'); const g = S.program.gunler.find((x) => x.id === gid); if (!g) return;
      const eski = g.hareketler[+i]; g.hareketler[+i] = M.degistir(S.profil, eski, yeni);
      degisAcik = null; kaydet(); render(); toast(D.HAREKET[eski.id].ad + ' yerine ' + D.HAREKET[yeni].ad + '.');
    },
    basla(el) {
      const g = S.program.gunler.find((x) => x.id === el.dataset.id);
      const setler = {};
      g.hareketler.forEach((x) => {
        const hk = hedefKilo(x.id);
        const b = birimOf(x);
        setler[x.id] = Array.from({ length: x.set }, () => ({ kg: hk ? String(hk).replace('.', ',') : '', tekrar: String(b === 'dk' || b === 'sn' ? x.ust || parseInt(x.tekrar, 10) : x.alt), ok: false }));
      });
      S.seans = { gunId: g.id, tarih: tarihKey(), baslangic: Date.now(), setler };
      kaydet(true); render(); window.scrollTo(0, 0);
    },
    tik(el) {
      const y = S.seans.setler[el.dataset.h][+el.dataset.i];
      y.ok = !y.ok; kaydet(true);
      const dz = S.program.gunler.find((g) => g.id === S.seans.gunId).hareketler.find((x) => x.id === el.dataset.h);
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
      if (y.ok) {
        dinlenmeBaslat(dz.dinlenme);
        const b = document.querySelector('[data-act="tik"][data-h="' + el.dataset.h + '"][data-i="' + el.dataset.i + '"]');
        if (b && b.animate && !azHareket) b.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
      } else { dinlenme = null; dinlenmeCiz(); }
    },
    'dinlenme-ek'() { if (dinlenme) { dinlenme.bitis += 30000; dinlenme.toplam += 30; dinlenmeCiz(); } },
    'dinlenme-atla'() { dinlenme = null; dinlenmeCiz(); },
    iptal() {
      if (!iptalOnay) { iptalOnay = true; const sY = window.scrollY; render(); window.scrollTo(0, sY); return; }
      S.seans = null; iptalOnay = false; dinlenme = null; kaydet(true); git('#/antrenman');
    },
    bitir() {
      const s = S.seans; const g = S.program.gunler.find((x) => x.id === s.gunId);
      let set = 0, hacim = 0, yeni = 0;
      const tarih = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      Object.keys(s.setler).forEach((h) => {
        const yapilan = s.setler[h].filter((x) => x.ok).map((x) => ({ kg: oku(x.kg) || 0, tekrar: parseInt(x.tekrar, 10) || 0 }));
        if (!yapilan.length) return;
        set += yapilan.length;
        hacim += yapilan.reduce((a, x) => a + x.kg * x.tekrar, 0);
        S.son[h] = { tarih: s.tarih, setler: yapilan };
        if (D.HAREKET[h].tip === 's') return;
        yapilan.forEach((x) => {
          if (!x.kg || !x.tekrar) return;
          const r = S.rekor[h];
          if (!r || e1rm(x.kg, x.tekrar) > e1rm(r.kg, r.tekrar) + 0.01) { if (r && r.tarih !== tarih) yeni++; S.rekor[h] = { kg: x.kg, tekrar: x.tekrar, tarih }; }
        });
      });
      if (!set) { toast('Önce en az bir seti tamamla.'); return; }
      gun(s.tarih).antrenman = { ad: g.ad, set, hacim: Math.round(hacim), dk: Math.max(1, Math.round((Date.now() - s.baslangic) / 60000)) };
      olay('antrenman_bitti');
      S.seans = null; dinlenme = null; kaydet(true);
      toast(yeni ? 'Antrenman kaydedildi. ' + yeni + ' yeni rekor!' : 'Antrenman kaydedildi. Bir sonrakinde görüşürüz.');
      git('#/');
    },
    su(el) { const g = gun(); g.su = Math.max(0, (g.su || 0) + (+el.dataset.ml)); if (+el.dataset.ml > 0) olay('su'); kaydet(); render(); },
    dunden(el) {
      const t = el.dataset.tur; const dun = S.gunluk[dunKey()]; if (!dun) return;
      dun.ogun.filter((o) => o.ogun === t).forEach((o) => gun().ogun.push(Object.assign({}, o, { id: kimlik(), saat: saat() })));
      kaydet(true); toast('Dünkü ' + OGUN_AD[t].toLocaleLowerCase('tr') + ' eklendi.'); render();
    },
    'ogun-kaydet'(el) {
      const t = el.dataset.tur; const l = gun().ogun.filter((o) => o.ogun === t); if (!l.length) return;
      const ad = OGUN_AD[t] + ' · ' + l.map((o) => o.ad.split(' · ')[0]).slice(0, 2).join(', ');
      S.kayitliOgun = (S.kayitliOgun || []).concat([{ ad: ad.slice(0, 40), tur: t, kalemler: l.map((o) => ({ ad: o.ad, g: o.g, k: o.k, p: o.p, kh: o.kh, y: o.y })) }]).slice(-12);
      kaydet(true); toast('Kaydedildi. Beslenme ekranından tek dokunuşla ekleyebilirsin.'); render();
    },
    'kayitli-ekle'(el) {
      const k = (S.kayitliOgun || [])[+el.dataset.i]; if (!k) return;
      k.kalemler.forEach((x) => gun().ogun.push(Object.assign({}, x, { id: kimlik(), ogun: ogunTuru(), saat: saat(), kaynak: 'kayitli' })));
      kaydet(true); toast(k.ad + ' eklendi.'); render();
    },
    'kayitli-sil'(el) { (S.kayitliOgun || []).splice(+el.dataset.i, 1); kaydet(true); render(); },
    async oneri() {
      if (!hesap) { toast('Öneri için giriş yapmalısın.'); return; }
      const g = gun(); const tp = toplam(g.ogun); const h = S.hedef;
      oneriYuk = true; oneri = null; render();
      try {
        const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'yemek', ogun: OGUN_AD[ogunTuru()], kalan_kcal: Math.round(h.kcal - tp.k), kalan_protein: Math.round(h.protein - tp.p), hedef: S.profil.hedef, bugun: g.ogun.map((o) => o.ad).slice(0, 12) }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok && Array.isArray(j.liste)) { oneri = { liste: j.liste }; olay('koc_mesaj'); } else toast(j.hata || 'Öneri alınamadı.');
      } catch (e) { toast('Bağlantı kurulamadı.'); }
      oneriYuk = false; render();
    },
    'oneri-ekle'(el) {
      const x = oneri && oneri.liste[+el.dataset.i]; if (!x) return;
      gun().ogun.push({ id: kimlik(), ad: x.ad, g: x.g, k: x.k, p: x.p, kh: x.kh, y: x.y, ogun: ogunTuru(), saat: saat(), kaynak: 'oneri' });
      kaydet(true); toast(x.ad + ' eklendi.'); render();
    },
    'ogun-sil'(el) { const g = gun(); g.ogun = g.ogun.filter((o) => o.id !== el.dataset.id); kaydet(true); render(); },
    'yerel-sec'(el) {
      const y = D.YEMEK.find((x) => x.ad === el.dataset.ad); if (!y) return;
      taslak = Object.assign({}, y, { secilenG: y.g, kaynak: 'liste', donus: '#/ekle/ara' }); git('#/porsiyon');
    },
    'marka-ara'() { markaAra(aramaQ); },
    'marka-sec'(el) {
      const u = aramaSonuc && aramaSonuc.urunler[+el.dataset.i]; if (!u) return;
      taslak = Object.assign({}, u, { secilenG: u.g || 100, kaynak: 'off', donus: '#/ekle/ara' }); git('#/porsiyon');
    },
    'por-hizli'(el) { taslak.secilenG = +el.dataset.g; render(); },
    'por-ekle'() {
      const g = taslak.secilenG || 0; if (!(g > 0)) { toast('Gram miktarını gir.'); return; }
      gun().ogun.push({ id: kimlik(), ad: taslak.ad + (taslak.marka ? ' · ' + taslak.marka : ''), g, k: (taslak.k * g) / 100, p: (taslak.p * g) / 100, kh: (taslak.kh * g) / 100, y: (taslak.y * g) / 100, ogun: taslak.ogun || ogunTuru(), saat: saat() });
      olay(taslak.donus === '#/ekle/barkod' ? 'ogun_barkod' : 'ogun_liste');
      kaydet(true); toast(taslak.ad + ' eklendi.'); taslak = null; git('#/beslenme');
    },
    'foto-g'(el) {
      const x = fotoSonuc.kalemler[+el.dataset.i]; const adim = x.g >= 100 ? 25 : 10;
      const yeni = Math.max(adim, x.g + adim * +el.dataset.yon); const o = yeni / x.g;
      x.g = yeni; x.k *= o; x.p *= o; x.kh *= o; x.y *= o; render();
    },
    'foto-kaydet'() {
      const tur = ogunTuru();
      fotoSonuc.kalemler.forEach((x) => gun().ogun.push({ id: kimlik(), ad: x.ad, g: x.g, k: x.k, p: x.p, kh: x.kh, y: x.y, ogun: tur, saat: saat(), kaynak: 'foto' }));
      olay('ogun_foto');
      kaydet(true); toast('Tabağın kaydedildi.'); fotoSonuc = null; git('#/beslenme');
    },
    'barkod-kamera'() { barkodBaslat(); },
    fener(el) { fenerDegistir(el); },
    'sifre-goster'(el) {
      const i = el.parentNode.querySelector('input'); const ac = i.type === 'password';
      i.type = ac ? 'text' : 'password'; el.setAttribute('aria-label', ac ? 'Şifreyi gizle' : 'Şifreyi göster');
    },
    'sifremi-unuttum'() { toast('E-postayla şifre sıfırlama çok yakında geliyor.'); },
    async cikis() {
      await senkronGonder();
      try { await istek('cikis', 'POST', {}); } catch (e) { /* yine de çık */ }
      hesap = null; S = bos(); try { localStorage.removeItem(ANAHTAR); } catch (e) { /* yok */ }
      toast('Çıkış yapıldı.'); git('#/');
    },
    'bekleme-hedef'(el) { beklemeHedef = el.getAttribute('aria-pressed') === 'true' ? '' : el.dataset.deger; el.parentNode.querySelectorAll('.hap').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.deger === beklemeHedef))); },
    'yon-sekme'(el) { yon.sekme = el.dataset.deger; render(); },
    'yon-yenile'() { yon.veri = null; render(); },
    async 'yon-onay'(el) {
      el.disabled = true;
      const r = await istek('yonetim/onay', 'POST', { eposta: el.dataset.eposta, durum: el.dataset.durum }).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) { el.disabled = false; toast(r.j.hata || 'Kaydedilemedi.'); return; }
      toast(el.dataset.durum === 'onayli' ? 'Onaylandı. Artık bu e-postayla kayıt olabilir.' : 'Reddedildi.');
      yon.veri = null; render();
    },
    'pd-set'(el) { const x = ptaslak.gunler[+el.dataset.g].hareketler[+el.dataset.i]; x.set = Math.max(1, Math.min(10, x.set + (+el.dataset.yon))); render(); },
    'pd-tasi'(el) { const l = ptaslak.gunler[+el.dataset.g].hareketler; const i = +el.dataset.i; const j = i + (+el.dataset.yon); if (j < 0 || j >= l.length) return; const t = l[i]; l[i] = l[j]; l[j] = t; render(); },
    'pd-sil'(el) { ptaslak.gunler[+el.dataset.g].hareketler.splice(+el.dataset.i, 1); render(); },
    'pd-gunsil'(el) { const g = ptaslak.gunler[+el.dataset.g]; if (g.hareketler.length && el.dataset.onay !== '1') { el.dataset.onay = '1'; toast(g.ad + ' silinsin mi? Onaylamak için tekrar bas.'); return; } ptaslak.gunler.splice(+el.dataset.g, 1); render(); },
    'pd-hafta'(el) { ptaslak.gunler[+el.dataset.g].hafta = +el.dataset.h; ptaslak.gunler.sort((a, b) => a.hafta - b.hafta); render(); },
    'pd-gunekle'() { const bos = [0, 1, 2, 3, 4, 5, 6].find((h) => !ptaslak.gunler.some((g) => g.hafta === h)); if (bos == null) return; ptaslak.gunler.push({ id: 'ozel-' + kimlik(), gid: 'ozel', ad: 'Gün ' + String.fromCharCode(65 + ptaslak.gunler.length), hafta: bos, bolge: 'ozel', hareketler: [] }); ptaslak.gunler.sort((a, b) => a.hafta - b.hafta); render(); },
    'pd-bolge'(el) { pBolge = el.dataset.deger; render(); },
    'pd-ekle'(el) {
      const x = M.ozelHareket(S.profil, el.dataset.id); if (!x) return;
      const g = ptaslak.gunler[pSecGun]; g.hareketler.push(x);
      if (!g.hareketler.some((y) => y.isinma) && x.blok === 'ana' && K.HAREKET[x.id].artis > 0) x.isinma = true;
      toast(D.HAREKET[x.id].ad + ' eklendi.'); git('#/program');
    },
    async 'pd-yorum'() {
      const pr = ptaslak; if (!pr.gunler.some((g) => g.hareketler.length)) { toast('Önce birkaç hareket ekle.'); return; }
      if (!hesap) { toast('Yapay zekâ yorumu için giriş yapmalısın.'); return; }
      pYorumYuk = true; render();
      try {
        const ozet = { ad: pr.ad, gunler: pr.gunler.map((g) => ({ ad: g.ad, gun: GUN_AD[g.hafta], hareketler: g.hareketler.map((x) => D.HAREKET[x.id].ad + ' ' + x.set + 'x' + x.tekrar + (x.birim !== 'tekrar' ? ' ' + BIRIM[x.birim].toLowerCase() : '')) })) };
        const p = S.profil; const profil = { cinsiyet: p.cinsiyet === 'k' ? 'kadın' : 'erkek', yas: p.yas, hedef: p.hedef, deneyim: p.deneyim, ortam: p.ortam, spor: p.spor, sakatlik: (p.sakatlik || []).map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]) };
        const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'program', program: ozet, profil, analiz: M.ozelAnaliz(pr.gunler, p).uyari }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) toast(j.hata || 'Yorum alınamadı.'); else { olay('program_yorum'); pr.yorum = { ozet: j.ozet || [], oneriler: j.oneriler || [], zaman: Date.now() }; }
      } catch (e) { toast('Bağlantı kurulamadı.'); }
      pYorumYuk = false; render();
    },
    'pd-kaydet'() {
      const pr = ptaslak;
      pr.gunler = pr.gunler.filter((g) => g.hareketler.length);
      if (!pr.gunler.length) { toast('En az bir güne hareket ekle.'); ptaslak.gunler.length || ptaslak.gunler.push(bosOzelProgram(1).gunler[0]); render(); return; }
      pr.gunler.forEach((g) => { g.dk = M.ozelAnaliz([g], S.profil).dk[0]; });
      const an = M.ozelAnaliz(pr.gunler, S.profil); pr.hacim = an.hacim; pr.hacimHedef = an.hacimHedef;
      pr.ozel = true; pr.ad = String(pr.ad || 'Kendi programım').trim().slice(0, 40) || 'Kendi programım';
      if (S.seans) S.seans = null;
      olay('program_ozel'); S.program = pr; S.profil.gun = pr.gunler.length; ptaslak = null; kaydet(true); toast('Programın kaydedildi.'); git('#/antrenman');
    },
    'pd-vazgec'() { ptaslak = null; git(S.program && S.program.gunler.some((g) => g.hareketler.length) ? '#/antrenman' : '#/profil'); },
    'koc-hizli'(el) { kocGonder(el.dataset.metin); },
    'koc-temizle'() { S.koc = []; kocAcil = false; kaydet(); render(); },
    'gorus-tur'(el) { gorusTur = el.dataset.deger; el.parentNode.querySelectorAll('.hap').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); },
    'sil-ac'() { silAcik = true; render(); const i = document.querySelector('[data-form="hesap-sil"] input'); if (i) i.focus(); },
    'sil-kapat'() { silAcik = false; render(); },
    sifirla() {
      if (!sifirOnay) { sifirOnay = true; render(); return; }
      S = bos(); kaydet(true); sifirOnay = false; git('#/');
    }
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const f = EYLEM[el.dataset.act]; if (!f) return;
    e.preventDefault(); f(el, e);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.id === 'araQ') {
      aramaQ = el.value; aramaSonuc = null;
      document.getElementById('yerelListe').innerHTML = yerelListe(aramaQ);
      document.getElementById('markaSonuc').innerHTML = '';
      document.getElementById('markaBtn').disabled = aramaQ.trim().length < 2;
      return;
    }
    if (el.id === 'pdAra') {
      pAra = el.value; const yer = document.getElementById('pdListe'); const pos = el.selectionStart;
      const tmp = document.createElement('div'); tmp.innerHTML = ekranProgramEkle(pSecGun); const yeni = tmp.querySelector('#pdListe'); if (yer && yeni) yer.innerHTML = yeni.innerHTML;
      try { el.setSelectionRange(pos, pos); } catch (er) { /* yok */ }
      return;
    }
    if (el.dataset && el.dataset.pd && ptaslak) {
      const g = ptaslak.gunler[+el.dataset.g];
      if (el.dataset.pd === 'ad') ptaslak.ad = el.value;
      else if (el.dataset.pd === 'gunad') g.ad = el.value.slice(0, 24);
      else if (el.dataset.pd === 'tekrar') {
        const x = g.hareketler[+el.dataset.i]; const c = M.tekrarCoz(el.value, x.birim);
        el.classList.toggle('hatali', !c);
        if (c) { x.alt = c.alt; x.ust = c.ust; x.tekrar = c.tekrar; }
      }
      return;
    }
    if (!el.dataset || !el.dataset.in) return;
    if (el.dataset.in === 'kg' || el.dataset.in === 'tekrar') {
      S.seans.setler[el.dataset.h][+el.dataset.i][el.dataset.in] = el.value; kaydet(); return;
    }
    if (el.dataset.in === 'porsiyon' && taslak) {
      const g = oku(el.value); taslak.secilenG = g > 0 ? g : 0;
      document.getElementById('porK').textContent = sayi((taslak.k * taslak.secilenG) / 100);
      document.getElementById('porM').innerHTML = '<div class="satir"><span>Protein</span><b style="color:var(--kobalt)">' + sayi((taslak.p * taslak.secilenG) / 100, 1) + ' g</b></div><div class="satir"><span>Karb.</span><b>' + sayi((taslak.kh * taslak.secilenG) / 100, 1) + ' g</b></div><div class="satir"><span>Yağ</span><b>' + sayi((taslak.y * taslak.secilenG) / 100, 1) + ' g</b></div>';
      document.querySelectorAll('[data-act="por-hizli"]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.g === taslak.secilenG)));
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.dataset && e.target.dataset.in === 'foto' && e.target.files[0]) fotoAnaliz(e.target.files[0]);
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'kocMetin' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.form) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    if (f.dataset.form === 'kurulum') return kurulumKaydet(f, v);
    if (f.dataset.form === 'kayit' || f.dataset.form === 'giris') return hesapFormu(f.dataset.form, f, v);
    if (f.dataset.form === 'gorus') return gorusGonder(v);
    if (f.dataset.form === 'koc') return kocGonder(v.metin);
    if (f.dataset.form === 'bekleme') return beklemeGonder(v);
    if (f.dataset.form === 'hesap-sil') return hesapSil(v);
    if (f.dataset.form === 'ara') { if (aramaQ.trim().length >= 2) markaAra(aramaQ); return; }
    if (f.dataset.form === 'barkod') return barkodBul(String(v.kod || '').replace(/\D/g, ''));
    if (f.dataset.form === 'kilo') {
      const kg = oku(v.kg); if (!(kg >= 30 && kg <= 250)) { toast('Kilonu 30–250 kg arasında gir.'); return; }
      const k = tarihKey(); S.kilo = S.kilo.filter((x) => x.tarih !== k).concat({ tarih: k, kg }); S.profil.kilo = kg; kaydet(true); toast('Tartın kaydedildi.'); render(); return;
    }
    if (f.dataset.form === 'elle') {
      const hata = document.getElementById('elleHata');
      const ad = String(v.ad || '').trim(); const k = oku(v.k);
      if (!ad || !(k >= 0)) { hata.textContent = 'Ad ve kalori gerekli.'; hata.hidden = false; return; }
      gun().ogun.push({ id: kimlik(), ad: ad.slice(0, 60), g: oku(v.g) || 0, k, p: oku(v.p) || 0, kh: oku(v.kh) || 0, y: oku(v.y) || 0, ogun: ogunTuru(), saat: saat(), kaynak: 'elle' });
      olay('ogun_elle');
      kaydet(true); toast(ad + ' eklendi.'); git('#/beslenme');
    }
  });

  async function beklemeGonder(v) {
    const hataEl = document.getElementById('formHata'); const btn = document.getElementById('formBtn');
    const eposta = String(v.eposta || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) { hataEl.textContent = 'Geçerli bir e-posta adresi yaz.'; hataEl.hidden = false; return; }
    btn.disabled = true;
    try {
      const r = await istek('bekleme', 'POST', { ad: v.ad, eposta, hedef: beklemeHedef, kaynak: v.kaynak });
      if (!r.ok) { btn.disabled = false; hataEl.textContent = r.j.hata || 'Kaydedilemedi. Tekrar dene.'; hataEl.hidden = false; return; }
      beklemeSonuc = r.j.durum || 'bekliyor'; render();
    } catch (e) { btn.disabled = false; hataEl.textContent = 'Bağlantı kurulamadı. İnternetini kontrol et.'; hataEl.hidden = false; }
  }
  async function gorusGonder(v) {
    const hataEl = document.getElementById('formHata'); const btn = document.getElementById('formBtn');
    const metin = String(v.metin || '').trim();
    if (metin.length < 3) { hataEl.textContent = 'Birkaç kelime yaz.'; hataEl.hidden = false; return; }
    btn.disabled = true;
    try {
      const r = await istek('gorus', 'POST', { tur: gorusTur, metin, ekran: sonRota || '' });
      if (!r.ok) { btn.disabled = false; hataEl.textContent = r.j.hata || 'Gönderilemedi. Tekrar dene.'; hataEl.hidden = false; return; }
      gorusTur = 'oneri'; toast('Teşekkürler, mesajın bize ulaştı.'); git('#/profil');
    } catch (e) { btn.disabled = false; hataEl.textContent = 'Bağlantı kurulamadı. İnternetini kontrol et.'; hataEl.hidden = false; }
  }
  async function hesapSil(v) {
    const hataEl = document.getElementById('formHata'); const btn = document.getElementById('formBtn');
    if (!v.sifre) { hataEl.textContent = 'Şifreni yaz.'; hataEl.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Siliniyor…';
    try {
      const r = await istek('sil', 'POST', { sifre: String(v.sifre) });
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Kalıcı sil'; hataEl.textContent = r.j.hata || 'Silinemedi. Tekrar dene.'; hataEl.hidden = false; return; }
      hesap = null; silAcik = false; S = bos(); try { localStorage.removeItem(ANAHTAR); } catch (e) { /* yok */ }
      toast('Hesabın ve bütün kayıtların silindi.'); git('#/');
    } catch (e) { btn.disabled = false; btn.textContent = 'Kalıcı sil'; hataEl.textContent = 'Bağlantı kurulamadı.'; hataEl.hidden = false; }
  }

  async function hesapFormu(tur, f, v) {
    const hataEl = document.getElementById('formHata'); const btn = document.getElementById('formBtn');
    const goster = (m) => { hataEl.textContent = m; hataEl.hidden = false; };
    hataEl.hidden = true;
    const eposta = String(v.eposta || '').trim(); const sifre = String(v.sifre || '');
    if (tur === 'kayit') {
      if (String(v.ad || '').trim().length < 2) return goster('Adını yaz.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) return goster('Geçerli bir e-posta adresi yaz.');
      if (sifre.length < 8) return goster('Şifre en az 8 karakter olmalı.');
      if (!v.yetiskin) return goster('COMEBACK. 18 yaş ve üstü içindir; onay kutusunu işaretle.');
      if (!v.riza) return goster('Kayıtlarının hesabında saklanmasına onay vermelisin.');
      if (!v.saglikRiza) return goster('Sağlık verilerin için açık rıza kutusunu işaretlemelisin.');
    } else if (!eposta || !sifre) return goster('E-posta ve şifreni yaz.');
    btn.disabled = true; const eski = btn.innerHTML; btn.textContent = tur === 'kayit' ? 'Hesap oluşturuluyor…' : 'Giriş yapılıyor…';
    try {
      const r = await istek(tur, 'POST', tur === 'kayit' ? { ad: v.ad, eposta, sifre, yetiskin: true, riza: true, saglikRiza: true } : { eposta, sifre });
      if (!r.ok && r.j.beta) { btn.disabled = false; btn.innerHTML = eski; goster(r.j.hata); if (r.j.beta === 'yok') { hataEl.insertAdjacentHTML('beforeend', ' <a href="#/bekleme" style="color:inherit;font-weight:800">Bekleme listesine katıl →</a>'); } return; }
      if (!r.ok) { btn.disabled = false; btn.innerHTML = eski; return goster(r.j.hata || 'Bir sorun oluştu. Tekrar dene.'); }
      hesap = r.j.kullanici; cevrimdisi = false;
      if (tur === 'giris') { const yerel = S.profil; S = yerel ? S : bos(); await veriCek(); }
      else if (S.profil) await senkronGonder();
      toast(tur === 'kayit' ? 'Hesabın hazır. Hoş geldin, ' + hesap.ad + '.' : 'Tekrar hoş geldin, ' + hesap.ad + '.');
      git(S.profil ? '#/' : '#/kurulum');
    } catch (e) { btn.disabled = false; btn.innerHTML = eski; goster('Bağlantı kurulamadı. İnternetini kontrol et.'); }
  }

  function kurulumKaydet(f, v) {
    const secili = (g) => { const b = f.querySelector('[data-grup="' + g + '"][aria-pressed="true"]'); return b ? b.dataset.deger : null; };
    const p = {
      ad: String(v.ad || '').trim().slice(0, 30), cinsiyet: secili('cinsiyet') || 'e',
      yas: parseInt(v.yas, 10), boy: oku(v.boy), kilo: oku(v.kilo),
      hedef: secili('hedef') || 'kas', spor: secili('spor') || 'fitness', deneyim: secili('deneyim') || 'orta',
      gun: parseInt(document.getElementById('gunSay').textContent, 10),
      sakatlik: Array.from(f.querySelectorAll('[data-grup="sakatlik"][aria-pressed="true"]')).map((b) => b.dataset.deger),
      odak: Array.from(f.querySelectorAll('[data-grup="odak"][aria-pressed="true"]')).map((b) => b.dataset.deger).slice(0, 2),
      ortam: secili('ortam') || 'salon', sure: parseInt(secili('sure') || '60', 10), sezon: secili('sezon') || 'disi', saglik: secili('saglik') === 'evet'
    };
    if (p.spor === 'fitness') p.sezon = 'disi';
    const hata = document.getElementById('kurulumHata');
    const sorun = !(p.yas >= 18 && p.yas <= 90) ? (p.yas > 0 && p.yas < 18 ? 'COMEBACK. 18 yaş ve üstü içindir.' : 'Yaşını 18–90 arasında gir.') : !v.yetiskin ? '18 yaşından büyük olduğunu onayla.' : !(p.boy >= 120 && p.boy <= 230) ? 'Boyunu santimetre olarak gir (120–230).' : !(p.kilo >= 30 && p.kilo <= 250) ? 'Kilonu 30–250 kg arasında gir.' : '';
    if (sorun) { hata.textContent = sorun; hata.hidden = false; hata.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const kendim = secili('yazan') === 'ben'; olay('kurulum');
    const eskiOzel = S.program && S.program.ozel ? S.program : null;
    S.profil = p; S.hedef = hedefHesapla(p);
    const k = tarihKey(); if (!S.kilo.some((x) => x.tarih === k)) S.kilo.push({ tarih: k, kg: p.kilo });
    S.seans = null;
    if (kendim) {
      if (!eskiOzel) S.program = bosOzelProgram(p.gun);
      kaydet(true); ptaslak = null; git('#/program'); return;
    }
    S.program = programOlustur(p);
    kaydet(true); git('#/plan');
  }

  /* ---------- ağ: ürün araması, barkod, fotoğraf ---------- */
  async function markaAra(q) {
    aramaSonuc = { yukleniyor: true }; const kutu = document.getElementById('markaSonuc'); if (kutu) kutu.innerHTML = markaListe();
    try {
      const r = await fetch('/api/comeback/urun?ara=' + encodeURIComponent(q.trim()));
      const j = await r.json();
      aramaSonuc = r.ok ? { urunler: j.urunler || [] } : { hata: j.hata || 'Arama şu an yapılamıyor.' };
    } catch (e) { aramaSonuc = { hata: 'Bağlantı kurulamadı. İnternetini kontrol et.' }; }
    const k2 = document.getElementById('markaSonuc'); if (k2) k2.innerHTML = markaListe();
  }
  async function barkodBul(kod) {
    const kutu = document.getElementById('barkodSonuc');
    if (kod.length < 8) { kutu.innerHTML = '<div class="t"><span class="hata">Barkod en az 8 haneli olmalı.</span></div>'; return; }
    kutu.innerHTML = '<div class="t"><span class="ik">Aranıyor…</span></div>';
    try {
      const r = await fetch('/api/comeback/urun?barkod=' + kod);
      const j = await r.json();
      if (!r.ok || !j.urun) { kutu.innerHTML = '<div class="t"><span class="hata">' + esc(j.hata || 'Bu barkodla ürün bulunamadı.') + '</span><a class="metin-btn" href="#/ekle/elle">Elle ekle</a></div>'; return; }
      barkodDurdur();
      taslak = Object.assign({}, j.urun, { secilenG: j.urun.g || 100, kaynak: 'off', donus: '#/ekle/barkod' }); git('#/porsiyon');
    } catch (e) { kutu.innerHTML = '<div class="t"><span class="hata">Bağlantı kurulamadı.</span></div>'; }
  }
  let barkodAkis = null, barkodIz = null;
  // Okuyucu: tarayıcıda yerleşik BarcodeDetector varsa o (Android Chrome), yoksa kendi sunucumuzdaki ZXing (iPhone Safari dahil)
  let okuyucuSoz = null;
  function okuyucuYukle() {
    if (okuyucuSoz) return okuyucuSoz;
    const formatlar = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    okuyucuSoz = (async () => {
      if ('BarcodeDetector' in window) {
        try { const d = await window.BarcodeDetector.getSupportedFormats(); if (d.indexOf('ean_13') >= 0) return new window.BarcodeDetector({ formats: formatlar }); } catch (e) { /* yedeğe geç */ }
      }
      await new Promise((ok, red) => { const sc = document.createElement('script'); sc.src = '/comeback/vendor/barkod.js?v=1'; sc.onload = ok; sc.onerror = red; document.head.appendChild(sc); });
      return new window.CB_BARKOD({ formats: formatlar });
    })();
    okuyucuSoz.catch(() => { okuyucuSoz = null; });
    return okuyucuSoz;
  }
  // EAN/UPC kontrol hanesi: yanlış okumaları ele
  function kodGecerli(k) {
    if (!/^\d{8}$|^\d{12,13}$/.test(k)) return false;
    const d = k.split('').map(Number); const kontrol = d.pop(); let t = 0;
    d.reverse().forEach((x, i) => { t += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - (t % 10)) % 10 === kontrol;
  }
  async function barkodBaslat() {
    const durum = document.getElementById('barkodDurum'); const video = document.getElementById('barkodVideo');
    const alan = document.getElementById('barkodAlan');
    if (barkodAkis) return;
    durum.textContent = 'Kamera açılıyor…';
    try {
      const [algila, akis] = await Promise.all([okuyucuYukle(), navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } }, audio: false
      })]);
      barkodAkis = akis; barkodIz = akis.getVideoTracks()[0];
      // Sürekli odak ve (varsa) hafif yakınlaştırma: küçük barkodlar netleşir
      try {
        const yet = barkodIz.getCapabilities ? barkodIz.getCapabilities() : {}; const ileri = {};
        if (yet.focusMode && yet.focusMode.indexOf('continuous') >= 0) ileri.focusMode = 'continuous';
        if (yet.zoom && yet.zoom.max >= 1.5) ileri.zoom = Math.min(2, yet.zoom.max);
        if (Object.keys(ileri).length) await barkodIz.applyConstraints({ advanced: [ileri] });
        if (yet.torch) { const f = document.getElementById('barkodFener'); if (f) f.hidden = false; }
      } catch (e) { /* desteklenmiyor */ }
      video.srcObject = akis; await video.play();
      alan.classList.add('tariyor'); durum.textContent = 'Barkodu çerçevenin içine getir';
      // Yalnızca ortadaki şeridi oku: daha hızlı ve daha az yanlış okuma
      const tuval = document.createElement('canvas'); const cx = tuval.getContext('2d', { willReadFrequently: true });
      let son = '', ayni = 0, deneme = 0;
      const dongu = async () => {
        if (!barkodAkis) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        if (vw) {
          deneme++;
          // Her 3 karede bir tüm kareyi, diğerlerinde ortadaki şeridi tara
          const tam = deneme % 3 === 0;
          const sw = tam ? vw : Math.round(vw * 0.8), sh = tam ? vh : Math.round(vh * 0.45);
          const sx = Math.round((vw - sw) / 2), sy = Math.round((vh - sh) / 2);
          const olcek = Math.min(1, 1280 / sw);
          tuval.width = Math.round(sw * olcek); tuval.height = Math.round(sh * olcek);
          cx.drawImage(video, sx, sy, sw, sh, 0, 0, tuval.width, tuval.height);
          try {
            const k = (await algila.detect(tuval)).map((x) => String(x.rawValue).replace(/\D/g, '')).find(kodGecerli);
            if (k) {
              // Aynı kodu iki kez üst üste görünce kabul et (yerleşik okuyucuda tek okuma yeter)
              ayni = k === son ? ayni + 1 : 1; son = k;
              if (ayni >= (algila instanceof (window.BarcodeDetector || Object) ? 1 : 2)) {
                if (navigator.vibrate) navigator.vibrate(40);
                alan.classList.add('bulundu'); durum.textContent = 'Bulundu: ' + k;
                const g = document.querySelector('[data-form=barkod] input[name=kod]'); if (g) g.value = k;
                barkodDurdur(); return barkodBul(k);
              }
            }
          } catch (e) { /* kare atla */ }
          if (deneme === 40) durum.textContent = 'Biraz uzaklaştır, ışığa çevir ya da numarayı yaz';
        }
        setTimeout(dongu, 90);
      };
      dongu();
    } catch (e) {
      durum.textContent = e && e.name === 'NotAllowedError' ? 'Kameraya izin verilmedi. Numarayı yazabilirsin.' : 'Kamera açılamadı. Numarayı yazabilirsin.';
      barkodDurdur();
    }
  }
  async function fenerDegistir(el) {
    if (!barkodIz) return;
    const acik = el.getAttribute('aria-pressed') !== 'true';
    try { await barkodIz.applyConstraints({ advanced: [{ torch: acik }] }); el.setAttribute('aria-pressed', String(acik)); } catch (e) { el.hidden = true; }
  }
  function barkodDurdur() {
    if (barkodAkis) { barkodAkis.getTracks().forEach((t) => t.stop()); barkodAkis = null; barkodIz = null; }
    const a = document.getElementById('barkodAlan'); if (a) a.classList.remove('tariyor');
  }

  async function kucult(file) {
    const img = await createImageBitmap(file);
    const s = Math.min(1, 800 / Math.max(img.width, img.height)); // 800 px: daha az görsel jetonu, daha hızlı analiz
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);
  }
  async function fotoAnaliz(file) {
    let resim;
    try { resim = await kucult(file); } catch (e) { toast('Bu fotoğraf açılamadı. Başka bir fotoğraf dene.'); return; }
    fotoSonuc = { resim, durum: 'Tabağın inceleniyor…' }; render();
    try {
      const r = await fetch('/api/comeback/foto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resim }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fotoSonuc.durum = j.hata || 'Analiz şu an yapılamıyor.'; render(); return; }
      if (!j.kalemler || !j.kalemler.length) { fotoSonuc.durum = 'Tabakta yemek bulamadık. Daha yakından çekmeyi dene.'; render(); return; }
      fotoSonuc.kalemler = j.kalemler.map((x) => ({ ad: String(x.ad || 'Yemek').slice(0, 50), g: Math.max(1, +x.g || 100), k: Math.max(0, +x.k || 0), p: Math.max(0, +x.p || 0), kh: Math.max(0, +x.kh || 0), y: Math.max(0, +x.y || 0) }));
      fotoSonuc.durum = fotoSonuc.kalemler.length + ' yemek bulundu';
      render();
    } catch (e) { fotoSonuc.durum = 'Bağlantı kurulamadı.'; render(); }
  }

  app.innerHTML = '<header class="ust"><span class="logo">COMEBACK<i>.</i></span></header>';
  gocEt();
  hesapYukle().then(render, render);
})();
