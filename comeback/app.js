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
      if (r.ok) { hesap = r.j.kullanici; await veriCek(); hocaYukle(); paylasimYukle(); }
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

  // takvim: kullanıcının tek seferlik değişiklikleri { 'YYYY-AA-GG': { off: true } | { gunId } }
  function gunIcin(dt) {
    if (!S.program) return null;
    const t = S.takvim && S.takvim[tarihKey(dt)];
    if (t && t.off) return null;
    if (t && t.gunId) { const g = S.program.gunler.find((x) => x.id === t.gunId); if (g) return g; }
    const hg = haftaGunu(dt);
    const g = S.program.gunler.find((x) => x.hafta === hg);
    // başka bir güne kaydırılmışsa kendi gününde görünmesin
    if (g && S.takvim && Object.keys(S.takvim).some((k) => S.takvim[k].gunId === g.id && S.takvim[k].kaynak === tarihKey(dt))) return null;
    return g || null;
  }
  const bugunkuGun = () => gunIcin(new Date());
  const offMu = (dt) => !!(S.takvim && S.takvim[tarihKey(dt)] && S.takvim[tarihKey(dt)].off);
  function sonrakiGun() {
    if (!S.program) return null;
    for (let i = 1; i <= 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); const g = gunIcin(d); if (g) return { gun: g, kac: i, hafta: haftaGunu(d) }; }
    return null;
  }
  function takvimTemizle() { if (!S.takvim) return; const sinir = tarihKey(new Date(Date.now() - 14 * 864e5)); Object.keys(S.takvim).forEach((k) => { if (k < sinir) delete S.takvim[k]; }); }
  // seansta her satırın anahtarı: ilk geçişte hareket id'si, tekrarlarında id#2, id#3…
  function seansAnahtar(g) { const n = {}; return g.hareketler.map((x) => { n[x.id] = (n[x.id] || 0) + 1; return n[x.id] === 1 ? x.id : x.id + '#' + n[x.id]; }); }
  const kokId = (k) => String(k).split('#')[0];
  function hedefKilo(h0) {
    const h = kokId(h0); const son = S.son[h0] || S.son[h]; const hr = D.HAREKET[h];
    if (!son || !son.setler.length) return '';
    const dz = (S.program && S.program.gunler.flatMap((g) => g.hareketler).find((x) => x.id === h)) || { ust: 99 };
    const kg = Math.max.apply(null, son.setler.map((s) => s.kg || 0));
    if (!kg) return '';
    const hepsi = son.setler.every((s) => s.tekrar >= dz.ust);
    const artis = hr.artis != null ? hr.artis : (hr.bolge === 'alt' ? 5 : 2.5);
    return hepsi && artis ? kg + artis : kg;
  }
  const e1rm = (kg, t) => kg * (1 + t / 30);

  /* ---------- geri dönüş modu, rozetler ---------- */
  function sonAntrenmanAra() {
    const l = Object.keys(S.gunluk).filter((k) => S.gunluk[k].antrenman && k < tarihKey()).sort();
    if (!l.length) return null;
    return Math.round((new Date(tarihKey()) - new Date(l[l.length - 1])) / 864e5);
  }
  // ara uzadıkça yükü düşür: 10–20 gün %90, 21–41 gün %80, 42+ gün %70 (detraining araştırmalarına göre ihtiyatlı)
  const donusOran = (ara) => (ara == null || ara < 10 ? 1 : ara < 21 ? 0.9 : ara < 42 ? 0.8 : 0.7);
  const ROZET = [
    ['ilk', 'İlk adım', 'İlk antrenmanını bitirdin', (o) => o.antr >= 1],
    ['a10', '10 antrenman', 'On antrenman tamam', (o) => o.antr >= 10],
    ['a25', '25 antrenman', 'Artık alışkanlık', (o) => o.antr >= 25],
    ['a50', '50 antrenman', 'Yarım yüz', (o) => o.antr >= 50],
    ['s7', '7 gün seri', 'Bir hafta hiç bırakmadın', (o) => o.seri >= 7],
    ['s30', '30 gün seri', 'Bir ay boyunca her gün', (o) => o.seri >= 30],
    ['r1', 'İlk rekor', 'Kendini geçtin', (o) => o.rekor >= 1],
    ['r10', '10 rekor', 'On harekette rekor', (o) => o.rekor >= 10],
    ['donus', 'Geri döndün', 'Uzun aradan sonra yeniden başladın', (o) => o.donus],
    ['hafta', 'Tam hafta', 'Haftalık hedefini tutturdun', (o) => o.tamHafta],
    ['beslenme', 'Kayıtçı', '7 gün öğünlerini yazdın', (o) => o.ogunGun >= 7]
  ];
  function rozetDurum() {
    const gunler = Object.keys(S.gunluk);
    const haftaBas = new Date(); haftaBas.setDate(haftaBas.getDate() - haftaGunu()); const hb = tarihKey(haftaBas);
    const o = {
      antr: gunler.filter((k) => S.gunluk[k].antrenman).length, seri: Math.max(seri(), S.enIyiSeri || 0),
      rekor: Object.keys(S.rekor).length, donus: !!S.donusYapildi,
      tamHafta: !!(S.profil && gunler.filter((k) => k >= hb && S.gunluk[k].antrenman).length >= S.profil.gun) || !!S.tamHaftaOldu,
      ogunGun: gunler.filter((k) => S.gunluk[k].ogun.length).length
    };
    if (o.seri > (S.enIyiSeri || 0)) S.enIyiSeri = o.seri;
    if (o.tamHafta) S.tamHaftaOldu = true;
    return ROZET.map((r) => ({ id: r[0], ad: r[1], acik: r[2], var: r[3](o) }));
  }
  function yeniRozetler() {
    const once = new Set(S.rozetler || []); const simdi = rozetDurum().filter((r) => r.var);
    S.rozetler = simdi.map((r) => r.id);
    return simdi.filter((r) => !once.has(r.id));
  }

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
      const [o, b, g, h, hc, sk] = await Promise.all(['ozet', 'bekleme', 'gorusler', 'hatalar', 'hocalar'].map((x) => istek('yonetim/' + x)).concat([tistek('sikayetler')]));
      yon.veri = o.ok ? { ozet: o.j, bekleme: b.j.liste || [], gorusler: g.j.liste || [], hatalar: h.j.liste || [], hocalar: hc.j.liste || [], sikayet: sk.j.liste || [] } : { hata: o.j.hata || 'Yüklenemedi.' };
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
    const sekmeler = [['bekleme', 'Bekleme listesi · ' + o.bekleyen], ['gorusler', 'Görüşler · ' + V.gorusler.length], ['hatalar', 'Hatalar · ' + V.hatalar.length], ['hocalar', 'Hocalar · ' + V.hocalar.length], ['sikayet', 'Şikâyetler · ' + V.sikayet.length]];
    let govde = '';
    if (yon.sekme === 'bekleme') govde = V.bekleme.length ? V.bekleme.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad || '—') + '</b><span class="ik">' + esc(x.eposta) + '</span><span class="ik">' + [HED[x.hedef] || x.hedef, x.kaynak, tarih(x.zaman)].filter(Boolean).map(esc).join(' · ') + (x.kayitli ? ' · <b>hesap açtı</b>' : '') + '</span></div><div class="yon-is"><span class="etiket">' + DUR[x.durum] + '</span>' +
      (x.durum !== 'onayli' ? '<button class="btn ana kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="onayli">Onayla</button>' : '') +
      (x.durum === 'bekliyor' ? '<button class="btn cerceve kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="reddedildi">Reddet</button>' : '') + '</div></div>').join('') : '<p class="ik">Henüz başvuru yok.</p>';
    else if (yon.sekme === 'gorusler') govde = V.gorusler.length ? V.gorusler.map((x) => '<div class="yon-satir"><div class="yigin"><span class="ik">' + esc([x.tur, x.ad || 'isimsiz', x.ekran, tarih(x.zaman)].filter(Boolean).join(' · ')) + '</span><span style="white-space:pre-wrap;line-height:1.5">' + esc(x.metin) + '</span></div></div>').join('') : '<p class="ik">Henüz görüş yok.</p>';
    else if (yon.sekme === 'sikayet') govde = V.sikayet.length ? V.sikayet.map((x) => '<div class="yon-satir"><div class="yigin"><span class="ik">' + (x.tur === 'konu' ? 'Konu' : 'Cevap') + ' · ' + x.adet + ' şikâyet' + (x.gizli ? ' · şu an gizli' : '') + '</span><span style="line-height:1.45;word-break:break-word">' + esc(x.metin || '(silinmiş)') + '</span></div><div class="yon-is"><button class="btn cerceve kucuk" data-act="yon-mod" data-tur="' + x.tur + '" data-id="' + x.hedef_id + '" data-gizli="1">Gizle</button><button class="btn ana kucuk" data-act="yon-mod" data-tur="' + x.tur + '" data-id="' + x.hedef_id + '" data-gizli="0">Sorun yok</button></div></div>').join('') : '<p class="ik">Açık şikâyet yok.</p>';
    else if (yon.sekme === 'hocalar') govde = '<form data-form="yon-hoca" class="satir" style="gap:8px;padding:10px 0"><input name="eposta" type="email" placeholder="Hocanın e-postası" aria-label="Hoca yapılacak kişinin e-postası" style="flex:1;min-width:0;border:0;background:var(--zemin);border-radius:14px;min-height:44px;padding:0 12px;font-size:16px"><button class="btn ana kucuk" type="submit">Hoca yap</button></form><p class="ik" style="padding-bottom:8px">Kişi önce hesap açmış olmalı. Hoca olunca Profil\'inde Hoca paneli çıkar.</p>' +
      (V.hocalar.length ? V.hocalar.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad) + '</b><span class="ik">' + esc(x.eposta) + ' · ' + x.ogrenci + ' öğrenci</span></div><div class="yon-is"><button class="btn cerceve kucuk" data-act="yon-rol" data-eposta="' + esc(x.eposta) + '" data-rol="uye">Hocalığı kaldır</button></div></div>').join('') : '<p class="ik">Henüz hoca yok.</p>');
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
    return ust(S.profil ? geri('#/profil') : logo, '<span class="alt">' + (S.profil ? 'Bilgilerim' : 'Program kurulumu') + '</span>') +
      '<h1 class="baslik">' + (S.profil ? 'Bilgilerini güncelle' : 'Seni tanıyalım') + '<span class="nokta">.</span></h1>' +
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
      (S.profil
        ? '<div class="genis kurulum-tus"><button class="btn ana buyuk-btn" type="submit" name="tus" value="kaydet">Bilgilerimi kaydet' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
          '<button class="btn cerceve" type="submit" name="tus" value="yeni">Kaydet ve programımı baştan oluştur</button>' +
          '<span class="ik">"Bilgilerimi kaydet" programına dokunmaz; kilo, yaş ve hedefe göre kalorini günceller.</span></div>'
        : '<button class="btn ana buyuk-btn genis" type="submit">Programımı oluştur' + IK.ok + '</button>') +
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

  /* ---------- hoca: öğrenci tarafı + hoca paneli ---------- */
  const HAPI = '/api/comeback/hoca/';
  async function histek(yol, yontem, veri) {
    const r = await fetch(HAPI + yol, { method: yontem || 'GET', credentials: 'same-origin', headers: veri ? { 'content-type': 'application/json' } : {}, body: veri ? JSON.stringify(veri) : undefined });
    const j = await r.json().catch(() => ({})); return { ok: r.ok, j };
  }
  let hocaDurum = null; // { hoca, atanan }
  async function hocaYukle() { try { const r = await histek('benim'); if (r.ok) { hocaDurum = r.j; render(); } } catch (e) { /* yok */ } }
  const hocaMi = () => hesap && (hesap.rol === 'koc' || hesap.rol === 'admin');
  function hocaKutu() {
    if (!hesap) return '';
    if (hocaDurum && hocaDurum.hoca) return '<div class="t h130"><span class="k">Hocam</span><b style="font-size:19px">' + esc(hocaDurum.hoca.ad) + '</b><span class="ik">Programını ve antrenmanlarını görebiliyor.</span><a class="btn siyah" href="#/mesaj/' + encodeURIComponent(hocaDurum.hoca.id) + '" style="min-height:40px;align-self:flex-start">Mesaj yaz</a><button class="metin-btn kucuk-metin" data-act="hoca-ayril" style="align-self:flex-start;color:var(--ikincil)">Hocamdan ayrıl</button></div>';
    return '<form class="t h130" data-form="hoca-baglan" novalidate style="gap:8px"><span class="k">Hocam</span><input name="kod" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="Hoca kodu" aria-label="Hocanın 6 haneli kodu" style="border:0;background:var(--zemin);border-radius:14px;min-height:44px;padding:0 12px;font-size:17px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;width:100%"><label class="onay-mini"><input type="checkbox" name="riza"><span>Hocam programımı, antrenmanlarımı, kilomu ve kalori özetimi görebilir.</span></label><button class="btn siyah" type="submit" style="min-height:40px">Bağlan</button></form>';
  }
  function atananBant() {
    const a = hocaDurum && hocaDurum.atanan; if (!a) return '';
    return '<a class="t limon genis" href="#/hoca-program" style="gap:4px"><span class="k">Hocan ' + esc(a.hoca) + ' sana program gönderdi</span><b style="font-size:20px">' + esc(a.program.ad || 'Yeni program') + '</b><span class="ik" style="color:#3E4410">Bak, beğenirsen kabul et.</span></a>';
  }
  function ekranHocaProgram() {
    const a = hocaDurum && hocaDurum.atanan; if (!a) { location.hash = '#/'; return ''; }
    const pr = a.program;
    return ust(geri('#/'), '<span class="alt">Hocandan · ' + esc(a.hoca) + '</span>') +
      '<h1 class="baslik">' + esc(pr.ad || 'Yeni program') + '<span class="nokta">.</span></h1>' +
      (a.not ? '<div class="t koyu"><span class="k">Hocanın notu</span><span style="line-height:1.5">' + esc(a.not) + '</span></div>' : '') +
      pr.gunler.map((g) => '<div class="t"><div class="satir"><b style="font-size:18px">' + esc(g.ad) + '</b><span class="ik">' + GUN_AD[g.hafta] + '</span></div><div class="liste">' + g.hareketler.map((x) => '<div><div class="ad"><b>' + esc((D.HAREKET[x.id] || { ad: x.id }).ad) + '</b></div><span class="num" style="font-weight:800;font-size:14px">' + x.set + ' × ' + esc(x.tekrar) + '</span></div>').join('') + '</div></div>').join('') +
      '<div class="uyari">Kabul edersen şu anki programının yerine bu geçer. Geçmiş antrenmanların ve rekorların silinmez.</div>' +
      '<button class="btn ana buyuk-btn" data-act="atanan" data-kabul="1">Kabul et, bununla çalışacağım' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="atanan" data-kabul="0" style="align-self:center;color:var(--ikincil)">Şimdilik istemiyorum</button>';
  }
  // hoca paneli
  let hp = { kod: null, liste: null, ogr: null, ogrId: null, yuk: false };
  async function hpYukle(id) {
    if (hp.yuk) return; hp.yuk = true;
    try {
      if (id) { const r = await histek('ogrenci/' + encodeURIComponent(id)); hp.ogr = r.ok ? r.j : { hata: r.j.hata || 'Yüklenemedi.' }; hp.ogrId = id; }
      else { const [k, l] = await Promise.all([histek('kod'), histek('ogrenciler')]); hp.kod = k.j.kod || null; hp.liste = l.ok ? l.j.liste : []; }
    } catch (e) { if (id) hp.ogr = { hata: 'Bağlantı kurulamadı.' }; else hp.liste = []; }
    hp.yuk = false; render();
  }
  const HEDEF_AD = { kas: 'Kas', yag: 'Yağ yakımı', guc: 'Güç', kondisyon: 'Kondisyon' };
  function ekranHoca(id) {
    if (!hocaMi()) { location.hash = '#/profil'; return ''; }
    if (id) return ekranHocaOgrenci(id);
    if (!hp.liste) { hpYukle(); return ust(geri('#/profil'), '<span class="alt">Hoca paneli</span>') + '<h1 class="baslik">Öğrencilerim<span class="nokta">.</span></h1><p class="ik" style="padding:0 4px">Yükleniyor…</p>'; }
    return ust(geri('#/profil'), '<button class="ikon-btn" data-act="hp-yenile" aria-label="Yenile" style="background:#fff">' + IK.degis + '</button>') +
      '<h1 class="baslik">Öğrencilerim<span class="nokta">.</span></h1>' +
      '<div class="izgara"><div class="t kobalt genis" style="gap:6px"><span class="k">Davet kodun</span><span class="dev num" style="font-size:52px;letter-spacing:.06em">' + esc(hp.kod || '—') + '</span><span style="opacity:.85;font-size:14px;line-height:1.45">Öğrencin uygulamada Profil → Hocam alanına bu kodu yazınca sana bağlanır.</span>' +
      '<div class="satir" style="gap:8px;justify-content:flex-start"><button class="btn beyaz" data-act="hp-kod-paylas" style="min-height:42px">Paylaş</button><button class="metin-btn" data-act="hp-kod-yenile" style="color:#fff;opacity:.85">Kodu yenile</button></div></div>' +
      (hp.liste.length ? hp.liste.map((o) => '<a class="t genis" href="#/hoca/' + encodeURIComponent(o.id) + '" style="gap:4px"><div class="satir"><b style="font-size:19px">' + esc(o.ad) + '</b><span class="etiket">' + o.haftalik + ' / ' + (o.gun || '?') + ' bu hafta</span></div><span class="ik">' + esc([HEDEF_AD[o.hedef] || '', o.kilo ? sayi(o.kilo, 1) + ' kg' : '', o.program || ''].filter(Boolean).join(' · ')) + '</span><span class="ik">Son antrenman: ' + (o.son_antrenman ? esc(o.son_antrenman.tarih + ' · ' + o.son_antrenman.ad) : 'henüz yok') + '</span></a>').join('') : '<div class="t bos genis"><b>Henüz öğrencin yok.</b><span class="ik">Kodunu öğrencilerinle paylaş.</span></div>') +
      '</div>';
  }
  function ekranHocaOgrenci(id) {
    if (!hp.ogr || hp.ogrId !== id) { hp.ogr = null; hpYukle(id); return ust(geri('#/hoca'), '<span class="alt">Öğrenci</span>') + '<p class="ik" style="padding:20px 4px">Yükleniyor…</p>'; }
    if (hp.ogr.hata) return ust(geri('#/hoca')) + '<div class="t"><span>' + esc(hp.ogr.hata) + '</span></div>';
    const o = hp.ogr.ozet; const pr = o.profil;
    const sakat = (pr.sakatlik || []).map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]).join(', ');
    return ust(geri('#/hoca'), '<span class="alt">Öğrenci</span>') +
      '<h1 class="baslik">' + esc(hp.ogr.ogrenci.ad) + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t kobalt genis"><span class="k">Bilgiler</span><span style="font-weight:700;line-height:1.5">' + esc([pr.cinsiyet === 'k' ? 'Kadın' : 'Erkek', pr.yas ? pr.yas + ' yaş' : '', pr.boy ? pr.boy + ' cm' : '', HEDEF_AD[pr.hedef] || '', { baslangic: 'yeni başlayan', orta: 'orta seviye', ileri: 'ileri seviye' }[pr.deneyim] || '', pr.gun ? 'haftada ' + pr.gun + ' gün' : '', (K.ORTAM[pr.ortam] || {}).ad || ''].filter(Boolean).join(' · ')) + '</span>' + (sakat ? '<span style="opacity:.85">Dikkat: ' + esc(sakat) + '</span>' : '') + '</div>' +
      '<div class="t h130"><span class="k">Kilo</span><span class="orta num">' + (o.kilo.length ? sayi(o.kilo[o.kilo.length - 1].kg, 1) : '—') + '<span class="ik"> kg</span></span><span class="ik">' + (o.kilo.length >= 2 ? (o.kilo[o.kilo.length - 1].kg - o.kilo[0].kg >= 0 ? '+' : '') + sayi(o.kilo[o.kilo.length - 1].kg - o.kilo[0].kg, 1) + ' kg (' + o.kilo.length + ' tartı)' : 'tek kayıt') + '</span></div>' +
      '<div class="t limon h130"><span class="k">Kalori (14 gün ort.)</span><span class="orta num">' + (o.ortKcal14 ? sayi(o.ortKcal14) : '—') + '</span><span class="k">' + (o.hedef ? 'hedef ' + sayi(o.hedef.kcal) + ' · ' : '') + o.kayitliGun14 + ' gün kayıt</span></div>' +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Son antrenmanlar</span><div class="liste">' + (o.antrenmanlar.length ? o.antrenmanlar.slice(0, 8).map((a) => '<div><div class="ad"><b>' + esc(a.ad) + '</b><span class="ik">' + esc(a.tarih) + '</span></div><span class="num ik" style="font-weight:700">' + a.set + ' set · ' + sayi(a.hacim) + ' kg · ' + a.dk + ' dk</span></div>').join('') : '<div><span class="ik">Henüz antrenman kaydı yok.</span></div>') + '</div></div>' +
      '<div class="t genis"><div class="satir"><span class="k">Programı</span>' + (hp.ogr.bekleyen ? '<span class="etiket">Gönderdiğin program onay bekliyor</span>' : '') + '</div>' + (o.program ? '<b style="font-size:18px">' + esc(o.program.ad) + '</b>' + o.program.gunler.map((g) => '<span class="ik"><b style="color:var(--murekkep)">' + GUN_KISA[g.hafta] + ' ' + esc(g.ad) + ':</b> ' + g.hareketler.map((x) => esc((D.HAREKET[x.id] || { ad: x.id }).ad) + ' ' + x.set + '×' + esc(x.tekrar)).join(', ') + '</span>').join('') : '<span class="ik">Programı yok.</span>') + '</div>' +
      '</div>' +
      '<a class="btn siyah" href="#/mesaj/' + encodeURIComponent(hp.ogr.ogrenci.id) + '">Mesaj yaz</a>' +
      '<button class="btn ana buyuk-btn" data-act="hp-program" data-bos="0">' + (o.program ? 'Programını düzenleyip gönder' : 'Program yaz ve gönder') + IK.ok + '</button>' +
      (o.program ? '<button class="btn cerceve" data-act="hp-program" data-bos="1">Sıfırdan program yaz</button>' : '') +
      '<button class="metin-btn" data-act="hp-cikar" style="align-self:center;color:var(--ikincil)">Öğrenciyi listeden çıkar</button>';
  }

  /* ---------- ana ekrana ekle (PWA) ---------- */
  let kurulumIstemi = null; let ekleAcik = false;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); kurulumIstemi = e; render(); });
  window.addEventListener('appinstalled', () => { kurulumIstemi = null; try { localStorage.setItem('cb-eklendi', '1'); } catch (er) { /* yok */ } toast('COMEBACK. ana ekranına eklendi.'); render(); });
  const tekBasina = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const iosMu = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function ekleKutu(kucuk) {
    if (tekBasina()) return '';
    let kapali = false; try { kapali = !kucuk && localStorage.getItem('cb-ekle-kapat') === '1'; } catch (e) { /* yok */ }
    if (kapali) return '';
    const yonerge = ekleAcik ? '<ol class="rutin" style="margin-top:4px">' + (iosMu()
      ? '<li><b>Safari\'de alttaki Paylaş düğmesine dokun</b><span>kutudan yukarı çıkan ok simgesi</span></li><li><b>“Ana Ekrana Ekle”yi seç</b><span>listeyi biraz aşağı kaydırman gerekebilir</span></li><li><b>Sağ üstte “Ekle”ye dokun</b><span>COMEBACK. ikonu ana ekranında belirir</span></li>'
      : '<li><b>Tarayıcının sağ üstündeki ⋮ menüsünü aç</b><span>Chrome, Samsung İnternet</span></li><li><b>“Ana ekrana ekle” ya da “Uygulamayı yükle”yi seç</b><span></span></li><li><b>“Ekle”ye dokun</b><span>COMEBACK. ikonu ana ekranında belirir</span></li>') + '</ol>' : '';
    return '<div class="t koyu genis ekle-kutu"><div class="satir" style="align-items:flex-start"><div class="yigin" style="gap:4px"><span class="k">Uygulama gibi kullan</span><b style="font-size:19px">Ana ekranına ekle</b><span class="ik" style="color:var(--koyu-ikincil)">Tek dokunuşla aç, tam ekran çalışsın, internet yokken de kayıt al.</span></div>' +
      (!kucuk ? '<button class="pd-ikon" data-act="ekle-kapat" aria-label="Kapat" style="background:rgba(255,255,255,.1);color:#fff">' + IK.kapat + '</button>' : '') + '</div>' +
      yonerge + '<button class="btn beyaz" data-act="ekle" style="align-self:flex-start;min-height:44px">' + (kurulumIstemi ? 'Ana ekrana ekle' : ekleAcik ? 'Tamam' : 'Nasıl eklenir?') + IK.ok + '</button></div>';
  }

  /* ---------- hedef değiştirme ---------- */
  let hedefTaslak = null;
  function ekranHedef() {
    if (!S.profil) return ekranKarsilama();
    const p = hedefTaslak || (hedefTaslak = JSON.parse(JSON.stringify(S.profil)));
    const hp = (grup, liste, secili, coklu) => liste.map((x) => '<button type="button" class="hap' + (coklu ? ' siyah' : '') + '" data-act="hedef-sec" data-grup="' + grup + '" data-deger="' + x[0] + '" aria-pressed="' + (coklu ? (secili || []).indexOf(x[0]) >= 0 : x[0] === secili) + '">' + x[1] + '</button>').join('');
    const yeni = M.hedefHesapla(p);
    const ozel = S.program && S.program.ozel;
    return ust(geri('#/profil'), '<span class="alt">Hedefin</span>') +
      '<h1 class="baslik">Ne istiyorsun<span class="nokta">?</span></h1>' +
      '<div class="izgara">' +
      '<div class="t genis"><span class="k">Hedefin</span><div class="haplar">' + hp('hedef', [['kas', 'Kas kazanmak'], ['yag', 'Yağ yakmak'], ['guc', 'Güçlenmek'], ['kondisyon', 'Kondisyon']], p.hedef) + '</div></div>' +
      '<div class="t genis"><span class="k">Haftada kaç gün?</span><div class="haplar">' + hp('gun', [2, 3, 4, 5, 6].map((n) => [String(n), n + ' gün']), String(p.gun)) + '</div></div>' +
      '<div class="t genis"><span class="k">Üzerine gitmek istediğin bölge · en fazla 2</span><div class="haplar">' + hp('odak', Object.keys(M.ODAK).map((k) => [k, M.ODAK[k].ad]), p.odak || [], true) + '</div></div>' +
      '<div class="t genis"><span class="k">Nerede çalışacaksın?</span><div class="haplar">' + hp('ortam', [['salon', 'Spor salonu'], ['ev', 'Evde, dambılla'], ['vucut', 'Ekipmansız'], ['dis', 'Dışarıda']], p.ortam || 'salon') + '</div></div>' +
      '<div class="t genis"><span class="k">Bir antrenman ne kadar sürsün?</span><div class="haplar">' + hp('sure', [['45', '45 dk'], ['60', '60 dk'], ['75', '75 dk'], ['90', '90 dk']], String(p.sure || 60)) + '</div></div>' +
      '<div class="t limon genis"><span class="k">Yeni günlük hedefin</span><span class="orta num">' + sayi(yeni.kcal) + ' kcal</span><span class="k">' + yeni.protein + ' g protein · şu an ' + sayi(S.hedef.kcal) + ' kcal</span></div>' +
      '</div>' +
      (ozel ? '<div class="uyari">Kendi yazdığın programın korunur, sadece kalori hedefin güncellenir. İstersen programı da yeni hedefe göre COMEBACK. kursun.</div>' : '<div class="uyari">Programın yeni hedefe göre yeniden kurulur. Geçmiş antrenmanların, rekorların ve öğünlerin silinmez.</div>') +
      '<button class="btn ana buyuk-btn" data-act="hedef-kaydet" data-program="' + (ozel ? '0' : '1') + '">' + (ozel ? 'Kalori hedefimi güncelle' : 'Kaydet, programımı yeniden kur') + IK.ok + '</button>' +
      (ozel ? '<button class="btn cerceve" data-act="hedef-kaydet" data-program="1">Programımı da COMEBACK. kursun</button>' : '') +
      '<a class="metin-btn" href="#/kurulum" style="align-self:center;color:var(--ikincil)">Yaş, kilo, sakatlık gibi diğer bilgileri değiştir</a>';
  }

  /* ---------- topluluk: forum, meydan okuma, hoca mesajları ---------- */
  const TAPI = '/api/comeback/topluluk/';
  async function tistek(yol, yontem, veri) {
    const r = await fetch(TAPI + yol, { method: yontem || 'GET', credentials: 'same-origin', headers: veri ? { 'content-type': 'application/json' } : {}, body: veri ? JSON.stringify(veri) : undefined });
    const j = await r.json().catch(() => ({})); return { ok: r.ok, j };
  }
  /* ---------- program paylaşımı (kullanıcı adıyla) ---------- */
  let paylasPr = null; let paylasOnay = null; let paylasYuk = false; let gelenler = null;
  async function paylasimYukle() { try { const r = await tistek('paylasim'); if (r.ok) { gelenler = r.j.liste || []; render(); } } catch (e) { /* yok */ } }
  const ozetProgram = (pr) => ({ ad: pr.ad, gunler: pr.gunler.filter((g) => g.hareketler.length).map((g) => ({ ad: g.ad, hafta: g.hafta, hareketler: g.hareketler.map((x) => ({ id: x.id, set: x.set, tekrar: x.tekrar, birim: x.birim, alt: x.alt, ust: x.ust, dinlenme: x.dinlenme, blok: x.blok, rir: x.rir, not: x.not, isinma: x.isinma })) })) });
  function programHazirla(pr0) {
    const pr = JSON.parse(JSON.stringify(pr0));
    pr.gunler = (pr.gunler || []).map((g, i) => Object.assign(g, { id: 'ozel-' + kimlik() + i, gid: 'ozel', bolge: 'ozel', hareketler: (g.hareketler || []).filter((x) => D.HAREKET[x.id]).map((x) => Object.assign(x, { sure: x.birim && x.birim !== 'tekrar' })) })).filter((g) => g.hareketler.length);
    pr.ozel = true; pr.ad = pr.ad || 'Paylaşılan program';
    return pr;
  }
  function programTamamla(pr, prof) {
    pr.gunler = pr.gunler.filter((g) => g.hareketler.length);
    pr.gunler.forEach((g) => { g.dk = M.ozelAnaliz([g], prof).dk[0]; });
    const an = M.ozelAnaliz(pr.gunler, prof); pr.hacim = an.hacim; pr.hacimHedef = an.hacimHedef; pr.ozel = true;
    return pr;
  }
  const programOzetSatir = (pr) => pr.gunler.length + ' gün · ' + pr.gunler.reduce((a, g) => a + g.hareketler.length, 0) + ' hareket';
  function ekranPaylas() {
    if (!paylasPr) { location.hash = '#/antrenman'; return ''; }
    const pr = paylasPr; const donus = ptaslak ? '#/program' : '#/antrenman';
    return ust(geri(donus), '<span class="alt">Program gönder</span>') +
      '<h1 class="baslik">Arkadaşına gönder<span class="nokta">.</span></h1>' +
      '<div class="t kobalt"><span class="k">Gönderilecek program</span><b style="font-size:22px;letter-spacing:-.02em">' + esc(pr.ad) + '</b><span class="k">' + programOzetSatir(pr) + '</span></div>' +
      (paylasOnay
        ? '<div class="t" style="gap:10px"><span class="k">Kime</span><div class="satir"><div class="yigin"><b style="font-size:20px">@' + esc(paylasOnay.kadi) + '</b><span class="ik">' + esc(paylasOnay.ad) + '</span></div><button class="metin-btn kucuk-metin" data-act="paylas-degis">Değiştir</button></div>' +
          (paylasOnay.not ? '<span class="ik">Notun: ' + esc(paylasOnay.not) + '</span>' : '') +
          '<span class="ik">Kabul ederse bu program onun programı olur. Senin kayıtların ona gitmez, yalnızca hareketler, setler ve tekrarlar.</span></div>' +
          '<button class="btn ana buyuk-btn" data-act="paylas-gonder"' + (paylasYuk ? ' disabled' : '') + '>' + (paylasYuk ? 'Gönderiliyor…' : 'Gönder') + IK.ok + '</button>'
        : '<form data-form="paylas-bul" class="izgara" novalidate style="grid-template-columns:1fr">' +
          '<label class="t alan"><span>Kime · kullanıcı adı</span><div class="kadi-alan"><span aria-hidden="true">@</span><input name="kime" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="21" placeholder="deniz.k" required style="font-size:20px"></div></label>' +
          '<label class="t alan"><span>Not · isteğe bağlı</span><input name="not" maxlength="200" placeholder="İlk hafta hafif başla." style="font-size:17px"></label>' +
          '<button class="btn ana buyuk-btn" type="submit">Kişiyi bul' + IK.ok + '</button></form>') +
      (hesap && !hesap.kadi ? '<a class="t koyu" href="#/profil"><span class="k">Senin kullanıcı adın yok</span><span style="line-height:1.45">Arkadaşların da sana program gönderebilsin diye Profil\'den bir kullanıcı adı al.</span></a>' : '');
  }
  function gelenBant() {
    const a = gelenler && gelenler[0]; if (!a) return '';
    return '<a class="t limon genis" href="#/gelen/' + a.id + '" style="gap:4px"><span class="k">@' + esc(a.kadi || '') + ' · ' + esc(a.gonderen) + ' sana program gönderdi</span><b style="font-size:20px">' + esc(a.program.ad || 'Program') + '</b><span class="ik" style="color:#3E4410">' + programOzetSatir(a.program) + ' · bak, beğenirsen al.</span></a>';
  }
  function ekranGelen(id) {
    const a = (gelenler || []).find((x) => String(x.id) === String(id)); if (!a) { location.hash = '#/'; return ''; }
    const pr = a.program;
    return ust(geri('#/'), '<span class="alt">@' + esc(a.kadi || '') + ' · ' + esc(a.gonderen) + '</span>') +
      '<h1 class="baslik">' + esc(pr.ad || 'Program') + '<span class="nokta">.</span></h1>' +
      (a.not ? '<div class="t koyu"><span class="k">Notu</span><span style="line-height:1.5">' + esc(a.not) + '</span></div>' : '') +
      pr.gunler.map((g) => '<div class="t"><div class="satir"><b style="font-size:18px">' + esc(g.ad) + '</b><span class="ik">' + GUN_AD[g.hafta] + '</span></div><div class="liste">' + g.hareketler.map((x) => '<div><div class="ad"><b>' + esc((D.HAREKET[x.id] || { ad: x.id }).ad) + '</b></div><span class="num" style="font-weight:800;font-size:14px">' + x.set + ' × ' + esc(x.tekrar) + '</span></div>').join('') + '</div></div>').join('') +
      '<div class="uyari">Alırsan şu anki programının yerine bu geçer. Geçmiş antrenmanların ve rekorların silinmez. Yükleri kendi seviyene göre ayarla.</div>' +
      '<button class="btn ana buyuk-btn" data-act="gelen" data-id="' + a.id + '" data-kabul="1">Programım yap' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="btn cerceve" data-act="gelen-duzenle" data-id="' + a.id + '">Önce düzenleyeyim</button>' +
      '<button class="metin-btn" data-act="gelen" data-id="' + a.id + '" data-kabul="0" style="align-self:center;color:var(--ikincil)">İstemiyorum</button>';
  }
  function kadiKutu() {
    if (!hesap) return '';
    return '<form class="t genis" data-form="kadi" novalidate style="gap:8px"><span class="k">Kullanıcı adın</span><div class="kadi-alan"><span aria-hidden="true">@</span><input name="ad" value="' + esc(hesap.kadi || '') + '" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20" placeholder="kullanici.adi" aria-label="Kullanıcı adı" style="font-size:20px"><button class="btn ana kucuk" type="submit">' + (hesap.kadi ? 'Değiştir' : 'Kaydet') + '</button></div><span class="ik">' + (hesap.kadi ? 'Arkadaşların sana bu adla program gönderebilir.' : 'Arkadaşların sana program gönderebilsin diye bir kullanıcı adı al. Harf, rakam, nokta, alt çizgi.') + '</span></form>';
  }
  const FKAT = [['genel', 'Genel'], ['antrenman', 'Antrenman'], ['beslenme', 'Beslenme'], ['motivasyon', 'Motivasyon'], ['sakatlik', 'Sakatlık ve toparlanma']];
  const MTUR = [['antrenman', 'Antrenman sayısı', 'antrenman'], ['set', 'Toplam set', 'set'], ['su', 'Su', 'L'], ['kayit', 'Öğün kaydı yapılan gün', 'gün'], ['seri', 'Gün serisi', 'gün']];
  let tp = { sekme: 'forum', kat: '', liste: null, konu: null, konuId: null, meydanlar: null, meydan: null, meydanId: null, yuk: false, mesaj: null, mesajId: null, menu: null };
  const zamanOnce = (z) => { const d = Math.round((Date.now() - z) / 60000); return d < 1 ? 'şimdi' : d < 60 ? d + ' dk önce' : d < 1440 ? Math.round(d / 60) + ' sa önce' : Math.round(d / 1440) + ' gün önce'; };
  async function tpYukle(ne, id) {
    if (tp.yuk) return; tp.yuk = true;
    try {
      if (ne === 'forum') { const r = await tistek('forum' + (tp.kat ? '?kategori=' + tp.kat : '')); tp.liste = r.ok ? r.j.liste : []; }
      else if (ne === 'konu') { const r = await tistek('forum/' + id); tp.konu = r.ok ? r.j : { hata: r.j.hata || 'Bulunamadı.' }; tp.konuId = id; }
      else if (ne === 'meydanlar') { const r = await tistek('meydan'); tp.meydanlar = r.ok ? r.j.liste : []; }
      else if (ne === 'meydan') {
        const r0 = await tistek('meydan/' + id);
        if (r0.ok) { const md = r0.j.meydan; const d = meydanIlerleme(md); await tistek('meydan/' + id + '/ilerleme', 'POST', { deger: d }); const r = await tistek('meydan/' + id); tp.meydan = r.ok ? r.j : r0.j; } else tp.meydan = { hata: r0.j.hata || 'Bulunamadı.' };
        tp.meydanId = id;
      } else if (ne === 'mesaj') { const r = await tistek('mesaj/' + encodeURIComponent(id)); tp.mesaj = r.ok ? r.j : { hata: r.j.hata || 'Açılamadı.' }; tp.mesajId = id; }
    } catch (e) { /* çevrimdışı */ if (ne === 'forum') tp.liste = []; if (ne === 'meydanlar') tp.meydanlar = []; }
    tp.yuk = false; render();
  }
  // meydan okuma ilerlemesi: kullanıcının kendi kayıtlarından, tarih aralığında
  function meydanIlerleme(md) {
    const gunler = Object.keys(S.gunluk).filter((k) => k >= md.baslangic && k <= md.bitis);
    if (md.tur === 'antrenman') return gunler.filter((k) => S.gunluk[k].antrenman).length;
    if (md.tur === 'set') return gunler.reduce((a, k) => a + (S.gunluk[k].antrenman ? S.gunluk[k].antrenman.set : 0), 0);
    if (md.tur === 'su') return Math.round(gunler.reduce((a, k) => a + (S.gunluk[k].su || 0), 0) / 100) / 10;
    if (md.tur === 'kayit') return gunler.filter((k) => S.gunluk[k].ogun.length).length;
    if (md.tur === 'seri') { let en = 0, n = 0; const d = new Date(md.baslangic); const son = new Date(Math.min(new Date(md.bitis), new Date(tarihKey()))); while (d <= son) { const k = tarihKey(d); const g = S.gunluk[k]; if (g && (g.ogun.length || g.antrenman)) { n++; en = Math.max(en, n); } else n = 0; d.setDate(d.getDate() + 1); } return en; }
    return 0;
  }
  const menuDugme = (tur, id, yazarId, benim) => '<button class="pd-ikon" data-act="tp-menu" data-tur="' + tur + '" data-id="' + id + '" aria-label="Seçenekler" aria-expanded="' + (tp.menu === tur + id) + '"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>' +
    (tp.menu === tur + id ? '<div class="tp-menu">' + (benim || (hesap && hesap.rol === 'admin') ? '<button data-act="tp-sil" data-tur="' + tur + '" data-id="' + id + '">Sil</button>' : '') + (!benim ? '<button data-act="tp-sikayet" data-tur="' + tur + '" data-id="' + id + '">Şikâyet et</button><button data-act="tp-engel" data-k="' + esc(yazarId) + '">Bu kişiyi engelle</button>' : '') + '</div>' : '');
  function ekranTopluluk(alt, id) {
    if (!S.profil) return ekranKarsilama();
    if (!hesap) return ust(geri('#/profil')) + '<div class="t"><b>Topluluk için giriş yapmalısın.</b></div>';
    const sekmeler = '<div class="yatay">' + [['forum', 'Forum'], ['meydan', 'Meydan okuma']].map((x) => '<a class="hap" href="#/topluluk' + (x[0] === 'meydan' ? '/meydan' : '') + '" aria-pressed="' + ((alt === 'meydan' || alt === 'meydan-yeni') === (x[0] === 'meydan')) + '" style="text-decoration:none">' + x[1] + '</a>').join('') + '</div>';
    if (alt === 'yeni') return ust(geri('#/topluluk'), '<span class="alt">Yeni konu</span>') + '<h1 class="baslik">Konu aç<span class="nokta">.</span></h1>' +
      '<form data-form="tp-konu" class="izgara" novalidate><div class="t genis"><span class="k">Kategori</span><div class="haplar">' + FKAT.map((k, i) => '<button type="button" class="hap" data-act="hap" data-grup="fkat" data-deger="' + k[0] + '" aria-pressed="' + (i === 0) + '">' + k[1] + '</button>').join('') + '</div></div>' +
      '<label class="t genis alan"><span>Başlık</span><input name="baslik" maxlength="120" required placeholder="İlk ayımda neler öğrendim" style="font-size:20px"></label>' +
      '<label class="t genis alan"><span>Ne anlatmak istiyorsun?</span><textarea name="metin" rows="6" maxlength="4000" required style="font:inherit;font-size:17px;line-height:1.5;border:0;background:transparent;resize:vertical;outline:none;width:100%"></textarea></label>' +
      '<p class="ik genis" style="padding:0 4px">Saygılı ol; kişisel bilgi, reklam ve tıbbi iddia paylaşma. Kurallara uymayan yazılar şikâyetle gizlenir.</p>' +
      '<button class="btn ana buyuk-btn genis" type="submit">Yayınla' + IK.ok + '</button></form>';
    if (alt === 'konu') {
      if (!tp.konu || tp.konuId !== id) { tp.konu = null; tpYukle('konu', id); return ust(geri('#/topluluk')) + '<p class="ik" style="padding:20px 4px">Yükleniyor…</p>'; }
      if (tp.konu.hata) return ust(geri('#/topluluk')) + '<div class="t"><span>' + esc(tp.konu.hata) + '</span></div>';
      const k = tp.konu.konu;
      return ust(geri('#/topluluk'), '<span class="alt">' + esc((FKAT.find((x) => x[0] === k.kategori) || ['', ''])[1]) + '</span>') +
        '<article class="t" style="gap:10px">' + (k.gizli ? '<span class="etiket">Gizlendi (şikâyet)</span>' : '') + '<div class="satir" style="align-items:flex-start"><h1 style="font-size:26px;font-weight:900;letter-spacing:-.03em;line-height:1.1">' + esc(k.baslik) + '</h1><div class="tp-menu-kap">' + menuDugme('konu', k.id, k.yazarId, k.benim) + '</div></div><span class="ik">' + esc(k.yazar) + ' · ' + zamanOnce(k.zaman) + '</span><p style="white-space:pre-wrap;line-height:1.55">' + esc(k.metin) + '</p></article>' +
        tp.konu.cevaplar.map((c) => '<div class="t tp-cevap"><div class="satir"><span class="ik"><b style="color:var(--murekkep)">' + esc(c.yazar) + '</b> · ' + zamanOnce(c.zaman) + (c.gizli ? ' · gizli' : '') + '</span><div class="tp-menu-kap">' + menuDugme('cevap', c.id, c.yazarId, c.benim) + '</div></div><p style="white-space:pre-wrap;line-height:1.5">' + esc(c.metin) + '</p></div>').join('') +
        '<form data-form="tp-cevap" class="koc-yaz" novalidate><label class="gizli" for="tpCevap">Cevabın</label><textarea id="tpCevap" name="metin" rows="1" maxlength="3000" placeholder="Cevap yaz"></textarea><button class="btn ana" type="submit" aria-label="Gönder">' + IK.ok + '</button></form>';
    }
    if (alt === 'meydan-yeni') return ust(geri('#/topluluk/meydan'), '<span class="alt">Meydan okuma</span>') + '<h1 class="baslik">Meydan oku<span class="nokta">.</span></h1>' +
      '<form data-form="tp-meydan" class="izgara" novalidate><label class="t genis alan"><span>Adı</span><input name="ad" maxlength="60" required placeholder="Kasımda 12 antrenman" style="font-size:20px"></label>' +
      '<div class="t genis"><span class="k">Ne yarışıyoruz?</span><div class="haplar">' + MTUR.map((x, i) => '<button type="button" class="hap" data-act="hap" data-grup="mtur" data-deger="' + x[0] + '" aria-pressed="' + (i === 0) + '">' + x[1] + '</button>').join('') + '</div></div>' +
      '<label class="t alan"><span>Hedef</span><input name="hedef" inputmode="numeric" placeholder="12" style="font-size:22px"></label><label class="t alan"><span>Süre, gün</span><input name="gun" inputmode="numeric" placeholder="30" style="font-size:22px"></label>' +
      '<button class="btn ana buyuk-btn genis" type="submit">Oluştur, kodu paylaş' + IK.ok + '</button></form>';
    if (alt === 'meydan' && id) {
      if (!tp.meydan || tp.meydanId !== id) { tp.meydan = null; tpYukle('meydan', id); return ust(geri('#/topluluk/meydan')) + '<p class="ik" style="padding:20px 4px">Yükleniyor…</p>'; }
      if (tp.meydan.hata) return ust(geri('#/topluluk/meydan')) + '<div class="t"><span>' + esc(tp.meydan.hata) + '</span></div>';
      const md = tp.meydan.meydan; const tur = MTUR.find((x) => x[0] === md.tur) || ['', md.turAd, ''];
      return ust(geri('#/topluluk/meydan'), '<span class="alt">Kod ' + esc(md.kod) + '</span>') + '<h1 class="baslik">' + esc(md.ad) + '<span class="nokta">.</span></h1>' +
        '<div class="t kobalt" style="gap:4px"><span class="k">' + esc(tur[1]) + ' · hedef ' + md.hedef + ' ' + tur[2] + '</span><span style="opacity:.85">' + esc(md.baslangic) + ' – ' + esc(md.bitis) + ' · ilerlemen kendi kayıtlarından otomatik hesaplanır</span><div class="satir" style="gap:8px;justify-content:flex-start;margin-top:6px"><button class="btn beyaz" data-act="tp-meydan-paylas" data-kod="' + esc(md.kod) + '" data-ad="' + esc(md.ad) + '" style="min-height:40px">Arkadaşını davet et</button></div></div>' +
        '<div class="t" style="padding:8px 16px"><span class="k" style="padding-top:6px">Sıralama</span>' + tp.meydan.sira.map((x, i) => '<div class="tp-sira' + (x.ben ? ' ben' : '') + '"><span class="num">' + (i + 1) + '</span><b>' + esc(x.ad) + (x.ben ? ' (sen)' : '') + '</b><div class="cubuk"><span style="width:' + yuzde(x.ilerleme, md.hedef) + '%"></span></div><span class="num">' + sayi(x.ilerleme, 1) + '</span></div>').join('') + '</div>' +
        '<button class="metin-btn" data-act="tp-meydan-ayril" style="align-self:center;color:var(--ikincil)">Meydan okumadan ayrıl</button>';
    }
    if (alt === 'meydan') {
      if (!tp.meydanlar) { tpYukle('meydanlar'); }
      return ust(logo, '<span class="alt">Topluluk</span>') + '<h1 class="baslik">Topluluk<span class="nokta">.</span></h1>' + sekmeler +
        '<form data-form="tp-katil" class="t" novalidate style="flex-direction:row;gap:8px;align-items:center"><input name="kod" maxlength="6" placeholder="Davet kodu" aria-label="Meydan okuma davet kodu" style="flex:1;min-width:0;border:0;background:var(--zemin);border-radius:14px;min-height:46px;padding:0 12px;font-size:17px;font-weight:800;letter-spacing:.1em;text-transform:uppercase"><button class="btn siyah" type="submit" style="min-height:46px">Katıl</button></form>' +
        '<a class="btn ana buyuk-btn" href="#/topluluk/meydan-yeni">Meydan okuma oluştur' + IK.ok + '</a>' +
        (!tp.meydanlar ? '<p class="ik">Yükleniyor…</p>' : tp.meydanlar.length ? tp.meydanlar.map((x) => '<a class="t" href="#/topluluk/meydan/' + x.id + '" style="gap:4px"><div class="satir"><b style="font-size:18px">' + esc(x.ad) + '</b><span class="etiket">' + x.kisi + ' kişi</span></div><span class="ik">' + esc(x.turAd) + ' · ' + sayi(x.ilerleme, 1) + ' / ' + x.hedef + ' · bitiş ' + esc(x.bitis) + '</span><div class="cubuk"><span style="width:' + yuzde(x.ilerleme, x.hedef) + '%"></span></div></a>').join('') : '<div class="t bos"><b>Henüz bir meydan okumada değilsin.</b><span class="ik">Bir tane oluştur ya da arkadaşının kodunu yaz.</span></div>');
    }
    // forum listesi
    if (!tp.liste) tpYukle('forum');
    return ust(logo, '<span class="alt">Topluluk</span>') + '<h1 class="baslik">Topluluk<span class="nokta">.</span></h1>' + sekmeler +
      '<div class="yatay">' + [['', 'Hepsi']].concat(FKAT).map((k) => '<button class="hap" data-act="tp-kat" data-deger="' + k[0] + '" aria-pressed="' + (tp.kat === k[0]) + '">' + k[1] + '</button>').join('') + '</div>' +
      '<a class="btn ana buyuk-btn" href="#/topluluk/yeni">Konu aç' + IK.ok + '</a>' +
      (!tp.liste ? '<p class="ik">Yükleniyor…</p>' : tp.liste.length ? tp.liste.map((x) => '<a class="t tp-konu" href="#/topluluk/konu/' + x.id + '"><span class="ik">' + esc((FKAT.find((k) => k[0] === x.kategori) || ['', ''])[1]) + ' · ' + esc(x.yazar) + ' · ' + zamanOnce(x.son) + '</span><b>' + esc(x.baslik) + '</b><span class="ik" style="color:var(--ikincil)">' + esc(x.ozet) + '</span><span class="etiket">' + x.cevap + ' cevap</span></a>').join('') : '<div class="t bos"><b>İlk konuyu sen aç.</b><span class="ik">Soru sor, ilerlemeni paylaş, motivasyon ver.</span></div>');
  }
  function ekranMesaj(id) {
    if (!hesap) { location.hash = '#/'; return ''; }
    if (!tp.mesaj || tp.mesajId !== id) { tp.mesaj = null; tpYukle('mesaj', id); return ust(geri('#/profil')) + '<p class="ik" style="padding:20px 4px">Yükleniyor…</p>'; }
    if (tp.mesaj.hata) return ust(geri('#/profil')) + '<div class="t"><span>' + esc(tp.mesaj.hata) + '</span></div>';
    const k = tp.mesaj.karsi;
    return ust(geri(k.hoca ? '#/profil' : '#/hoca/' + encodeURIComponent(id)), '<button class="ikon-btn" data-act="tp-mesaj-yenile" aria-label="Yenile" style="background:#fff">' + IK.degis + '</button>') +
      '<h1 class="baslik">' + esc(k.ad) + '<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:0 4px">' + (k.hoca ? 'Hocanla yazışma. Form videosu için videonu Drive ya da Instagram bağlantısı olarak gönderebilirsin.' : 'Öğrencinle yazışma.') + '</p>' +
      '<div class="koc-akis" id="kocAkis">' + (tp.mesaj.liste.length ? tp.mesaj.liste.map((x) => '<div class="koc-balon ' + (x.ben ? 'ben' : 'koc') + '">' + esc(x.metin).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">bağlantıyı aç</a>') + '<span class="mesaj-zaman">' + zamanOnce(x.zaman) + '</span></div>').join('') : '<p class="ik">Henüz mesaj yok. İlk mesajı sen yaz.</p>') + '</div>' +
      '<form data-form="tp-mesaj" class="koc-yaz" novalidate><label class="gizli" for="kocMetin">Mesajın</label><textarea id="kocMetin" name="metin" rows="1" maxlength="2000" placeholder="Mesaj yaz"></textarea><button class="btn ana" type="submit" aria-label="Gönder">' + IK.ok + '</button></form>';
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
  const KOCLAR = [
    ['demir', 'Demir', 'Sert ve net', 'Lafı dolandırmaz, bahaneye yer vermez, seni zorlar.'],
    ['ece', 'Ece', 'Sakin ve destekleyici', 'Sabırlı, küçük adımları takdir eder, cesaret verir.'],
    ['atlas', 'Atlas', 'Bilimsel', 'Nedenini anlatır, set, tekrar ve sayılarla konuşur.'],
    ['kuzey', 'Kuzey', 'Enerjik ve esprili', 'Motive eder, şakalaşır, ama bilgi net kalır.']
  ];
  let kocSecAcik = false; let kocTaslak = null;
  const kocAdi = () => (S.kocSec ? S.kocSec.ad : 'Koç');
  function kocSecici() {
    const t = kocTaslak || S.kocSec || { tarz: 'atlas', ad: 'Atlas' };
    return '<div class="t genis koc-sec" style="gap:12px"><span class="k">Koçunu seç</span>' +
      '<div class="koc-liste">' + KOCLAR.map((k) => '<button type="button" class="koc-kart" data-act="koc-tarz" data-tarz="' + k[0] + '" aria-pressed="' + (t.tarz === k[0]) + '"><b>' + k[1] + '</b><span class="koc-tarz">' + k[2] + '</span><span class="ik">' + k[3] + '</span></button>').join('') + '</div>' +
      '<label class="mini koc-ad"><span>İstersen kendi koyduğun bir isim</span><input id="kocAd" maxlength="20" value="' + esc(t.ad) + '" placeholder="Koçunun adı" autocomplete="off"></label>' +
      '<button class="btn ana" data-act="koc-kaydet">Bu koçla devam et' + IK.ok + '</button></div>';
  }
  function ekranKoc() {
    if (!S.profil) return ekranKarsilama();
    if (!S.kocSec || kocSecAcik) {
      return ust(geri('#/'), '<span class="alt">Koç · yapay zekâ</span>') +
        '<h1 class="baslik">Koçun kim olsun<span class="nokta">?</span></h1>' +
        '<p class="ik" style="font-size:15px;line-height:1.5;margin:0">Hepsi aynı bilgiyle, senin programına ve kayıtlarına göre cevap verir. Fark konuşma tarzında. İstediğin zaman değiştirebilirsin.</p>' +
        kocSecici();
    }
    const l = S.koc || [];
    const bicim = (t) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•]\s+/gm, '• ').replace(/^#+\s*/gm, '').replace(/\n/g, '<br>');
    const balon = (m) => '<div class="koc-balon ' + (m.rol === 'koc' ? 'koc' : 'ben') + '">' + (m.rol === 'koc' ? bicim(m.metin) : esc(m.metin).replace(/\n/g, '<br>')) + '</div>';
    const kk = KOCLAR.find((k) => k[0] === S.kocSec.tarz) || KOCLAR[2];
    return ust(geri('#/'), '<button class="metin-btn kucuk-metin" data-act="koc-degis">Koçunu değiştir</button>') +
      '<h1 class="baslik">Koç ' + esc(kocAdi()) + '<span class="nokta">.</span></h1>' +
      '<span class="ik" style="margin-top:-6px">' + kk[2] + ' · yapay zekâ</span>' +
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
      const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'sohbet', mesajlar: S.koc.slice(-12).map((m) => ({ rol: m.rol, metin: m.metin })), baglam: kocBaglam(), koc: S.kocSec || null }) });
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
  let pHoca = null; // { id, ad, profil } öğrenci için program yazılıyorsa
  const pProfil = () => (pHoca ? Object.assign({ hedef: 'kas', deneyim: 'orta', sakatlik: [] }, pHoca.profil) : S.profil);
  let ptaslak = null; let pSecGun = 0; let pAra = ''; let pBolge = ''; let pYer = ''; let pEkip = ''; let pYorumYuk = false; let pDonGun = null;
  const pFiltreSifirla = () => { pAra = ''; pBolge = ''; pYer = ''; pEkip = ''; };
  const PBOLGE = [['gogus', 'Göğüs', ['yatay_itme', 'egimli_itme', 'dips']], ['sirt', 'Sırt', ['yatay_cekme', 'dikey_cekme', 'trapez']], ['omuz', 'Omuz', ['dikey_itme', 'yan_omuz', 'arka_omuz', 'rotator']], ['kol', 'Kol', ['biceps', 'triceps']], ['bacak', 'Bacak', ['diz', 'tek_bacak', 'quad_izo', 'hamstring_izo', 'adduktor', 'abduktor', 'baldir']], ['kalca', 'Kalça', ['kalca']], ['karin', 'Karın', ['core_anti_ext', 'core_anti_rot', 'core_lat', 'core_rot', 'tasima', 'kavrama', 'boyun']], ['kondisyon', 'Kondisyon', ['kardiyo', 'surat', 'ceviklik', 'plyo_dikey', 'plyo_inis', 'plyo_yatay', 'plyo_ust']]];
  const PYER = [['', 'Her yer'], ['salon', 'Salon'], ['ev', 'Evde dambılla'], ['vucut', 'Ekipmansız'], ['dis', 'Dışarı / park']];
  const PEKIP = [['', 'Tüm ekipman'], ['makine', 'Makine'], ['kablo', 'Kablo'], ['dambil', 'Dambıl'], ['barbell', 'Barbell'], ['kettlebell', 'Kettlebell'], ['bant', 'Bant'], ['vucut', 'Vücut ağırlığı']];
  // aramada kalıba göre ek kelimeler: "itiş", "çekiş", "push", "fly" gibi yazınca da bulunsun
  const KALIP_ARA = {
    yatay_itme: 'itis itme push gogus chest press fly', egimli_itme: 'itis itme push egimli incline ust gogus', dikey_itme: 'itis itme push omuz shoulder press',
    dips: 'itis itme push dips', triceps: 'itis itme push arka kol triceps', yan_omuz: 'itis omuz lateral raise yan omuz', arka_omuz: 'cekis cekme pull omuz arka rear delt',
    rotator: 'omuz rotator', yatay_cekme: 'cekis cekme pull sirt row kurek', dikey_cekme: 'cekis cekme pull sirt kanat lat pulldown barfiks', biceps: 'cekis cekme pull on kol biceps curl pazu',
    trapez: 'cekis sirt trapez shrug', diz: 'bacak squat leg on bacak', kalca: 'bacak kalca glute deadlift popo', tek_bacak: 'bacak lunge tek bacak', hamstring_izo: 'bacak arka bacak hamstring leg curl',
    quad_izo: 'bacak on bacak quad', baldir: 'bacak baldir calf', adduktor: 'bacak ic bacak adductor', abduktor: 'kalca dis kalca abductor', core_anti_ext: 'karin core abs', core_anti_rot: 'karin core',
    core_lat: 'karin yan karin core', core_rot: 'karin yan karin core', tasima: 'karin tasima', kavrama: 'onkol kavrama', boyun: 'boyun', kardiyo: 'kardiyo cardio kondisyon yag yakma',
    surat: 'kondisyon surat sprint kosu', ceviklik: 'kondisyon ceviklik', plyo_dikey: 'kondisyon ziplama', plyo_inis: 'kondisyon', plyo_yatay: 'kondisyon ziplama', plyo_ust: 'kondisyon patlayici'
  };
  const normal = (x) => String(x || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c').replace(/[^a-z0-9 ]+/g, ' ');
  const aramaMetni = {};
  const hAra = (h) => aramaMetni[h.id] || (aramaMetni[h.id] = normal([h.ad, D.HAREKET[h.id].kas, h.ekipman.map((e) => K.EKIPMAN[e]).join(' '), KALIP_ARA[h.kalip] || '', h.id.replace(/_/g, ' ')].join(' ')));
  const ekipUyar = (h, e) => (e === 'vucut' ? h.ekipman.every((x) => x === 'vucut' || x === 'kutu') : h.ekipman.indexOf(e) >= 0);
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
    if (!S.profil && !pHoca) return ekranKarsilama();
    const pr = ptaslakAl();
    const an = M.ozelAnaliz(pr.gunler, pProfil());
    const gunler = pr.gunler.map((g, gi) => {
      const satirlar = g.hareketler.map((x, i) => {
        const h = D.HAREKET[x.id] || { ad: x.id, kas: '' };
        return '<div class="pd-hareket"><div class="yigin" style="min-width:0"><b>' + esc(h.ad) + '</b><span class="ik">' + esc(h.kas || '') + (x.birim !== 'tekrar' ? ' · ' + BIRIM[x.birim].toLowerCase() : '') + '</span></div>' +
          '<div class="pd-kontrol"><div class="pd-sayac" role="group" aria-label="Set sayısı"><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="-1" aria-label="Set azalt">−</button><span class="num">' + x.set + '<small>set</small></span><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="1" aria-label="Set artır">+</button></div>' +
          '<label class="pd-tekrar"><span class="gizli">' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '</span><input data-pd="tekrar" data-g="' + gi + '" data-i="' + i + '" value="' + esc(x.tekrar) + '" inputmode="text" maxlength="7" aria-label="' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '"><small>' + BIRIM[x.birim].toLowerCase() + '</small></label>' +
          '<div class="pd-is"><button type="button" class="pd-ikon" data-act="pd-tasi" data-g="' + gi + '" data-i="' + i + '" data-yon="-1" aria-label="Yukarı taşı"' + (i === 0 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 15l6-6 6 6"/></svg></button><button type="button" class="pd-ikon" data-act="pd-tasi" data-g="' + gi + '" data-i="' + i + '" data-yon="1" aria-label="Aşağı taşı"' + (i === g.hareketler.length - 1 ? ' disabled' : '') + '><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></button><button type="button" class="pd-ikon" data-act="pd-sil" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(h.ad) + ' çıkar">' + IK.kapat + '</button></div></div></div>';
      }).join('');
      return '<section class="t genis pd-gun" id="pdgun-' + gi + '" aria-label="' + esc(g.ad) + '">' +
        '<div class="satir" style="gap:8px"><input class="pd-gunad" data-pd="gunad" data-g="' + gi + '" value="' + esc(g.ad) + '" maxlength="24" aria-label="Gün adı"><span class="ik num">~' + an.dk[gi] + ' dk</span>' +
        (pr.gunler.length < 7 && g.hareketler.length ? '<button type="button" class="pd-ikon" data-act="pd-gunkopya" data-g="' + gi + '" aria-label="' + esc(g.ad) + ' gününü kopyala" title="Günü kopyala"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/></svg></button>' : '') +
        (pr.gunler.length > 1 ? '<button type="button" class="pd-ikon" data-act="pd-gunsil" data-g="' + gi + '" aria-label="' + esc(g.ad) + ' gününü sil">' + IK.kapat + '</button>' : '') + '</div>' +
        '<div class="haplar pd-hafta" role="group" aria-label="Haftanın günü">' + GUN_KISA.map((k, h) => { const dolu = pr.gunler.some((y, yi) => yi !== gi && y.hafta === h); return '<button type="button" class="hap" data-act="pd-hafta" data-g="' + gi + '" data-h="' + h + '" aria-pressed="' + (g.hafta === h) + '"' + (dolu ? ' disabled' : '') + '>' + k + '</button>'; }).join('') + '</div>' +
        (satirlar || '<p class="ik" style="padding:6px 0">Bu güne henüz hareket eklemedin.</p>') +
        '<a class="btn cerceve" href="#/program/ekle/' + gi + '" style="min-height:46px">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Hareket ekle</a></section>';
    }).join('');
    const yorum = pr.yorum ? '<div class="t genis koyu"><span class="k">Yapay zekâ yorumu</span>' + pr.yorum.ozet.map((x) => '<p style="font-size:15px;line-height:1.5">' + esc(x) + '</p>').join('') +
      (pr.yorum.oneriler && pr.yorum.oneriler.length ? '<ul class="madde" style="color:var(--koyu-yazi)">' + pr.yorum.oneriler.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '<span class="ik" style="color:var(--koyu-ikincil)">Genel bilgidir, tıbbi tavsiye değildir.</span></div>' : '';
    return ust(geri(pHoca ? '#/hoca/' + encodeURIComponent(pHoca.id) : S.program && S.program.gunler.some((g) => g.hareketler.length) ? '#/antrenman' : '#/profil'), '<span class="alt">' + (pHoca ? esc(pHoca.ad) + ' için' : pr.ozel ? 'Kendi programın' : 'Programı düzenle') + '</span>') +
      '<h1 class="baslik">' + (pHoca ? esc(pHoca.ad) + '\'in programı' : 'Programın') + '<span class="nokta">.</span></h1>' +
      (pHoca ? '<label class="t genis alan"><span>Öğrencine not · isteğe bağlı</span><input data-pd="not" value="' + esc(pr.hocaNotu || '') + '" maxlength="300" placeholder="İlk hafta yükleri hafif tut." style="font-size:17px"></label>' : '') +
      '<div class="izgara">' +
      '<label class="t genis alan"><span>Program adı</span><input data-pd="ad" value="' + esc(pr.ad) + '" maxlength="40" style="font-size:22px"></label>' +
      gunler +
      (pr.gunler.length < 7 ? '<button type="button" class="btn cerceve genis" data-act="pd-gunekle">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Gün ekle</button>' : '') +
      planHacim({ hacim: an.hacim, hacimHedef: an.hacimHedef }) +
      (an.uyari.length ? '<div class="t genis"><span class="k">Dikkat</span><ul class="madde">' + an.uyari.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul></div>' : '') +
      yorum +
      (pHoca ? '' : '<button type="button" class="btn cerceve genis" data-act="paylas-ac" data-kaynak="taslak">' + IK.ok.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Programı bir arkadaşına gönder</button>') +
      '<button type="button" class="btn siyah genis" data-act="pd-yorum"' + (pYorumYuk ? ' disabled' : '') + '>' + (pYorumYuk ? 'Yorumlanıyor…' : (pr.yorum ? 'Yeniden yorumlat' : 'Yapay zekâya yorumlat')) + IK.ok + '</button>' +
      '</div>' +
      '<button class="btn ana buyuk-btn" data-act="pd-kaydet">' + (pHoca ? 'Öğrencime gönder' : 'Programı kaydet') + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="pd-vazgec" style="align-self:center;color:var(--ikincil)">Değişiklikleri at</button>';
  }
  function ekranProgramEkle(gi) {
    const pr = ptaslakAl(); const g = pr.gunler[gi];
    if (!g) { location.hash = '#/program'; return ''; }
    if (pSecGun !== gi) pFiltreSifirla();
    pSecGun = gi;
    return ust(geri('#/program'), '<span class="alt">' + esc(g.ad) + ' · hareket ekle</span>') +
      '<h1 class="baslik">Hareket seç<span class="nokta">.</span></h1>' +
      '<label class="t alan"><span>Ara</span><input id="pdAra" type="search" value="' + esc(pAra) + '" placeholder="Lateral, itiş, kablo, kelebek…" autocomplete="off" style="font-size:20px"></label>' +
      '<div class="pd-filtre">' +
      '<div class="yatay" role="group" aria-label="Nerede">' + PYER.map((b) => '<button class="hap" data-act="pd-filtre" data-tur="yer" data-deger="' + b[0] + '" aria-pressed="' + (pYer === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' +
      '<div class="yatay" role="group" aria-label="Ekipman">' + PEKIP.map((b) => '<button class="hap" data-act="pd-filtre" data-tur="ekip" data-deger="' + b[0] + '" aria-pressed="' + (pEkip === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' +
      '<div class="yatay" role="group" aria-label="Bölge">' + '<button class="hap" data-act="pd-filtre" data-tur="bolge" data-deger="" aria-pressed="' + (!pBolge) + '">Tüm bölgeler</button>' + PBOLGE.map((b) => '<button class="hap" data-act="pd-filtre" data-tur="bolge" data-deger="' + b[0] + '" aria-pressed="' + (pBolge === b[0]) + '">' + b[1] + '</button>').join('') + '</div>' +
      '</div>' +
      '<div id="pdListe">' + pdListe(g) + '</div>' +
      '<a class="btn ana pd-bitti" href="#/program">' + (g.hareketler.length ? 'Bitti · ' + esc(g.ad) + ' · ' + g.hareketler.length + ' hareket' : 'Geri dön') + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</a>';
  }
  function pdListe(g) {
    const PP = pProfil() || {};
    const ekip = K.ORTAM[PP.ortam] ? K.ORTAM[PP.ortam].ekipman : null;
    const sozcuk = normal(pAra).split(' ').filter(Boolean);
    const bol = PBOLGE.find((b) => b[0] === pBolge);
    const yer = pYer && K.ORTAM[pYer] ? K.ORTAM[pYer].ekipman : null;
    const adet = {}; g.hareketler.forEach((x) => { adet[x.id] = (adet[x.id] || 0) + 1; });
    const liste = Object.keys(K.HAREKET).map((id) => K.HAREKET[id])
      .filter((h) => !bol || bol[2].indexOf(h.kalip) >= 0)
      .filter((h) => !yer || h.ekipman.every((e) => yer.indexOf(e) >= 0))
      .filter((h) => !pEkip || ekipUyar(h, pEkip))
      .filter((h) => !sozcuk.length || sozcuk.every((w) => hAra(h).indexOf(w) >= 0))
      .sort((a, b) => { const u = (h) => (ekip && !h.ekipman.every((e) => ekip.indexOf(e) >= 0) ? 1 : 0); return u(a) - u(b) || a.seviye - b.seviye; });
    const satir = (h) => {
      const uygunDegil = !yer && ekip && !h.ekipman.every((e) => ekip.indexOf(e) >= 0);
      const sakat = (PP.sakatlik || []).some((b) => (h.kontra || []).indexOf(b) >= 0);
      const n = adet[h.id] || 0;
      return '<button type="button" class="pd-sec" data-act="pd-ekle" data-id="' + h.id + '"><span class="yigin"><b>' + esc(h.ad) + '</b><span class="ik">' + esc(D.HAREKET[h.id].kas || 'Kondisyon') + ' · ' + h.ekipman.map((e) => K.EKIPMAN[e]).join(', ') + '</span>' +
        (uygunDegil || sakat ? '<span class="pd-not">' + [uygunDegil ? 'ortamında ekipmanı yok' : '', sakat ? 'sakatlık bölgeni zorlayabilir' : ''].filter(Boolean).join(' · ') + '</span>' : '') + '</span>' +
        '<span class="pd-ekle-ik">' + (n ? '<span class="pd-adet num">' + (n > 1 ? n + '× ' : '') + 'ekli</span>' : '') + IK.arti.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:var(--kobalt);stroke-width:2.4;flex:none"') + '</span></button>';
    };
    const aktif = pAra || pBolge || pYer || pEkip;
    return '<div class="satir pd-sonuc"><span class="ik num">' + liste.length + ' hareket</span>' + (aktif ? '<button class="metin-btn kucuk-metin" data-act="pd-filtre" data-tur="hepsi">Filtreleri temizle</button>' : '') + '</div>' +
      '<div class="t" style="padding:4px 12px">' + (liste.length ? liste.map(satir).join('') : '<p class="ik" style="padding:12px 4px">Bu filtrelerde hareket yok. Bir filtreyi kaldırmayı dene; aradığın hareket listede hiç yoksa Görüş bildir\'den yaz, ekleyelim.</p>') + '</div>';
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

  let offAcik = false;
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
      antr = '<a class="t koyu genis ana-kutu h150" href="#/antrenman" style="min-height:190px"><span class="k">' + (offMu() ? 'Bugünü dinlenmeye ayırdın' : 'Bugün dinlenme günü') + '</span><span class="dev">Dinlen<span style="color:var(--mavi-gece)">.</span></span><span class="ik">' + (sonra ? 'Sıradaki: ' + (sonra.kac === 1 ? 'yarın' : GUN_AD[sonra.hafta]) + ' · ' + esc(sonra.gun.ad) : '') + '</span></a>';
      if (offMu()) antr += '<div class="t genis off-kutu"><span class="ik">Fikrini mi değiştirdin?</span><button class="btn cerceve kucuk" data-act="off-geri">Antrenmanı geri getir</button></div>';
    }
    if (!S.seans && !g.antrenman && bugunku && bugunku.hareketler.length) {
      const yarin = new Date(); yarin.setDate(yarin.getDate() + 1);
      const yarinBos = !gunIcin(yarin);
      antr += offAcik
        ? '<div class="t genis off-kutu acik"><span class="k">Bugün gitmek istemiyor musun?</span><span class="ik">Öğünlerini kaydetmeye devam edersen serin bozulmaz. Ne yapalım?</span><div class="haplar">' +
          '<button class="btn siyah kucuk" data-act="off" data-tur="dinlen">Bugünü atla, dinleneyim</button>' +
          (yarinBos ? '<button class="btn ana kucuk" data-act="off" data-tur="kaydir">Yarına kaydır</button>' : '') +
          '<button class="metin-btn" data-act="off-ac" style="color:var(--ikincil)">Vazgeç</button></div>' +
          (yarinBos ? '' : '<span class="ik">Yarın zaten ' + esc(gunIcin(yarin).ad) + ' var, o yüzden kaydıramıyoruz.</span>') + '</div>'
        : '<button class="metin-btn off-btn" data-act="off-ac">Bugün gidemiyorum · off gün ver</button>';
    }
    const ana = ['bench', 'squat', 'deadlift', 'ohp', 'db_bench', 'goblet', 'legpress'].find((x) => S.rekor[x]);
    const rekorKutu = ana
      ? '<a class="t h150" href="#/ilerleme"><span class="k">' + esc(D.HAREKET[ana].ad) + ' rekoru</span><span class="orta num">' + sayi(S.rekor[ana].kg, 1) + '<span class="ik" style="font-weight:600"> kg × ' + S.rekor[ana].tekrar + '</span></span><span class="ik">' + esc(S.rekor[ana].tarih) + '</span></a>'
      : '<a class="t h150" href="#/ilerleme"><span class="k">Kilo</span><span class="orta num">' + sayi(S.kilo.length ? S.kilo[S.kilo.length - 1].kg : S.profil.kilo, 1) + '<span class="ik" style="font-weight:600"> kg</span></span><span class="ik">Tart, ekle, gelişimi gör</span></a>';
    const ara = S.seans ? null : sonAntrenmanAra();
    if (ara != null && ara >= 10 && !g.antrenman && antr.indexOf('Bugünün antrenmanı') >= 0) antr = antr.replace('<span class="btn beyaz"', '<span class="ik" style="color:rgba(255,255,255,.85)">' + ara + ' gün aradan sonra yükleri biraz hafifletiyoruz. Bıraktığın yerden.</span><span class="btn beyaz"');
    const sa = new Date().getHours();
    const selam = sa < 5 ? 'İyi geceler' : sa < 12 ? 'Günaydın' : sa < 18 ? 'İyi günler' : 'İyi akşamlar';
    return ust(logo, '<span class="alt">' + tarihYazi() + '</span>') +
      '<h1 class="baslik">' + selam + (S.profil.ad ? ', ' + esc(S.profil.ad) : '') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + atananBant() + gelenBant() + antr +
      '<a class="t limon h150" href="#/beslenme"><span class="k">' + (kalan >= 0 ? 'Kalan kalori' : 'Hedefin üstünde') + '</span><span class="buyuk num" data-say="' + Math.round(Math.abs(kalan)) + '">' + sayi(Math.abs(kalan)) + '</span><span class="k" style="display:inline-flex;align-items:center;gap:6px">' + sayi(tp.k) + ' / ' + sayi(h.kcal) + ' kcal</span></a>' +
      '<a class="t koyu h150" href="#/ilerleme"><span class="k">Seri</span><span class="buyuk num"><span data-say="' + seri() + '">' + seri() + '</span><span style="color:var(--mavi-gece)">.</span></span><span class="ik">gün üst üste</span></a>' +
      '<a class="t h150" href="#/beslenme"><span class="k">Protein</span><span class="orta num">' + sayi(tp.p) + '<span class="ik" style="font-weight:600"> / ' + h.protein + ' g</span></span><div class="cubuk" role="img" aria-label="Protein hedefinin yüzde ' + yuzde(tp.p, h.protein) + '\'i"><span style="width:' + yuzde(tp.p, h.protein) + '%"></span></div></a>' +
      rekorKutu +
      '<a class="t koyu genis koc-kutu" href="#/koc"><span class="k">' + (S.kocSec ? 'Koç ' + esc(S.kocSec.ad) : 'Koç') + ' · yapay zekâ</span><b style="font-size:20px;letter-spacing:-.02em">Bir yerin mi ağrıyor, keyfin mi yok?</b><span class="ik" style="color:var(--koyu-ikincil)">Koça danış, programına göre cevap versin.</span></a>' +
      ekleKutu(false) +
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
      '<a class="metin-btn" href="#/program" style="align-self:center;color:var(--murekkep)">' + (pr.ozel ? 'Programımı düzenle' : 'Programı düzenle ya da kendi programını yaz') + '</a>' +
      (hesap ? '<button class="metin-btn" data-act="paylas-ac" data-kaynak="program" style="align-self:center;color:var(--kobalt)">Programımı bir arkadaşıma gönder</button>' : '');
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

  // ısınma ve soğuma: günün ağırlıklı bölgesine göre (genel ısınma + dinamik hareket; soğumada statik esneme)
  const ISINMA = {
    genel: [['Hafif kardiyo', '3–5 dk · bisiklet, kürek ya da tempolu yürüyüş; hafif terleyene kadar']],
    alt: [['Vücut ağırlığıyla squat', '10 tekrar, yavaş ve derin'], ['Kalça açma (dünyanın en iyi esnemesi)', 'her yan 5 tekrar'], ['Yürüyüş lunge', 'her bacak 6'], ['Bacak sallama', 'öne-arkaya ve yana, her bacak 10'], ['Glute bridge', '10 tekrar, tepede 1 sn sık']],
    ust: [['Kol çevirme', 'öne ve arkaya 10’ar'], ['Bantla pull-apart', '15 tekrar'], ['Duvar kayması (wall slide)', '10 tekrar'], ['Kedi-deve', '8 tekrar, sırtı yuvarla ve aç'], ['Hafif şınav', '8 tekrar']],
    tum: [['Inchworm (el yürüyüşü)', '5 tekrar'], ['Vücut ağırlığıyla squat', '10 tekrar'], ['Kol çevirme', 'öne ve arkaya 10’ar'], ['Kalça açma', 'her yan 4 tekrar'], ['Jumping jack', '20 tekrar']]
  };
  const SOGUMA = {
    alt: [['Ön bacak esnemesi', 'ayakta, her bacak 30 sn'], ['Arka bacak esnemesi', 'oturarak, 30 sn'], ['Güvercin duruşu (kalça)', 'her yan 30 sn'], ['Baldır esnemesi', 'duvara dayan, her bacak 30 sn']],
    ust: [['Göğüs esnemesi', 'kapı kenarında, 30 sn'], ['Lat esnemesi', 'bara tutun, kalçayı geri it, 30 sn'], ['Omuz arkası', 'kolu göğsün önünden çek, her kol 20 sn'], ['Triceps esnemesi', 'dirsek başın arkasında, her kol 20 sn']],
    tum: [['Çocuk duruşu', '45 sn, derin nefes'], ['Ön bacak esnemesi', 'her bacak 30 sn'], ['Göğüs esnemesi', 'kapı kenarında, 30 sn'], ['Arka bacak esnemesi', '30 sn']]
  };
  function gunBolge(g) {
    let alt = 0, ust = 0;
    g.hareketler.forEach((x) => { const h = K.HAREKET[x.id]; if (!h) return; h.birincil.forEach((m) => { if (['on_bacak', 'arka_bacak', 'kalca', 'baldir', 'adduktor'].indexOf(m) >= 0) alt += x.set; else if (m !== 'karin' && m !== 'bel') ust += x.set; }); });
    return alt > ust * 2 ? 'alt' : ust > alt * 2 ? 'ust' : 'tum';
  }
  const rutinListe = (l) => '<ol class="rutin">' + l.map((x) => '<li><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></li>').join('') + '</ol>';

  function ekranSeans() {
    const s = S.seans; const sg = S.program.gunler.find((x) => x.id === s.gunId);
    const dk = Math.round((Date.now() - s.baslangic) / 60000);
    const tamam = Object.values(s.setler).reduce((a, l) => a + l.filter((x) => x.ok).length, 0);
    const toplamSet = Object.values(s.setler).reduce((a, l) => a + l.length, 0);
    return ust('<a class="ikon-btn" href="#/" aria-label="Ana sayfa">' + IK.geri + '</a>', '<span class="alt num">' + tamam + ' / ' + toplamSet + ' set · ' + dk + ' dk</span>') +
      '<h1 class="baslik">' + esc(sg.ad) + '<span class="nokta">.</span></h1>' +
      (s.donus ? '<div class="t limon" style="gap:4px"><span class="k">Bıraktığın yerden.</span><span style="font-weight:600;line-height:1.45">' + s.donus.ara + ' gün ara verdin. Sakatlanmadan dönmen için bugünkü yükleri son kaldırdığının %' + Math.round(s.donus.oran * 100) + '\'ine indirdik. Rahat geliyorsa sonraki antrenmanda kaldığın yere döneriz.</span></div>' : '') +
      '<details class="t rutin-kutu"' + (Object.values(s.setler).some((l) => l.some((y) => y.ok)) ? '' : ' open') + '><summary><span class="k">Isınma · ~7 dk</span><span class="ik">açmak için dokun</span></summary>' + rutinListe(ISINMA.genel.concat(ISINMA[gunBolge(sg)])) + '</details>' +
      '<div class="seans-izgara">' + (() => { const ks = seansAnahtar(sg); return sg.hareketler.map((x, xi) => {
        const k = ks[xi]; const hr = D.HAREKET[x.id]; const l = s.setler[k] || []; const once = S.son[k] || S.son[x.id];
        const aktifIdx = l.findIndex((y) => !y.ok);
        return '<section class="t" aria-label="' + esc(hr.ad) + '" style="padding-bottom:6px"><div class="satir"><div class="yigin"><b style="font-size:18px;letter-spacing:-.01em">' + esc(hr.ad) + '</b><span class="ik num">Hedef ' + x.set + ' × ' + esc(x.tekrar) + (x.rir ? ' · ' + esc(x.rir) : '') + (S.rekor[x.id] ? ' · rekor ' + sayi(S.rekor[x.id].kg, 1) + ' × ' + S.rekor[x.id].tekrar : '') + '</span></div>' + (x.blok && x.blok !== 'ana' && x.blok !== 'yard' ? '<span class="etiket">' + BLOK[x.blok] + '</span>' : '') + '</div>' +
          hareketGorsel(x.id) +
          (x.isinma ? '<p class="ipucu"><b>Önce ısın:</b> çok hafif × 8, sonra orta × 4.</p>' : '') +
          (hr.ipucu ? '<p class="ipucu">' + esc(hr.ipucu) + (x.not ? ' <b>' + esc(x.not) + '.</b>' : '') + '</p>' : '') +
          '<div class="setler"><div class="set bas"><span>Set</span><span>Önceki</span><span style="text-align:center">Kg</span><span style="text-align:center">' + BIRIM[birimOf(x)] + '</span><span></span></div>' +
          l.map((y, i) => {
            const o = once && once.setler[i];
            return '<div class="set' + (i === aktifIdx ? ' aktif' : '') + (i >= x.set ? ' ek' : '') + '"><span class="no num">' + (i >= x.set ? '+' + (i - x.set + 1) : i + 1) + '</span><span class="once num">' + (o ? sayi(o.kg, 1) + ' × ' + o.tekrar : '—') + '</span>' +
              '<input aria-label="' + (i + 1) + '. set kilo" inputmode="decimal" data-in="kg" data-h="' + k + '" data-i="' + i + '" value="' + esc(y.kg) + '" placeholder="—">' +
              '<input aria-label="' + (i + 1) + '. set ' + BIRIM[birimOf(x)].toLowerCase() + '" inputmode="numeric" data-in="tekrar" data-h="' + k + '" data-i="' + i + '" value="' + esc(y.tekrar) + '" placeholder="' + (x.alt || '') + '">' +
              '<button class="tik" data-act="tik" data-h="' + k + '" data-i="' + i + '" aria-pressed="' + (y.ok ? 'true' : 'false') + '" aria-label="' + (i + 1) + '. seti ' + (y.ok ? 'geri al' : 'tamamla') + '">' + IK.tik + '</button></div>';
          }).join('') + '</div>' +
          '<div class="set-ek"><button class="metin-btn" data-act="set-ekle" data-h="' + k + '">+ Ek set</button>' +
          (l.length > x.set && !l[l.length - 1].ok ? '<button class="metin-btn" data-act="set-cikar" data-h="' + k + '" style="color:var(--ikincil)">Son ek seti kaldır</button>' : '') + '</div></section>';
      }).join(''); })() + '</div>' +
      '<details class="t rutin-kutu"><summary><span class="k">Soğuma ve esneme · ~4 dk</span><span class="ik">bitirmeden önce</span></summary>' + rutinListe(SOGUMA[gunBolge(sg)]) + '</details>' +
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
      return bas + '<form data-form="ara" class="t" role="search"><label class="alan"><span>Yemek ya da ürün adı</span><input name="q" id="araQ" autocomplete="off" placeholder="ör. domates, tavuk, ayran" style="font-size:24px" value="' + esc(aramaQ) + '"></label></form>' +
        yemKatHaplar() +
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
        '<label class="t genis onay"><input type="checkbox" name="kaydet"><span>Ürünlerime kaydet: bir dahaki sefere aramada çıksın (miktarı girersen 100 g değerine çeviririz).</span></label>' +
        '<p class="hata genis" id="elleHata" role="alert" hidden></p>' +
        '<button class="btn ana buyuk-btn genis" type="submit">Ekle' + IK.ok + '</button></form>';
    }
    // foto
    return bas +
      '<label class="foto" style="cursor:pointer" id="fotoAlan">' + (fotoSonuc && fotoSonuc.resim ? '<img src="' + fotoSonuc.resim + '" alt="Çektiğin tabak fotoğrafı">' : '') +
      '<span class="durum" id="fotoDurum">' + (fotoSonuc ? esc(fotoSonuc.durum) : 'Fotoğraf çek ya da seç') + '</span>' +
      '<input type="file" accept="image/*" capture="environment" data-in="foto" style="position:absolute;width:1px;height:1px;opacity:0" aria-label="Tabak fotoğrafı"></label>' +
      '<label class="t alan foto-not"><span>Ne yiyorsun? · isteğe bağlı</span><input id="fotoNot" data-in="foto-not" maxlength="300" value="' + esc(fotoNot) + '" placeholder="Ör. tavuk sote, yarım tabak pilav, 1 ayran" autocomplete="off" style="font-size:17px"></label>' +
      (fotoSonuc && fotoSonuc.resim && !fotoSonuc.kalemler && !/inceleniyor/.test(fotoSonuc.durum) ? '<button class="btn cerceve" data-act="foto-tekrar">Notla birlikte tekrar dene</button>' : '') +
      (fotoSonuc && fotoSonuc.kalemler ? fotoKalemler() : '<p class="not">Yapay zekâ tabağındaki yemekleri ve gramajları tahmin eder; sen düzeltip kaydedersin. Ne yediğini kısaca yazarsan tahmin çok daha isabetli olur.</p>');
  }
  let aramaQ = '';
  const kucuk = (s) => s.toLocaleLowerCase('tr-TR');
  let yemKat = '';
  const yemAra = {};
  const yAra = (y) => yemAra[y.ad] || (yemAra[y.ad] = ' ' + normal(y.ad + ' ' + (y.es || '') + ' ' + (y.marka || '')).replace(/\s+/g, ' ') + ' ');
  // son 10 günde yediklerin: ada göre tekil, en yeni önce
  function sonYenenler() {
    const l = []; const gor = {};
    Object.keys(S.gunluk || {}).sort().reverse().slice(0, 10).forEach((k) => (S.gunluk[k].ogun || []).slice().reverse().forEach((o) => {
      if (gor[o.ad] || !(o.g > 0) || o.kaynak === 'foto') return; gor[o.ad] = 1;
      const ana = (S.urunlerim || []).concat(D.YEMEK).find((y) => y.ad === o.ad);
      l.push(ana || { ad: o.ad, k: (o.k / o.g) * 100, p: (o.p / o.g) * 100, kh: (o.kh / o.g) * 100, y: (o.y / o.g) * 100, g: Math.round(o.g), birim: 'son yediğin' });
    }));
    return l.slice(0, 8);
  }
  const yemSatir = (y) => '<button data-act="yerel-sec" data-ad="' + esc(y.ad) + '" style="border:none;background:none;text-align:left;width:100%;padding:0"><div class="ad"><b>' + esc(y.ad) + '</b><span class="ik num">' + esc(y.birim || '1 porsiyon') + ' (' + Math.round(y.g) + ' g) · ' + sayi((y.k * y.g) / 100) + ' kcal</span></div><span class="yuvarlak" aria-hidden="true">+</span></button>';
  function yerelListe(q) {
    const sozcuk = normal(q).split(' ').filter(Boolean);
    const hepsi = (S.urunlerim || []).concat(D.YEMEK);
    if (sozcuk.length) {
      const puan = (y) => { const m = yAra(y); if (!sozcuk.every((w) => m.indexOf(w) >= 0)) return -1; const a = ' ' + normal(y.ad); return (a.indexOf(' ' + sozcuk[0]) === 0 ? 3 : 0) + (a.indexOf(' ' + sozcuk[0]) >= 0 ? 2 : 0) + (a.indexOf(sozcuk[0]) >= 0 ? 1 : 0); };
      const l = hepsi.map((y) => [y, puan(y)]).filter((x) => x[1] >= 0).sort((a, b) => b[1] - a[1] || a[0].ad.length - b[0].ad.length).slice(0, 40).map((x) => x[0]);
      if (!l.length) return '<div><span class="ik">Listemizde yok. Marketteki ürünlerde arayabilir ya da "Elle" sekmesinden ekleyebilirsin.</span></div>';
      return l.map(yemSatir).join('');
    }
    if (yemKat) {
      const l = (yemKat === 'benim' ? S.urunlerim || [] : D.YEMEK.filter((y) => y.kat === yemKat)).slice().sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));
      return l.length ? l.map(yemSatir).join('') : '<div><span class="ik">Burada henüz bir şey yok.</span></div>';
    }
    const son = sonYenenler();
    return (son.length ? '<div class="yem-baslik"><span class="k">Son yediklerin</span></div>' + son.map(yemSatir).join('') : '') +
      ((S.urunlerim || []).length ? '<div class="yem-baslik"><span class="k">Ürünlerim</span></div>' + S.urunlerim.slice(0, 6).map(yemSatir).join('') : '') +
      (!son.length && !(S.urunlerim || []).length ? '<div><span class="ik">Yukarıdan bir kategori seç ya da adını yaz: domates, tavuk, ayran…</span></div>' : '');
  }
  function yemKatHaplar() {
    return '<div class="yatay yem-kat" role="group" aria-label="Kategori">' + [['', 'Önerilen']].concat((S.urunlerim || []).length ? [['benim', 'Ürünlerim']] : [], D.YEMEK_KAT).map((k) => '<button class="hap" data-act="yem-kat" data-deger="' + k[0] + '" aria-pressed="' + (yemKat === k[0]) + '">' + k[1] + '</button>').join('') + '</div>';
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
      '<div class="t" style="padding:4px 16px"><div class="liste">' + fotoSonuc.kalemler.map((x, i) => '<div><div class="ad"><b>' + esc(x.ad) + '</b><span class="ik num">' + sayi(x.k) + ' kcal' + (x.emin === 'dusuk' ? ' · emin değil, kontrol et' : '') + '</span><button class="metin-btn kucuk-metin" data-act="foto-sil-kalem" data-i="' + i + '" style="color:var(--ikincil);align-self:flex-start;padding:0">Bu yok, çıkar</button></div><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="-1" aria-label="' + esc(x.ad) + ' porsiyonunu azalt">−</button><span class="num" style="min-width:52px;text-align:center;font-weight:800">' + sayi(x.g) + ' g</span><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="1" aria-label="' + esc(x.ad) + ' porsiyonunu artır">+</button></div>').join('') + '</div></div>' +
      '<button class="btn cerceve" data-act="foto-tekrar">Yanlış mı? Notu düzelt, yeniden hesapla</button>' +
      '<button class="btn ana buyuk-btn" data-act="foto-kaydet">Öğüne kaydet<span class="num" style="font-weight:600;color:var(--kobalt-yumusak)">' + sayi(S.hedef.kcal - toplam(gun().ogun).k - t) + ' kcal kalır</span></button>';
  }

  function ekranPorsiyon() {
    if (!taslak) { location.hash = '#/ekle/ara'; return ''; }
    const u = taslak; const g = u.secilenG || u.g || 100;
    const k = (u.k * g) / 100;
    const hizli = [u.g, 50, 100, 150, 200, 250].filter((x, i, a) => x && a.indexOf(x) === i).sort((a, b) => a - b);
    const bm = /^(\d+)\s+(.+)$/.exec(u.birim || ''); const tekG = bm ? u.g / +bm[1] : null;
    const katlar = bm && tekG ? [[0.5, '½'], [1, '1'], [2, '2'], [3, '3']].map((x) => [Math.round(tekG * x[0]), x[1] + ' ' + bm[2]]).filter((x) => x[0] > 0) : [];
    return ust(geri(taslak.donus || '#/ekle/ara'), '<span class="alt">Porsiyon</span>') +
      '<h1 class="baslik" style="font-size:32px">' + esc(u.ad) + '<span class="nokta">.</span></h1>' +
      (u.marka ? '<p class="not">' + esc(u.marka) + '</p>' : '') +
      '<div class="izgara">' +
      '<div class="t limon h130"><span class="k">Bu porsiyon</span><span class="buyuk num" id="porK">' + sayi(k) + '</span><span class="k">kcal</span></div>' +
      '<div class="t h130 num" id="porM"><div class="satir"><span>Protein</span><b style="color:var(--kobalt)">' + sayi((u.p * g) / 100, 1) + ' g</b></div><div class="satir"><span>Karb.</span><b>' + sayi((u.kh * g) / 100, 1) + ' g</b></div><div class="satir"><span>Yağ</span><b>' + sayi((u.y * g) / 100, 1) + ' g</b></div></div>' +
      '<label class="t genis alan"><span>Miktar, gram' + (u.birim ? ' · ' + esc(u.birim) + ' = ' + u.g + ' g' : '') + '</span><input id="porG" data-in="porsiyon" inputmode="numeric" value="' + g + '"></label>' +
      (katlar.length ? '<div class="t genis"><span class="k">Kaç tane?</span><div class="haplar">' + katlar.map((x) => '<button class="hap siyah" data-act="por-hizli" data-g="' + x[0] + '" aria-pressed="' + (x[0] === g) + '">' + esc(x[1]) + '</button>').join('') + '</div></div>' : '') +
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
      '<div class="t genis"><div class="satir"><span class="k">Rozetler</span><span class="ik num">' + rozetDurum().filter((r) => r.var).length + ' / ' + ROZET.length + '</span></div><div class="rozetler">' + rozetDurum().map((r) => '<div class="rozet' + (r.var ? ' var' : '') + '"><i aria-hidden="true">' + (r.var ? IK.tik : '') + '</i><b>' + esc(r.ad) + '</b><span>' + esc(r.acik) + '</span></div>').join('') + '</div></div>' +
      '<a class="t h130" href="#/olcu"><span class="k">Ölçüler</span><b style="font-size:19px">' + ((S.olcu || []).length ? 'Bel ' + sayi(S.olcu[S.olcu.length - 1].bel || 0, 1) + ' cm' : 'Bel, göğüs, kol…') + '</b><span class="ik">İlk ölçüme göre fark</span></a>' +
      '<a class="t koyu h130" href="#/rapor"><span class="k">Aylık rapor</span><b style="font-size:19px">' + AY[new Date().getMonth()] + '</b><span class="ik" style="color:var(--koyu-ikincil)">Ayın özeti</span></a>' +
      '<button class="t kobalt genis" data-act="paylas" style="flex-direction:row;align-items:center;justify-content:space-between;border:0;text-align:left;cursor:pointer"><span class="yigin"><span class="k">Haftalık kartın</span><b style="font-size:19px">Bu haftanı paylaş</b><span style="opacity:.8;font-size:14px">Instagram hikâyesine hazır görsel</span></span>' + IK.ok.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</button>' +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Rekorların</span><div class="liste">' + (rekorlar.length ? rekorlar.slice(0, 8).map((h) => '<div><div class="ad"><b>' + esc(D.HAREKET[h].ad) + '</b><span class="ik">' + esc(S.rekor[h].tarih) + '</span></div><b class="num">' + sayi(S.rekor[h].kg, 1) + ' kg × ' + S.rekor[h].tekrar + '</b></div>').join('') : '<div><span class="ik">İlk antrenmanını bitirince rekorların burada görünür.</span></div>') + '</div></div>' +
      '</div>';
  }

  /* ---------- vücut ölçüleri ve fotoğraflar (fotoğraflar yalnızca bu cihazda, IndexedDB) ---------- */
  const OLCU = [['bel', 'Bel'], ['gogus', 'Göğüs'], ['kalca', 'Kalça'], ['kol', 'Kol'], ['bacak', 'Bacak (uyluk)'], ['yag', 'Yağ oranı']];
  const FOTO_ACI = [['on', 'Önden'], ['yan', 'Yandan'], ['arka', 'Arkadan']];
  function fotoDb() {
    return new Promise((ok, red) => { const r = indexedDB.open('comeback-foto', 1); r.onupgradeneeded = () => r.result.createObjectStore('foto'); r.onsuccess = () => ok(r.result); r.onerror = () => red(r.error); });
  }
  async function fotoIslem(tur, anahtar, deger) {
    const db = await fotoDb();
    return new Promise((ok, red) => {
      const t = db.transaction('foto', tur === 'oku' || tur === 'liste' ? 'readonly' : 'readwrite'); const st = t.objectStore('foto');
      const r = tur === 'yaz' ? st.put(deger, anahtar) : tur === 'sil' ? st.delete(anahtar) : tur === 'liste' ? st.getAllKeys() : st.get(anahtar);
      r.onsuccess = () => ok(r.result); r.onerror = () => red(r.error);
    });
  }
  let fotoListe = null; let fotoUrl = {}; let fotoAci = 'on'; let karsilastir = 50;
  async function fotoYukle() {
    try {
      const anahtarlar = (await fotoIslem('liste')).sort();
      for (const a of anahtarlar) if (!fotoUrl[a]) { const b = await fotoIslem('oku', a); if (b) fotoUrl[a] = URL.createObjectURL(b); }
      fotoListe = anahtarlar;
    } catch (e) { fotoListe = []; }
    if (location.hash.indexOf('#/olcu') === 0) render();
  }
  function kucultBlob(file, uzun) {
    return new Promise((ok, red) => {
      const img = new Image(); const u = URL.createObjectURL(file);
      img.onload = () => { const sc = Math.min(1, uzun / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob((b) => (b ? ok(b) : red(new Error('foto'))), 'image/jpeg', 0.82); };
      img.onerror = () => { URL.revokeObjectURL(u); red(new Error('foto')); }; img.src = u;
    });
  }
  function ekranOlcu() {
    if (!S.profil) return ekranKarsilama();
    const l = (S.olcu || []).slice().sort((a, b) => (a.tarih < b.tarih ? -1 : 1));
    const ilk = l[0], son = l[l.length - 1];
    const fark = (k) => { if (!ilk || !son || ilk === son || ilk[k] == null || son[k] == null) return ''; const d = son[k] - ilk[k]; return '<span class="olcu-fark ' + (d < 0 ? 'eksi' : d > 0 ? 'arti' : '') + '">' + (d > 0 ? '+' : '') + sayi(d, 1) + '</span>'; };
    const tarihOf = (a) => { const d = new Date(a.slice(0, 10)); return d.getDate() + ' ' + AY[d.getMonth()] + ' ' + d.getFullYear(); };
    return ust(geri('#/ilerleme'), '<span class="alt">Vücut</span>') +
      '<h1 class="baslik">Ölçüler<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      (son ? '<div class="t genis"><div class="satir"><span class="k">Son ölçüm · ' + esc(tarihOf(son.tarih)) + '</span>' + (l.length > 1 ? '<span class="ik">ilk ölçüme göre</span>' : '') + '</div><div class="olcu-izgara">' + OLCU.filter((o) => son[o[0]] != null).map((o) => '<div><span class="ik">' + o[1] + '</span><b class="num">' + sayi(son[o[0]], 1) + '<small>' + (o[0] === 'yag' ? ' %' : ' cm') + '</small></b>' + fark(o[0]) + '</div>').join('') + '</div></div>' : '') +
      '<form data-form="olcu" class="t genis" novalidate style="gap:10px"><span class="k">Bugünkü ölçülerin · cm</span><div class="olcu-form">' + OLCU.map((o) => '<label class="mini"><span>' + o[1] + (o[0] === 'yag' ? ', %' : '') + '</span><input name="' + o[0] + '" inputmode="decimal" placeholder="' + (son && son[o[0]] != null ? sayi(son[o[0]], 1) : '—') + '"></label>').join('') + '</div><span class="ik">Mezurayı sabah, aç karnına ve hep aynı yerden tut: bel göbek hizasından, kol en kalın yerinden.</span><button class="btn siyah" type="submit">Kaydet</button></form>' +
      '</div>';
  }

  /* ---------- aylık rapor ---------- */
  let raporAy = 0; // 0 bu ay, 1 geçen ay…
  function ekranRapor() {
    if (!S.profil) return ekranKarsilama();
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - raporAy);
    const onek = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const ayAd = AY[d.getMonth()] + ' ' + d.getFullYear();
    const gunler = Object.keys(S.gunluk).filter((k) => k.indexOf(onek) === 0).sort();
    const antr = gunler.filter((k) => S.gunluk[k].antrenman).map((k) => S.gunluk[k].antrenman);
    const set = antr.reduce((a, x) => a + x.set, 0), hacim = antr.reduce((a, x) => a + x.hacim, 0), dk = antr.reduce((a, x) => a + x.dk, 0);
    const ogunGun = gunler.filter((k) => S.gunluk[k].ogun.length);
    const kcal = ogunGun.map((k) => toplam(S.gunluk[k].ogun));
    const ortK = kcal.length ? kcal.reduce((a, x) => a + x.k, 0) / kcal.length : 0, ortP = kcal.length ? kcal.reduce((a, x) => a + x.p, 0) / kcal.length : 0;
    const uyum = kcal.filter((x) => Math.abs(x.k - S.hedef.kcal) <= S.hedef.kcal * 0.1).length;
    const su = gunler.map((k) => S.gunluk[k].su || 0).filter((x) => x > 0);
    const kilo = S.kilo.filter((x) => x.tarih.indexOf(onek) === 0);
    const ayAdKucuk = AY[d.getMonth()];
    const rekor = Object.keys(S.rekor).filter((h) => (S.rekor[h].tarih || '').split(' ')[1] === ayAdKucuk);
    const olc = (S.olcu || []).filter((x) => x.tarih.indexOf(onek) === 0);
    const haftaGunSay = [0, 0, 0, 0, 0, 0, 0]; gunler.filter((k) => S.gunluk[k].antrenman).forEach((k) => { haftaGunSay[haftaGunu(new Date(k))]++; });
    const enGun = Math.max.apply(null, haftaGunSay) ? GUN_AD[haftaGunSay.indexOf(Math.max.apply(null, haftaGunSay))] : '—';
    return ust(geri('#/ilerleme'), '<span class="alt">Aylık rapor</span>') +
      '<h1 class="baslik">' + ayAd + '<span class="nokta">.</span></h1>' +
      '<div class="yatay">' + [0, 1, 2].map((i) => { const x = new Date(); x.setDate(1); x.setMonth(x.getMonth() - i); return '<button class="hap" data-act="rapor-ay" data-deger="' + i + '" aria-pressed="' + (raporAy === i) + '">' + AY[x.getMonth()] + '</button>'; }).join('') + '</div>' +
      '<div class="izgara">' +
      '<div class="t kobalt h150"><span class="k">Antrenman</span><span class="buyuk num">' + antr.length + '</span><span class="k">en çok ' + esc(enGun) + '</span></div>' +
      '<div class="t koyu h150"><span class="k">Toplam</span><span class="orta num">' + sayi(set) + ' set</span><span class="ik num">' + sayi(hacim) + ' kg · ' + sayi(dk) + ' dk</span></div>' +
      '<div class="t limon h150"><span class="k">Ortalama kalori</span><span class="orta num">' + (kcal.length ? sayi(ortK) : '—') + '</span><span class="k">' + kcal.length + ' gün kayıt · ' + uyum + ' gün hedefte</span></div>' +
      '<div class="t h150"><span class="k">Ortalama protein</span><span class="orta num">' + (kcal.length ? sayi(ortP) + '<span class="ik"> g</span>' : '—') + '</span><span class="ik">hedef ' + S.hedef.protein + ' g' + (su.length ? ' · su ort. ' + sayi(su.reduce((a, b) => a + b, 0) / su.length / 1000, 1) + ' L' : '') + '</span></div>' +
      '<div class="t genis"><span class="k">Kilo</span><span class="orta num">' + (kilo.length >= 2 ? sayi(kilo[0].kg, 1) + ' → ' + sayi(kilo[kilo.length - 1].kg, 1) + ' kg <span style="color:var(--kobalt)">(' + (kilo[kilo.length - 1].kg - kilo[0].kg >= 0 ? '+' : '') + sayi(kilo[kilo.length - 1].kg - kilo[0].kg, 1) + ')</span>' : kilo.length ? sayi(kilo[0].kg, 1) + ' kg' : '—') + '</span>' +
      (olc.length >= 2 && olc[0].bel != null && olc[olc.length - 1].bel != null ? '<span class="ik">Bel ' + sayi(olc[0].bel, 1) + ' → ' + sayi(olc[olc.length - 1].bel, 1) + ' cm</span>' : '') + '</div>' +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Bu ayın rekorları · ' + rekor.length + '</span><div class="liste">' + (rekor.length ? rekor.map((h) => '<div><div class="ad"><b>' + esc(D.HAREKET[h].ad) + '</b><span class="ik">' + esc(S.rekor[h].tarih) + '</span></div><span class="num" style="font-weight:800">' + sayi(S.rekor[h].kg, 1) + ' kg × ' + S.rekor[h].tekrar + '</span></div>').join('') : '<div><span class="ik">Bu ay rekor yok. Bir sonraki ay senin.</span></div>') + '</div></div>' +
      '</div>';
  }

  /* haftalık paylaşım kartı: 1080×1920, bento */
  function haftaKarti() {
    const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = getComputedStyle(document.body).fontFamily;
    const haftaBas = new Date(); haftaBas.setDate(haftaBas.getDate() - haftaGunu()); const hb = tarihKey(haftaBas);
    const gunler = Object.keys(S.gunluk).filter((k) => k >= hb).sort();
    const antr = gunler.filter((k) => S.gunluk[k].antrenman).map((k) => S.gunluk[k].antrenman);
    const set = antr.reduce((a, y) => a + y.set, 0), hacim = antr.reduce((a, y) => a + y.hacim, 0), dk = antr.reduce((a, y) => a + y.dk, 0);
    const rekor = Object.keys(S.rekor).filter((h) => { const t = S.rekor[h].tarih; return gunler.some((k) => new Date(k).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) === t); }).length;
    const kutu = (X, Y, w, h, renk) => { x.fillStyle = renk; x.beginPath(); x.roundRect(X, Y, w, h, 56); x.fill(); };
    const yaz = (t, X, Y, boyut, kalinlik, renk, ls) => { x.fillStyle = renk; x.font = kalinlik + ' ' + boyut + 'px ' + F; if ('letterSpacing' in x) x.letterSpacing = (ls || 0) + 'px'; x.fillText(t, X, Y); };
    x.fillStyle = '#ECECE8'; x.fillRect(0, 0, W, H);
    yaz('COMEBACK', 80, 160, 64, 900, '#16161A', -3); const lw = x.measureText('COMEBACK').width; yaz('.', 80 + lw + 2, 160, 64, 900, '#2E4BFF', 0);
    const bitis = new Date(haftaBas); bitis.setDate(bitis.getDate() + 6);
    yaz(haftaBas.getDate() + ' ' + AY[haftaBas.getMonth()] + ' – ' + bitis.getDate() + ' ' + AY[bitis.getMonth()], 80, 230, 36, 700, '#5F5D57');
    yaz('Bu haftam', 80, 400, 150, 900, '#16161A', -7); yaz('.', 80 + x.measureText('Bu haftam').width + 2, 400, 150, 900, '#2E4BFF', 0);
    kutu(60, 470, 960, 470, '#2E4BFF');
    yaz('Antrenman', 120, 560, 40, 700, 'rgba(255,255,255,.8)');
    yaz(String(antr.length), 120, 840, 280, 900, '#FFFFFF', -12);
    yaz('/ ' + (S.profil ? S.profil.gun : antr.length) + ' gün', 120 + x.measureText(String(antr.length)).width + 30, 840, 64, 800, 'rgba(255,255,255,.75)', 0);
    kutu(60, 970, 470, 360, '#D9F05A'); yaz('Set', 110, 1050, 36, 700, '#3E4410'); yaz(sayi(set), 110, 1250, 150, 900, '#16161A', -6);
    kutu(550, 970, 470, 360, '#16161A'); yaz('Seri', 600, 1050, 36, 700, '#B9B6AE'); yaz(String(seri()), 600, 1250, 150, 900, '#F3F1EC', -6); yaz('gün', 600 + x.measureText(String(seri())).width + 16, 1250, 48, 800, '#6E86FF', 0);
    kutu(60, 1360, 960, 300, '#FFFFFF');
    yaz('Toplam hacim', 120, 1440, 36, 700, '#5F5D57'); yaz(sayi(hacim) + ' kg', 120, 1580, 110, 900, '#16161A', -5);
    yaz((rekor ? rekor + ' rekor · ' : '') + dk + ' dk', 640, 1440, 36, 700, '#2E4BFF');
    yaz('Bıraktığın yerden başla.', 80, 1790, 44, 800, '#16161A', -1);
    yaz('comeback.com.tr', 80, 1850, 32, 700, '#5F5D57');
    return c;
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
      '<a class="t limon h130" href="#/hedef"><span class="k">Günlük hedef · değiştir</span><span class="buyuk num" style="font-size:40px">' + sayi(S.hedef.kcal) + '</span><span class="k">kcal · ' + S.hedef.protein + ' g protein</span></a>' +
      '<a class="t kobalt h130" href="#/plan"><span class="k">Program</span><span class="orta" style="font-size:22px">' + esc(S.program.ad) + '</span><span class="k">Ayrıntılar →</span></a>' +
      '<a class="btn siyah genis" href="#/program">' + (S.program && S.program.ozel ? 'Kendi programımı düzenle' : 'Programı düzenle · kendi programımı yaz') + '</a>' +
      '<a class="btn ana genis" href="#/hedef">Hedefimi değiştir · kas, yağ yakma, gün, odak</a>' +
      '<a class="btn cerceve genis" href="#/kurulum">Tüm bilgilerimi güncelle</a>' +
      ekleKutu(true) +
      (hesap ? '<div class="t genis satir" style="flex-direction:row"><div class="yigin" style="min-width:0"><span class="k">Hesap</span><b style="overflow:hidden;text-overflow:ellipsis">' + esc(hesap.eposta) + '</b><span class="ik">Kayıtların hesabında saklanıyor.</span></div><button class="btn cerceve" data-act="cikis" style="min-height:44px;flex-shrink:0">Çıkış yap</button></div>' : '') +
      (hesap && hesap.rol === 'admin' ? '<a class="t koyu genis" href="#/yonetim"><span class="k">Yalnızca sen görürsün</span><b style="font-size:20px">Yönetim</b><span style="opacity:.8">Bekleme listesi, görüşler, hatalar, kullanıcılar.</span></a>' : '') +
      '<a class="t kobalt genis" href="#/gorus"><span class="k">Deneme sürümü</span><b style="font-size:20px">Görüş bildir</b><span class="ik" style="color:inherit;opacity:.8">Hata, öneri, beğendiğin bir şey: bize yaz.</span></a>' +
      kadiKutu() +
      hocaKutu() +
      (hocaMi() ? '<a class="t kobalt h130" href="#/hoca"><span class="k">Hoca paneli</span><b style="font-size:19px">Öğrencilerim</b><span style="opacity:.85">Kod, programlar, antrenmanlar.</span></a>' : '') +
      '<a class="t limon h130" href="#/topluluk"><span class="k">Topluluk</span><b style="font-size:19px">Forum ve meydan okuma</b><span class="ik" style="color:#3E4410">Sor, paylaş, arkadaşınla yarış.</span></a>' +
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
    else if (parca[0] === 'topluluk') { html = ekranTopluluk(parca[1] || '', parca[2] ? decodeURIComponent(parca[2]) : null); sekme = 'profil'; }
    else if (parca[0] === 'mesaj') { html = ekranMesaj(decodeURIComponent(parca[1] || '')); sekme = 'profil'; }
    else if (parca[0] === 'hedef') { if (sonRota !== 'hedef') hedefTaslak = null; html = ekranHedef(); sekme = 'profil'; }
    else if (parca[0] === 'olcu') { html = ekranOlcu(); sekme = 'ilerleme'; }
    else if (parca[0] === 'rapor') { html = ekranRapor(); sekme = 'ilerleme'; }
    else if (parca[0] === 'koc') { html = ekranKoc(); sekme = 'bugun'; }
    else if (parca[0] === 'hoca') { html = ekranHoca(parca[1] ? decodeURIComponent(parca[1]) : null); sekme = 'profil'; }
    else if (parca[0] === 'hoca-program') { html = ekranHocaProgram(); sekme = 'bugun'; }
    else if (parca[0] === 'paylas') { html = ekranPaylas(); sekme = 'antrenman'; }
    else if (parca[0] === 'gelen') { html = ekranGelen(parca[1]); sekme = 'bugun'; }
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
  // öncesi/sonrası fotoğraf özelliği kaldırıldı: cihazda kalan eski fotoğrafları bir kez sil
  try { if (!S.fotoKaldirildi) { indexedDB.deleteDatabase('comeback-foto'); S.fotoKaldirildi = true; kaydet(); } } catch (e) { /* yok */ }
  let sonHash = location.hash;
  window.addEventListener('hashchange', () => {
    const onceki = sonHash; sonHash = location.hash;
    const m = /^#\/program\/ekle\/(\d+)/.exec(onceki || '');
    if (m && !/^#\/program\/ekle\//.test(location.hash)) { pFiltreSifirla(); if (location.hash === '#/program') pDonGun = +m[1]; }
    iptalOnay = false; sifirOnay = false; offAcik = false; if (barkodAkis) barkodDurdur(); render(); window.scrollTo(0, 0);
    if (pDonGun != null) { const e = document.getElementById('pdgun-' + pDonGun); pDonGun = null; if (e) { let y = 0; for (let n = e; n; n = n.offsetParent) y += n.offsetTop; window.scrollTo(0, Math.max(0, y - 12)); } }
  });

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
      const ara = sonAntrenmanAra(); const oran = donusOran(ara);
      const yuvarla = (kg) => Math.max(0, Math.round((kg * oran) / 2.5) * 2.5);
      const ks = seansAnahtar(g);
      g.hareketler.forEach((x, xi) => {
        const k = ks[xi]; const so = S.son[k] || S.son[x.id];
        let hk = hedefKilo(k); if (hk && oran < 1) hk = yuvarla(so ? Math.max.apply(null, so.setler.map((y) => y.kg || 0)) : hk);
        const b = birimOf(x);
        setler[k] = Array.from({ length: x.set }, () => ({ kg: hk ? String(hk).replace('.', ',') : '', tekrar: String(b === 'dk' || b === 'sn' ? x.ust || parseInt(x.tekrar, 10) : x.alt), ok: false }));
      });
      S.seans = { gunId: g.id, tarih: tarihKey(), baslangic: Date.now(), setler, donus: oran < 1 ? { ara, oran } : null };
      kaydet(true); render(); window.scrollTo(0, 0);
    },
    tik(el) {
      const y = S.seans.setler[el.dataset.h][+el.dataset.i];
      y.ok = !y.ok; kaydet(true);
      const sg0 = S.program.gunler.find((g) => g.id === S.seans.gunId); const dz = sg0.hareketler[seansAnahtar(sg0).indexOf(el.dataset.h)] || {};
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
        const kh = kokId(h); if (!D.HAREKET[kh] || D.HAREKET[kh].tip === 's') return;
        yapilan.forEach((x) => {
          if (!x.kg || !x.tekrar) return;
          const r = S.rekor[kh];
          if (!r || e1rm(x.kg, x.tekrar) > e1rm(r.kg, r.tekrar) + 0.01) { if (r && r.tarih !== tarih) yeni++; S.rekor[kh] = { kg: x.kg, tekrar: x.tekrar, tarih }; }
        });
      });
      if (!set) { toast('Önce en az bir seti tamamla.'); return; }
      gun(s.tarih).antrenman = { ad: g.ad, set, hacim: Math.round(hacim), dk: Math.max(1, Math.round((Date.now() - s.baslangic) / 60000)) };
      if (s.donus) S.donusYapildi = true;
      const yeniR = yeniRozetler();
      olay('antrenman_bitti');
      S.seans = null; dinlenme = null; kaydet(true);
      toast(yeniR.length ? 'Yeni rozet: ' + yeniR.map((r) => r.ad).join(', ') + '!' : yeni ? 'Antrenman kaydedildi. ' + yeni + ' yeni rekor!' : 'Antrenman kaydedildi. Bir sonrakinde görüşürüz.');
      git('#/');
    },
    async paylas() {
      const c = haftaKarti(); olay('paylas');
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const dosya = new File([blob], 'comeback-hafta.png', { type: 'image/png' });
      try {
        if (navigator.canShare && navigator.canShare({ files: [dosya] })) { await navigator.share({ files: [dosya], title: 'COMEBACK. haftam' }); return; }
      } catch (e) { if (e && e.name === 'AbortError') return; }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'comeback-hafta.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000); toast('Görsel indirildi.');
    },
    'foto-aci'(el) { fotoAci = el.dataset.deger; karsilastir = 50; render(); },
    async 'foto-sil'(el) { if (el.dataset.onay !== '1') { el.dataset.onay = '1'; toast('Silmek için tekrar bas.'); return; } try { await fotoIslem('sil', el.dataset.a); } catch (e) { /* yok */ } if (fotoUrl[el.dataset.a]) URL.revokeObjectURL(fotoUrl[el.dataset.a]); delete fotoUrl[el.dataset.a]; fotoListe = (fotoListe || []).filter((a) => a !== el.dataset.a); render(); },
    'rapor-ay'(el) { raporAy = +el.dataset.deger; render(); },
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
    'yem-kat'(el) {
      yemKat = el.dataset.deger; aramaQ = ''; const i = document.getElementById('araQ'); if (i) i.value = '';
      const yx = (document.querySelector('.yem-kat') || {}).scrollLeft || 0; const sY = window.scrollY; render(); window.scrollTo(0, sY);
      const r = document.querySelector('.yem-kat'); if (r) r.scrollLeft = yx;
    },
    'yerel-sec'(el) {
      const y = (S.urunlerim || []).concat(D.YEMEK).find((x) => x.ad === el.dataset.ad) || sonYenenler().find((x) => x.ad === el.dataset.ad); if (!y) return;
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
    'foto-sil-kalem'(el) { fotoSonuc.kalemler.splice(+el.dataset.i, 1); if (!fotoSonuc.kalemler.length) fotoSonuc.kalemler = null; render(); },
    'foto-tekrar'() { if (!fotoSonuc || !fotoSonuc.resim) return; const n = document.getElementById('fotoNot'); if (n) fotoNot = n.value; if (!fotoNot.trim()) { toast('Önce ne yediğini kısaca yaz.'); if (n) n.focus(); return; } fotoAnaliz(null, fotoSonuc.resim); },
    'foto-kaydet'() {
      const tur = ogunTuru();
      fotoSonuc.kalemler.forEach((x) => gun().ogun.push({ id: kimlik(), ad: x.ad, g: x.g, k: x.k, p: x.p, kh: x.kh, y: x.y, ogun: tur, saat: saat(), kaynak: 'foto' }));
      olay('ogun_foto');
      kaydet(true); toast('Tabağın kaydedildi.'); fotoSonuc = null; fotoNot = ''; git('#/beslenme');
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
    async 'yon-mod'(el) { const r = await tistek('moderasyon', 'POST', { tur: el.dataset.tur, id: +el.dataset.id, gizli: el.dataset.gizli === '1' }); toast(r.ok ? 'Kaydedildi.' : 'Olmadı.'); yon.veri = null; render(); },
    async 'yon-rol'(el) { const r = await istek('yonetim/rol', 'POST', { eposta: el.dataset.eposta, rol: el.dataset.rol }); toast(r.ok ? 'Güncellendi.' : (r.j.hata || 'Olmadı.')); yon.veri = null; render(); },
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
    'pd-filtre'(el) {
      const t = el.dataset.tur, d = el.dataset.deger || '';
      if (t === 'hepsi') pFiltreSifirla(); else if (t === 'yer') pYer = d; else if (t === 'ekip') pEkip = d; else pBolge = d;
      const sY = window.scrollY; const yx = Array.from(document.querySelectorAll('.pd-filtre .yatay')).map((r) => r.scrollLeft);
      render(); window.scrollTo(0, sY);
      document.querySelectorAll('.pd-filtre .yatay').forEach((r, i) => { r.scrollLeft = t === 'hepsi' ? 0 : yx[i] || 0; });
    },
    'pd-ekle'(el) {
      const x = M.ozelHareket(pProfil(), el.dataset.id); if (!x) return;
      const g = ptaslak.gunler[pSecGun]; g.hareketler.push(x);
      if (!g.hareketler.some((y) => y.isinma && y !== x) && x.blok === 'ana' && K.HAREKET[x.id].artis > 0 && g.hareketler.filter((y) => y.id === x.id).length === 1) x.isinma = true;
      const sY = window.scrollY; const yx = Array.from(document.querySelectorAll('.pd-filtre .yatay')).map((r) => r.scrollLeft);
      render(); window.scrollTo(0, sY); document.querySelectorAll('.pd-filtre .yatay').forEach((r, i) => { r.scrollLeft = yx[i] || 0; });
      const n = g.hareketler.filter((y) => y.id === x.id).length;
      toast(D.HAREKET[x.id].ad + (n > 1 ? ' ' + n + '. kez' : '') + ' eklendi. ' + g.hareketler.length + ' hareket oldu.');
    },
    'pd-gunkopya'(el) {
      const gi = +el.dataset.g; const g = ptaslak.gunler[gi]; if (!g) return;
      let bos = null; for (let i = 1; i <= 7 && bos == null; i++) { const h = (g.hafta + i) % 7; if (!ptaslak.gunler.some((y) => y.hafta === h)) bos = h; }
      if (bos == null) { toast('Haftada boş gün kalmadı.'); return; }
      const kopya = JSON.parse(JSON.stringify(g)); kopya.id = 'ozel-' + kimlik(); kopya.hafta = bos; kopya.ad = (g.ad + ' (kopya)').slice(0, 24);
      ptaslak.gunler.push(kopya); ptaslak.gunler.sort((a, b) => a.hafta - b.hafta);
      render(); const yi = ptaslak.gunler.indexOf(kopya); const e = document.getElementById('pdgun-' + yi);
      if (e) e.scrollIntoView({ block: 'start', behavior: azHareket ? 'auto' : 'smooth' });
      toast(g.ad + ' ' + GUN_AD[bos].toLocaleLowerCase('tr') + ' gününe kopyalandı. Adını ve gününü değiştirebilirsin.');
    },
    'paylas-ac'(el) {
      if (!hesap) { toast('Program göndermek için giriş yapmalısın.'); return; }
      const kaynak = el.dataset.kaynak === 'taslak' ? ptaslak : S.program;
      if (!kaynak || !kaynak.gunler.some((g) => g.hareketler.length)) { toast('Önce programa birkaç hareket ekle.'); return; }
      paylasPr = ozetProgram(kaynak); paylasOnay = null; git('#/paylas');
    },
    'paylas-degis'() { paylasOnay = null; render(); },
    async 'paylas-gonder'() {
      if (!paylasPr || !paylasOnay || paylasYuk) return;
      paylasYuk = true; render();
      try {
        const r = await tistek('paylas', 'POST', { kime: paylasOnay.kadi, program: paylasPr, not: paylasOnay.not || '' });
        if (!r.ok) toast(r.j.hata || 'Gönderilemedi.');
        else { olay('program_paylas'); toast('Gönderildi. @' + paylasOnay.kadi + ' kabul edince onun programı olur.'); const d = ptaslak ? '#/program' : '#/antrenman'; paylasPr = null; paylasOnay = null; paylasYuk = false; git(d); return; }
      } catch (e) { toast('Bağlantı kurulamadı.'); }
      paylasYuk = false; render();
    },
    async gelen(el) {
      const a = (gelenler || []).find((x) => String(x.id) === el.dataset.id); if (!a) return; const kabul = el.dataset.kabul === '1';
      const r = await tistek('paylasim/' + a.id + '/yanit', 'POST', { kabul }); if (!r.ok) { toast('Kaydedilemedi.'); return; }
      gelenler = gelenler.filter((x) => x !== a);
      if (kabul) {
        const pr = programTamamla(programHazirla(a.program), S.profil);
        if (!pr.gunler.length) { toast('Bu programdaki hareketler bulunamadı.'); git('#/'); return; }
        S.program = pr; S.profil.gun = pr.gunler.length; S.seans = null; ptaslak = null; kaydet(true); olay('program_al'); toast(pr.ad + ' artık senin programın.'); git('#/antrenman'); return;
      }
      git('#/');
    },
    async 'gelen-duzenle'(el) {
      const a = (gelenler || []).find((x) => String(x.id) === el.dataset.id); if (!a) return;
      const r = await tistek('paylasim/' + a.id + '/yanit', 'POST', { kabul: true }); if (!r.ok) { toast('Kaydedilemedi.'); return; }
      gelenler = gelenler.filter((x) => x !== a); pHoca = null;
      ptaslak = programHazirla(a.program); git('#/program');
      toast('Düzenle, sonra "Programı kaydet"e bas.');
    },
    'koc-tarz'(el) {
      const k = KOCLAR.find((x) => x[0] === el.dataset.tarz); const inp = document.getElementById('kocAd');
      const onceki = kocTaslak || S.kocSec || { tarz: 'atlas', ad: 'Atlas' }; const eskiVarsayilan = KOCLAR.some((x) => x[1] === (inp ? inp.value.trim() : onceki.ad));
      kocTaslak = { tarz: k[0], ad: eskiVarsayilan || !inp || !inp.value.trim() ? k[1] : inp.value.trim() }; render();
    },
    'koc-kaydet'() {
      const t = kocTaslak || S.kocSec || { tarz: 'atlas', ad: 'Atlas' }; const inp = document.getElementById('kocAd');
      const ad = (inp && inp.value.trim()) || (KOCLAR.find((x) => x[0] === t.tarz) || KOCLAR[2])[1];
      S.kocSec = { tarz: t.tarz, ad: ad.slice(0, 20) }; kocTaslak = null; kocSecAcik = false; kaydet(true); render();
      toast('Koçun artık ' + S.kocSec.ad + '.');
    },
    'koc-degis'() { kocSecAcik = true; kocTaslak = null; render(); },
    'set-ekle'(el) {
      if (!S.seans) return; const l = S.seans.setler[el.dataset.h]; if (!l) return;
      if (l.length >= 15) { toast('Bir harekette en fazla 15 set.'); return; }
      const son = l[l.length - 1] || {}; l.push({ kg: son.kg || '', tekrar: '', ok: false, ek: true });
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      const g = document.querySelector('[data-in="tekrar"][data-h="' + el.dataset.h + '"][data-i="' + (l.length - 1) + '"]'); if (g) g.focus({ preventScroll: true });
    },
    'set-cikar'(el) {
      if (!S.seans) return; const l = S.seans.setler[el.dataset.h]; if (!l || !l.length || l[l.length - 1].ok) return;
      l.pop(); kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'off-ac'() { offAcik = !offAcik; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    off(el) {
      const g = bugunkuGun(); if (!g) return; S.takvim = S.takvim || {}; takvimTemizle();
      const bugun = tarihKey();
      if (el.dataset.tur === 'kaydir') { const y = new Date(); y.setDate(y.getDate() + 1); S.takvim[tarihKey(y)] = { gunId: g.id, kaynak: bugun }; }
      S.takvim[bugun] = { off: true, gunId0: g.id };
      offAcik = false; olay('off_gun'); kaydet(true); render();
      toast(el.dataset.tur === 'kaydir' ? g.ad + ' yarına kaydı. Bugün dinlen.' : 'Bugün dinlenme. ' + g.ad + ' bu hafta atlandı.');
    },
    'off-geri'() {
      const bugun = tarihKey(); if (!S.takvim || !S.takvim[bugun]) return;
      delete S.takvim[bugun]; Object.keys(S.takvim).forEach((k) => { if (S.takvim[k].kaynak === bugun) delete S.takvim[k]; });
      kaydet(true); render(); toast('Bugünün antrenmanı geri geldi.');
    },
    async 'pd-yorum'() {
      const pr = ptaslak; if (!pr.gunler.some((g) => g.hareketler.length)) { toast('Önce birkaç hareket ekle.'); return; }
      if (!hesap) { toast('Yapay zekâ yorumu için giriş yapmalısın.'); return; }
      pYorumYuk = true; render();
      try {
        const ozet = { ad: pr.ad, gunler: pr.gunler.map((g) => ({ ad: g.ad, gun: GUN_AD[g.hafta], hareketler: g.hareketler.map((x) => D.HAREKET[x.id].ad + ' ' + x.set + 'x' + x.tekrar + (x.birim !== 'tekrar' ? ' ' + BIRIM[x.birim].toLowerCase() : '')) })) };
        const p = pProfil(); const profil = { cinsiyet: p.cinsiyet === 'k' ? 'kadın' : 'erkek', yas: p.yas, hedef: p.hedef, deneyim: p.deneyim, ortam: p.ortam, spor: p.spor, sakatlik: (p.sakatlik || []).map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]) };
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
      programTamamla(pr, pProfil()); pr.ad = String(pr.ad || 'Kendi programım').trim().slice(0, 40) || 'Kendi programım';
      if (pHoca) {
        const hedefId = pHoca.id; const not = pr.hocaNotu || ''; delete pr.hocaNotu; delete pr.yorum; pr.hocadan = hesap.ad;
        histek('ogrenci/' + encodeURIComponent(hedefId) + '/program', 'POST', { program: pr, not }).then((r) => {
          if (!r.ok) { toast(r.j.hata || 'Gönderilemedi.'); return; }
          toast('Program öğrencine gönderildi. Kabul edince onun programı olur.'); pHoca = null; ptaslak = null; hp.ogr = null; git('#/hoca/' + encodeURIComponent(hedefId));
        }).catch(() => toast('Bağlantı kurulamadı.'));
        return;
      }
      if (S.seans) S.seans = null;
      olay('program_ozel'); S.program = pr; S.profil.gun = pr.gunler.length; ptaslak = null; kaydet(true); toast('Programın kaydedildi.'); git('#/antrenman');
    },
    'pd-vazgec'() { if (pHoca) { const id = pHoca.id; pHoca = null; ptaslak = null; git('#/hoca/' + encodeURIComponent(id)); return; } ptaslak = null; git(S.program && S.program.gunler.some((g) => g.hareketler.length) ? '#/antrenman' : '#/profil'); },
    'koc-hizli'(el) { kocGonder(el.dataset.metin); },
    'koc-temizle'() { S.koc = []; kocAcil = false; kaydet(); render(); },
    'hp-program'(el) {
      const o = hp.ogr; if (!o) return;
      pHoca = { id: o.ogrenci.id, ad: o.ogrenci.ad, profil: o.ozet.profil };
      const kaynak = el.dataset.bos === '1' || !o.ozet.program ? bosOzelProgram(o.ozet.profil.gun || 3) : JSON.parse(JSON.stringify(o.ozet.program));
      kaynak.gunler.forEach((g) => { g.id = g.id || 'ozel-' + kimlik(); g.gid = g.gid || 'ozel'; g.bolge = g.bolge || 'ozel'; g.hareketler.forEach((x) => { x.sure = x.birim && x.birim !== 'tekrar'; }); });
      kaynak.ad = kaynak.ad || (pHoca.ad + ' programı'); kaynak.ozel = true;
      ptaslak = kaynak; git('#/program');
    },
    'hp-yenile'() { hp.liste = null; render(); },
    async 'hp-kod-yenile'() { const r = await histek('kod', 'POST'); if (r.ok) { hp.kod = r.j.kod; toast('Yeni kod hazır. Eski kod artık çalışmaz.'); render(); } },
    async 'hp-kod-paylas'() {
      const metin = 'COMEBACK. uygulamasında Profil → Hocam alanına şu kodu yaz: ' + hp.kod;
      try { if (navigator.share) { await navigator.share({ text: metin }); return; } } catch (e) { if (e.name === 'AbortError') return; }
      try { await navigator.clipboard.writeText(metin); toast('Kopyalandı.'); } catch (e) { toast(metin); }
    },
    async 'hp-cikar'(el) {
      if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misin? Tekrar bas'; return; }
      const r = await histek('ogrenci/' + encodeURIComponent(hp.ogrId) + '/cikar', 'POST'); if (r.ok) { hp.liste = null; hp.ogr = null; toast('Öğrenci listeden çıkarıldı.'); git('#/hoca'); }
    },
    async 'hoca-ayril'(el) {
      if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misin? Tekrar bas'; return; }
      const r = await histek('ayril', 'POST'); if (r.ok) { hocaDurum = { hoca: null, atanan: null }; toast('Hocandan ayrıldın. Artık verilerini göremez.'); render(); }
    },
    async atanan(el) {
      const a = hocaDurum && hocaDurum.atanan; if (!a) return; const kabul = el.dataset.kabul === '1';
      const r = await histek('atanan/' + a.id + '/yanit', 'POST', { kabul }); if (!r.ok) { toast('Kaydedilemedi.'); return; }
      if (kabul) { S.program = a.program; S.program.ozel = true; S.profil.gun = a.program.gunler.length; S.seans = null; kaydet(true); toast('Hocanın programı artık senin programın.'); }
      hocaDurum.atanan = null; git(kabul ? '#/antrenman' : '#/');
    },
    async ekle() {
      if (kurulumIstemi) { const e = kurulumIstemi; kurulumIstemi = null; e.prompt(); try { await e.userChoice; } catch (er) { /* yok */ } render(); return; }
      ekleAcik = !ekleAcik; render();
    },
    'ekle-kapat'() { try { localStorage.setItem('cb-ekle-kapat', '1'); } catch (e) { /* yok */ } render(); },
    'hedef-sec'(el) {
      const g = el.dataset.grup; const d = el.dataset.deger; const p = hedefTaslak;
      if (g === 'odak') { const l = p.odak || []; const i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else { if (l.length >= 2) { toast('En fazla 2 bölge seçebilirsin.'); return; } l.push(d); } p.odak = l; }
      else if (g === 'gun' || g === 'sure') p[g] = parseInt(d, 10); else p[g] = d;
      render();
    },
    'hedef-kaydet'(el) {
      const p = hedefTaslak; if (!p) return;
      const programDa = el.dataset.program === '1';
      S.profil = p; S.hedef = hedefHesapla(p);
      if (programDa) { S.program = programOlustur(p); S.seans = null; }
      hedefTaslak = null; kaydet(true); olay('kurulum');
      toast(programDa ? 'Hedefin ve programın güncellendi.' : 'Kalori hedefin güncellendi.'); git(programDa ? '#/plan' : '#/profil');
    },
    'tp-kat'(el) { tp.kat = el.dataset.deger; tp.liste = null; render(); },
    'tp-menu'(el) { const k = el.dataset.tur + el.dataset.id; tp.menu = tp.menu === k ? null : k; render(); },
    async 'tp-sikayet'(el) { const r = await tistek('sikayet', 'POST', { tur: el.dataset.tur, id: +el.dataset.id, neden: 'uygunsuz' }); tp.menu = null; toast(r.ok ? 'Şikâyetin alındı. İnceleyeceğiz.' : (r.j.hata || 'Olmadı.')); render(); },
    async 'tp-engel'(el) { const r = await tistek('engel', 'POST', { kullanici: el.dataset.k }); tp.menu = null; if (r.ok) { toast('Engellendi. Yazılarını artık görmeyeceksin.'); tp.konu = null; tp.liste = null; } render(); },
    async 'tp-sil'(el) { const r = await tistek('sil', 'POST', { tur: el.dataset.tur, id: +el.dataset.id }); tp.menu = null; if (!r.ok) { toast(r.j.hata || 'Silinemedi.'); return; } toast('Silindi.'); tp.liste = null; if (el.dataset.tur === 'konu') { tp.konu = null; git('#/topluluk'); } else { tp.konu = null; render(); } },
    async 'tp-meydan-paylas'(el) { const t = 'COMEBACK. uygulamasında "' + el.dataset.ad + '" meydan okumasına katıl: Topluluk → Meydan okuma → kod ' + el.dataset.kod; try { if (navigator.share) { await navigator.share({ text: t }); return; } } catch (e) { if (e.name === 'AbortError') return; } try { await navigator.clipboard.writeText(t); toast('Kopyalandı.'); } catch (e) { toast(t); } },
    async 'tp-meydan-ayril'(el) { if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misin? Tekrar bas'; return; } await tistek('meydan/' + tp.meydanId + '/ayril', 'POST'); tp.meydanlar = null; tp.meydan = null; git('#/topluluk/meydan'); },
    'tp-mesaj-yenile'() { tp.mesaj = null; render(); },
    'gorus-tur'(el) { gorusTur = el.dataset.deger; el.parentNode.querySelectorAll('.hap').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); },
    'sil-ac'() { silAcik = true; render(); const i = document.querySelector('[data-form="hesap-sil"] input'); if (i) i.focus(); },
    'sil-kapat'() { silAcik = false; render(); },
    sifirla() {
      if (!sifirOnay) { sifirOnay = true; render(); return; }
      S = bos(); kaydet(true); sifirOnay = false; try { indexedDB.deleteDatabase('comeback-foto'); } catch (e) { /* yok */ } fotoListe = null; fotoUrl = {}; git('#/');
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
    if (el.dataset && el.dataset.in === 'foto-not') { fotoNot = el.value; return; }
    if (el.id === 'pdAra') {
      pAra = el.value; const yer = document.getElementById('pdListe');
      if (yer && ptaslak && ptaslak.gunler[pSecGun]) yer.innerHTML = pdListe(ptaslak.gunler[pSecGun]);
      return;
    }
    if (el.dataset && el.dataset.pd && ptaslak) {
      const g = ptaslak.gunler[+el.dataset.g];
      if (el.dataset.pd === 'ad') ptaslak.ad = el.value;
      else if (el.dataset.pd === 'not') ptaslak.hocaNotu = el.value.slice(0, 300);
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
    if (e.target.dataset && e.target.dataset.in === 'vucut-foto' && e.target.files[0]) {
      const a = tarihKey() + '_' + fotoAci;
      kucultBlob(e.target.files[0], 1200).then((b) => fotoIslem('yaz', a, b).then(() => { if (fotoUrl[a]) URL.revokeObjectURL(fotoUrl[a]); fotoUrl[a] = URL.createObjectURL(b); fotoListe = Array.from(new Set((fotoListe || []).concat(a))).sort(); toast('Fotoğraf bu cihaza kaydedildi.'); render(); }))
        .catch(() => toast('Fotoğraf kaydedilemedi.'));
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target && e.target.id === 'kocMetin' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.form) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    if (e.submitter && e.submitter.name) v[e.submitter.name] = e.submitter.value;
    if (f.dataset.form === 'kurulum') return kurulumKaydet(f, v);
    if (f.dataset.form === 'kayit' || f.dataset.form === 'giris') return hesapFormu(f.dataset.form, f, v);
    if (f.dataset.form === 'gorus') return gorusGonder(v);
    if (f.dataset.form === 'koc') return kocGonder(v.metin);
    if (f.dataset.form === 'tp-konu') {
      const kat = (f.querySelector('[data-grup="fkat"][aria-pressed="true"]') || {}).dataset; const btn = f.querySelector('[type=submit]'); btn.disabled = true;
      tistek('forum', 'POST', { kategori: kat ? kat.deger : 'genel', baslik: v.baslik, metin: v.metin }).then((r) => { btn.disabled = false; if (!r.ok) { toast(r.j.hata || 'Yayınlanamadı.'); return; } tp.liste = null; git('#/topluluk/konu/' + r.j.id); });
      return;
    }
    if (f.dataset.form === 'tp-cevap') {
      const metin = String(v.metin || '').trim(); if (!metin) return;
      tistek('forum/' + tp.konuId, 'POST', { metin }).then((r) => { if (!r.ok) { toast(r.j.hata || 'Gönderilemedi.'); return; } tp.konu = null; render(); });
      return;
    }
    if (f.dataset.form === 'tp-meydan') {
      const tur = (f.querySelector('[data-grup="mtur"][aria-pressed="true"]') || {}).dataset;
      tistek('meydan', 'POST', { ad: v.ad, tur: tur ? tur.deger : 'antrenman', hedef: v.hedef || 12, gun: v.gun || 30 }).then((r) => { if (!r.ok) { toast(r.j.hata || 'Oluşturulamadı.'); return; } tp.meydanlar = null; toast('Hazır. Kod: ' + r.j.kod); git('#/topluluk/meydan/' + r.j.id); });
      return;
    }
    if (f.dataset.form === 'tp-katil') {
      tistek('meydan/katil', 'POST', { kod: String(v.kod || '').trim() }).then((r) => { if (!r.ok) { toast(r.j.hata || 'Katılınamadı.'); return; } tp.meydanlar = null; toast(r.j.ad + ' meydan okumasına katıldın.'); git('#/topluluk/meydan/' + r.j.id); });
      return;
    }
    if (f.dataset.form === 'tp-mesaj') {
      const metin = String(v.metin || '').trim(); if (!metin) return;
      tistek('mesaj/' + encodeURIComponent(tp.mesajId), 'POST', { metin }).then((r) => { if (!r.ok) { toast(r.j.hata || 'Gönderilemedi.'); return; } tp.mesaj = null; render(); setTimeout(kocKaydir, 400); });
      return;
    }
    if (f.dataset.form === 'yon-hoca') { istek('yonetim/rol', 'POST', { eposta: String(v.eposta || '').trim(), rol: 'koc' }).then((r) => { toast(r.ok ? 'Artık hoca.' : (r.j.hata || 'Olmadı.')); if (r.ok) { yon.veri = null; render(); } }); return; }
    if (f.dataset.form === 'kadi') {
      istek('kullanici-adi', 'POST', { ad: String(v.ad || '').trim() }).then((r) => {
        if (!r.ok) { toast(r.j.hata || 'Kaydedilemedi.'); return; }
        hesap.kadi = r.j.kadi; toast('Kullanıcı adın @' + r.j.kadi + '.'); render();
      }).catch(() => toast('Bağlantı kurulamadı.'));
      return;
    }
    if (f.dataset.form === 'paylas-bul') {
      const kadi = String(v.kime || '').trim().replace(/^@/, '');
      if (kadi.length < 3) { toast('Kullanıcı adını yaz.'); return; }
      tistek('kisi?ad=' + encodeURIComponent(kadi)).then((r) => {
        if (!r.ok) { toast(r.j.hata || 'Bulunamadı.'); return; }
        if (r.j.ben) { toast('Bu senin kullanıcı adın.'); return; }
        paylasOnay = { kadi: r.j.kadi, ad: r.j.ad, not: String(v.not || '').trim().slice(0, 200) }; render();
      }).catch(() => toast('Bağlantı kurulamadı.'));
      return;
    }
    if (f.dataset.form === 'hoca-baglan') {
      if (!v.riza) { toast('Hocanın verilerini görmesine onay vermelisin.'); return; }
      histek('baglan', 'POST', { kod: String(v.kod || '').trim().toUpperCase(), riza: true }).then((r) => {
        if (!r.ok) { toast(r.j.hata || 'Bağlanılamadı.'); return; }
        toast('Hocan ' + r.j.hoca.ad + ' ile bağlandın.'); hocaYukle();
      }).catch(() => toast('Bağlantı kurulamadı.'));
      return;
    }
    if (f.dataset.form === 'bekleme') return beklemeGonder(v);
    if (f.dataset.form === 'hesap-sil') return hesapSil(v);
    if (f.dataset.form === 'ara') { if (aramaQ.trim().length >= 2) markaAra(aramaQ); return; }
    if (f.dataset.form === 'barkod') return barkodBul(String(v.kod || '').replace(/\D/g, ''));
    if (f.dataset.form === 'olcu') {
      const o = { tarih: tarihKey() }; let n = 0;
      OLCU.forEach((x) => { const d = oku(v[x[0]]); if (d > 0 && d < (x[0] === 'yag' ? 70 : 250)) { o[x[0]] = d; n++; } });
      if (!n) { toast('En az bir ölçü gir.'); return; }
      const once = (S.olcu || []).find((x) => x.tarih === o.tarih);
      S.olcu = (S.olcu || []).filter((x) => x.tarih !== o.tarih).concat(Object.assign({}, once || {}, o));
      kaydet(true); toast('Ölçülerin kaydedildi.'); render(); return;
    }
    if (f.dataset.form === 'kilo') {
      const kg = oku(v.kg); if (!(kg >= 30 && kg <= 250)) { toast('Kilonu 30–250 kg arasında gir.'); return; }
      const k = tarihKey(); S.kilo = S.kilo.filter((x) => x.tarih !== k).concat({ tarih: k, kg }); S.profil.kilo = kg; kaydet(true); toast('Tartın kaydedildi.'); render(); return;
    }
    if (f.dataset.form === 'elle') {
      const hata = document.getElementById('elleHata');
      const ad = String(v.ad || '').trim(); const k = oku(v.k);
      if (!ad || !(k >= 0)) { hata.textContent = 'Ad ve kalori gerekli.'; hata.hidden = false; return; }
      gun().ogun.push({ id: kimlik(), ad: ad.slice(0, 60), g: oku(v.g) || 0, k, p: oku(v.p) || 0, kh: oku(v.kh) || 0, y: oku(v.y) || 0, ogun: ogunTuru(), saat: saat(), kaynak: 'elle' });
      if (v.kaydet) {
        const g = oku(v.g) > 0 ? oku(v.g) : 100; const c = 100 / g; const r1 = (x) => Math.round((oku(x) || 0) * c * 10) / 10;
        S.urunlerim = [{ ad: ad.slice(0, 60), k: Math.round(k * c), p: r1(v.p), kh: r1(v.kh), y: r1(v.y), g, birim: oku(v.g) > 0 ? '1 porsiyon' : '100 g', ozel: true }].concat((S.urunlerim || []).filter((x) => x.ad !== ad.slice(0, 60))).slice(0, 60);
      }
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
      hesap = null; silAcik = false; S = bos(); try { localStorage.removeItem(ANAHTAR); indexedDB.deleteDatabase('comeback-foto'); } catch (e) { /* yok */ } fotoListe = null; fotoUrl = {};
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
      hesap = r.j.kullanici; cevrimdisi = false; paylasimYukle();
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
    if (v.tus === 'kaydet' && S.program) {
      const eskiGun = S.profil ? S.profil.gun : p.gun;
      S.profil = p; S.hedef = hedefHesapla(p); p.gun = eskiGun;
      const bk = tarihKey(); const kx = S.kilo.find((x) => x.tarih === bk); if (kx) kx.kg = p.kilo; else S.kilo.push({ tarih: bk, kg: p.kilo });
      kaydet(true); toast('Bilgilerin kaydedildi. Günlük hedefin ' + sayi(S.hedef.kcal) + ' kcal.'); git('#/profil'); return;
    }
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
    const s = Math.min(1, 1280 / Math.max(img.width, img.height)); // 1280 px: porsiyon ve ayrıntı için yeterli netlik
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }
  let fotoNot = '';
  async function fotoAnaliz(file, eskiResim) {
    let resim = eskiResim;
    if (!resim) { try { resim = await kucult(file); } catch (e) { toast('Bu fotoğraf açılamadı. Başka bir fotoğraf dene.'); return; } }
    fotoSonuc = { resim, durum: 'Tabağın inceleniyor…' }; render();
    try {
      const r = await fetch('/api/comeback/foto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resim, not: fotoNot.trim().slice(0, 300) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fotoSonuc.durum = j.hata || 'Analiz şu an yapılamıyor.'; render(); return; }
      if (!j.kalemler || !j.kalemler.length) { fotoSonuc.durum = 'Tabakta yemek bulamadık. Daha yakından çekmeyi dene.'; render(); return; }
      fotoSonuc.kalemler = j.kalemler.map((x) => ({ emin: x.emin || 'orta', ad: String(x.ad || 'Yemek').slice(0, 50), g: Math.max(1, +x.g || 100), k: Math.max(0, +x.k || 0), p: Math.max(0, +x.p || 0), kh: Math.max(0, +x.kh || 0), y: Math.max(0, +x.y || 0) }));
      fotoSonuc.durum = fotoSonuc.kalemler.length + ' yemek bulundu';
      render();
    } catch (e) { fotoSonuc.durum = 'Bağlantı kurulamadı.'; render(); }
  }

  app.innerHTML = '<header class="ust"><span class="logo">COMEBACK<i>.</i></span></header>';
  gocEt();
  hesapYukle().then(render, render);
})();
