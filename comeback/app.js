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
    const yaz = () => { try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { /* depolama kapalı; hesapla eşitleniyor */ } senkronPlanla(); try { if (hatAcikMi()) hatPlanla(); } catch (e) { /* henüz hazır değil */ } };
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
  // afiş QR'ı ya da davet bağlantısıyla gelenin kaynağı (basla.html yazar); başvuruda "Bizi nereden duydun?" hazır gelir
  const kaynakOn = () => { try { return sessionStorage.getItem('cb-kaynak') || ''; } catch (e) { return ''; } };
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
  // demo hesabı: ilk girişte örnek verilerle doldur (inceleme ve geliştiriciler için)
  function demoDoldur() {
    const p = { ad: (hesap && hesap.ad) || 'Demo', cinsiyet: 'e', yas: 28, boy: 178, kilo: 79, hedef: 'kas', spor: 'fitness', deneyim: 'orta', gun: 4, sakatlik: [], odak: ['omuz'], ortam: 'salon', sure: 60, sezon: 'disi', saglik: false };
    S = bos(); S.profil = p; S.hedef = hedefHesapla(p); S.program = programOlustur(p);
    S.kocSec = { tarz: 'kararli', ad: 'Arnold' }; S.takviye = [{ id: kimlik(), ad: 'Kreatin', doz: '5 g', zaman: 'sabah' }, { id: kimlik(), ad: 'D vitamini', doz: '1 damla', zaman: 'sabah' }];
    const yem = (ad, g) => { const y = D.YEMEK.find((x) => x.ad === ad); return y ? { id: kimlik(), ad: y.ad, g, k: y.k * g / 100, p: y.p * g / 100, kh: y.kh * g / 100, y: y.y * g / 100 } : null; };
    for (let i = 20; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); const k = tarihKey(d); const hg = haftaGunu(d);
      const g = { ogun: [], su: 1750 + (i % 4) * 250, takviye: {} };
      [['kahvalti', 'Haşlanmış yumurta', 100, '08:30'], ['kahvalti', 'Beyaz peynir', 30, '08:30'], ['kahvalti', 'Domates', 120, '08:30'], ['ogle', 'Tavuk göğsü (ızgara)', 180, '13:00'], ['ogle', 'Bulgur pilavı', 150, '13:00'], ['ara', 'Muz', 120, '16:30'], ['aksam', 'Mercimek çorbası', 250, '19:30'], ['aksam', 'Izgara köfte', 150, '19:30'], ['aksam', 'Çoban salata', 150, '19:30']]
        .forEach((x) => { const o = yem(x[1], x[2]); if (o) g.ogun.push(Object.assign(o, { ogun: x[0], saat: x[3] })); });
      S.takviye.forEach((t, j) => { if ((i + j) % 5) g.takviye[t.id] = 1; });
      const pg = S.program.gunler.find((x) => x.hafta === hg);
      if (pg && i % 7 !== 3) {
        let set = 0, hacim = 0; const kaslar = [];
        pg.hareketler.forEach((x, xi) => { const kg = 20 + xi * 7.5 + (20 - i) * 0.5; set += x.set; hacim += kg * x.set * (x.alt || 8); S.son[x.id] = { tarih: k, setler: Array.from({ length: x.set }, () => ({ kg: Math.round(kg / 2.5) * 2.5, tekrar: x.alt || 8 })) }; ((K.HAREKET[x.id] || {}).birincil || []).forEach((m) => { const gr = KAS_GRUP[m]; if (gr && kaslar.indexOf(gr) < 0) kaslar.push(gr); }); });
        g.antrenman = { ad: pg.ad, set, hacim: Math.round(hacim), dk: 48 + (i % 3) * 6, kaslar, fb: { zor: 2 + (i % 3), iyi: kaslar.slice(0, 2), agri: [], not: '' } };
      }
      S.gunluk[k] = g;
      if (i % 3 === 0) S.kilo.push({ tarih: k, kg: Math.round((79 + (20 - i) * 0.08) * 10) / 10 });
    }
    Object.keys(S.son).slice(0, 4).forEach((id) => { const st = S.son[id].setler[0]; S.rekor[id] = { kg: st.kg, tekrar: st.tekrar, tarih: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) }; });
    try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { /* yok */ }
  }
  async function hesapYukle() {
    try {
      const r = await istek('ben');
      if (r.ok) { hesap = r.j.kullanici; await veriCek(); if (hesap.rol === 'demo' && !S.profil) { demoDoldur(); kaydet(true); } hocaYukle(); paylasimYukle(); if (S.profil) skorGonder(); setTimeout(() => { try { if (hatAcikMi()) hatEsitle(true); } catch (e) { /* yok */ } }, 3000); }
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
    if (S.profil && S.profil.dogum) { const y = yasHesapla(S.profil.dogum); if (y && y !== S.profil.yas) { S.profil.yas = y; S.hedef = hedefHesapla(S.profil); } }
    // protein hedefi yeni formüle (≈1,6 g/kg, fazla kiloda boya göre) bir kez geçsin
    if (S.profil && S.hedefSurum !== 2) { S.hedef = hedefHesapla(S.profil); S.hedefSurum = 2; }
    // kendi yazdığı, yapay zekânın kurduğu, hocasından ya da arkadaşından gelen programa asla dokunma
    if (S.program && (S.program.ozel || S.program.hocadan)) { if (S.program.surum !== 2) S.program.surum = 2; return; }
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
    if (t && t.gunId === undefined && t.kaynak) return null;
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
    ['h4', '4 hafta', 'Dört hafta üst üste haftalık hedefini tuttun', (o) => o.seri >= 4],
    ['h12', '12 hafta', 'Üç ay boyunca her hafta sözünü tuttun', (o) => o.seri >= 12],
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
      antr: gunler.filter((k) => S.gunluk[k].antrenman).length, seri: Math.max(haftaSeri(), S.enIyiHafta || 0),
      rekor: Object.keys(S.rekor).length, donus: !!S.donusYapildi,
      tamHafta: !!(S.profil && gunler.filter((k) => k >= hb && S.gunluk[k].antrenman).length >= S.profil.gun) || !!S.tamHaftaOldu,
      ogunGun: gunler.filter((k) => S.gunluk[k].ogun.length).length
    };
    if (o.seri > (S.enIyiHafta || 0)) S.enIyiHafta = o.seri;
    if (o.tamHafta) S.tamHaftaOldu = true;
    return ROZET.map((r) => ({ id: r[0], ad: r[1], acik: r[2], var: r[3](o) }));
  }
  function yeniRozetler() {
    const once = new Set(S.rozetler || []); const simdi = rozetDurum().filter((r) => r.var);
    S.rozetler = simdi.map((r) => r.id);
    return simdi.filter((r) => !once.has(r.id));
  }

  // seri artık günlük değil haftalık: her gün gelmek sağlıklı değil, haftalık hedefi tutmak ödüllenir
  function haftaHedefi(bas) { const p = (S.haftaPlan || {})[tarihKey(bas)]; return p && p.gunler.length ? p.gunler.length : (S.profil && S.profil.gun) || antrenmanGunleri().length || 3; }
  function haftaYapilan(bas) { let n = 0; for (let i = 0; i < 7; i++) { const d = new Date(bas); d.setDate(d.getDate() + i); const g = S.gunluk[tarihKey(d)]; if (g && g.antrenman) n++; } return n; }
  function haftaSeri() {
    const b = haftaBasi(); let n = haftaYapilan(b) >= haftaHedefi(b) ? 1 : 0;
    for (let i = 0; i < 104; i++) { b.setDate(b.getDate() - 7); if (haftaYapilan(b) >= haftaHedefi(b)) n++; else break; }
    return n;
  }
  function seriKart(etiket) {
    const n = haftaSeri(); const b = haftaBasi(); const y = haftaYapilan(b); const h = haftaHedefi(b);
    const ic = n ? '<span class="k">' + etiket + '</span><span class="buyuk num"><span data-say="' + n + '">' + n + '</span><span style="color:var(--mavi-gece)">.</span></span><span class="ik">hafta üst üste hedefini tuttun</span>'
      : '<span class="k">' + etiket + '</span><span class="buyuk num">' + y + '<span class="ik" style="font-size:.4em"> / ' + h + '</span></span><span class="ik">Bu hafta ' + h + ' gün hedefini tutarsan seri başlar.</span>';
    return ic;
  }
  function seri() {
    let n = 0; const d = new Date();
    const dolu = (k) => { const g = S.gunluk[k]; return g && (g.ogun.length || g.antrenman); };
    if (!dolu(tarihKey(d))) d.setDate(d.getDate() - 1);
    while (dolu(tarihKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  // kalori hedefi tuttu mu: hedefin %90–105'i (limon yalnız bu zafer anında)
  const hedefTamam = (k, hedef) => hedef > 0 && k >= hedef * 0.9 && k <= hedef * 1.05;
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
  /* karşılama: tek görsel (canlanan widget'lar), tek başlık, altta tek ana düğme, giriş ikincil */
  function ekranKarsilama() {
    const gun = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
    const gorsel = '<div class="kr-gorsel" aria-hidden="true"><div class="kr-sahne">' +
      '<div class="kr-w kr-plan"><div class="kr-wb"><span>Haftalık Plan</span><b class="num">4 / 4</b></div><div class="kr-gunler">' + gun.map((g, i) => '<i class="' + ([0, 1, 3, 5].indexOf(i) >= 0 ? 'on' : '') + '" style="--i:' + i + '"><span>' + g + '</span></i>').join('') + '</div></div>' +
      '<div class="kr-w kr-zil"><svg viewBox="0 0 120 120"><circle class="iz" cx="60" cy="60" r="50"/><circle class="dolu" cx="60" cy="60" r="50"/></svg><div class="kr-zil-ic"><b class="num">1:30</b><span>Dinlenme</span></div></div>' +
      '<div class="kr-w kr-set"><span class="kr-set-ad">Squat</span><div class="kr-satir"><span class="num">3</span><b class="num">80 kg × 6</b><i class="kr-tik"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></i></div></div>' +
      '<span class="kr-cip">Yeni rekor · 80 kg</span>' +
      '</div></div>';
    const basvuruVar = S.basvuru && !hesap && !cevrimdisi;
    return '<div class="kr">' + '<header class="ust kr-ust">' + logo + '</header>' + gorsel +
      '<div class="kr-alt"><h1 class="kr-baslik"><span class="mk">Make the</span><span>COMEBACK<span class="nokta">.</span></span></h1>' +
      '<p class="kr-deger">Programın kurulur, her setin kaydedilir. En zor gününde bile yanında.</p>' +
      (basvuruVar ? '<div class="t kobalt" style="gap:6px"><span class="k">Başvurun alındı</span><span style="font-size:15px;font-weight:600;line-height:1.45">' + esc(S.basvuru.eposta) + ' ile başvurun inceleniyor. Onaylanınca aynı e-posta ve şifreyle giriş yap.</span></div>' : '') +
      '<div class="kr-eylem">' + (hesap || cevrimdisi ? '<a class="btn ana buyuk-btn" href="#/kurulum">Programımı oluştur' + IK.ok + '</a>'
        : (basvuruVar ? '' : '<a class="btn ana buyuk-btn" href="#/basvuru">Beta\'ya başvur' + IK.ok + '</a>') + '<a class="metin-btn kr-giris" href="#/giris">Zaten hesabım var ·&nbsp;<b>Giriş yap</b></a>') + '</div>' +
      (S.profil && !hesap && !cevrimdisi && !S.basvuru ? '<div class="uyari">Bu cihazda kayıtların var. Hesap oluşturursan hepsi hesabına aktarılır.</div>' : '') +
      '<p class="kr-not">Kapalı beta · 18 yaş ve üstü' + (cevrimdisi ? ' · Sunucuya şu an ulaşılamıyor, kayıtların bu cihazda.' : '') + ' · <a href="#/topluluk/rehber">Kas grubu rehberi</a></p>' +
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
      '<label class="t genis alan"><span>Bizi nereden duydun? · isteğe bağlı</span><input name="kaynak" maxlength="60" placeholder="Instagram, arkadaşım, salonum…" value="' + esc(kaynakOn()) + '" style="font-size:18px"></label>' +
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
      const [o, b, g, h, hc, dm, sk] = await Promise.all(['ozet', 'bekleme', 'gorusler', 'hatalar', 'hocalar', 'demo'].map((x) => istek('yonetim/' + x)).concat([tistek('sikayetler')]));
      yon.veri = o.ok ? { ozet: o.j, bekleme: b.j.liste || [], gorusler: g.j.liste || [], hatalar: h.j.liste || [], hocalar: hc.j.liste || [], demo: (dm.j && dm.j.liste) || [], sikayet: sk.j.liste || [] } : { hata: o.j.hata || 'Yüklenemedi.' };
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
    const sekmeler = [['bekleme', 'Bekleme listesi · ' + o.bekleyen], ['gorusler', 'Görüşler · ' + V.gorusler.length], ['hatalar', 'Hatalar · ' + V.hatalar.length], ['hocalar', 'Hocalar · ' + V.hocalar.length], ['sikayet', 'Şikâyetler · ' + V.sikayet.length], ['demo', 'Demo hesap · ' + (V.demo || []).length]];
    let govde = '';
    if (yon.sekme === 'bekleme') govde = V.bekleme.length ? V.bekleme.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad || '—') + '</b><span class="ik">' + esc(x.eposta) + '</span><span class="ik">' + [HED[x.hedef] || x.hedef, x.kaynak, tarih(x.zaman)].filter(Boolean).map(esc).join(' · ') + (x.kayitli === 2 ? ' · <b>profil hazır, onay bekliyor</b>' : x.kayitli ? ' · <b>hesap açtı</b>' : '') + '</span></div><div class="yon-is"><span class="etiket">' + DUR[x.durum] + '</span>' +
      (x.durum !== 'onayli' ? '<button class="btn ana kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="onayli">Onayla</button>' : '') +
      (x.durum === 'bekliyor' ? '<button class="btn cerceve kucuk" data-act="yon-onay" data-eposta="' + esc(x.eposta) + '" data-durum="reddedildi">Reddet</button>' : '') + '</div></div>').join('') : '<p class="ik">Henüz başvuru yok.</p>';
    else if (yon.sekme === 'gorusler') govde = V.gorusler.length ? V.gorusler.map((x) => '<div class="yon-satir"><div class="yigin"><span class="ik">' + esc([x.tur, x.ad || 'isimsiz', x.ekran, tarih(x.zaman)].filter(Boolean).join(' · ')) + '</span><span style="white-space:pre-wrap;line-height:1.5">' + esc(x.metin) + '</span></div></div>').join('') : '<p class="ik">Henüz görüş yok.</p>';
    else if (yon.sekme === 'sikayet') govde = V.sikayet.length ? V.sikayet.map((x) => '<div class="yon-satir"><div class="yigin"><span class="ik">' + (x.tur === 'konu' ? 'Konu' : 'Cevap') + ' · ' + x.adet + ' şikâyet' + (x.gizli ? ' · şu an gizli' : '') + '</span><span style="line-height:1.45;word-break:break-word">' + esc(x.metin || '(silinmiş)') + '</span></div><div class="yon-is"><button class="btn cerceve kucuk" data-act="yon-mod" data-tur="' + x.tur + '" data-id="' + x.hedef_id + '" data-gizli="1">Gizle</button><button class="btn ana kucuk" data-act="yon-mod" data-tur="' + x.tur + '" data-id="' + x.hedef_id + '" data-gizli="0">Sorun yok</button></div></div>').join('') : '<p class="ik">Açık şikâyet yok.</p>';
    else if (yon.sekme === 'demo') govde = '<p class="ik" style="padding:10px 0 0;line-height:1.5">Google Play / App Store incelemesi ya da yardım aldığın geliştiriciler için. Bekleme listesine takılmaz; ilk girişte örnek program, antrenman, öğün ve takviye verisiyle dolar. Şifreyi sen belirle ve yalnızca ilgili kişiyle paylaş.</p>' +
      '<form data-form="demo" class="izgara" novalidate style="grid-template-columns:1fr;gap:8px;padding:10px 0"><label class="mini"><span>E-posta</span><input name="eposta" type="email" autocomplete="off" placeholder="demo@comeback.com.tr" required></label><label class="mini"><span>Görünen ad</span><input name="ad" maxlength="40" placeholder="Demo Kullanıcı"></label><label class="mini"><span>Şifre · en az 8 karakter</span><input name="sifre" type="text" autocomplete="new-password" minlength="8"></label>' +
      '<div class="haplar"><button class="btn ana kucuk" type="submit" name="tus" value="kaydet">Aç / şifreyi güncelle</button><button class="btn cerceve kucuk" type="submit" name="tus" value="sifirla">Verisini sıfırla</button><button class="btn cerceve kucuk" type="submit" name="tus" value="sil" style="color:var(--hata)">Sil</button></div></form>' +
      ((V.demo || []).length ? V.demo.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad) + '</b><span class="ik">' + esc(x.eposta) + ' · son kullanım ' + tarih(x.son) + '</span></div></div>').join('') : '<p class="ik">Henüz demo hesap yok.</p>');
    else if (yon.sekme === 'hocalar') govde = '<form data-form="yon-hoca" class="satir" style="gap:8px;padding:10px 0"><input name="eposta" type="email" placeholder="Hocanın e-postası" aria-label="Hoca yapılacak kişinin e-postası" style="flex:1;min-width:0;border:0;background:var(--zemin);border-radius:14px;min-height:44px;padding:0 12px;font-size:16px"><button class="btn ana kucuk" type="submit">Hoca yap</button></form><p class="ik" style="padding-bottom:8px">Kişi önce hesap açmış olmalı. Hoca olunca Profil\'inde Hoca paneli çıkar.</p>' +
      (V.hocalar.length ? V.hocalar.map((x) => '<div class="yon-satir"><div class="yigin"><b>' + esc(x.ad) + '</b><span class="ik">' + esc(x.eposta) + ' · ' + x.ogrenci + ' öğrenci</span></div><div class="yon-is"><button class="btn cerceve kucuk" data-act="yon-rol" data-eposta="' + esc(x.eposta) + '" data-rol="uye">Hocalığı kaldır</button></div></div>').join('') : '<p class="ik">Henüz hoca yok.</p>');
    else govde = V.hatalar.length ? V.hatalar.map((x) => '<div class="yon-satir"><div class="yigin"><b style="font-size:14px;word-break:break-word">' + esc(x.mesaj) + '</b><span class="ik" style="word-break:break-all">' + esc([x.yer, x.ekran, 'sürüm ' + x.surum].filter(Boolean).join(' · ')) + '</span><span class="ik">' + x.adet + ' kez · ' + x.kisi + ' kişi · son ' + tarih(x.son) + '</span></div></div>').join('') : '<p class="ik">Hata kaydı yok.</p>';
    return ust(geri('#/profil'), '<button class="ikon-btn" data-act="yon-yenile" aria-label="Yenile" style="background:#fff">' + IK.degis + '</button>') +
      '<h1 class="baslik">Yönetim<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + kutu('Kullanıcı', o.kullanici, 'kobalt') + kutu('Son 7 gün aktif', o.aktif) + kutu('Yeni (7 gün)', o.yeniKullanici) + kutu('Bekleyen', o.bekleyen, o.bekleyen ? 'limon' : '') +
      '<div class="t genis"><span class="k">İkinci hafta dönüşü</span><span class="orta num">' + (o.donusAday ? Math.round(o.donus / o.donusAday * 100) + '%' : '—') + '</span><span class="ik">' + (o.donusAday ? o.donusAday + ' kişiden ' + o.donus + ' kişi kayıttan 1 hafta sonra hâlâ kullanıyor' : 'Hesap açalı en az 1 hafta olan kullanıcı yok') + '</span></div>' +
      '<div class="t genis"><span class="k">Son 7 günde ne kullanıldı</span>' + ((o.olaylar || []).length ? (o.olaylar || []).map((x) => '<div class="satir num"><span>' + esc(({ antrenman_bitti: 'Antrenman bitirildi', ogun_foto: 'Fotoğrafla öğün', ogun_barkod: 'Barkodla öğün', ogun_liste: 'Listeden öğün', ogun_elle: 'Elle öğün', koc_mesaj: 'Koç mesajı', program_ozel: 'Kendi programını kaydetti', program_yorum: 'Program yorumu', kurulum: 'Kurulum', su: 'Su', paylas: 'Haftalık kart paylaşımı', off_gun: 'Off gün aldı', program_paylas: 'Program gönderdi', program_al: 'Gelen programı aldı', program_kur: 'Yapay zekâya program kurdurdu', antrenman_his: 'Antrenman sonu notu', takviye: 'Takviye işaretledi', siralama: 'Sıralamaya katıldı', jam: 'Jam açtı/katıldı', bplan: 'Beslenme programı hazırladı', gun_degis: 'Antrenman gününü değiştirdi', haftaplan: 'Haftasını planladı' })[x.olay] || x.olay) + '</span><b>' + x.adet + '</b></div>').join('') : '<span class="ik">Henüz kayıt yok.</span>') + '</div>' +
      '<div class="t genis"><span class="k">Yapay zekâ cevapları · son 30 gün</span>' + ((o.aiOy || []).length ? o.aiOy.map((x) => '<div class="satir num"><span>' + ({ koc: 'Koç', yorum: 'Program yorumu', yemek: 'Yemek önerisi', foto: 'Fotoğrafla kalori', kur: 'Program kurma', bplan: 'Beslenme programı' }[x.tur] || x.tur) + '</span><b>' + x.iyi + ' yararlı · ' + x.kotu + ' değil</b></div>').join('') : '<span class="ik">Henüz oy yok.</span>') +
      ((o.aiKotu || []).length ? '<details style="margin-top:6px"><summary class="ik" style="cursor:pointer">Yararlı bulunmayan son cevaplar</summary>' + o.aiKotu.map((x) => '<p class="ik" style="margin:6px 0">' + esc(x.tur) + ': ' + esc(x.ornek) + '</p>').join('') + '</details>' : '') + '</div>' +
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
      sifreAlani('sifre', 'new-password', 'Şifre · en az 8 karakter') + sifreAlani('sifre2', 'new-password', 'Şifre tekrar') +
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

  // şifre sıfırlama: #/sifre (e-posta iste) ve #/sifre/<token> (yeni şifre)
  let sifreGonderildi = '';
  function ekranSifre(token) {
    if (token) return ust(geri('#/giris', 'Girişe dön'), '<span class="alt">Şifre yenile</span>') +
      '<h1 class="baslik">Yeni şifren<span class="nokta">.</span></h1>' +
      '<form data-form="sifre-yenile" class="izgara" novalidate><input type="hidden" name="token" value="' + esc(token) + '">' +
      sifreAlani('sifre', 'new-password', 'Yeni şifre · en az 8 karakter') + sifreAlani('sifre2', 'new-password', 'Yeni şifre tekrar') +
      '<p class="hata genis" id="formHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Şifremi değiştir' + IK.ok + '</button></form>';
    return ust(geri('#/giris', 'Girişe dön'), '<span class="alt">Şifremi unuttum</span>') +
      '<h1 class="baslik">Şifreni yenile<span class="nokta">.</span></h1>' +
      (sifreGonderildi ? '<div class="t genis kobalt"><span class="k">E-posta yolda</span><span style="font-size:17px;font-weight:700;line-height:1.45">' + esc(sifreGonderildi) + '</span></div><a class="btn cerceve genis" href="#/giris">Girişe dön</a>'
        : '<p class="ik" style="padding:0 4px 6px;font-size:15px">Hesabının e-postasını yaz. 30 dakika geçerli bir yenileme bağlantısı gönderelim.</p>' +
        '<form data-form="sifre-unuttum" class="izgara" novalidate><label class="t genis alan"><span>E-posta</span><input name="eposta" type="email" autocomplete="email" inputmode="email" required placeholder="ornek@eposta.com" style="font-size:20px;letter-spacing:-.01em"></label>' +
        '<p class="hata genis" id="formHata" role="alert" hidden></p><button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Bağlantıyı gönder' + IK.ok + '</button></form>');
  }
  async function sifreFormu(tur, v) {
    const hataEl = document.getElementById('formHata'); const btn = document.getElementById('formBtn');
    const goster = (m) => { hataEl.textContent = m; hataEl.hidden = false; }; hataEl.hidden = true;
    if (tur === 'sifre-unuttum') { if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v.eposta || '').trim())) return goster('Geçerli bir e-posta adresi yaz.'); }
    else { if (String(v.sifre || '').length < 8) return goster('Şifre en az 8 karakter olmalı.'); if (v.sifre !== v.sifre2) return goster('İki şifre aynı değil. Tekrar yaz.'); }
    btn.disabled = true; const eski = btn.innerHTML; btn.textContent = 'Gönderiliyor…'; btn.classList.add('isliyor');
    try {
      const r = await istek(tur, 'POST', tur === 'sifre-unuttum' ? { eposta: String(v.eposta).trim() } : { token: v.token, sifre: v.sifre });
      if (!r.ok) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); return goster(r.j.hata || 'Bir sorun oluştu. Tekrar dene.'); }
      if (tur === 'sifre-unuttum') { sifreGonderildi = r.j.mesaj; render(); return; }
      if (r.j.kullanici) { hesap = r.j.kullanici; cevrimdisi = false; paylasimYukle(); const yerel = S.profil; S = yerel ? S : bos(); await veriCek(); toast('Şifren değişti. Hoş geldin, ' + hesap.ad + '.'); git(S.profil ? '#/' : '#/kurulum'); }
      else { toast('Şifren değişti. Başvurun onaylanınca yeni şifrenle girersin.'); git('#/giris'); }
    } catch (e) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); goster('Bağlantı kurulamadı. İnternetini kontrol et.'); }
  }

  const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  function yasHesapla(d) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || ''); if (!m) return 0;
    const b = new Date(); let y = b.getFullYear() - +m[1];
    if (b.getMonth() + 1 < +m[2] || (b.getMonth() + 1 === +m[2] && b.getDate() < +m[3])) y--;
    return y;
  }
  function dogumGunuMu(p) { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec((p && p.dogum) || ''); const b = new Date(); return !!m && +m[1] === b.getMonth() + 1 && +m[2] === b.getDate(); }
  function ekranKurulum(basvuru) {
    if (basvuru) basvuru = !hesap && !cevrimdisi;
    const p = (!basvuru && S.profil) || (basvuru && S.basvuruTaslak) || { ad: hesap ? hesap.ad : '', cinsiyet: 'e', yas: '', boy: '', kilo: '', hedef: 'kas', spor: 'fitness', deneyim: 'orta', gun: 4, sakatlik: [], odak: [], ortam: 'salon', sure: 60, sezon: 'disi', saglik: false };
    const hap = (grup, deger, yazi, secili, coklu) => '<button type="button" class="hap' + (coklu ? ' siyah' : '') + '" data-act="hap" data-grup="' + grup + '" data-deger="' + deger + '"' + (coklu ? ' data-coklu="1"' : '') + ' aria-pressed="' + (secili ? 'true' : 'false') + '">' + yazi + '</button>';
    const tekli = (grup, liste, secili) => liste.map((x) => hap(grup, x[0], x[1], x[0] === secili)).join('');
    const dg = /^(\d{4})-(\d{2})-(\d{2})$/.exec(p.dogum || '') || [];
    const duzen = !basvuru && S.profil;
    return ust(basvuru ? geri('#/', 'Başa dön') : duzen ? geri('#/profilim') : logo, '<span class="alt">' + (basvuru ? 'Kapalı beta başvurusu' : duzen ? 'Bilgilerim' : 'Program kurulumu') + '</span>') +
      '<h1 class="baslik">' + (basvuru ? 'İlk sen dene' : duzen ? 'Bilgilerini güncelle' : 'Seni tanıyalım') + '<span class="nokta">.</span></h1>' +
      (basvuru ? '<p class="ik" style="padding:0 4px 6px;font-size:15px;max-width:52ch">COMEBACK. şu an kapalı betada. Bilgilerini şimdi doldur; başvurun onaylanınca bu e-posta ve şifreyle giriş yaparsın, programın seni hazır bekler.</p>' : '') +
      '<form data-form="kurulum"' + (basvuru ? ' data-mod="basvuru"' : '') + ' class="izgara" novalidate>' +
      '<label class="t genis alan"><span>Adın</span><input name="ad" autocomplete="given-name" maxlength="30" value="' + esc(p.ad) + '" placeholder="Deniz" style="font-size:24px"></label>' +
      (basvuru ? '<label class="t genis alan"><span>E-posta</span><input name="eposta" type="email" autocomplete="email" inputmode="email" required placeholder="ornek@eposta.com" style="font-size:20px;letter-spacing:-.01em" value="' + esc(p.eposta || '') + '"></label>' + sifreAlani('sifre', 'new-password', 'Şifre · en az 8 karakter') + sifreAlani('sifre2', 'new-password', 'Şifre tekrar') : '') +
      '<fieldset class="t genis"><legend>Cinsiyet</legend><div class="haplar">' + tekli('cinsiyet', [['e', 'Erkek'], ['k', 'Kadın']], p.cinsiyet) + '</div><span class="ik">Kalori hesabı için gerekiyor.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Doğum tarihin</legend><div class="dogum">' +
        '<label class="mini"><span>Gün</span><input name="dgun" inputmode="numeric" maxlength="2" autocomplete="bday-day" value="' + (dg[3] ? +dg[3] : '') + '" placeholder="14"></label>' +
        '<label class="mini"><span>Ay</span><select name="day" autocomplete="bday-month"><option value="">Seç</option>' + AYLAR.map((a, i) => '<option value="' + (i + 1) + '"' + (dg[2] && +dg[2] === i + 1 ? ' selected' : '') + '>' + a + '</option>').join('') + '</select></label>' +
        '<label class="mini"><span>Yıl</span><input name="dyil" inputmode="numeric" maxlength="4" autocomplete="bday-year" value="' + (dg[1] || '') + '" placeholder="1998"></label>' +
      '</div><span class="ik">Yaşını buradan hesaplarız. Doğum gününde sana küçük bir sürprizimiz var.</span></fieldset>' +
      '<div class="genis" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--ara)">' +
      '<label class="t alan"><span>Boy, cm</span><input name="boy" inputmode="numeric" value="' + esc(p.boy) + '" placeholder="178"></label>' +
      '<label class="t alan"><span>Kilo, kg</span><input name="kilo" inputmode="decimal" value="' + esc(p.kilo ? String(p.kilo).replace('.', ',') : '') + '" placeholder="76,4"></label>' +
      '</div>' +
      '<fieldset class="t genis"><legend>Hedefin</legend><div class="haplar">' + tekli('hedef', [['kas', 'Kas kazanmak'], ['yag', 'Yağ yakmak'], ['guc', 'Güçlenmek'], ['kondisyon', 'Kondisyon']], p.hedef) + '</div></fieldset>' +
      '<fieldset class="t genis"><legend>Uğraştığın spor</legend><div class="haplar">' + tekli('spor', [['fitness', 'Fitness'], ['futbol', 'Futbol'], ['basketbol', 'Basketbol'], ['kosu', 'Koşu'], ['yuzme', 'Yüzme'], ['tenis', 'Tenis'], ['dovus', 'Dövüş sporları']], p.spor) + '</div><span class="ik">Spora özel güç, sürat ve sakatlık önleme hareketleri eklenir.</span></fieldset>' +
      '<fieldset class="t genis" id="sezonAlan"' + (p.spor === 'fitness' ? ' hidden' : '') + '><legend>Şu an sezonda mısın?</legend><div class="haplar">' + tekli('sezon', [['disi', 'Sezon dışı / hazırlık'], ['ici', 'Sezon içi, maçlar var']], p.sezon || 'disi') + '</div><span class="ik">Sezon içinde set sayısı azalır, amaç kuvveti korumak olur.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Nerede çalışacaksın? · birden fazla seçebilirsin</legend><div class="haplar">' + [['salon', 'Spor salonu'], ['ev', 'Evde, dambılla'], ['vucut', 'Ekipmansız'], ['dis', 'Dışarıda, parkta']].map((x) => hap('ortam', x[0], x[1], ortamlar(p).indexOf(x[0]) >= 0, true)).join('') + '</div><span class="ik">' + 'Hem salonda hem dışarıda çalışıyorsan ikisini de seç; günleri bu yerlere paylaştırırız. Ev: dambıl ve lastik bant. Ekipmansız: yalnızca vücut ağırlığı ve bir sandalye. Park: barfiks ve paralel bar.' + '</span></fieldset>' +
      '<fieldset class="t genis"><legend>Bir antrenman ne kadar sürsün?</legend><div class="haplar">' + tekli('sure', [['45', '45 dk'], ['60', '60 dk'], ['75', '75 dk'], ['90', '90 dk']], String(p.sure || 60)) + '</div></fieldset>' +
      '<fieldset class="t"><legend>Deneyim</legend><div class="haplar">' + tekli('deneyim', [['baslangic', 'Yeni'], ['orta', 'Orta'], ['ileri', 'İleri']], p.deneyim) + '</div></fieldset>' +
      '<div class="t ara-sb"><span class="k">Haftada</span><div class="satir"><button type="button" class="yuvarlak" data-act="gun" data-yon="-1" aria-label="Gün azalt">−</button><span class="buyuk num" id="gunSay">' + p.gun + '</span><button type="button" class="yuvarlak" data-act="gun" data-yon="1" aria-label="Gün artır">+</button></div><span class="k">gün antrenman</span></div>' +
      '<fieldset class="t genis"' + (basvuru ? ' hidden' : '') + '><legend>Programını kim yazsın?</legend><div class="haplar">' + tekli('yazan', [['biz', 'COMEBACK. kursun'], ['anlat', 'Anlatayım, koçum kursun'], ['ben', 'Kendim yazacağım']], S.program && S.program.ozel ? 'ben' : 'biz') + '</div>' +
        '<label class="alan" id="anlatAlan" hidden style="margin-top:8px"><span>Nasıl bir program istiyorsun?</span><textarea name="anlat" rows="3" maxlength="1200" placeholder="Ör. Haftada 4 gün, itiş-çekiş-bacak. Omuzlarım geri kalmış. En fazla 1 saat." style="font-size:16px"></textarea></label>' + '<span class="ik">Kendin yazarsan hareketleri kütüphaneden seçersin; istersen koçun yorumlar. Hazır programı da sonradan düzenleyebilirsin.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Üzerine gitmek istediğin bölge</legend><div class="haplar">' + Object.keys(M.ODAK).map((k) => hap('odak', k, M.ODAK[k].ad, (p.odak || []).indexOf(k) >= 0, true)).join('') + '</div><span class="ik">En fazla 2 bölge. Seçtiğin bölgeye haftada 2 gün ek hareket koyarız. İstemezsen boş bırak.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Ağrı ya da sakatlık var mı?</legend><div class="haplar">' + K.SAKATLIK.map((x) => hap('sakatlik', x[0], x[1], (p.sakatlik || []).indexOf(x[0]) >= 0, true)).join('') + '</div><span class="ik">Seçersen o bölgeyi zorlayan hareketlerin yerine güvenli olanları koyarız.</span></fieldset>' +
      '<fieldset class="t genis"><legend>Sağlık kontrolü</legend><span style="font-size:14px;line-height:1.5">Doktorun kalp rahatsızlığın olduğunu söyledi mi? Egzersizde ya da dinlenirken göğüs ağrısı, baş dönmesi veya bayılma yaşıyor musun? Hareketle kötüleşebilecek bir kemik ya da eklem sorunun, tansiyon veya kalp için düzenli kullandığın bir ilacın var mı?</span><div class="haplar">' + tekli('saglik', [['hayir', 'Hayır, hiçbiri'], ['evet', 'Evet, en az biri']], p.saglik ? 'evet' : 'hayir') + '</div><span class="ik">Ayrıntı saklanmaz; yalnızca evet/hayır cevabı, doktor onayı uyarısı için tutulur.</span></fieldset>' +
      '<label class="t genis onay"><input type="checkbox" name="yetiskin"' + (duzen || (hesap && !basvuru) ? ' checked' : '') + '><span>18 yaşından büyüğüm. Programın ve kalori hedeflerinin genel bilgi olduğunu, tıbbi tavsiye yerine geçmediğini biliyorum.</span></label>' +
      (basvuru ? '<label class="t genis onay"><input type="checkbox" name="riza"><span>Antrenman ve beslenme kayıtlarımın programımı hazırlamak için hesabımda saklanmasına onay veriyorum.</span></label>' +
        '<label class="t genis onay"><input type="checkbox" name="saglikRiza"><span><b>Açık rıza:</b> Doğum tarihim, kilo, boy, sakatlık bölgelerim ve sağlık kontrolü cevabım gibi sağlık verilerimin yalnızca programımı ve kalori hedefimi hesaplamak için işlenmesine açık rıza veriyorum. Rızamı hesabımı silerek her zaman geri alabilirim.</span></label>' +
        '<label class="t genis alan"><span>Bizi nereden duydun? · isteğe bağlı</span><input name="kaynak" maxlength="60" placeholder="Instagram, arkadaşım, salonum…" value="' + esc(kaynakOn()) + '" style="font-size:18px"></label>' +
        '<a class="metin-btn genis" href="gizlilik.html" target="_blank" rel="noopener" style="text-align:left;color:var(--kobalt);padding-top:0">Aydınlatma metnini oku →</a>' : '') +
      '<p class="hata genis" id="kurulumHata" role="alert" hidden></p>' +
      (basvuru ? '<button class="btn ana buyuk-btn genis" type="submit" id="formBtn">Başvurumu gönder' + IK.ok + '</button><a class="metin-btn genis" href="#/giris" style="text-align:center;color:var(--murekkep)">Zaten hesabım var · <span style="color:var(--kobalt)">Giriş yap</span></a>' : '') +
      (basvuru ? '' : duzen
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
    return '<a class="t koyu genis" href="#/hoca-program" style="gap:4px"><span class="k">Hocan ' + esc(a.hoca) + ' sana program gönderdi</span><b style="font-size:20px">' + esc(a.program.ad || 'Yeni program') + '</b><span class="ik" style="color:#3E4410">Bak, beğenirsen kabul et.</span></a>';
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
      '<div class="t h130"><span class="k">Kalori (14 gün ort.)</span><span class="orta num">' + (o.ortKcal14 ? sayi(o.ortKcal14) : '—') + '</span><span class="k">' + (o.hedef ? 'hedef ' + sayi(o.hedef.kcal) + ' · ' : '') + o.kayitliGun14 + ' gün kayıt</span></div>' +
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
  // çalışma yerleri: tek ortam (eski) ya da birden fazla (ör. hem salon hem dışarı)
  const gunProfil = (g) => (g && g.ortam ? Object.assign({}, S.profil, { ortam: g.ortam }) : S.profil);
  const ORTAM_KISA = { salon: 'Salon', ev: 'Ev', vucut: 'Ekipmansız', dis: 'Dışarıda' };
  const ortamlar = (p) => (p && Array.isArray(p.ortamlar) && p.ortamlar.length ? p.ortamlar : [(p && p.ortam) || 'salon']);
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
      '<div class="t genis"><span class="k">Nerede çalışacaksın? · birden fazla seçebilirsin</span><div class="haplar">' + hp('ortam', [['salon', 'Spor salonu'], ['ev', 'Evde, dambılla'], ['vucut', 'Ekipmansız'], ['dis', 'Dışarıda']], ortamlar(p), true) + '</div>' + (ortamlar(p).length > 1 ? '<span class="ik">Antrenman günlerini ' + ortamlar(p).map((o) => (K.ORTAM[o] || { ad: o }).ad.toLowerCase()).join(' ve ') + ' arasında sırayla paylaştırırız.</span>' : '') + '</div>' +
      '<div class="t genis"><span class="k">Bir antrenman ne kadar sürsün?</span><div class="haplar">' + hp('sure', [['45', '45 dk'], ['60', '60 dk'], ['75', '75 dk'], ['90', '90 dk']], String(p.sure || 60)) + '</div></div>' +
      '<div class="t genis"><span class="k">Günlük protein</span><div class="haplar">' + [['dusuk', 'Az'], ['orta', 'Orta'], ['yuksek', 'Yüksek']].map((x) => { const pp = Object.assign({}, p, { protSeviye: x[0] }); const h = M.hedefHesapla(pp); return '<button type="button" class="hap" data-act="hedef-sec" data-grup="protSeviye" data-deger="' + x[0] + '" aria-pressed="' + ((p.protSeviye || '') === x[0]) + '">' + x[1] + ' · ' + h.protein + ' g</button>'; }).join('') +
        '<button type="button" class="hap" data-act="hedef-sec" data-grup="protSeviye" data-deger="" aria-pressed="' + !p.protSeviye + '">Önerilen · ' + M.hedefHesapla(Object.assign({}, p, { protSeviye: '' })).protein + ' g</button>' +
        '<button type="button" class="hap" data-act="hedef-sec" data-grup="protSeviye" data-deger="ozel" aria-pressed="' + (p.protSeviye === 'ozel') + '">Kendim belirleyeyim</button></div>' +
        (p.protSeviye === 'ozel' ? '<label class="mini" style="max-width:220px"><span>Günlük protein, g</span><input id="protG" data-in="prot-g" inputmode="numeric" value="' + (p.protG || yeni.protein) + '"></label>' : '') +
        '<span class="ik">Çoğu kişi için kilo başına 1,4–1,8 g yeterli. Fazla kiloluysan boyuna göre hesaplanır. Doldurması zor geliyorsa "Az" ile başla; kas kaybı riski düşük hedefte bile azdır.</span></div>' +
      '<div class="t genis"><span class="k">Yeni günlük hedefin</span><span class="orta num">' + sayi(yeni.kcal) + ' kcal</span><span class="k">' + yeni.protein + ' g protein (' + String(yeni.protKg).replace('.', ',') + ' g/kg) · şu an ' + sayi(S.hedef.kcal) + ' kcal, ' + S.hedef.protein + ' g protein</span></div>' +
      '</div>' +
      (ozel ? '<div class="uyari">Kendi yazdığın programın korunur, sadece kalori hedefin güncellenir. İstersen programı da yeni hedefe göre COMEBACK. kursun.</div>' : '<div class="uyari">Programın yeni hedefe göre yeniden kurulur. Geçmiş antrenmanların, rekorların ve öğünlerin silinmez.</div>') +
      '<button class="btn ana buyuk-btn" data-act="hedef-kaydet" data-program="' + (ozel ? '0' : '1') + '">' + (ozel ? 'Kalori hedefimi güncelle' : 'Kaydet, programımı yeniden kur') + IK.ok + '</button>' +
      (ozel ? '<button class="btn cerceve" data-act="hedef-kaydet" data-program="1">Programımı da COMEBACK. kursun</button>' : '<button class="btn cerceve" data-act="hedef-kaydet" data-program="0">Programıma dokunma, sadece kalori ve protein</button>') +
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
    const an = M.ozelAnaliz(pr.gunler, prof); pr.hacim = an.hacim; pr.hacimHedef = an.hacimHedef; pr.ozel = true; pr.surum = 2;
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
    return '<a class="t koyu genis" href="#/gelen/' + a.id + '" style="gap:4px"><span class="k">@' + esc(a.kadi || '') + ' · ' + esc(a.gonderen) + ' sana program gönderdi</span><b style="font-size:20px">' + esc(a.program.ad || 'Program') + '</b><span class="ik" style="color:#3E4410">' + programOzetSatir(a.program) + ' · bak, beğenirsen al.</span></a>';
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
      } else if (ne === 'mesaj') { const r = await tistek('mesaj/' + encodeURIComponent(id)); tp.mesaj = r.ok ? r.j : { hata: r.j.hata || 'Açılamadı.' }; tp.mesajId = id; setTimeout(() => { kocKaydir(); okunmamisYukle(); }, 120); mk.liste = null; }
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
  // Rehber: kas grubu yazıları (rehber.js), girişsiz de okunur
  function ekranRehber(id) {
    const RB = window.COMEBACK_REHBER; if (!RB) return ust(geri('#/topluluk')) + '<div class="t"><span>Rehber yüklenemedi. Sayfayı yenile.</span></div>';
    const sek = '<div class="yatay">' + [['forum', 'Forum', '#/topluluk'], ['meydan', 'Meydan okuma', '#/topluluk/meydan'], ['rehber', 'Rehber', '#/topluluk/rehber']].map((x) => '<a class="hap" href="' + x[2] + '" aria-pressed="' + (x[0] === 'rehber') + '" style="text-decoration:none">' + x[1] + '</a>').join('') + '</div>';
    const y = id && RB.R.find((x) => x.id === id);
    if (y) {
      const hl = y.hareketler.filter((h) => D.HAREKET[h]);
      return ust(geri('#/topluluk/rehber'), '<span class="alt">Rehber · ' + y.sure + ' okuma</span>') +
        '<article class="rh-yazi">' +
        '<h1 class="baslik">' + esc(y.ad) + '<span class="nokta">.</span></h1>' +
        '<p class="rh-ozet">' + esc(y.ozet) + '</p>' +
        y.bolumler.map((b) => '<section class="t rh-bolum"><h2>' + esc(b[0]) + '</h2><p>' + esc(b[1]) + '</p></section>').join('') +
        '<section class="t rh-bolum"><h2>Bu kası çalıştıran hareketler</h2><div class="haplar">' + hl.map((h) => '<span class="hap" style="cursor:default">' + esc(D.HAREKET[h].ad) + '</span>').join('') + '</div><a class="btn cerceve" href="#/program" style="align-self:flex-start;margin-top:4px">Programıma ekle</a></section>' +
        RB.GENEL.map((b) => '<section class="t koyu rh-bolum"><h2>' + esc(b[0]) + '</h2><p>' + esc(b[1]) + '</p></section>').join('') +
        '<p class="ik" style="padding:4px">Genel bilgilendirmedir, tıbbi tavsiye değildir. Ağrın varsa bir uzmana danış.</p>' +
        '</article>';
    }
    return ust(geri(hesap ? '#/profil' : '#/'), '<span class="alt">Topluluk</span>') + '<h1 class="baslik">Rehber<span class="nokta">.</span></h1>' + sek +
      '<p class="ik" style="padding:2px 4px 8px;max-width:56ch">Her kas grubu için kısa ve net: nasıl çalışır, haftada kaç set, en sık hatalar.</p>' +
      '<div class="izgara">' + RB.R.map((x, i) => '<a class="t rh-kart' + (i === 0 ? ' kobalt' : i === 6 ? ' limon' : '') + '" href="#/topluluk/rehber/' + x.id + '"><span class="k">' + x.sure + ' okuma</span><b>' + esc(x.ad) + '</b><span class="rh-kisa">' + esc(x.ozet) + '</span></a>').join('') + '</div>';
  }
  function ekranTopluluk(alt, id) {
    if (alt === 'rehber') return ekranRehber(id);
    if (!S.profil) return ekranKarsilama();
    if (!hesap) return ust(geri('#/profil')) + '<div class="t"><b>Topluluğa katılmak için giriş yap.</b></div>';
    const sekmeler = '<div class="yatay">' + [['forum', 'Forum'], ['meydan', 'Meydan okuma']].map((x) => '<a class="hap" href="#/topluluk' + (x[0] === 'meydan' ? '/meydan' : '') + '" aria-pressed="' + ((alt === 'meydan' || alt === 'meydan-yeni') === (x[0] === 'meydan')) + '" style="text-decoration:none">' + x[1] + '</a>').join('') + '<a class="hap" href="#/topluluk/rehber" aria-pressed="false" style="text-decoration:none">Rehber</a></div>';
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
      '<div class="t genis"><span class="k">Ne yarışıyoruz?</span><div class="haplar">' + MTUR.filter((x) => x[0] !== 'seri').map((x, i) => '<button type="button" class="hap" data-act="hap" data-grup="mtur" data-deger="' + x[0] + '" aria-pressed="' + (i === 0) + '">' + x[1] + '</button>').join('') + '</div></div>' +
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
  function mesajAkis() {
    const L = tp.mesaj.liste; const sonBen = L.map((x) => x.ben).lastIndexOf(true);
    return L.length ? L.map((x, i) => '<div class="koc-balon ' + (x.ben ? 'ben' : 'koc') + '">' + esc(x.metin).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline">bağlantıyı aç</a>') + '<span class="mesaj-zaman">' + zamanOnce(x.zaman) + (x.ben && i === sonBen ? (x.okundu ? ' · Görüldü' : ' · Gönderildi') : '') + '</span></div>').join('') : bosEkran('Henüz mesaj yok', 'İlk mesajı sen yaz. Sorun, ağrın, sorduğun her şey burada kalır.');
  }
  // açık yazışmayı 5 sn'de bir sessizce yeniler; yazılan metne dokunmaz
  let mesajZaman = null;
  function mesajIzle() {
    clearInterval(mesajZaman);
    mesajZaman = setInterval(async () => {
      if (location.hash.indexOf('#/mesaj/') !== 0) { clearInterval(mesajZaman); mesajZaman = null; return; }
      if (document.hidden || !tp.mesaj || tp.mesaj.hata || tp.yuk) return;
      try {
        const id = tp.mesajId; const r = await tistek('mesaj/' + encodeURIComponent(id));
        if (!r.ok || tp.mesajId !== id || !tp.mesaj) return;
        const eski = tp.mesaj.liste; const yeni = r.j.liste;
        const fark = eski.length !== yeni.length || (yeni.length && (eski[eski.length - 1].id !== yeni[yeni.length - 1].id || eski[eski.length - 1].okundu !== yeni[yeni.length - 1].okundu));
        tp.mesaj = r.j; if (!fark) return;
        const a = document.getElementById('kocAkis'); if (!a) return;
        const altta = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 160;
        a.innerHTML = mesajAkis(); if (altta) kocKaydir();
      } catch (e) { /* çevrimdışı */ }
    }, 5000);
  }
  function ekranMesaj(id) {
    if (!hesap) { location.hash = '#/'; return ''; }
    if (!tp.mesaj || tp.mesajId !== id) { tp.mesaj = null; tpYukle('mesaj', id); return ust(geri('#/mesajlar')) + '<p class="ik" style="padding:20px 4px">Yükleniyor…</p>'; }
    if (tp.mesaj.hata) return ust(geri('#/mesajlar')) + '<div class="t"><span>' + esc(tp.mesaj.hata) + '</span></div>';
    const k = tp.mesaj.karsi;
    if (!mesajZaman) mesajIzle();
    return ust(geri('#/mesajlar'), k.hoca ? '' : '<a class="btn cerceve kucuk" href="#/hoca/' + encodeURIComponent(id) + '" style="min-height:40px">Öğrenci sayfası</a>') +
      '<div class="mesaj-ust">' + avatar(k.ad, k.id || id, k.foto, 'orta') + '<div class="yigin" style="min-width:0"><h1 class="baslik" style="padding:0;margin:0">' + esc(k.ad) + '<span class="nokta">.</span></h1><span class="ik">' + (k.hoca ? 'Hocan' : 'Öğrencin') + '</span></div></div>' +
      '<p class="ik" style="padding:0 4px">' + (k.hoca ? 'Form videosu için videonu Drive ya da Instagram bağlantısı olarak gönderebilirsin.' : 'Öğrencinin programına ve antrenmanlarına "Öğrenci sayfası"ndan bakabilirsin.') + '</p>' +
      '<div class="koc-akis" id="kocAkis" aria-live="polite">' + mesajAkis() + '</div>' +
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
      son_antrenmanlar: son,
      antrenman_sonu_notlari: hisler(30).slice(0, 6).map((x) => ({ tarih: x.tarih, ad: x.ad, zorluk: x.zorluk ? ZORLUK[x.zorluk - 1] : '', iyi_hissettigi: x.iyi, agri: x.agri, not: x.not })),
      takviyeler: (S.takviye || []).map((x) => x.ad + (x.doz ? ' ' + x.doz : ''))
    };
  }
  const KOCLAR = [
    ['kararli', 'Arnold', 'Kararlı ve motive edici', 'Büyük hedef koydurur, disiplini ve istikrarı öne çıkarır.'],
    ['kuzey', 'Ronnie', 'Enerjik ve coşkulu', 'Gaz verir, şakalaşır, her seti kutlar; bilgi yine net.'],
    ['ece', 'Chris', 'Sakin ve destekleyici', 'Sabırlı, küçük adımları takdir eder, sakatlıkta temkinli.'],
    ['atlas', 'Jay', 'Bilimsel', 'Nedenini anlatır, set, tekrar ve sayılarla konuşur.'],
    ['demir', 'Dorian', 'Sert ve net', 'Lafı dolandırmaz, bahaneye yer vermez, seni zorlar.']
  ];
  (function () { const eski = { Demir: 'Dorian', Ece: 'Chris', Atlas: 'Jay', Kuzey: 'Ronnie' }; if (S.kocSec && eski[S.kocSec.ad]) S.kocSec.ad = eski[S.kocSec.ad]; })();
  let kocSecAcik = false; let kocTaslak = null;
  const kocAdi = () => (S.kocSec ? S.kocSec.ad : 'Koç');
  // koçun adıyla Türkçe ekler: Arnold'a, Ronnie'nin; koç seçilmediyse Koça, Koçun
  function sonUnlu(ad) { const m = String(ad).toLocaleLowerCase('tr').match(/[aeıioöuü](?=[^aeıioöuü]*$)/); return m ? m[0] : 'e'; }
  const unluBiter = (ad) => /[aeıioöuü]$/i.test(ad);
  function adaYonelme(ad) { if (!S.kocSec) return 'Koça'; const u = sonUnlu(ad); return ad + "'" + (unluBiter(ad) ? 'y' : '') + ('aıou'.indexOf(u) >= 0 ? 'a' : 'e'); }
  function adIlgi(ad) { if (!S.kocSec) return 'Koçun'; const u = sonUnlu(ad); const e = 'aı'.indexOf(u) >= 0 ? 'ın' : 'ou'.indexOf(u) >= 0 ? 'un' : 'öü'.indexOf(u) >= 0 ? 'ün' : 'in'; return ad + "'" + (unluBiter(ad) ? 'n' : '') + e; }
  function kocSecici() {
    const t = kocTaslak || S.kocSec || { tarz: 'kararli', ad: 'Arnold' };
    return '<div class="t genis koc-sec" style="gap:12px"><span class="k">Koçunu seç</span>' +
      '<div class="koc-liste">' + KOCLAR.map((k) => '<button type="button" class="koc-kart" data-act="koc-tarz" data-tarz="' + k[0] + '" aria-pressed="' + (t.tarz === k[0]) + '"><b>' + k[1] + '</b><span class="koc-tarz">' + k[2] + '</span><span class="ik">' + k[3] + '</span></button>').join('') + '</div>' +
      '<label class="mini koc-ad"><span>İstersen kendi koyduğun bir isim</span><input id="kocAd" maxlength="20" value="' + esc(t.ad) + '" placeholder="Koçunun adı" autocomplete="off"></label>' +
      '<button class="btn ana" data-act="koc-kaydet">Bu koçla devam et' + IK.ok + '</button></div>';
  }
  function ekranKoc() {
    if (!S.profil) return ekranKarsilama();
    if (!S.kocSec || kocSecAcik) {
      return ust(geri('#/'), '<span class="alt">Koç</span>') +
        '<h1 class="baslik">Koçun kim olsun<span class="nokta">?</span></h1>' +
        '<p class="ik" style="font-size:15px;line-height:1.5;margin:0">Hepsi aynı bilgiyle, senin programına ve kayıtlarına göre cevap verir. Fark konuşma tarzında. İstediğin zaman değiştirebilirsin.</p>' +
        kocSecici();
    }
    const l = S.koc || [];
    const bicim = (t) => esc(t).replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•]\s+/gm, '• ').replace(/^#+\s*/gm, '').replace(/\n/g, '<br>');
    const balon = (m) => '<div class="koc-balon ' + (m.rol === 'koc' ? 'koc' : 'ben') + '">' + (m.rol === 'koc' ? bicim(m.metin) : esc(m.metin).replace(/\n/g, '<br>')) + '</div>' + (m.rol === 'koc' && !m.uyari ? aiOy('koc', 'k' + kisaKimlik(m.metin), m.metin) : '');
    const kk = KOCLAR.find((k) => k[0] === S.kocSec.tarz) || KOCLAR[0];
    return ust(geri('#/'), '<button class="metin-btn kucuk-metin" data-act="koc-degis">Koçunu değiştir</button>') +
      '<h1 class="baslik">Koç ' + esc(kocAdi()) + '<span class="nokta">.</span></h1>' +
      '<span class="ik" style="margin-top:-6px">' + kk[2] + '</span>' +
      '<div class="t koyu" style="gap:6px"><span style="font-size:15px;line-height:1.5">Sakatlık, ağrı, yorgunluk, program ya da beslenme: aklına takılanı yaz. Programını ve son antrenmanlarını bilerek cevap verir.</span><span class="ik" style="color:var(--koyu-ikincil)">Doktor değildir, teşhis koymaz. Göğüs ağrısı, nefes darlığı, bayılma gibi durumlarda antrenmanı bırak ve 112\'yi ara.</span></div>' +
      (kocAcil ? '<div class="koc-acil" role="alert"><b>Bu belirti acil olabilir.</b> Antrenmanı hemen bırak. Kendini iyi hissetmiyorsan <a href="tel:112">112\'yi ara</a> ya da en yakın acile git.</div>' : '') +
      '<div class="koc-akis" id="kocAkis" aria-live="polite">' + (l.length ? l.map(balon).join('') : '<div class="haplar">' + KOC_HIZLI.map((q) => '<button class="hap" data-act="koc-hizli" data-metin="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>') +
      (kocYuk ? '<div class="koc-balon koc yaziyor" aria-label="Koç yazıyor"><i></i><i></i><i></i></div>' : '') + '</div>' +
      '<form data-form="koc" class="koc-yaz" novalidate><label class="gizli" for="kocMetin">Koça mesajın</label><textarea id="kocMetin" name="metin" rows="1" maxlength="1200" placeholder="Örnek: Squat yaparken dizimin içi ağrıdı." ' + (kocYuk ? 'disabled' : '') + '></textarea><button class="btn ana" type="submit" aria-label="Gönder" ' + (kocYuk ? 'disabled' : '') + '>' + IK.ok + '</button></form>' +
      (l.length ? '<button class="metin-btn" data-act="koc-temizle" style="align-self:center;color:var(--ikincil)">Sohbeti temizle</button>' : '');
  }
  async function kocGonder(metin) {
    metin = String(metin || '').trim(); if (!metin || kocYuk) return;
    if (!hesap) { toast('Koçla konuşmak için giriş yap.'); return; }
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
  /* ---------- ortak antrenman (jam) ---------- */
  let jamGecmisSec = null;
  function jamKaydet() {
    // jam'in son halini cihazda sakla (geçmiş jam'ler)
    if (!S.jam || !jamV || !jamV.uyeler) return;
    S.jamGecmis = (S.jamGecmis || []).filter((g) => g.kod !== S.jam.kod).concat([{ kod: S.jam.kod, ad: jamV.ad || 'Jam', tarih: new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }), uyeler: jamV.uyeler.map((x) => ({ ad: x.ad, ben: x.ben, durum: x.durum })) }]).slice(-12);
  }
  let jamV = null; let jamKodGir = ''; let jamYuk = false; let jamZaman = null; let jamPaylas = true;
  async function jamCek() {
    if (!S.jam) return;
    try { const r = await tistek('jam/' + S.jam.kod); if (r.ok) { jamV = r.j; jamDinlenmeUygula(); if (S.sonSeans && S.sonSeans.jam === S.jam.kod) jamKaydet(); } else if (r.j && /süresi doldu|yok/.test(r.j.hata || '')) { S.jam = null; jamV = null; kaydet(); } } catch (e) { /* çevrimdışı */ }
    const h = location.hash; if (h.indexOf('#/bitti') === 0) { const sY = window.scrollY; render(); window.scrollTo(0, sY); return; }
    if (h.indexOf('#/jam') === 0 || (S.seans && (h === '#/' || h === '' || h.indexOf('#/antrenman') === 0))) jamCiz();
  }
  function jamCiz() { const e = document.getElementById('jamSerit'); if (e) e.outerHTML = jamSerit(); else if (location.hash.indexOf('#/jam') === 0) { const sY = window.scrollY; render(); window.scrollTo(0, sY); } }
  function jamDurumGonder(bitti, ozet) {
    if (!S.jam || !S.seans && !bitti) return Promise.resolve();
    let hareket = '', set = 0, toplam = 0, hacim = 0;
    if (S.seans) {
      const hl = seansHareket(S.seans); const ks = seansAnahtar({ hareketler: hl });
      hl.forEach((x, i) => { const l = S.seans.setler[ks[i]] || []; set += l.filter(setSayilir).length; toplam += l.filter((y) => y.tur !== 'isinma').length; l.filter(setSayilir).forEach((y) => { hacim += (oku(y.kg) || 0) * (parseInt(y.tekrar, 10) || 0); }); if (!hareket && l.some((y) => !y.ok && !y.atla)) hareket = (D.HAREKET[x.id] || { ad: x.id }).ad; });
    }
    const v = { hareket, set, toplam, hacim: Math.round(hacim), dinlenme: dinlenme && !bitti ? Math.max(0, Math.round((dinlenme.bitis - Date.now()) / 1000)) : 0, bitti: !!bitti };
    if (ozet) Object.assign(v, ozet);
    return tistek('jam/' + S.jam.kod + '/durum', 'POST', v).catch(() => {});
  }
  // ortak dinlenme
  let jamSonDinlenme = 0;
  function jamOrtakMi() { return !!(S.jam && jamV && jamV.ortak); }
  function jamDinlen(sn, iptal) {
    if (!jamOrtakMi() || !S.seans) return;
    tistek('jam/' + S.jam.kod + '/dinlen', 'POST', iptal ? { iptal: true } : { sn, toplam: dinlenme ? dinlenme.toplam : sn }).then((r) => { if (r.ok && r.j.id) { jamSonDinlenme = r.j.id; if (dinlenme && !iptal) dinlenme.id = r.j.id; } }).catch(() => {});
  }
  function jamDinlenmeUygula() {
    const d = jamV && jamV.ortak && jamV.dinlenme; if (!d || !S.seans) return;
    if (d.id === jamSonDinlenme) return;
    const ilk = !jamSonDinlenme; jamSonDinlenme = d.id;
    if (d.kalan > 1) {
      const hedef = Date.now() + d.kalan * 1000;
      if (!dinlenme || Math.abs(dinlenme.bitis - hedef) > 2500) { dinlenmeBaslat(d.kalan, { id: d.id, toplam: d.sn || d.kalan }); if (!ilk || d.kalan > 5) toast(d.kim + ' seti bitirdi · dinlenme ' + d.kalan + ' sn'); }
    } else if (!ilk && dinlenme && dinlenme.bitis - Date.now() > 2000) { dinlenme = null; dinlenmeCiz(); toast(d.kim + ' dinlenmeyi bitirdi. Sıra sende.'); }
  }
  function jamTablo(uyeler, baslik) {
    const l = (uyeler || []).slice().sort((a, b) => (b.durum.hacim || 0) - (a.durum.hacim || 0) || (b.durum.set || 0) - (a.durum.set || 0));
    if (!l.length) return '';
    const enCok = (f) => { const m = Math.max.apply(null, l.map((x) => x.durum[f] || 0)); return m > 0 ? m : -1; };
    const mH = enCok('hacim'), mS = enCok('set'), mR = enCok('rekor');
    return '<div class="t genis jam-tablo"><div class="satir"><span class="k">' + (baslik || 'Jam sıralaması') + '</span><span class="ik">' + l.filter((x) => x.durum.bitti).length + '/' + l.length + ' bitirdi</span></div><div class="liste sira-liste">' +
      l.map((x, i) => '<div class="' + (x.ben ? 'ben' : '') + '"><span class="sira-no num' + (i < 3 && (x.durum.hacim || 0) > 0 ? ' ust' + (i + 1) : '') + '">' + (i + 1) + '</span>' + avatar(x.ad, x.fid, x.fv, 'kucuk') + '<div class="ad"><b>' + esc(x.ad) + (x.ben ? ' · sen' : '') + '</b><span class="ik num">' + (x.durum.set || 0) + ' set' + (x.durum.sure ? ' · ' + x.durum.sure + ' dk' : '') + (x.durum.rekor ? ' · ' + x.durum.rekor + ' rekor' : '') + (x.durum.bitti ? '' : ' · devam ediyor') + '</span>' +
        '<span class="jam-rozetler">' + ((x.durum.hacim || 0) === mH ? '<i>En çok kaldıran</i>' : '') + ((x.durum.set || 0) === mS && l.length > 1 ? '<i>En çok set</i>' : '') + ((x.durum.rekor || 0) === mR ? '<i>Rekor avcısı</i>' : '') + '</span></div><b class="num">' + sayi(x.durum.hacim || 0) + ' kg</b></div>').join('') + '</div></div>';
  }
  let jamSayac = 0;
  function jamBaslatZaman() { if (jamZaman) return; jamZaman = setInterval(() => { if (!S.jam) { clearInterval(jamZaman); jamZaman = null; return; } if (document.visibilityState !== 'visible') return; jamSayac++; const hizli = S.seans && jamOrtakMi(); if (hizli || jamSayac % 2 === 0) { if (jamSayac % 2 === 0) jamDurumGonder(); jamCek(); } }, 3000); }
  function jamSerit() {
    if (!S.jam) return '';
    const u = (jamV && jamV.uyeler) || [];
    const say = {}; u.forEach((x) => { if (x.durum.hareket && !x.durum.bitti) say[x.durum.hareket] = (say[x.durum.hareket] || 0) + 1; });
    const grup = Object.keys(say).sort((a, b) => say[b] - say[a])[0];
    return '<div id="jamSerit" class="t genis jam-serit"><div class="satir"><span class="k">Jam · ' + esc(S.jam.kod) + ' · ' + u.length + ' kişi' + (jamOrtakMi() ? ' · ortak dinlenme' : '') + '</span><a class="metin-btn kucuk-metin" href="#/jam" style="color:#fff">Aç</a></div>' +
      (grup && u.length > 1 ? '<span style="font-weight:700">Grup şu an: ' + esc(grup) + '</span>' : '') +
      (u.length ? '<div class="jam-uyeler">' + u.map((x) => '<div class="jam-uye' + (x.ben ? ' ben' : '') + '"><b>' + esc(x.ad) + (x.ben ? ' · sen' : '') + '</b><span>' + (x.durum.bitti ? 'Bitirdi' : x.durum.hareket ? esc(x.durum.hareket) + ' · ' + x.durum.set + '/' + x.durum.toplam + ' set' : x.once > 600 ? 'Bağlantı yok' : 'Hazırlanıyor') + (x.durum.dinlenme ? ' · dinleniyor ' + x.durum.dinlenme + ' sn' : '') + '</span></div>').join('') + '</div>' : '<span class="ik" style="color:rgba(255,255,255,.75)">Arkadaşların katılınca burada görünür.</span>') + '</div>';
  }
  function ekranJam() {
    if (!S.profil) return ekranKarsilama();
    if (!hesap) return ust(geri('#/antrenman')) + '<h1 class="baslik">Jam<span class="nokta">.</span></h1><div class="t"><span>Ortak antrenman için giriş yap.</span></div>';
    if (S.jam && !jamV && !jamYuk) { jamYuk = true; jamCek().then(() => { jamYuk = false; }); }
    const bugunku = bugunkuGun();
    if (!S.jam) {
      return ust(geri('#/antrenman'), '<span class="alt">Ortak antrenman</span>') +
        '<h1 class="baslik">Jam<span class="nokta">.</span></h1>' +
        '<p class="ik" style="font-size:15px;line-height:1.5;margin:0">Arkadaşınla aynı anda antrenman yap: kim hangi harekette, kaçıncı sette, dinleniyor mu, canlı gör. İstersen bugünkü antrenmanını paylaş, o da aynısını yapsın.</p>' +
        '<div class="izgara">' +
        '<div class="t kobalt genis" style="gap:10px"><span class="k">Jam başlat</span>' +
        (bugunku ? '<label class="se-kalici" style="color:#fff"><input type="checkbox" data-act="jam-paylas"' + (jamPaylas ? ' checked' : '') + '> Bugünkü antrenmanımı (' + esc(bugunku.ad) + ') paylaş</label>' : '') +
        '<button class="btn" data-act="jam-olustur" style="background:#fff;color:var(--kobalt);align-self:flex-start"' + (jamYuk ? ' disabled' : '') + '>Kod oluştur</button></div>' +
        ((S.jamGecmis || []).length ? '<div class="t genis" style="gap:4px;padding-bottom:6px"><span class="k">Geçmiş Jam\'ler</span><div class="liste">' + S.jamGecmis.slice().reverse().map((g, i) => { const l = g.uyeler.slice().sort((a, b) => (b.durum.hacim || 0) - (a.durum.hacim || 0)); const sira = l.findIndex((x) => x.ben) + 1; return '<button class="gd-satir" data-act="jam-gecmis" data-i="' + (S.jamGecmis.length - 1 - i) + '"><div class="ad"><b>' + esc(g.ad) + ' · ' + esc(g.tarih) + '</b><span class="ik">' + l.length + ' kişi · ' + (sira ? sira + '. oldun' : '') + ' · birinci ' + esc(l[0] ? l[0].ad : '') + '</span></div></button>'; }).join('') + '</div></div>' : '') +
        (jamGecmisSec != null && S.jamGecmis && S.jamGecmis[jamGecmisSec] ? jamTablo(S.jamGecmis[jamGecmisSec].uyeler, esc(S.jamGecmis[jamGecmisSec].ad) + ' · ' + esc(S.jamGecmis[jamGecmisSec].tarih)) : '') +
        '<div class="t genis" style="gap:10px"><span class="k">Arkadaşının koduna katıl</span><div class="kadi-alan"><input id="jamKod" data-in="jam-kod" value="' + esc(jamKodGir) + '" maxlength="5" autocapitalize="characters" autocomplete="off" placeholder="ABC12" aria-label="Jam kodu" style="font-size:22px;letter-spacing:.12em;text-transform:uppercase"><button class="btn ana kucuk" data-act="jam-katil">Katıl</button></div></div>' +
        '</div>';
    }
    const V = jamV; const prog = V && V.program;
    return ust(geri('#/antrenman'), '<span class="alt">Ortak antrenman</span>') +
      '<h1 class="baslik">Jam<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t genis jam-kod"><span class="k">Kod · arkadaşına gönder</span><b class="num">' + esc(S.jam.kod) + '</b><div class="haplar"><button class="btn siyah kucuk" data-act="jam-kopya">Kodu kopyala</button></div><span class="ik" style="color:#3E4410">4 saat açık kalır · en fazla 8 kişi</span></div>' +
      (!S.seans && prog && prog.hareketler && prog.hareketler.length ? '<div class="t genis" style="gap:8px"><span class="k">Paylaşılan antrenman · ' + esc(prog.ad || '') + '</span><div class="liste">' + prog.hareketler.map((x) => '<div><div class="ad"><b>' + esc((D.HAREKET[x.id] || { ad: x.id }).ad) + '</b></div><span class="num" style="font-weight:800;font-size:14px">' + x.set + ' × ' + esc(x.tekrar) + '</span></div>').join('') + '</div>' +
        (!S.seans ? '<button class="btn ana buyuk-btn" data-act="jam-basla">Bu antrenmanı birlikte yap' + IK.ok + '</button>' : '') + '</div>' : '') +
      jamSerit() +
      (V ? '<label class="t genis ayar-satir jam-ortak"><span class="yigin"><span class="k">Ortak dinlenme</span><b>Biri seti bitirince herkesin sayacı birlikte başlasın</b><span class="ik">' + (V.sahip ? 'Aynı antrenmanı birlikte yapıyorsanız açık kalsın.' : 'Bunu Jam\'i açan kişi değiştirebilir.') + '</span></span><input type="checkbox" data-act="jam-ortak"' + (V.ortak ? ' checked' : '') + (V.sahip ? '' : ' disabled') + ' aria-label="Ortak dinlenme"></label>' : '') +
      (V && V.uyeler && V.uyeler.some((x) => (x.durum.hacim || 0) > 0) ? jamTablo(V.uyeler) : '') +
      (!S.seans && bugunku ? '<button class="btn genis ' + (prog ? 'cerceve' : 'ana') + '" data-act="basla" data-id="' + bugunku.id + '">Kendi antrenmanımı (' + esc(bugunku.ad) + ') başlat</button>' : '') +
      (S.seans ? '<a class="btn ana" href="#/antrenman">Antrenmana dön</a>' : '') +
      '<button class="metin-btn genis" data-act="jam-ayril" style="color:var(--ikincil)">' + (V && V.sahip ? 'Jam\'i kapat' : 'Jam\'den ayrıl') + '</button>' +
      '</div>';
  }

  /* ---------- beslenme programı ---------- */
  let bpTaslak = { gun: 3, ogun: 4, not: '' }; let bpYuk = false; let bpSec = null;
  function bpBugunIdx() { const b = S.bplan; if (!b) return 0; const fark = Math.floor((new Date(tarihKey()) - new Date(b.baslangic)) / 864e5); return ((fark % b.gunler.length) + b.gunler.length) % b.gunler.length; }
  function bpKalem(x) { const y = D.YEMEK.find((z) => z.ad === x.ad); if (!y) return null; const f = x.g / 100; return { ad: y.ad, g: x.g, k: y.k * f, p: y.p * f, kh: y.kh * f, y: y.y * f, birim: y.birim, pg: y.g }; }
  function bpOgunToplam(o) { return o.kalemler.map(bpKalem).filter(Boolean).reduce((a, x) => ({ k: a.k + x.k, p: a.p + x.p, kh: a.kh + x.kh, y: a.y + x.y }), { k: 0, p: 0, kh: 0, y: 0 }); }
  const bpMiktar = (x) => { const m = /^(\d+)\s+(.+)$/.exec(x.birim || ''); if (m && x.pg) { const n = Math.round((x.g / (x.pg / +m[1])) * 2) / 2; if (n > 0 && n <= 12 && Math.abs(n * (x.pg / +m[1]) - x.g) < x.g * 0.15) return String(n).replace('.5', '½').replace(/^0½/, '½') + ' ' + m[2] + ' · ' + x.g + ' g'; } return x.g + ' g'; };
  function bplanKutu(g) {
    const b = S.bplan;
    if (!b) return '<a class="t genis bp-kutu" href="#/bplan" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="yigin"><span class="k">Beslenme programı</span><b>Hedefine göre öğün planı hazırlayalım</b></span>' + IK.ok.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>';
    const i = bpBugunIdx(); const d = b.gunler[i]; const yap = (g.bplan || {});
    const n = d.ogunler.filter((o, j) => yap[j]).length;
    return '<div class="t genis bp-kutu"><div class="satir"><span class="k">Bugünkü planın · Gün ' + (i + 1) + ' · ' + n + '/' + d.ogunler.length + ' öğün</span><a class="metin-btn kucuk-metin" href="#/bplan">Tümü</a></div>' +
      d.ogunler.map((o, j) => { const t = bpOgunToplam(o); return '<div class="bp-ogun' + (yap[j] ? ' yapildi' : '') + '"><div class="yigin"><b>' + OGUN_AD[o.ogun] + ' · ' + sayi(t.k) + ' kcal</b><span class="ik">' + o.kalemler.map((x) => esc(x.ad)).join(', ') + '</span></div>' + (yap[j] ? '<button class="metin-btn kucuk-metin" data-act="bp-geri" data-j="' + j + '" style="color:var(--ikincil)">Geri al</button>' : '<button class="btn ana kucuk" data-act="bp-ye" data-j="' + j + '">Yedim</button>') + '</div>'; }).join('') + '</div>';
  }
  function ekranBplan() {
    if (!S.profil) return ekranKarsilama();
    const h = S.hedef; const b = S.bplan;
    const form = '<div class="t genis" style="gap:12px"><span class="k">' + (b ? 'Yeni program hazırla' : 'Programını hazırlayalım') + '</span>' +
      '<div class="yigin"><span class="ik">Kaç günlük döngü?</span><div class="haplar">' + [3, 5, 7].map((n) => '<button class="hap" data-act="bp-sec" data-tur="gun" data-deger="' + n + '" aria-pressed="' + (bpTaslak.gun === n) + '">' + n + ' gün</button>').join('') + '</div></div>' +
      '<div class="yigin"><span class="ik">Günde kaç öğün?</span><div class="haplar">' + [3, 4, 5].map((n) => '<button class="hap" data-act="bp-sec" data-tur="ogun" data-deger="' + n + '" aria-pressed="' + (bpTaslak.ogun === n) + '">' + n + ' öğün</button>').join('') + '</div></div>' +
      '<label class="alan"><span class="ik">Tercihlerin · isteğe bağlı</span><textarea data-in="bp-not" rows="3" maxlength="600" placeholder="Ör. Balık sevmem, kahvaltıda yumurta olsun, öğlen iş yerinde dışarıda yiyorum, bütçe dostu olsun.">' + esc(bpTaslak.not) + '</textarea></label>' +
      '<button class="btn ana" data-act="bp-hazirla"' + (bpYuk ? ' disabled' : '') + '>' + (bpYuk ? 'Hazırlanıyor… (20 sn kadar)' : b ? 'Yeniden hazırla' : 'Programımı hazırla') + IK.ok + '</button>' +
      '<span class="ik">Günlük ' + sayi(h.kcal) + ' kcal ve ' + h.protein + ' g protein hedefine göre, listemizdeki yemeklerle hazırlanır. Hedefini <a href="#/hedef" style="color:var(--kobalt);font-weight:700">buradan</a> değiştirebilirsin.</span></div>';
    if (!b) return ust(geri('#/beslenme'), '<span class="alt">Beslenme programı</span>') + '<h1 class="baslik">Beslenme programı<span class="nokta">.</span></h1><div class="izgara">' + form + '<p class="not genis">Genel bilgidir; bir hastalığın, alerjin ya da özel bir diyetin varsa bir diyetisyene danış.</p></div>';
    const bi = bpBugunIdx(); const si = bpSec == null ? bi : bpSec; const d = b.gunler[si];
    const gt = d.ogunler.map(bpOgunToplam).reduce((a, x) => ({ k: a.k + x.k, p: a.p + x.p, kh: a.kh + x.kh, y: a.y + x.y }), { k: 0, p: 0, kh: 0, y: 0 });
    const son7 = []; for (let i = 0; i < 7; i++) { const dd = new Date(); dd.setDate(dd.getDate() - i); const k = tarihKey(dd); if (k >= b.baslangic) son7.push(k); }
    const uyum = son7.length ? son7.reduce((a, k) => { const yap = (S.gunluk[k] && S.gunluk[k].bplan) || {}; return a + Object.keys(yap).length; }, 0) / (son7.length * d.ogunler.length) : 0;
    return ust(geri('#/beslenme'), '<span class="alt">Beslenme programı</span>') +
      '<h1 class="baslik">' + esc(b.ad) + '<span class="nokta">.</span></h1>' +
      (b.not ? '<p class="ik" style="font-size:15px;line-height:1.5;margin:0">' + esc(b.not) + '</p>' : '') +
      '<div class="izgara">' +
      '<div class="t h130"><span class="k">Gün ' + (si + 1) + ' toplamı</span><span class="orta num">' + sayi(gt.k) + '</span><span class="k num">kcal · hedef ' + sayi(h.kcal) + '</span></div>' +
      '<div class="t koyu h130"><span class="k">Son 7 gün uyum</span><span class="orta num">%' + Math.round(uyum * 100) + '</span><span class="k" style="color:var(--koyu-ikincil)">"Yedim" dediğin öğünler</span></div>' +
      '<div class="t genis num bp-makro"><span>Protein <b style="color:var(--kobalt)">' + sayi(gt.p) + ' / ' + h.protein + ' g</b></span><span>Karb. <b>' + sayi(gt.kh) + ' g</b></span><span>Yağ <b>' + sayi(gt.y) + ' g</b></span></div>' +
      '<div class="yatay genis" role="tablist" aria-label="Günler">' + b.gunler.map((x, i) => '<button class="hap" data-act="bp-gun" data-i="' + i + '" aria-pressed="' + (i === si) + '">Gün ' + (i + 1) + (i === bi ? ' · bugün' : '') + '</button>').join('') + '</div>' +
      d.ogunler.map((o, j) => { const t = bpOgunToplam(o); const yap = si === bi && ((gun().bplan || {})[j]); return '<div class="t genis bp-ogun-kart"><div class="satir"><span class="k">' + OGUN_AD[o.ogun] + ' · ' + sayi(t.k) + ' kcal · P ' + sayi(t.p) + ' g</span>' + (si === bi ? (yap ? '<span class="ik">Yedin ✓</span>' : '<button class="btn ana kucuk" data-act="bp-ye" data-j="' + j + '">Yedim</button>') : '') + '</div><div class="liste">' + o.kalemler.map(bpKalem).filter(Boolean).map((x) => '<div><div class="ad"><b>' + esc(x.ad) + '</b><span class="ik num">' + esc(bpMiktar(x)) + '</span></div><span class="num" style="font-weight:800">' + sayi(x.k) + ' kcal</span></div>').join('') + '</div></div>'; }).join('') +
      aiOy('bplan', 'b' + kisaKimlik(b.baslangic + b.ad), b.ad + ' · ' + b.gunler.length + ' gün') +
      '<p class="ik genis">"Yedim" deyince o öğündeki her şey günlüğüne eklenir; farklı yediysen günlükten düzeltebilirsin. Program her ' + b.gunler.length + ' günde bir başa döner.</p>' +
      form +
      '<button class="metin-btn genis" data-act="bp-sil" style="color:var(--ikincil)">Programı kaldır</button>' +
      '</div>';
  }
  async function bpHazirla() {
    if (!hesap) { toast('Bunun için giriş yap.'); return; }
    const h = S.hedef;
    // Türkçe kullanan için dünya mutfağı listeye girmez (liste kısa ve isabetli kalsın); başka dilde kullanan hepsini görür
    const dunyaDa = !/^tr/i.test(navigator.language || 'tr') || /pasta|sushi|burrito|taco|curry|köri|ramen|meksika|italyan|japon|hint/i.test(bpTaslak.not || '');
    const yemekler = D.YEMEK.filter((y) => dunyaDa || y.kat !== 'dunya').map((y) => [y.ad, Math.round(y.k), Math.round(y.p * 10) / 10, Math.round(y.kh * 10) / 10, Math.round(y.y * 10) / 10, y.g]);
    bpYuk = true; render();
    try {
      const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'bplan', gun: bpTaslak.gun, ogun: bpTaslak.ogun, not: bpTaslak.not, hedef: { kcal: h.kcal, protein: h.protein, karb: h.karb, yag: h.yag, amac: S.profil.hedef }, yemekler }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(j.gunler)) toast(j.hata || 'Program hazırlanamadı.');
      else {
        // her günü kalori hedefine oranla (±%15 içinde) ölçekle, gramları 5'e yuvarla
        j.gunler.forEach((d) => { const t = d.ogunler.reduce((a2, o) => a2 + bpOgunToplam(o).k, 0); if (!t) return; const f = Math.max(0.85, Math.min(1.15, h.kcal / t)); d.ogunler.forEach((o) => o.kalemler.forEach((x) => { x.g = Math.max(5, Math.round((x.g * f) / 5) * 5); })); });
        S.bplan = { ad: j.ad, not: j.not, gunler: j.gunler, baslangic: tarihKey(), ogun: bpTaslak.ogun }; bpSec = null; olay('bplan'); kaydet(true); toast('Beslenme programın hazır.'); }
    } catch (e) { toast('Bağlantı kurulamadı.'); }
    bpYuk = false; render(); window.scrollTo(0, 0);
  }

  /* ---------- yapay zekâ cevabına oy ---------- */
  // anahtar: cevabı tanımlayan kısa kimlik; S.aiOy[anahtar] = 1 | -1
  function aiOy(tur, anahtar, ornek, koyu) {
    const v = (S.aiOy || {})[anahtar] || 0;
    const ik = (yon) => '<svg viewBox="0 0 24 24" aria-hidden="true"' + (yon < 0 ? ' style="transform:rotate(180deg)"' : '') + '><path d="M7 10v10H4V10zM7 10l4-7c1.4 0 2.3 1 2 2.4L12.4 9H18a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7"/></svg>';
    return '<div class="ai-oy' + (koyu ? ' koyu' : '') + '"><span>' + (v ? (v > 0 ? 'Teşekkürler!' : 'Teşekkürler, iyileştireceğiz.') : 'Yararlı mıydı?') + '</span>' +
      '<button data-act="ai-oy" data-tur="' + tur + '" data-anahtar="' + esc(anahtar) + '" data-oy="1" data-ornek="' + esc(String(ornek || '').slice(0, 300)) + '" aria-pressed="' + (v > 0) + '" aria-label="Yararlı">' + ik(1) + '</button>' +
      '<button data-act="ai-oy" data-tur="' + tur + '" data-anahtar="' + esc(anahtar) + '" data-oy="-1" data-ornek="' + esc(String(ornek || '').slice(0, 300)) + '" aria-pressed="' + (v < 0) + '" aria-label="Yararlı değil">' + ik(-1) + '</button></div>';
  }
  const kisaKimlik = (t) => { let h = 0; const s0 = String(t || ''); for (let i = 0; i < s0.length; i++) h = (h * 31 + s0.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  /* ---------- anlat, yapay zekâ kursun ---------- */
  let pAnlat = ''; let pAnlatYuk = false; let pAnlatOtomatik = false; let pAnlatNot = '';
  function anlatKutu(pr) {
    const bos = !pr.gunler.some((g) => g.hareketler.length);
    return '<details class="t genis anlat"' + (bos || pAnlatYuk || pAnlatNot ? ' open' : '') + '><summary><span class="yigin"><span class="k">Koçun kursun</span><b style="font-size:18px">Nasıl bir program istediğini anlat, biz kuralım</b></span></summary>' +
      (pAnlatNot ? '<div class="uyari" style="margin-top:10px">' + esc(pAnlatNot) + '</div>' + aiOy('kur', 'p' + kisaKimlik(pAnlatNot + pAnlat), pAnlat + ' → ' + pAnlatNot) : '') +
      '<label class="alan" style="margin-top:10px"><span class="gizli">İsteğin</span><textarea id="pdAnlat" data-in="pd-anlat" rows="4" maxlength="1200" placeholder="Ör. Haftada 4 gün, itiş-çekiş-bacak. Omuzlarım geri kalmış, onlara biraz daha ağırlık ver. Antrenman en fazla 1 saat sürsün, deadlift sevmiyorum.">' + esc(pAnlat) + '</textarea></label>' +
      '<button class="btn ana" data-act="pd-kur"' + (pAnlatYuk ? ' disabled' : '') + '>' + (pAnlatYuk ? 'Programın kuruluyor…' : (bos ? 'Programımı kur' : 'Bu isteğe göre baştan kur')) + IK.ok + '</button>' +
      '<span class="ik">Ortamına ve sakatlıklarına uygun hareketlerden kurar. Sonra istediğin gibi düzenleyip kaydedersin.' + (bos ? '' : ' Şu anki taslağın yerine geçer.') + '</span></details>';
  }
  async function programKur() {
    const metin = (pAnlat || '').trim(); if (metin.length < 8) { toast('Nasıl bir program istediğini biraz anlat.'); const t = document.getElementById('pdAnlat'); if (t) t.focus(); return; }
    if (!hesap) { toast('Bunun için giriş yap.'); return; }
    const p = pProfil() || {}; const ekip = K.ORTAM[p.ortam] ? K.ORTAM[p.ortam].ekipman : null; const sak = p.sakatlik || [];
    const bolgeAd = (h) => (PBOLGE.find((b) => b[2].indexOf(h.kalip) >= 0) || ['', 'Diğer'])[1];
    const katalog = Object.keys(K.HAREKET).map((id) => K.HAREKET[id]).filter((h) => (!ekip || h.ekipman.every((e) => ekip.indexOf(e) >= 0)) && !sak.some((b) => (h.kontra || []).indexOf(b) >= 0))
      .map((h) => [h.id, h.ad, bolgeAd(h), h.ekipman.map((e) => K.EKIPMAN[e]).join('+')]);
    const profil = { cinsiyet: p.cinsiyet === 'k' ? 'kadın' : 'erkek', yas: p.yas, hedef: p.hedef, deneyim: p.deneyim, ortam: p.ortam, gun: p.gun, spor: p.spor, sakatlik: sak.map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]) };
    pAnlatYuk = true; pAnlatNot = ''; render();
    try {
      const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'kur', metin, profil, katalog }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !Array.isArray(j.gunler)) { toast(j.hata || 'Program kurulamadı.'); }
      else {
        const gunler = []; const kul = {};
        j.gunler.forEach((d) => { let h = d.hafta; while (kul[h]) h = (h + 1) % 7; kul[h] = 1; gunler.push({ id: 'ozel-' + kimlik(), gid: 'ozel', bolge: 'ozel', ad: d.ad, hafta: h, hareketler: d.hareketler.map((x) => { const o = M.ozelHareket(p, x.id); if (!o) return null; o.set = x.set; const tc = M.tekrarCoz(x.tekrar, o.birim); if (tc) Object.assign(o, tc); return o; }).filter(Boolean) }); });
        gunler.sort((a, b) => a.hafta - b.hafta);
        ptaslak = { ad: j.ad, ozel: true, gunler };
        pAnlatNot = j.aciklama ? j.aciklama + ' Göz at, istediğin gibi değiştir, sonra "Programı kaydet"e bas.' : 'Taslak hazır. Göz at, istediğin gibi değiştir, sonra "Programı kaydet"e bas.';
        olay('program_kur'); toast('Taslak hazır.');
      }
    } catch (e) { toast('Bağlantı kurulamadı.'); }
    pAnlatYuk = false; render();
  }

  /* ---------- antrenman sonu geri bildirimi ---------- */
  const KAS_GRUP = { gogus: 'Göğüs', sirt_kanat: 'Sırt', sirt_orta: 'Sırt', trapez: 'Sırt', bel: 'Sırt', omuz_on: 'Omuz', omuz_yan: 'Omuz', omuz_arka: 'Omuz', biceps: 'Kol', triceps: 'Kol', onkol: 'Kol', on_bacak: 'Bacak', arka_bacak: 'Bacak', adduktor: 'Bacak', baldir: 'Bacak', kalca: 'Kalça', kalca_yan: 'Kalça', karin: 'Karın', yan_karin: 'Karın' };
  const ZORLUK = ['Çok kolaydı', 'Kolaydı', 'Tam kıvamında', 'Zordu', 'Çok zordu'];
  function hisler(gunSay) {
    const sinir = tarihKey(new Date(Date.now() - (gunSay || 60) * 864e5));
    return Object.keys(S.gunluk).filter((k) => k >= sinir && S.gunluk[k].antrenman && S.gunluk[k].antrenman.fb).sort().reverse()
      .map((k) => { const a = S.gunluk[k].antrenman; return { tarih: k, ad: a.ad, kaslar: a.kaslar || [], zorluk: a.fb.zor, iyi: a.fb.iyi || [], agri: a.fb.agri || [], not: a.fb.not || '' }; });
  }
  function hisOneriler(gunSay) {
    const l = hisler(gunSay); if (l.length < 3) return [];
    const o = [];
    const z = l.filter((x) => x.zorluk).map((x) => x.zorluk); const ort = z.length ? z.reduce((a, b) => a + b, 0) / z.length : 3;
    if (z.length >= 3 && ort >= 4.3) o.push('Antrenmanların çoğu "çok zor" geçiyor. Birkaç hareketin set sayısını bir azalt ya da yükü %5-10 düşür; toparlanman hızlanır.');
    if (z.length >= 3 && ort <= 1.7) o.push('Antrenmanlar kolay geliyor. Kiloları biraz artırmanın ya da büyük hareketlere bir set eklemenin zamanı.');
    const agri = {}; l.forEach((x) => x.agri.forEach((b) => { agri[b] = (agri[b] || 0) + 1; }));
    Object.keys(agri).filter((b) => agri[b] >= 2).forEach((b) => {
      const ad = (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1];
      const zorlayan = S.program ? [].concat.apply([], S.program.gunler.map((g) => g.hareketler)).filter((x) => K.HAREKET[x.id] && (K.HAREKET[x.id].kontra || []).indexOf(b) >= 0).map((x) => D.HAREKET[x.id].ad) : [];
      o.push('Son ' + l.length + ' antrenmanın ' + agri[b] + '\'inde ' + ad.toLocaleLowerCase('tr') + ' ağrısı yazdın.' + (zorlayan.length ? ' Bu bölgeyi zorlayan hareketlerin: ' + Array.from(new Set(zorlayan)).slice(0, 3).join(', ') + '. Bunları değiştirmeyi düşün.' : '') + ' Ağrı sürerse bir uzmana görün.');
    });
    const calis = {}, iyi = {}; l.forEach((x) => { x.kaslar.forEach((g) => { calis[g] = (calis[g] || 0) + 1; }); x.iyi.forEach((g) => { iyi[g] = (iyi[g] || 0) + 1; }); });
    Object.keys(calis).filter((g) => calis[g] >= 3 && (iyi[g] || 0) / calis[g] < 0.25).slice(0, 2).forEach((g) => {
      let oneri = '';
      if (S.program) {
        const x = [].concat.apply([], S.program.gunler.map((d) => d.hareketler)).find((y) => K.HAREKET[y.id] && K.HAREKET[y.id].birincil.some((m) => KAS_GRUP[m] === g));
        if (x) { const a = M.alternatifler(S.profil, x, [])[0]; if (a && D.HAREKET[a]) oneri = ' ' + D.HAREKET[x.id].ad + ' yerine ' + D.HAREKET[a].ad + ' deneyebilirsin.'; }
      }
      o.push(g + ' çalıştığın günlerde o bölgeyi pek hissetmediğini yazıyorsun.' + oneri + ' Hareketi yavaşlatmak ve tepe noktada bir saniye durmak da işe yarar.');
    });
    return o;
  }
  function hisOneriKutu(gunSay) {
    const o = hisOneriler(gunSay); if (!o.length) return '';
    return '<div class="t genis his-oneri"><span class="k">Antrenman notlarına göre</span><ul>' + o.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul></div>';
  }
  let fbTaslak = null;
  function ekranBitti() {
    const b = S.sonSeans; if (!b) { location.hash = '#/'; return ''; }
    const t = fbTaslak || (fbTaslak = { zor: 0, iyi: [], agri: [], not: '' });
    const hap = (grup, deger, ad, secili) => '<button type="button" class="hap" data-act="fb" data-grup="' + grup + '" data-deger="' + esc(deger) + '" aria-pressed="' + secili + '">' + esc(ad) + '</button>';
    const soz = b.rekor ? (b.rekor === 1 ? 'Bir yeni rekor. Dün yapamadığını bugün yaptın.' : b.rekor + ' yeni rekor. Dün yapamadığını bugün yaptın.') : b.kisa ? 'Zor bir günde bile geldin. En önemli antrenman buydu.' : b.donus ? 'Uzun bir aradan sonra geri döndün. En zor set buydu.' : 'Kimse görmese de bu setler sayıldı.';
    return ust('', '<span class="alt">Antrenman bitti</span>') +
      '<h1 class="baslik">Bugün de geldin<span class="nokta">.</span></h1>' +
      '<p class="bitti-soz">' + soz + '</p>' +
      '<div class="izgara">' +
      '<div class="t kobalt h130"><span class="k">' + esc(b.ad) + '</span><span class="orta num">' + b.set + ' set</span><span class="k num">' + sayi(b.hacim) + ' kg · ' + b.dk + ' dk' + (b.rekor ? ' · ' + b.rekor + ' rekor' : '') + '</span></div>' +
      '<div class="t koyu h130"><span class="k">Nasıl geçti?</span><b style="font-size:17px;line-height:1.35">Söyle, programını buna göre ayarlayalım</b><span class="ik" style="color:var(--koyu-ikincil)">30 saniye sürer</span></div>' +
      (b.jam && jamV && jamV.uyeler ? jamTablo(jamV.uyeler) + '<button class="metin-btn genis" data-act="jam-yenile">Sıralamayı yenile</button>' : '') +
      '<div class="t genis fb-kutu"><span class="k">Zorluk</span><div class="haplar">' + ZORLUK.map((z, i) => hap('zor', i + 1, z, t.zor === i + 1)).join('') + '</div></div>' +
      (b.kaslar.length ? '<div class="t genis fb-kutu"><span class="k">Hangi kasları iyi hissettin?</span><div class="haplar">' + b.kaslar.map((g) => hap('iyi', g, g, t.iyi.indexOf(g) >= 0)).join('') + '</div></div>' : '') +
      '<div class="t genis fb-kutu"><span class="k">Bir yerin ağrıdı ya da rahatsız etti mi?</span><div class="haplar">' + hap('agri', 'yok', 'Hayır, her şey yolunda', !t.agri.length && t.agriYok) + K.SAKATLIK.map((x) => hap('agri', x[0], x[1], t.agri.indexOf(x[0]) >= 0)).join('') + '</div>' +
      (t.agri.length ? '<span class="ik">Ağrı keskinse, şişlik ya da uyuşma varsa o bölgeyi dinlendir ve bir uzmana görün. <a href="#/koc" style="color:var(--kobalt);font-weight:700">Koça danış</a></span>' : '') + '</div>' +
      '<label class="t genis alan"><span>Eklemek istediğin bir şey · isteğe bağlı</span><input id="fbNot" data-in="fb-not" maxlength="200" value="' + esc(t.not) + '" placeholder="Ör. Squat\'ta formum bozuldu, uykusuzdum." style="font-size:17px"></label>' +
      '<button class="btn ana buyuk-btn genis" data-act="fb-kaydet">Kaydet' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn genis" data-act="fb-gec" style="color:var(--ikincil)">Şimdi değil</button>' +
      '</div>';
  }

  /* ---------- takviyeler ---------- */
  const TAKVIYE_HAZIR = [['Kreatin', '5 g'], ['Sitrülin', ''], ['Whey protein', '1 ölçek (30 g)'], ['D vitamini', ''], ['Omega-3', ''], ['Magnezyum', ''], ['Multivitamin', ''], ['Çinko', ''], ['B12 vitamini', ''], ['Kafein', ''], ['Beta-alanin', ''], ['Elektrolit', '']];
  const TK_BIRIM = ['g', 'mg', 'mcg', 'IU', 'kapsül', 'tablet', 'ölçek', 'damla', 'ml', 'adet'];
  let tkDuzen = null;
  const tkDozAyir = (d) => { const m = /^\s*([\d.,]+)\s*(.*)$/.exec(d || ''); return m ? [m[1], m[2] || 'g'] : ['', 'g']; };
  function tkForm(x) {
    const dz = tkDozAyir(x && x.doz);
    return '<form class="tk-form" data-form="takviye" novalidate>' + (x ? '<input type="hidden" name="id" value="' + x.id + '">' : '') +
      '<label class="mini"><span>Adı</span><input name="ad" maxlength="40" required value="' + esc(x ? x.ad : '') + '" placeholder="Ör. L-karnitin"></label>' +
      '<div class="tk-doz"><label class="mini"><span>Miktar</span><input name="miktar" inputmode="decimal" value="' + esc(dz[0]) + '" placeholder="5"></label>' +
      '<label class="mini"><span>Birim</span><select name="birim">' + TK_BIRIM.map((b) => '<option' + (b === dz[1] ? ' selected' : '') + '>' + b + '</option>').join('') + '</select></label></div>' +
      '<label class="mini"><span>Ne zaman</span><select name="zaman"><option value="">Fark etmez</option>' + TAKVIYE_ZAMAN.map((z) => '<option value="' + z[0] + '"' + (x && x.zaman === z[0] ? ' selected' : '') + '>' + z[1] + '</option>').join('') + '</select></label>' +
      '<div class="haplar"><button class="btn ana kucuk" type="submit">' + (x ? 'Kaydet' : 'Listeme ekle') + '</button>' + (x ? '<button type="button" class="btn cerceve kucuk" data-act="tk-duzen" data-id="">Vazgeç</button>' : '') + '</div></form>';
  }
  /* ---------- hatırlatıcılar: su, takviye, antrenman (Web Push; isteyen açar, istediği an kapatır) ---------- */
  const HAT_VAR = { su: false, suAralik: 120, suBas: '09:00', suBit: '21:00', takviye: false, sabah: '08:30', ogle: '13:00', aksam: '20:00', antrenman: false, antrenmanSaat: '18:00' };
  const hatAyar = () => Object.assign({}, HAT_VAR, (S.ayar || {}).hat || {});
  const pushVar = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const iosTarayici = () => iosMu() && !(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches);
  const saatEkle = (hhmm, dk) => { const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '18:00'); const t = ((+m[1] * 60 + +m[2] + dk) % 1440 + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  function hatPlan() {
    const a = hatAyar(); const p = { tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul'), takviye: [] };
    // önümüzdeki 14 günün planlı antrenmanları (haftalık plan + takvim değişiklikleri)
    const gunler = {}; for (let i = 0; i < 14; i++) { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + i); const g = gunIcin(d); const k = tarihKey(d); if (g && !(S.gunluk[k] && S.gunluk[k].antrenman)) gunler[k] = g.ad; }
    if (a.su) p.su = { bas: a.suBas, bit: a.suBit, aralik: a.suAralik };
    if (a.antrenman && Object.keys(gunler).length) p.antrenman = { saat: a.antrenmanSaat, gunler };
    if (a.takviye) (S.takviye || []).forEach((t) => {
      const z = t.zaman || 'sabah';
      if (z === 'once' || z === 'sonra') { if (Object.keys(gunler).length) p.takviye.push({ ad: t.ad, saat: saatEkle(a.antrenmanSaat, z === 'once' ? -30 : 90), gunler: Object.keys(gunler) }); }
      else p.takviye.push({ ad: t.ad, saat: a[z] || a.sabah });
    });
    return p;
  }
  const hatAcikMi = () => { const a = hatAyar(); return a.su || a.takviye || a.antrenman; };
  function b64uDiz(s) { const p = '='.repeat((4 - (s.length % 4)) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); }
  let hatZ = null; let hatSon = ''; let hatDurum = '';
  async function hatAbonelik(olustur) {
    const reg = await navigator.serviceWorker.ready; let ab = await reg.pushManager.getSubscription();
    if (!ab && olustur) {
      const k = await fetch('/api/comeback/hatirlat/anahtar', { credentials: 'same-origin' }).then((x) => x.json());
      ab = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDiz(k.anahtar) });
    }
    return ab;
  }
  async function hatEsitle(zorla) {
    if (!pushVar() || !hesap || hesap.rol === 'demo') return;
    try {
      if (!hatAcikMi()) { const ab = await hatAbonelik(false); if (ab) { await fetch('/api/comeback/hatirlat/cik', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uc: ab.endpoint }) }); await ab.unsubscribe(); } hatSon = ''; return; }
      if (Notification.permission !== 'granted') return;
      const plan = hatPlan(); const ab = await hatAbonelik(true); const imza = ab.endpoint + JSON.stringify(plan);
      if (!zorla && imza === hatSon) return;
      const r = await fetch('/api/comeback/hatirlat/abone', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ abonelik: ab.toJSON(), plan }) });
      if (r.ok) { hatSon = imza; hatDurum = ''; } else hatDurum = 'Hatırlatıcılar kaydedilemedi. Biraz sonra tekrar denenecek.';
    } catch (e) { hatDurum = 'Bu cihaz bildirimleri desteklemiyor ya da izin kapalı.'; }
  }
  const hatPlanla = () => { clearTimeout(hatZ); hatZ = setTimeout(() => hatEsitle(false), 4000); };
  function hatSatir(tur, baslik, alt) { const a = hatAyar(); return '<button class="ayar-satir" data-act="hat-ac" data-tur="' + tur + '" aria-pressed="' + !!a[tur] + '" style="background:none;padding:12px 0;border-top:1px solid var(--zemin)"><span class="yigin" style="min-width:0"><b>' + baslik + '</b><span class="ik">' + alt + '</span></span><span class="anahtar" aria-hidden="true"><i></i></span></button>'; }
  const hatSaat = (alan, deger, etiket) => '<label class="mini hat-saat"><span>' + etiket + '</span><input type="time" data-hat="' + alan + '" value="' + esc(deger) + '" step="300"></label>';
  function hatirlatKutu() {
    const a = hatAyar();
    if (!pushVar()) return '<div class="t genis" style="gap:6px"><span class="k">Hatırlatıcılar</span><span class="ik">' + (iosMu() ? 'iPhone\'da hatırlatıcılar için COMEBACK.\'ı ana ekrana ekle (Paylaş → Ana Ekrana Ekle), sonra oradan aç.' : 'Bu tarayıcı bildirimleri desteklemiyor.') + '</span></div>';
    if (!hesap || hesap.rol === 'demo') return '<div class="t genis" style="gap:6px"><span class="k">Hatırlatıcılar</span><span class="ik">Hatırlatıcılar için hesabınla giriş yap.</span></div>';
    const izinYok = Notification.permission === 'denied';
    return '<div class="t genis hat-kutu" style="gap:0"><span class="k" style="padding-bottom:4px">Hatırlatıcılar</span>' +
      '<span class="ik" style="padding-bottom:8px">İstediğini aç, istediğin an kapat. Uygulama kapalıyken de gelir.</span>' +
      (izinYok ? '<span class="hata" style="padding:8px 0">Bildirim izni kapalı. Telefonun ayarlarından COMEBACK. için bildirimlere izin ver.</span>' : '') +
      hatSatir('su', 'Su', 'Gün içinde belli aralıklarla bir bardak su.') +
      (a.su ? '<div class="hat-ayar"><div class="haplar">' + [[60, 'Saatte bir'], [120, '2 saatte bir'], [180, '3 saatte bir']].map((x) => '<button class="hap" data-act="hat-aralik" data-deger="' + x[0] + '" aria-pressed="' + (a.suAralik === x[0]) + '">' + x[1] + '</button>').join('') + '</div><div class="hat-saatler">' + hatSaat('suBas', a.suBas, 'Başlangıç') + hatSaat('suBit', a.suBit, 'Bitiş') + '</div></div>' : '') +
      hatSatir('takviye', 'Takviye', (S.takviye || []).length ? 'Listendeki ' + S.takviye.length + ' takviye, seçtiğin zamanda.' : 'Önce takviye listeni oluştur.') +
      (a.takviye ? '<div class="hat-ayar"><div class="hat-saatler">' + hatSaat('sabah', a.sabah, 'Sabah') + hatSaat('ogle', a.ogle, 'Öğle') + hatSaat('aksam', a.aksam, 'Akşam') + '</div><span class="ik">Antrenman öncesi olanlar antrenmandan 30 dk önce, sonrası olanlar 1,5 saat sonra gelir.</span>' + ((S.takviye || []).length ? '' : '<a class="metin-btn" href="#/takviye" style="color:var(--kobalt);padding:6px 0">Takviyelerimi ekle →</a>') + '</div>' : '') +
      hatSatir('antrenman', 'Antrenman', 'Yalnızca planladığın günlerde.') +
      (a.antrenman ? '<div class="hat-ayar"><div class="hat-saatler">' + hatSaat('antrenmanSaat', a.antrenmanSaat, 'Saat') + '</div></div>' : '') +
      (hatAcikMi() && Notification.permission === 'granted' ? '<button class="metin-btn" data-act="hat-dene" style="color:var(--kobalt);padding:12px 0 2px;text-align:left">Deneme bildirimi gönder</button>' : '') +
      (hatDurum ? '<span class="ik" style="padding-top:6px">' + esc(hatDurum) + '</span>' : '') + '</div>';
  }
  const TAKVIYE_ZAMAN = [['sabah', 'Sabah'], ['ogle', 'Öğle'], ['aksam', 'Akşam'], ['once', 'Antrenman öncesi'], ['sonra', 'Antrenman sonrası']];
  function takviyeKutu(g) {
    const l = S.takviye || [];
    if (!l.length) return '<a class="t genis takviye-kutu" href="#/takviye" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="yigin"><span class="k">Takviyeler</span><b>Kreatin, vitamin, sitrülin… takip et</b></span>' + IK.ok.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>';
    const al = (g.takviye || {}); const n = l.filter((x) => al[x.id]).length;
    return '<div class="t genis takviye-kutu"><div class="satir"><span class="k">Takviyeler · ' + n + ' / ' + l.length + '</span><a class="metin-btn kucuk-metin" href="#/takviye">Düzenle</a></div><div class="haplar">' +
      l.map((x) => '<button class="hap takviye' + (al[x.id] ? ' alindi' : '') + '" data-act="tk-al" data-id="' + x.id + '" aria-pressed="' + !!al[x.id] + '">' + (al[x.id] ? IK.tik.replace('<svg', '<svg width="14" height="14" style="fill:none;stroke:currentColor;stroke-width:3"') : '') + esc(x.ad) + (x.doz ? ' · ' + esc(x.doz) : '') + '</button>').join('') + '</div></div>';
  }
  function ekranTakviye() {
    if (!S.profil) return ekranKarsilama();
    const l = S.takviye || []; const g = gun();
    const ayGun = Object.keys(S.gunluk).filter((k) => k >= tarihKey(new Date(Date.now() - 29 * 864e5)));
    return ust(geri('#/beslenme'), '<span class="alt">Takviye takibi</span>') +
      '<h1 class="baslik">Takviyeler<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      (l.length ? '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Listem · bugün işaretle</span><div class="liste">' + l.map((x) => {
        const say = ayGun.filter((k) => S.gunluk[k].takviye && S.gunluk[k].takviye[x.id]).length;
        if (tkDuzen === x.id) return '<div class="tk-duzen-satir">' + tkForm(x) + '</div>';
        return '<div><button class="tk-tik" data-act="tk-al" data-id="' + x.id + '" aria-pressed="' + !!((g.takviye || {})[x.id]) + '" aria-label="' + esc(x.ad) + ' bugün alındı">' + IK.tik + '</button><div class="ad"><b>' + esc(x.ad) + '</b><span class="ik num">' + [x.doz, (TAKVIYE_ZAMAN.find((z) => z[0] === x.zaman) || ['', ''])[1], 'son 30 günde ' + say + ' gün'].filter(Boolean).join(' · ') + '</span></div><button class="metin-btn kucuk-metin" data-act="tk-duzen" data-id="' + x.id + '">Düzenle</button><button class="sil" data-act="tk-sil" data-id="' + x.id + '" aria-label="' + esc(x.ad) + ' listeden çıkar">' + IK.kapat + '</button></div>';
      }).join('') + '</div></div>' : '<div class="t genis bos" style="align-items:flex-start"><b>Henüz takviye eklemedin.</b><span class="ik">Aşağıdan seç ya da kendin yaz. Her gün aldığında işaretlersin.</span></div>') +
      '<div class="t genis"><span class="k">Hızlı ekle</span><div class="haplar">' + TAKVIYE_HAZIR.filter((h) => !l.some((x) => x.ad === h[0])).map((h) => '<button class="hap" data-act="tk-hazir" data-ad="' + esc(h[0]) + '" data-doz="' + esc(h[1]) + '">+ ' + esc(h[0]) + '</button>').join('') + '</div></div>' +
      '<div class="t genis" style="gap:10px"><span class="k">Kendin ekle</span>' + tkForm(null) + '</div>' +
      '<p class="not genis">Burası yalnızca takip içindir. Doz ve kullanım için ürün etiketine uy; ilaç kullanıyorsan ya da bir rahatsızlığın varsa önce doktoruna danış.</p>' +
      '</div>';
  }

  /* ---------- rozet tasarımları ---------- */
  const ROZET_IK = {
    bayrak: '<path d="M18 33V15m0 0h11l-2 3.5 2 3.5H18"/>',
    dambil: '<path d="M15 24h18M14 19v10M34 19v10M11 21v6M37 21v6"/>',
    alev: '<path d="M24 34c-4.4 0-7-2.8-7-6.6 0-3.6 2.6-5.6 4-8.4.6 2 1.6 3 2.8 3.4-.2-3 .8-5.8 3.2-8.4.4 3.4 4 5.8 4 10.8 0 5-3 9.2-7 9.2z"/>',
    kupa: '<path d="M18 15h12v5a6 6 0 0 1-12 0zM18 17h-3a3 3 0 0 0 3 5M30 17h3a3 3 0 0 1-3 5M24 26v5M19.5 33h9"/>',
    donus: '<path d="M31.5 20.5A8.5 8.5 0 1 0 32 27M32 15v6h-6"/>',
    takvim: '<rect x="14" y="16" width="20" height="18" rx="3"/><path d="M14 22h20M19 13v5M29 13v5M20 28l2.6 2.4L28 25.5"/>',
    tabak: '<circle cx="25" cy="25" r="8"/><circle cx="25" cy="25" r="4"/><path d="M13 15v6a2 2 0 0 0 2 2v11M15 15v6M17 15v6"/>'
  };
  // Rozet teması: ağırlık plakası. Sayılı rozetlerde sayı plakanın yüzüne basılı, diğerlerinde simge.
  // kademe: 1 limon, 2 kobalt, 3 siyah (zor olanlar)
  const ROZET_GORSEL = {
    ilk: ['bayrak', '', '', 1], a10: ['', '10', 'ANTRENMAN', 1], a25: ['', '25', 'ANTRENMAN', 2], a50: ['', '50', 'ANTRENMAN', 3],
    s7: ['alev', '7', 'GÜN SERİ', 1], s30: ['alev', '30', 'GÜN SERİ', 3], r1: ['kupa', '', '', 1], r10: ['kupa', '10', 'REKOR', 3],
    donus: ['donus', '', '', 2], hafta: ['takvim', '', '', 2], beslenme: ['tabak', '7', 'GÜN ÖĞÜN', 2]
  };
  function rozetSvg(id, acik) {
    const g = ROZET_GORSEL[id] || ['bayrak', '', '', 1];
    // plakanın kenarındaki tutma çentikleri
    let centik = '';
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; const x1 = 32 + Math.cos(a) * 27.5, y1 = 32 + Math.sin(a) * 27.5, x2 = 32 + Math.cos(a) * 30.2, y2 = 32 + Math.sin(a) * 30.2; centik += 'M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1); }
    const ic = g[1]
      ? (g[0] ? '<g class="rz-ik kucuk" transform="translate(24.8 8.2) scale(.3)">' + ROZET_IK[g[0]] + '</g>' : '') +
        '<text class="rz-no" x="32" y="' + (g[0] ? 39.5 : 37.5) + '" text-anchor="middle" font-size="' + (g[1].length > 1 ? 19 : 22) + '">' + g[1] + '</text>' +
        '<text class="rz-alt" x="32" y="' + (g[0] ? 47.5 : 46) + '" text-anchor="middle" font-size="' + (g[2].length > 8 ? 4.6 : 5.2) + '">' + g[2] + '</text>'
      : '<g class="rz-ik" transform="translate(9.6 8.6) scale(.93)">' + ROZET_IK[g[0]] + '</g>';
    return '<svg class="rozet-svg kd' + g[3] + '" viewBox="0 0 64 64" aria-hidden="true"><circle class="rz-kenar" cx="32" cy="32" r="31"/><path class="rz-centik" d="' + centik + '"/><circle class="rz-yuz" cx="32" cy="32" r="25.5"/><circle class="rz-halka" cx="32" cy="32" r="22.5"/>' + ic + '</svg>';
  }

  function ekranProgramDuzen() {
    if (!S.profil && !pHoca) return ekranKarsilama();
    const pr = ptaslakAl();
    const an = M.ozelAnaliz(pr.gunler, pProfil());
    const gunler = pr.gunler.map((g, gi) => {
      const satirlar = g.hareketler.map((x, i) => {
        const h = D.HAREKET[x.id] || { ad: x.id, kas: '' };
        return '<div class="pd-hareket" data-g="' + gi + '" data-i="' + i + '"><div class="pd-bas"><div class="yigin" style="min-width:0"><a class="hareket-ad" href="#/hareket/' + encodeURIComponent(x.id) + '"><b>' + esc(h.ad) + '</b></a><span class="ik">' + esc(h.kas || '') + (x.birim !== 'tekrar' ? ' · ' + BIRIM[x.birim].toLowerCase() : '') + '</span></div>' +
          (g.hareketler.length > 1 ? '<button type="button" class="pd-tut" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(h.ad) + ': tutup sürükle ya da ok tuşlarıyla taşı"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button>' : '') + '</div>' +
          '<div class="pd-kontrol"><div class="pd-sayac" role="group" aria-label="Set sayısı"><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="-1" aria-label="Set azalt">−</button><span class="num">' + x.set + '<small>set</small></span><button type="button" data-act="pd-set" data-g="' + gi + '" data-i="' + i + '" data-yon="1" aria-label="Set artır">+</button></div>' +
          '<label class="pd-tekrar"><span class="gizli">' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '</span><input data-pd="tekrar" data-g="' + gi + '" data-i="' + i + '" value="' + esc(x.tekrar) + '" inputmode="text" maxlength="7" aria-label="' + esc(h.ad) + ' ' + BIRIM[x.birim].toLowerCase() + '"><small>' + BIRIM[x.birim].toLowerCase() + '</small></label>' +
          '<button type="button" class="pd-isinma" data-act="pd-isinma" data-g="' + gi + '" data-i="' + i + '" aria-label="Isınma seti sayısı: ' + (x.isinmaSet || 0) + '. Değiştirmek için dokun">Isınma <b class="num">' + (x.isinmaSet || 0) + '</b></button>' +
          '<div class="pd-is"><button type="button" class="pd-ikon" data-act="pd-sil" data-g="' + gi + '" data-i="' + i + '" aria-label="' + esc(h.ad) + ' çıkar">' + IK.kapat + '</button></div></div></div>';
      }).join('');
      return '<section class="t genis pd-gun" id="pdgun-' + gi + '" aria-label="' + esc(g.ad) + '">' +
        '<div class="satir" style="gap:8px"><input class="pd-gunad" data-pd="gunad" data-g="' + gi + '" value="' + esc(g.ad) + '" maxlength="24" aria-label="Gün adı"><span class="ik num">~' + an.dk[gi] + ' dk</span>' +
        (pr.gunler.length < 7 && g.hareketler.length ? '<button type="button" class="pd-ikon" data-act="pd-gunkopya" data-g="' + gi + '" aria-label="' + esc(g.ad) + ' gününü kopyala" title="Günü kopyala"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A1.5 1.5 0 0 1 6.5 5H15"/></svg></button>' : '') +
        (pr.gunler.length > 1 ? '<button type="button" class="pd-ikon" data-act="pd-gunsil" data-g="' + gi + '" aria-label="' + esc(g.ad) + ' gününü sil">' + IK.kapat + '</button>' : '') + '</div>' +
        '<div class="haplar pd-hafta" role="group" aria-label="Haftanın günü">' + GUN_KISA.map((k, h) => { const dolu = pr.gunler.some((y, yi) => yi !== gi && y.hafta === h); return '<button type="button" class="hap" data-act="pd-hafta" data-g="' + gi + '" data-h="' + h + '" aria-pressed="' + (g.hafta === h) + '"' + (dolu ? ' disabled' : '') + '>' + k + '</button>'; }).join('') + '</div>' +
        (satirlar || '<p class="be-mini" style="padding:6px 0"><b>Bu gün boş.</b> Kütüphaneden hareket ekle; set ve tekrarı sonra ayarlarsın.</p>') +
        '<a class="btn cerceve" href="#/program/ekle/' + gi + '" style="min-height:46px">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Hareket ekle</a></section>';
    }).join('');
    const yorum = pr.yorum ? '<div class="t genis koyu"><span class="k">' + esc(adIlgi(kocAdi())) + ' yorumu</span>' + pr.yorum.ozet.map((x) => '<p style="font-size:15px;line-height:1.5">' + esc(x) + '</p>').join('') +
      (pr.yorum.oneriler && pr.yorum.oneriler.length ? '<ul class="madde" style="color:var(--koyu-yazi)">' + pr.yorum.oneriler.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '<span class="ik" style="color:var(--koyu-ikincil)">Genel bilgidir, tıbbi tavsiye değildir.</span>' + aiOy('yorum', 'y' + kisaKimlik(pr.yorum.ozet.join(' ')), pr.yorum.ozet.join(' '), true) + '</div>' : '';
    return ust(geri(pHoca ? '#/hoca/' + encodeURIComponent(pHoca.id) : S.program && S.program.gunler.some((g) => g.hareketler.length) ? '#/antrenman' : '#/profil'), '<span class="alt">' + (pHoca ? esc(pHoca.ad) + ' için' : pr.ozel ? 'Kendi programın' : 'Programı düzenle') + '</span>') +
      '<h1 class="baslik">' + (pHoca ? esc(pHoca.ad) + '\'in programı' : 'Programın') + '<span class="nokta">.</span></h1>' +
      (pHoca ? '<label class="t genis alan"><span>Öğrencine not · isteğe bağlı</span><input data-pd="not" value="' + esc(pr.hocaNotu || '') + '" maxlength="300" placeholder="İlk hafta yükleri hafif tut." style="font-size:17px"></label>' : '') +
      '<div class="izgara">' +
      (pHoca ? '' : anlatKutu(pr)) +
      (pHoca ? '' : hisOneriKutu(30)) +
      '<label class="t genis alan"><span>Program adı</span><input data-pd="ad" value="' + esc(pr.ad) + '" maxlength="40" style="font-size:22px"></label>' +
      gunler +
      (pr.gunler.length < 7 ? '<button type="button" class="btn cerceve genis" data-act="pd-gunekle">' + IK.arti.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Gün ekle</button>' : '') +
      planHacim({ hacim: an.hacim, hacimHedef: an.hacimHedef }) +
      (an.uyari.length ? '<div class="t genis"><span class="k">Dikkat</span><ul class="madde">' + an.uyari.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul></div>' : '') +
      yorum +
      (pHoca ? '' : '<button type="button" class="btn cerceve genis" data-act="paylas-ac" data-kaynak="taslak">' + IK.ok.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4"') + 'Programı bir arkadaşına gönder</button>') +
      '<button type="button" class="btn siyah genis" data-act="pd-yorum"' + (pYorumYuk ? ' disabled' : '') + '>' + (pYorumYuk ? 'Yorumlanıyor…' : (pr.yorum ? 'Yeniden yorumlat' : esc(adaYonelme(kocAdi())) + ' yorumlat')) + IK.ok + '</button>' +
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
    const gYer = (g && g.ortam) || PP.ortam; const ekip = K.ORTAM[gYer] ? K.ORTAM[gYer].ekipman : null;
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
      '<div class="t h130"><span class="k">Günlük kalori</span><span class="buyuk num">' + sayi(h.kcal) + '</span><span class="k">kcal</span></div>' +
      '<div class="t h130 num"><span class="k">Makrolar</span><div class="satir"><span>Protein</span><b>' + h.protein + ' g</b></div><div class="satir"><span>Karb.</span><b>' + h.karb + ' g</b></div><div class="satir"><span>Yağ</span><b>' + h.yag + ' g</b></div></div>' +
      '<div class="t koyu genis tum num"><span class="k">Nasıl hesapladık</span><span style="font-size:14px;line-height:1.5">Bazal metabolizman ' + sayi(h.bmr) + ' kcal (Mifflin-St Jeor). Haftada ' + p.gun + ' gün antrenmanla günlük harcaman yaklaşık ' + sayi(h.tdee) + ' kcal. Hedefine göre ' + sayi(h.kcal) + ' kcal ayarladık' + (h.haftalikKg ? ' (haftada yaklaşık ' + sayi(Math.abs(h.haftalikKg), 2) + ' kg ' + (h.haftalikKg < 0 ? 'kayıp' : 'artış') + ')' : '') + '. Protein vücut ağırlığının kilosu başına ' + sayi(h.protein / p.kilo, 1) + ' g.</span></div>' +
      planHacim(pr) +
      (pr.notlar && pr.notlar.length ? '<div class="t genis"><span class="k">Senin için notlar</span><ul class="madde">' + pr.notlar.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
      (pr.kurallar ? '<div class="t genis"><span class="k">Antrenman kuralları</span><ul class="madde">' + pr.kurallar.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></div>' : '') +
      (pr.kaynaklar ? '<div class="t genis tum"><span class="k">Dayandığımız kaynaklar</span><ul class="madde kaynak">' + pr.kaynaklar.filter((k) => K.KAYNAK[k]).map((k) => '<li><a href="' + esc(K.KAYNAK[k].url) + '" target="_blank" rel="noopener">' + esc(K.KAYNAK[k].ad) + '</a></li>').join('') + '</ul></div>' : '') +
      '</div>' +
      uyarilar.map((u) => '<div class="uyari">' + esc(u) + '</div>').join('') +
      '<a class="btn cerceve buyuk-btn" href="#/program">' + (pr.ozel ? 'Kendi programımı düzenle' : 'Programı düzenle') + '</a>' +
      '<a class="btn ana buyuk-btn" href="#/">Başlayalım' + IK.ok + '</a>';
  }

  let offAcik = false; let gunDegisAcik = false;
  // önümüzdeki günlerde hangi gün ne var: [{tarih, gun}]
  function yakinGunler(n) { const l = []; for (let i = 1; i <= n; i++) { const d = new Date(); d.setDate(d.getDate() + i); l.push({ d, k: tarihKey(d), gun: gunIcin(d) }); } return l; }
  function zincirVar() { return yakinGunler(7).some((x) => !x.gun); }
  function gunDegisKutu(bugunku) {
    const yakin = yakinGunler(7);
    const l = S.program.gunler.filter((g) => !bugunku || g.id !== bugunku.id);
    return '<div class="t genis off-kutu acik"><div class="satir"><span class="k">Bugün hangisini yapalım?</span><button class="metin-btn kucuk-metin" data-act="gd-ac" style="color:var(--ikincil)">Vazgeç</button></div><div class="gd-liste">' +
      l.map((g) => { const z = yakin.find((x) => x.gun && x.gun.id === g.id); return '<button data-act="gun-degis" data-id="' + g.id + '"><b>' + esc(g.ad) + '</b><span class="ik">' + g.hareketler.length + ' hareket' + (z ? ' · normalde ' + (z.d.getDate() === new Date(Date.now() + 864e5).getDate() ? 'yarın' : GUN_AD[haftaGunu(z.d)]) : '') + '</span></button>'; }).join('') + '</div>' +
      '<span class="ik">' + (bugunku ? esc(bugunku.ad) + ' seçtiğin antrenmanın gününe geçer; yer değiştirirler.' : 'Seçtiğin antrenmanın günü dinlenme olur.') + '</span></div>';
  }
  // ana sayfada tek beslenme kartı: halka, kalan kalori, protein ve fotoğrafla ekleme
  function besKutu(tp, h, kalan) {
    const tamam = hedefTamam(tp.k, h.kcal); const v = Math.round(tamam ? tp.k : Math.abs(kalan));
    return '<div class="t genis bes-kutu' + (tamam ? ' limon' : '') + '"><a class="bes-ana" href="#/beslenme">' + halka(yuzde(tp.k, h.kcal)) +
      '<span class="k">' + (tamam ? 'Hedef tamam' : kalan >= 0 ? 'Kalan kalori' : 'Hedefin üstünde') + '</span>' +
      '<span class="buyuk num" data-say="' + v + '">' + sayi(v) + '</span>' +
      '<span class="bes-alt num"><span>' + sayi(tp.k) + ' / ' + sayi(h.kcal) + ' kcal</span><span class="bes-prot"><b>Protein ' + sayi(tp.p) + '</b> / ' + h.protein + ' g<i class="cubuk" role="img" aria-label="Protein hedefinin yüzde ' + yuzde(tp.p, h.protein) + '\'i"><span style="width:' + yuzde(tp.p, h.protein) + '%"></span></i></span></span></a>' +
      '<a class="bes-foto" href="#/ekle/foto" aria-label="Fotoğrafla öğün ekle">' + IK.kamera.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2"') + '<span>Öğün ekle</span></a></div>';
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
      antr = '<a class="t kobalt genis ana-kutu h150 ' + gunTonu(bugunku) + '" href="#/antrenman" style="min-height:230px"><div class="k satir num"><span>Bugünün antrenmanı' + (bugunku.ortam ? ' · ' + ORTAM_KISA[bugunku.ortam] : '') + '</span><span>' + bugunku.hareketler.length + ' hareket</span></div><span class="dev">' + esc(bugunku.ad) + '<span style="color:var(--koyu)">.</span></span><span class="btn beyaz" style="align-self:flex-start;min-height:44px">Başla' + IK.ok + '</span></a>';
    } else {
      antr = '<a class="t koyu genis ana-kutu h150" href="#/antrenman" style="min-height:190px"><span class="k">' + (offMu() ? 'Bugünü dinlenmeye ayırdın' : 'Bugün dinlenme günü') + '</span><span class="dev">Dinlen<span style="color:var(--mavi-gece)">.</span></span><span class="ik">' + (sonra ? 'Sıradaki: ' + (sonra.kac === 1 ? 'yarın' : GUN_AD[sonra.hafta]) + ' · ' + esc(sonra.gun.ad) : '') + '</span></a>';
      if (offMu()) antr += '<div class="t genis off-kutu"><span class="ik">Fikrini mi değiştirdin?</span><button class="btn cerceve kucuk" data-act="off-geri">Antrenmanı geri getir</button></div>';
    }
    if (!S.seans && !g.antrenman && bugunku && bugunku.hareketler.length) {
      const yarin = new Date(); yarin.setDate(yarin.getDate() + 1);
      const yarinBos = !gunIcin(yarin);
      antr += offAcik
        ? '<div class="t genis off-kutu acik"><span class="k">Bugün Zor</span><span class="ik">Az da olsa gel. ' + esc(bugunku.ad) + ' antrenmanının 20 dakikalık kısa hâli hazır; bir set bile sayılır. Ya da bugünü dinlenmeye ayır, öğünlerini yazmaya devam edersen serin bozulmaz.</span><div class="haplar">' +
          '<button class="btn ana kucuk" data-act="basla" data-id="' + bugunku.id + '" data-kisa="1">Kısa yap · 20 dk</button>' +
          '<button class="btn siyah kucuk" data-act="off" data-tur="dinlen">Bugünü atla, dinleneyim</button>' +
          (yarinBos ? '<button class="btn cerceve kucuk" data-act="off" data-tur="kaydir">Yarına kaydır</button>' : (zincirVar() ? '<button class="btn cerceve kucuk" data-act="off" data-tur="zincir">Programı bir gün kaydır</button>' : '')) +
          '<button class="metin-btn" data-act="off-ac" style="color:var(--ikincil)">Vazgeç</button></div>' +
          (yarinBos ? '' : '<span class="ik">"Programı bir gün kaydır" bugünü ve sonraki antrenmanları ilk boş güne kadar birer gün ileri atar.</span>') + '</div>'
        : '<div class="off-satir"><button class="metin-btn off-btn" data-act="off-ac">Bugün zor</button><button class="metin-btn off-btn" data-act="gd-ac">Başka antrenman</button></div>';
    }
    if (!S.seans && !g.antrenman && S.program && S.program.gunler.length > (bugunku ? 1 : 0)) {
      if (gunDegisAcik) antr += gunDegisKutu(bugunku);
      else if (!bugunku && !offMu()) antr += '<button class="metin-btn off-btn" data-act="gd-ac">Bugün antrenman yapmak istiyorum</button>';
    }
    if (!S.seans && S.takvim && S.takvim[tarihKey()] && S.takvim[tarihKey()].gunId && !S.takvim[tarihKey()].off && !S.takvim[tarihKey()].plan) antr += '<button class="metin-btn off-btn" data-act="off-geri">Asıl programa dön</button>';
    const ara = S.seans ? null : sonAntrenmanAra();
    if (ara != null && ara >= 10 && !g.antrenman && antr.indexOf('Bugünün antrenmanı') >= 0) antr = antr.replace('<span class="btn beyaz"', '<span class="ik" style="color:rgba(255,255,255,.85)">Geri Dönüş Modu: ' + ara + ' gün aradan sonra yükleri biraz hafifletiyoruz. Bıraktığın yerden.</span><span class="btn beyaz"');
    const sa = new Date().getHours();
    const selam = sa < 5 ? 'İyi geceler' : sa < 12 ? 'Günaydın' : sa < 18 ? 'İyi günler' : 'İyi akşamlar';
    return ust(logo, '<span class="alt">' + tarihYazi() + '</span>') +
      '<h1 class="baslik">' + selam + (S.profil.ad ? ', ' + esc(S.profil.ad) : '') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + (dogumGunuMu(S.profil) ? '<div class="t limon genis dg-kart"><span class="k">Bugün senin günün</span><span class="orta">İyi ki doğdun' + (S.profil.ad ? ', ' + esc(S.profil.ad) : '') + '<span class="nokta">.</span></span><span style="font-size:15px;font-weight:600;line-height:1.45">' + S.profil.yas + ' yaşın güçlü geçsin. Bugün antrenman yaparsan rekoru kutlamaya say.</span></div>' : '') + atananBant() + gelenBant() + (haftaPlanKutu(false) || '') + antr + (haftaPlanKutu(false) ? '' : (haftaKart() || sozKutu())) +
      besKutu(tp, h, kalan) +
      '<a class="t koyu h150 seri-kutu" href="#/ilerleme">' + seriKart('Hafta serisi') + '</a>' +
      '<a class="t h150 koc-mini" href="#/koc"><span class="k">' + (S.kocSec ? 'Koç ' + esc(S.kocSec.ad) : 'Koç') + '</span><b class="koc-mini-b">Bir yerin mi ağrıyor?</b><span class="ik">Sor, programına göre cevaplasın.</span></a>' +
      ekleKutu(false) +
      '</div>';
  }

  /* --- antrenman --- */
  let secilenGun = null;
  let degisAcik = null;
  function ekranAntrenman() {
    if (!S.profil) return ekranKarsilama();
    if (S.seans) return ekranSeans();
    const pr = S.program;
    if (!pr.gunler.some((g) => g.hareketler.length)) return ust(logo, '<span class="alt">' + esc(pr.ad) + '</span>') + '<h1 class="baslik">Antrenman<span class="nokta">.</span></h1><div class="t kobalt"><span class="k">Programın boş</span><span style="font-size:18px;font-weight:700;line-height:1.4">Günlerini ve hareketlerini seç, set ve tekrarlarını yaz. İstersen koçun yorumlasın.</span></div><a class="btn ana buyuk-btn" href="#/program">Programımı yaz' + IK.ok + '</a>';
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
        const alt = acik ? M.alternatifler(gunProfil(sg), x, sg.hareketler.map((y) => y.id)) : [];
        return '<div class="hareket-satir' + (acik ? ' acik' : '') + '"><div class="ad"><b>' + esc(D.HAREKET[x.id].ad) + '</b><span class="ik">' + (x.blok && ['ana', 'yard', 'izo'].indexOf(x.blok) < 0 ? BLOK[x.blok] + ' · ' : '') + esc(D.HAREKET[x.id].kas) + (x.not ? ' · ' + esc(x.not) : '') + '</span></div><span class="num" style="font-weight:800;font-size:14px;text-align:right">' + x.set + ' × ' + esc(x.tekrar) + (hk ? '<br><span class="ik" style="font-weight:600">' + sayi(hk, 1) + ' kg</span>' : '') + '</span>' +
          '<button class="degis-btn" data-act="degisac" data-id="' + sg.id + ':' + i + '" aria-expanded="' + acik + '" aria-label="' + esc(D.HAREKET[x.id].ad) + ' yerine başka hareket seç">' + IK.degis + '</button>' +
          (acik ? '<div class="degis-liste"><span class="ik">Bu hareket yoksa ya da yapamıyorsan, aynı kası çalıştıran biriyle değiştir:</span><div class="haplar">' +
            (alt.length ? alt.map((id) => '<button class="hap" data-act="degissec" data-id="' + sg.id + ':' + i + ':' + id + '">' + esc(D.HAREKET[id].ad) + '</button>').join('') : '<span class="ik">Ortamına uygun başka hareket bulunamadı.</span>') +
            '</div></div>' : '') + '</div>';
      }).join('') + '</div></div></div>' +
      (bitti ? '<div class="t limon"><span class="k">Bugün ' + esc(bitti.ad) + ' tamamlandı</span><span style="font-weight:700">İstersen yine de yeni bir antrenman başlatabilirsin.</span></div>' : '') +
      '<button class="btn ana buyuk-btn" data-act="basla" data-id="' + sg.id + '">' + esc(sg.ad) + ' başlat' + IK.ok + '</button>' +
      '<button class="metin-btn zor-btn" data-act="basla" data-id="' + sg.id + '" data-kisa="1">Bugün Zor · 20 dakikalık kısa hâlini yap</button>' +
      '<a class="metin-btn" href="#/program" style="align-self:center;color:var(--murekkep)">' + (pr.ozel ? 'Programımı düzenle' : 'Programı düzenle ya da kendi programını yaz') + '</a>' +
       (hesap ? '<a class="t koyu jam-giris" href="#/jam" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px"><span class="yigin"><span class="k">Jam</span><b>' + (S.jam ? 'Ortak antrenmandasın · ' + esc(S.jam.kod) : 'Arkadaşınla birlikte antrenman yap') + '</b></span>' + IK.ok.replace('<svg', '<svg width="20" height="20" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>' : '') +
      (hesap ? '<button class="metin-btn" data-act="paylas-ac" data-kaynak="program" style="align-self:center;color:var(--kobalt)">Programımı bir arkadaşıma gönder</button>' : '');
  }

  /* ---------- hareket sayfası: her hareketin kendi sayfası (fotoğraf, kaslar, nasıl yapılır, senin geçmişin, benzerleri) ---------- */
  let hareketDonus = '';
  const SEVIYE_AD = { 1: 'Başlangıç', 2: 'Orta', 3: 'İleri' };
  const TIP_AD = { b: 'Çok eklemli', i: 'İzolasyon', s: 'Süreli', p: 'Patlayıcı', k: 'Kardiyo' };
  const KONTRA_AD = { omuz: 'omuz', diz: 'diz', bel: 'bel', dirsek: 'dirsek', bilek: 'bilek', boyun: 'boyun', kalca: 'kalça', ayak: 'ayak bileği' };
  function hareketGrafik(l) {
    const v = l.map((z) => z.e1 || z.kg).filter((x) => x > 0); if (v.length < 2) return '';
    const W = 320, H = 110, P = 8; const mn = Math.min.apply(null, v), mx = Math.max.apply(null, v); const ar = Math.max(1, mx - mn);
    const nk = v.map((x, i) => [P + (i * (W - 2 * P)) / (v.length - 1), H - P - ((x - mn) / ar) * (H - 2 * P)]);
    const yol = nk.map((n, i) => (i ? 'L' : 'M') + n[0].toFixed(1) + ' ' + n[1].toFixed(1)).join(' ');
    const son = nk[nk.length - 1];
    return '<svg class="hs-grafik" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tahmini en iyi tekrar ' + sayi(v[0], 1) + ' kg\'dan ' + sayi(v[v.length - 1], 1) + ' kg\'a"><path d="' + yol + ' L' + son[0].toFixed(1) + ' ' + (H - P) + ' L' + P + ' ' + (H - P) + 'Z" class="alan"/><path d="' + yol + '" class="cizgi"/><circle cx="' + son[0].toFixed(1) + '" cy="' + son[1].toFixed(1) + '" r="4.5" class="uc"/></svg>';
  }
  function ekranHareketSayfa(id) {
    const h = K.HAREKET[id]; const d = D.HAREKET[id];
    if (!h || !d) return ust(geri('#/antrenman')) + '<h1 class="baslik">Hareket bulunamadı<span class="nokta">.</span></h1>';
    const geriYol = hareketDonus || '#/antrenman';
    const gor = hareketGorsel(id) || '<figure class="hs-foto bos" aria-label="Fotoğraf yakında"><span class="hs-foto-ad">' + esc(h.ad) + '<span class="nokta">.</span></span><span class="ik">Doğru duruş fotoğrafı yakında burada.</span></figure>';
    const kas = (l, cls) => l.map((m) => '<span class="hs-kas ' + cls + '">' + esc(K.KAS[m] || m) + '</span>').join('');
    const ek = (h.ekipman || []).map((e) => (K.EKIPMAN || {})[e] || e).join(' · ');
    const son = S.son[id]; const rek = S.rekor[id]; const gec = (S.hgec || {})[id] || [];
    const benzer = Object.keys(K.HAREKET).filter((k) => k !== id && K.HAREKET[k].kalip === h.kalip).slice(0, 6);
    const kontra = (h.kontra || []).filter(Boolean);
    return ust(geri(geriYol), '<span class="alt">' + esc(TIP_AD[h.tip] || 'Hareket') + '</span>') +
      '<h1 class="baslik">' + esc(h.ad) + '<span class="nokta">.</span></h1>' +
      '<div class="izgara hs">' + '<div class="genis hs-gorsel">' + gor + '</div>' +
      '<div class="t genis" style="gap:10px"><span class="k">Çalışan kaslar</span><div class="hs-kaslar">' + kas(h.birincil, 'ana') + kas(h.ikincil, '') + '</div>' +
        '<div class="hs-bilgi num"><div><span class="ik">Ekipman</span><b>' + esc(ek || 'Ekipman yok') + '</b></div><div><span class="ik">Seviye</span><b>' + (SEVIYE_AD[h.seviye] || '—') + '</b></div>' + (h.artis ? '<div><span class="ik">Kilo artışı</span><b>' + sayi(h.artis, 1) + ' kg</b></div>' : '') + '</div></div>' +
      (h.ipucu ? '<div class="t genis kobalt" style="gap:8px"><span class="k">Nasıl yapılır</span><span style="font-size:17px;font-weight:700;line-height:1.45">' + esc(h.ipucu) + '</span></div>' : '') +
      (kontra.length ? '<div class="t genis" style="gap:6px"><span class="k">Dikkat</span><span style="font-size:15px;line-height:1.5">' + esc(kontra.map((k) => KONTRA_AD[k] || k).join(', ')) + ' bölgende ağrı ya da sakatlık varsa hafif kiloyla dene; ağrı olursa bırak ve benzer bir hareket seç.</span></div>' : '') +
      '<div class="t genis" style="gap:10px"><span class="k">Senin kaydın</span>' +
        (son ? '<div class="hs-bilgi num"><div><span class="ik">Son yaptığın</span><b>' + esc(String(son.tarih || '').split('-').reverse().slice(0, 2).join('.')) + ' · ' + son.setler.filter((y) => y.tur !== 'isinma').map((y) => (y.kg ? sayi(y.kg, 1) + '×' : '') + y.tekrar).join(', ') + '</b></div>' + (rek ? '<div><span class="ik">Rekorun</span><b>' + sayi(rek.kg, 1) + ' kg × ' + rek.tekrar + '</b></div>' : '') + '</div>' : '<span class="ik">Bu hareketi henüz kaydetmedin. İlk setinden sonra gelişimin burada görünür.</span>') +
        (gec.length >= 2 ? '<span class="ik" style="margin-top:4px">Tahmini en iyi tekrar · son ' + gec.length + ' antrenman</span>' + hareketGrafik(gec) : '') + '</div>' +
      (benzer.length ? '<div class="t genis" style="gap:4px"><span class="k">Benzer hareketler</span><div class="hs-benzer">' + benzer.map((k) => '<a href="#/hareket/' + encodeURIComponent(k) + '"><b>' + esc(K.HAREKET[k].ad) + '</b><span class="ik">' + esc((K.HAREKET[k].ekipman || []).map((e) => (K.EKIPMAN || {})[e] || e).join(' · ')) + '</span>' + IK.ok + '</a>').join('') + '</div></div>' : '') +
      '</div>';
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

  // seansın hareket listesi: başlarken programdan kopyalanır, değiştirme/atlama yalnızca bugünü etkiler
  const seansHareket = (s) => s.hareketler || ((S.program.gunler.find((g) => g.id === s.gunId) || { hareketler: [] }).hareketler);
  const setEtiket = (l, i) => { const y = l[i]; const ayni = l.slice(0, i + 1).filter((z) => (z.tur || '') === (y.tur || '')).length; return y.tur === 'isinma' ? 'I' + ayni : y.tur === 'drop' ? '↳D' : y.tur === 'ek' ? '+' + ayni : String(ayni); };
  // dinlenme: programın önerdiği süre; kişi bir hareket için değiştirdiyse o hareketin her antrenmanında onu kullan
  const dinOneri = (x) => (x.dinlenme === 0 ? 0 : x.dinlenme || 90);
  const dinOzelMi = (x) => !!(S.ayar && S.ayar.dinOzel && S.ayar.dinOzel[x.id]);
  const dinSn = (x) => (dinOzelMi(x) ? S.ayar.dinOzel[x.id] : dinOneri(x));
  const dakYaz = (sn) => Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
  let dinAcik = null;
  function dinSecici(x, k) {
    const o = dinOneri(x); const su = dinSn(x); const ozel = dinOzelMi(x);
    const sec = [45, 60, 90, 120, 150, 180, 240].filter((v) => v !== o);
    return '<div class="din-panel"><span class="k">Setler arası dinlenme</span><div class="haplar">' +
      '<button class="hap" data-act="din-sec" data-id="' + x.id + '" data-sn="0" aria-pressed="' + !ozel + '">Önerilen · ' + dakYaz(o) + '</button>' +
      sec.map((v) => '<button class="hap" data-act="din-sec" data-id="' + x.id + '" data-sn="' + v + '" aria-pressed="' + (ozel && su === v) + '">' + dakYaz(v) + '</button>').join('') + '</div>' +
      '<span class="ik">Ağır, çok eklemli hareketlerde 2–3 dk; tek eklemli hareketlerde 60–90 sn yeterli. Seçtiğin süre bu hareketin sonraki antrenmanlarında da kalır.</span></div>';
  }
  // takip detayı: yeni başlayana sade, ileri seviyeye her şey. Varsayılan deneyimden gelir, menüden değişir
  const TAKIP = { sade: ['Sade', 'Kilo, tekrar ve tik. Drop set, ısınma seti ekleme ve RIR gizli.'], standart: ['Standart', 'Isınma seti ekleme ve yedekte kalan tekrar (RIR) görünür.'], detayli: ['Detaylı', 'Her şey açık: drop set, ısınma seti, RIR.'] };
  const takipVarsayilan = () => (S.profil && S.profil.deneyim === 'baslangic' ? 'sade' : S.profil && S.profil.deneyim === 'ileri' ? 'detayli' : 'standart');
  const takipSeviye = () => (S.ayar && TAKIP[S.ayar.takip] ? S.ayar.takip : takipVarsayilan());
  const setSayilir = (y) => y.ok && !y.atla && y.tur !== 'isinma';
  // Bugün zor: günün antrenmanının ~20 dakikalık asgari hâli. En önemli 3 hareket, her birinde 2 çalışma seti; geri kalanı bugün atlanır.
  // Kesilen setler ve atlanan hareketler saklanır; "Tam antrenmana dön" hepsini geri getirir.
  const KISA_ONCELIK = { ana: 0, guc: 1, yard: 2, vurgu: 3, izo: 4, odak: 5, core: 6, onleme: 7, kardiyo: 8 };
  function kisalt(s) {
    const hl = seansHareket(s); const ks = seansAnahtar({ hareketler: hl });
    const sira = hl.map((x, i) => i).sort((a, b) => ((KISA_ONCELIK[hl[a].blok] != null ? KISA_ONCELIK[hl[a].blok] : 2) - (KISA_ONCELIK[hl[b].blok] != null ? KISA_ONCELIK[hl[b].blok] : 2)) || a - b);
    const tut = new Set(sira.slice(0, 3)); const ilkTut = sira.slice(0, 3).sort((a, b) => a - b)[0];
    const kayit = { atlanan: [], kesilen: {} };
    hl.forEach((x, i) => {
      const k = ks[i];
      if (!tut.has(i)) { if (!s.atlanan[k]) { s.atlanan[k] = true; kayit.atlanan.push(k); } return; }
      const l = s.setler[k] || []; const isinma = l.filter((y) => y.tur === 'isinma'); const calis = l.filter((y) => y.tur !== 'isinma');
      const isTut = i === ilkTut ? isinma.slice(0, 1) : []; const bas = isinma.slice(isTut.length); const son = calis.slice(2);
      if (!bas.length && !son.length) return;
      s.setler[k] = isTut.concat(calis.slice(0, 2)); kayit.kesilen[k] = { bas, son };
    });
    s.kisa = kayit;
  }
  function kisaGeriAl(s) {
    if (!s || !s.kisa) return;
    s.kisa.atlanan.forEach((k) => { delete s.atlanan[k]; });
    Object.keys(s.kisa.kesilen).forEach((k) => { const l = s.setler[k]; if (!l) return; const c = s.kisa.kesilen[k]; s.setler[k] = c.bas.concat(l).concat(c.son); });
    delete s.kisa;
  }
  let seAcik = null; let degisKalici = false;
  const sureYaz = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); const sa = Math.floor(t / 3600); const dk = Math.floor((t % 3600) / 60); const sn = t % 60; return (sa ? sa + ':' + String(dk).padStart(2, '0') : dk) + ':' + String(sn).padStart(2, '0'); };
  setInterval(() => { const e = document.getElementById('seansSure'); if (e && S.seans) e.textContent = sureYaz(Date.now() - S.seans.baslangic); }, 1000);
  /* ---------- odak: antrenmanda tek hareket ekranı ----------
     Varsayılan görünüm. Üstte hareket adımları, ortada tek hareket; aktif sette büyük kilo/tekrar ayarı ve plaka dökümü.
     Hareket bitince sıradakine kendiliğinden geçer; yana kaydırarak ya da adımlara dokunarak gezilir. */
  const IK_GERIAL = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>';
  const odakMi = () => !(S.ayar && S.ayar.seansGorunum === 'liste');
  function hareketBittiMi(s, k) { const l = s.setler[k] || []; return (s.atlanan && s.atlanan[k]) || (l.length && l.every((y) => y.ok || y.atla)); }
  function odakIdx(s, hl, ks) {
    if (typeof s.odak === 'number' && s.odak >= 0 && s.odak < hl.length) return s.odak;
    const i = ks.findIndex((k) => !hareketBittiMi(s, k)); return i < 0 ? Math.max(0, hl.length - 1) : i;
  }
  function odakAdim(s, hl, ks, oi) {
    return '<nav class="odak-adim" aria-label="Hareketler"><button class="odak-ok" data-act="odak-git" data-i="' + (oi - 1) + '" aria-label="Önceki hareket"' + (oi ? '' : ' disabled') + '>' + IK.geri + '</button>' +
      '<div class="odak-noktalar">' + hl.map((x, i) => '<button class="odak-n' + (i === oi ? ' su' : '') + (hareketBittiMi(s, ks[i]) ? ' bitti' : '') + (s.atlanan && s.atlanan[ks[i]] ? ' atla' : '') + '" data-act="odak-git" data-i="' + i + '" aria-label="' + (i + 1) + '. hareket: ' + esc((D.HAREKET[x.id] || { ad: x.id }).ad) + '"' + (i === oi ? ' aria-current="step"' : '') + '><span class="num">' + (i + 1) + '</span></button>').join('') + '</div>' +
      '<button class="odak-ok ileri" data-act="odak-git" data-i="' + (oi + 1) + '" aria-label="Sonraki hareket"' + (oi < hl.length - 1 ? '' : ' disabled') + '>' + IK.geri + '</button>' +
      '<span class="odak-say num">' + (oi + 1) + ' / ' + hl.length + '</span></nav>';
  }
  // plaka: bar 20 kg, her yana en büyükten küçüğe
  const PLAKA = [25, 20, 15, 10, 5, 2.5, 1.25];
  function plakaHesap(kg) { let yan = (kg - 20) / 2; if (!(yan > 0)) return null; const l = []; PLAKA.forEach((p) => { while (yan >= p - 1e-6) { l.push(p); yan -= p; } }); return { l, kalan: Math.round(yan * 100) / 100 }; }
  function plakaHtml(kg) {
    const p = plakaHesap(kg); if (!p) return kg > 0 && kg <= 20 ? '<div class="plaka ik">Yalnızca bar (20 kg)</div>' : '';
    const boy = { 25: 46, 20: 42, 15: 36, 10: 30, 5: 24, 2.5: 18, 1.25: 14 };
    return '<div class="plaka" aria-label="Her yana ' + p.l.map((x) => sayi(x, 2)).join(' + ') + ' kg"><span class="plaka-bar" aria-hidden="true"></span>' + p.l.map((x) => '<i class="p' + String(x).replace('.', '_') + '" style="height:' + boy[x] + 'px" aria-hidden="true"></i>').join('') +
      '<span class="plaka-yazi num">Bar 20 + her yana ' + p.l.map((x) => sayi(x, 2)).join(' + ') + (p.kalan ? ' · ' + sayi(p.kalan * 2, 2) + ' kg eksik' : '') + '</span></div>';
  }
  function aktifPanel(x, k, i, y, et) {
    const kg = oku(y.kg) || 0; const h = K.HAREKET[x.id] || {}; const barbell = (h.ekipman || []).indexOf('barbell') >= 0;
    const adim = h.artis && h.artis < 2.5 ? h.artis : 2.5;
    return '<div class="aktif-panel" data-h="' + k + '"><span class="k">' + (y.tur === 'isinma' ? 'Isınma seti ' : 'Set ') + esc(et) + '</span>' +
      '<div class="ap-satir"><div class="ap-alan"><button class="ap-btn" data-act="ap-deg" data-h="' + k + '" data-i="' + i + '" data-alan="kg" data-d="-' + adim + '" aria-label="Kiloyu ' + sayi(adim, 2) + ' azalt">−</button><div class="ap-deger"><b class="num" data-ap="kg">' + (kg ? sayi(kg, 2) : '—') + '</b><span>kg</span></div><button class="ap-btn" data-act="ap-deg" data-h="' + k + '" data-i="' + i + '" data-alan="kg" data-d="' + adim + '" aria-label="Kiloyu ' + sayi(adim, 2) + ' artır">+</button></div>' +
      '<div class="ap-alan"><button class="ap-btn" data-act="ap-deg" data-h="' + k + '" data-i="' + i + '" data-alan="tekrar" data-d="-1" aria-label="Tekrarı azalt">−</button><div class="ap-deger"><b class="num" data-ap="tekrar">' + (y.tekrar || x.alt || '—') + '</b><span>tekrar</span></div><button class="ap-btn" data-act="ap-deg" data-h="' + k + '" data-i="' + i + '" data-alan="tekrar" data-d="1" aria-label="Tekrarı artır">+</button></div></div>' +
      (barbell ? plakaHtml(kg) : '') +
      '<button class="btn ana buyuk-btn ap-bitir" data-act="tik" data-h="' + k + '" data-i="' + i + '">Seti bitir' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button></div>';
  }
  /* ---------- tam ekran odak: tek hareket, kaydırma yok ----------
     Ekranı üstten alta kaplar: üstte gün ve süre, hareket adımları, ortada hareket ve setleri, altta büyük kilo/tekrar ve "Seti bitir".
     Isınma, soğuma, set ekleme, hareket değiştirme, liste görünümü ve bitirme "⋯" menüsünde. */
  let odMenu = false; let odIpucu = false;
  function odakSetler(l, k, aktifIdx) {
    return '<div class="od-setler" role="list" aria-label="Setler">' + l.map((y, i) => {
      const et = setEtiket(l, i); const ok = y.ok && !y.atla;
      const sinif = 'od-set' + (i === aktifIdx ? ' su' : '') + (ok ? ' ok' : '') + (y.atla ? ' atla' : '') + (y.tur ? ' ' + y.tur : '');
      const ic = '<span class="od-set-no num">' + et + '</span><span class="od-set-d num">' + (y.atla ? 'atlandı' : (y.kg ? esc(y.kg) : '—') + '×' + (y.tekrar ? esc(y.tekrar) : '—')) + '</span>';
      return ok ? '<button role="listitem" class="' + sinif + '" data-act="tik" data-h="' + k + '" data-i="' + i + '" aria-label="' + et + '. seti düzenle">' + ic + '</button>'
        : y.atla ? '<button role="listitem" class="' + sinif + '" data-act="set-atla" data-h="' + k + '" data-i="' + i + '" aria-label="' + et + '. seti geri al">' + ic + '</button>'
          : '<span role="listitem" class="' + sinif + '">' + ic + '</span>';
    }).join('') + '</div>';
  }
  function odakMenuHtml(s, x, k, hl, l, aktifIdx, sg) {
    const sat = (act, yazi, ek) => '<button class="od-m" data-act="' + act + '"' + (ek || '') + '>' + yazi + '</button>';
    return '<div class="od-perde" data-act="od-menu" aria-hidden="true"></div><div class="od-sayfa" role="dialog" aria-modal="true" aria-label="Antrenman menüsü"><span class="od-tutamak" aria-hidden="true"></span>' +
      (seAcik === k ? seSecenek(x, k, hl) : '') +
      (dinAcik === k ? dinSecici(x, k) : '') +
      '<div class="od-grup"><span class="k">Bu hareket</span>' +
        sat('set-ekle', '+ Set ekle', ' data-h="' + k + '" data-tur="ek"') +
        (takipSeviye() !== 'sade' ? sat('set-ekle', '+ Isınma seti', ' data-h="' + k + '" data-tur="isinma"') : '') +
        (takipSeviye() === 'detayli' ? sat('set-ekle', '+ Drop set', ' data-h="' + k + '" data-tur="drop"') : '') +
        (aktifIdx >= 0 ? sat('set-atla', 'Bu seti atla', ' data-h="' + k + '" data-i="' + aktifIdx + '"') : '') +
        (seAcik === k ? '' : sat('se-ac', 'Değiştir ya da atla', ' data-h="' + k + '"')) +
        (dinOneri(x) && dinAcik !== k ? sat('din-ac', 'Dinlenme süresi · ' + dakYaz(dinSn(x)), ' data-h="' + k + '"') : '') +
      '</div>' +
      '<details class="od-grup"><summary class="od-m">Isınma · ~7 dk</summary>' + rutinListe(ISINMA.genel.concat(ISINMA[gunBolge(sg)])) + '</details>' +
      '<details class="od-grup"><summary class="od-m">Soğuma ve esneme · ~4 dk</summary>' + rutinListe(SOGUMA[gunBolge(sg)]) + '</details>' +
      '<div class="od-grup">' +
        '<a class="od-m" href="#/koc">Bir yerin mi ağrıdı? Koça danış</a>' +
        sat('gorunum', 'Bütün hareketleri liste olarak gör', ' data-deger="liste"') +
        (s.kisa ? sat('kisa-iptal', 'Tam antrenmana dön') : '') +
      '</div>' +
      '<button class="btn siyah buyuk-btn" data-act="bitir">Antrenmanı bitir' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="iptal" style="align-self:center;color:var(--ikincil)">' + (iptalOnay ? 'Emin misin? Kaydetmeden çıkmak için tekrar bas' : 'Kaydetmeden çık') + '</button></div>';
  }
  // görsel yoksa orta alan: büyük set sayacı ve geçen seferki setler
  function odakOrta(x, k, l, aktifIdx, once) {
    const calis = l.filter((y) => y.tur !== 'isinma'); const bitti = calis.filter((y) => y.ok && !y.atla).length;
    const su = aktifIdx >= 0 ? l[aktifIdx] : null;
    const no = su ? (su.tur === 'isinma' ? 'Isınma' : 'Set ' + (calis.indexOf(su) + 1)) : 'Bitti';
    const gecen = once ? once.setler.filter((y) => y.tur !== 'isinma').map((y) => sayi(y.kg, 1) + '×' + y.tekrar) : [];
    return '<div class="od-sayac"><span class="od-sayac-no num">' + no + (su && su.tur !== 'isinma' ? '<i> / ' + calis.length + '</i>' : '') + '</span>' +
      '<span class="od-sayac-cubuk" aria-hidden="true">' + calis.map((y, i) => '<i class="' + (i < bitti ? 'ok' : '') + '"></i>').join('') + '</span>' +
      (gecen.length ? '<span class="od-gecen num">Geçen sefer · ' + gecen.join('  ') + '</span>' : '<span class="od-gecen">İlk kez yapıyorsun. Rahat bir kiloyla başla.</span>') + '</div>';
  }
  function ekranOdak() {
    const s = S.seans; const sg = S.program.gunler.find((x) => x.id === s.gunId) || { ad: s.ad || 'Antrenman', hareketler: seansHareket(s) };
    const hl = seansHareket(s); const ks = seansAnahtar({ hareketler: hl });
    const oi = odakIdx(s, hl, ks); const x = hl[oi]; const k = ks[oi]; const hr = D.HAREKET[x.id] || { ad: x.id };
    const l = s.setler[k] || []; const aktifIdx = l.findIndex((y) => !y.ok && !y.atla);
    const atlandi = s.atlanan && s.atlanan[k];
    const hepsiBitti = ks.every((kk) => hareketBittiMi(s, kk));
    const once = S.son[k] || S.son[x.id];
    const sonKg = once ? Math.max.apply(null, once.setler.filter((y) => y.tur !== 'isinma').map((y) => y.kg || 0).concat([0])) : 0;
    const oner = hedefKilo(k); const artir = sonKg && oner && oner > sonKg && aktifIdx >= 0;
    const ipucu = hr.ipucu ? esc(hr.ipucu) + (x.not ? ' <b>' + esc(x.not) + '.</b>' : '') : '';
    let alt;
    if (atlandi) alt = '<div class="od-bos"><b>Bugün atlandı.</b><button class="btn cerceve" data-act="se-geri" data-h="' + k + '">Geri al</button></div>';
    else if (aktifIdx >= 0 && (birimOf(x) === 'sn' || birimOf(x) === 'dk')) alt = kronoDugme(k, aktifIdx, l[aktifIdx], x);
    else if (aktifIdx >= 0) alt = aktifPanel(x, k, aktifIdx, l[aktifIdx], setEtiket(l, aktifIdx));
    else if (hepsiBitti) alt = '<div class="od-bos"><b>Hepsi bitti<span class="nokta">.</span></b><span class="ik">' + hl.length + ' hareketin hepsini tamamladın.</span><button class="btn ana buyuk-btn" data-act="bitir">Antrenmanı bitir' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button></div>';
    else { const n = ks.findIndex((kk) => !hareketBittiMi(s, kk)); alt = '<div class="od-bos"><b>' + esc(hr.ad) + ' tamam<span class="nokta">.</span></b><button class="btn ana buyuk-btn" data-act="odak-git" data-i="' + n + '">Sıradaki: ' + esc((D.HAREKET[hl[n].id] || { ad: hl[n].id }).ad) + IK.ok + '</button></div>'; }
    return '<div class="od">' +
      '<header class="od-ust"><a class="od-ikon" href="#/" aria-label="Ana sayfa">' + IK.geri + '</a>' +
        '<div class="od-gun"><span>' + esc(sg.ad) + (sg.ortam ? ' · ' + ORTAM_KISA[sg.ortam] : '') + (s.kisa ? ' · kısa' : '') + '</span><b class="num" id="seansSure">' + sureYaz(Date.now() - s.baslangic) + '</b></div>' +
        '<button class="od-ikon" data-act="od-menu" aria-label="Antrenman menüsü" aria-expanded="' + odMenu + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></header>' +
      jamSerit() +
      odakAdim(s, hl, ks, oi) +
      '<section class="od-kart odak-kart" aria-label="' + esc(hr.ad) + '">' +
        '<div class="od-bas"><a class="od-ad" href="#/hareket/' + encodeURIComponent(x.id) + '">' + esc(hr.ad) + '</a>' +
        '<span class="od-hedef num">' + x.set + ' × ' + esc(x.tekrar) + (x.rir && takipSeviye() !== 'sade' ? ' · ' + esc(x.rir) : '') + (S.rekor[x.id] ? ' · rekor ' + sayi(S.rekor[x.id].kg, 1) + '×' + S.rekor[x.id].tekrar : '') + '</span>' +
        '<div class="od-cipler">' + (dinOneri(x) ? '<button class="od-cip" data-act="din-ac" data-h="' + k + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg><b class="num">' + dakYaz(dinSn(x)) + '</b></button>' : '') +
          (ipucu ? '<button class="od-cip" data-act="od-ipucu" aria-expanded="' + odIpucu + '">Nasıl yapılır</button>' : '') +
          '<button class="od-cip" data-act="se-ac" data-h="' + k + '">Değiştir</button></div></div>' +
        (odIpucu && ipucu ? '<p class="od-ipucu">' + ipucu + '</p>' : artir ? '<p class="od-ipucu">Geçen sefer ' + sayi(sonKg, 1) + ' kg ile hedefi tuttun. Hazırsan <b>' + sayi(oner, 1) + ' kg</b> dene.</p>' : '') +
        '<div class="od-orta">' + (hareketGorsel(x.id) || (atlandi ? '' : odakOrta(x, k, l, aktifIdx, once))) + '</div>' +
        (atlandi ? '' : odakSetler(l, k, aktifIdx)) +
        '<div class="od-alt">' + alt + '</div>' +
      '</section>' +
      (odMenu ? odakMenuHtml(s, x, k, hl, l, aktifIdx, sg) : '') +
      '</div>';
  }
  function ekranSeans() {
    if (odakMi()) return ekranOdak();
    const s = S.seans; const sg = S.program.gunler.find((x) => x.id === s.gunId) || { ad: s.ad || 'Antrenman', hareketler: seansHareket(s) };
    const hl = seansHareket(s); const ks = seansAnahtar({ hareketler: hl });
    const sayilan = Object.keys(s.setler).filter((k) => !(s.atlanan && s.atlanan[k])).map((k) => s.setler[k]);
    const tamam = sayilan.reduce((a, l) => a + l.filter((x) => x.ok || x.atla).length, 0);
    const toplamSet = sayilan.reduce((a, l) => a + l.length, 0);
    const oi = odakIdx(s, hl, ks);
    return ust('<a class="ikon-btn" href="#/" aria-label="Ana sayfa">' + IK.geri + '</a>', '<span class="alt num">' + tamam + ' / ' + toplamSet + ' set</span>') +
      '<div class="seans-bas"><h1 class="baslik">' + esc(sg.ad) + '<span class="nokta">.</span></h1><div class="seans-saat"><span class="k">Süre</span><b class="num" id="seansSure">' + sureYaz(Date.now() - s.baslangic) + '</b></div></div>' +
      (s.donus ? '<div class="t limon" style="gap:4px"><span class="k">Geri Dönüş Modu</span><span style="font-weight:600;line-height:1.45">Geri döndün. ' + s.donus.ara + ' gün oldu, önemli değil. Hiçbir zaman çok geç değil. Vücudun sana yetişsin diye bugünkü yükleri son kaldırdığının %' + Math.round(s.donus.oran * 100) + '\'ine indirdik. Rahat geliyorsa sonraki antrenmanda kaldığın yerden devam.</span></div>' : '') +
      (s.kisa ? '<div class="t koyu kisa-bant"><span class="k">Bugün Zor · ~20 dk</span><b>Az da olsa geldin. Bir set bile sayılır.</b><span class="ik">En önemli ' + Math.min(3, hl.length) + ' hareket, her birinde 2 set. Geri kalanı bugün atlandı.</span><button class="metin-btn" data-act="kisa-iptal">Tam antrenmana dön</button></div>' : '') +
      jamSerit() +
      '<details class="t rutin-kutu"' + (odakMi() || Object.values(s.setler).some((l) => l.some((y) => y.ok)) ? '' : ' open') + '><summary><span class="k">Isınma · ~7 dk</span><span class="ik">açmak için dokun</span></summary>' + rutinListe(ISINMA.genel.concat(ISINMA[gunBolge(sg)])) + '</details>' +
      (odakMi() ? odakAdim(s, hl, ks, oi) : '') +
      '<div class="seans-izgara' + (odakMi() ? ' odak' : '') + '">' + (odakMi() ? [hl[oi]] : hl).map((x, xi0) => {
        const xi = odakMi() ? oi : xi0; const k = ks[xi]; const hr = D.HAREKET[x.id] || { ad: x.id }; const l = s.setler[k] || []; const once = S.son[k] || S.son[x.id];
        if (s.atlanan && s.atlanan[k]) return '<section class="t atlandi" aria-label="' + esc(hr.ad) + ' atlandı"><div class="satir"><div class="yigin"><b>' + esc(hr.ad) + '</b><span class="ik">Bugün atlandı</span></div><button class="btn cerceve kucuk" data-act="se-geri" data-h="' + k + '">Geri al</button></div></section>';
        const aktifIdx = l.findIndex((y) => !y.ok && !y.atla);
        const sonKg = once ? Math.max.apply(null, once.setler.filter((y) => y.tur !== 'isinma').map((y) => y.kg || 0).concat([0])) : 0;
        const oner = hedefKilo(k); const artir = sonKg && oner && oner > sonKg;
        const acik = seAcik === k;
        return '<section class="t' + (odakMi() ? ' odak-kart' : '') + '" aria-label="' + esc(hr.ad) + '" style="padding-bottom:6px"><div class="satir"><div class="yigin"><a class="hareket-ad" href="#/hareket/' + encodeURIComponent(x.id) + '"><b class="hk-baslik">' + esc(hr.ad) + '</b></a><span class="ik num">Hedef ' + x.set + ' × ' + esc(x.tekrar) + (x.rir && takipSeviye() !== 'sade' ? ' · ' + esc(x.rir) : '') + (S.rekor[x.id] ? ' · rekor ' + sayi(S.rekor[x.id].kg, 1) + ' × ' + S.rekor[x.id].tekrar : '') + '</span></div>' +
          '<button class="pd-ikon se-menu" data-act="se-ac" data-h="' + k + '" aria-expanded="' + acik + '" aria-label="' + esc(hr.ad) + ' seçenekleri"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button></div>' +
          (dinOneri(x) ? '<button class="din-cip" data-act="din-ac" data-h="' + k + '" aria-expanded="' + (dinAcik === k) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>Dinlenme <b class="num">' + dakYaz(dinSn(x)) + '</b><span>' + (dinOzelMi(x) ? 'senin' : 'önerilen') + '</span></button>' : '') +
          (dinAcik === k ? dinSecici(x, k) : '') +
          (acik ? seSecenek(x, k, hl) : '') +
          hareketGorsel(x.id) +
          (artir ? '<p class="ipucu">Geçen sefer ' + sayi(sonKg, 1) + ' kg ile hedefi tuttun. Hazır hissediyorsan <b>' + sayi(oner, 1) + ' kg</b> dene; kiloyu sen değiştirmezsen geçen seferki gibi kalır.</p>' : '') +
          (hr.ipucu ? '<p class="ipucu">' + esc(hr.ipucu) + (x.not ? ' <b>' + esc(x.not) + '.</b>' : '') + '</p>' : '') +
          (odakMi() && aktifIdx >= 0 && birimOf(x) === 'tekrar' ? aktifPanel(x, k, aktifIdx, l[aktifIdx], setEtiket(l, aktifIdx)) : '') +
          '<div class="setler"><div class="set bas"><span>Set</span><span>Önceki</span><span style="text-align:center">Kg</span><span style="text-align:center">' + BIRIM[birimOf(x)] + '</span><span></span></div>' +
          l.map((y, i) => {
            const ayniTur = l.slice(0, i).filter((z) => (z.tur || '') === (y.tur || '')).length;
            const o = once && once.setler.filter((z) => (z.tur || '') === (y.tur || ''))[ayniTur];
            const et = setEtiket(l, i);
            return '<div class="set' + (i === aktifIdx ? ' aktif' : '') + (y.tur ? ' ' + y.tur : '') + (y.atla ? ' atla' : '') + '"><span class="no num">' + et + '</span>' + (y.tur ? '<span class="once"><button class="set-sil" data-act="set-sil" data-h="' + k + '" data-i="' + i + '" aria-label="' + et + ' setini sil">' + IK.kapat.replace('<svg', '<svg class="ik-k" aria-hidden="true"') + ' Sil</button></span>' : '<span class="once num">' + (y.atla ? 'atlandı' : o ? sayi(o.kg, 1) + ' × ' + o.tekrar : '—') + '</span>') +
              '<input aria-label="' + et + '. set kilo" inputmode="decimal" data-in="kg" data-h="' + k + '" data-i="' + i + '" value="' + esc(y.kg) + '" placeholder="—"' + (y.atla ? ' disabled' : '') + '>' +
              '<input aria-label="' + et + '. set ' + BIRIM[birimOf(x)].toLowerCase() + '" inputmode="numeric" data-in="tekrar" data-h="' + k + '" data-i="' + i + '" value="' + esc(y.tekrar) + '" placeholder="' + (x.alt || '') + '"' + (y.atla ? ' disabled' : '') + '>' +
              (y.atla ? '<button class="tik geri" data-act="set-atla" data-h="' + k + '" data-i="' + i + '" aria-label="Atlanan seti geri al">' + IK_GERIAL + '</button>' : '<button class="tik" data-act="tik" data-h="' + k + '" data-i="' + i + '" aria-pressed="' + (y.ok ? 'true' : 'false') + '" aria-label="' + et + '. seti ' + (y.ok ? 'geri al' : 'tamamla') + '">' + IK.tik + '</button>') + '</div>';
          }).join('') + '</div>' +
          '<div class="set-ek"><button class="metin-btn" data-act="set-ekle" data-h="' + k + '" data-tur="ek">+ Set</button>' + (takipSeviye() === 'detayli' ? '<button class="metin-btn" data-act="set-ekle" data-h="' + k + '" data-tur="drop">+ Drop set</button>' : '') + (takipSeviye() !== 'sade' ? '<button class="metin-btn" data-act="set-ekle" data-h="' + k + '" data-tur="isinma">+ Isınma</button>' : '') +
          (aktifIdx >= 0 ? '<button class="metin-btn" data-act="set-atla" data-h="' + k + '" data-i="' + aktifIdx + '" style="color:var(--ikincil)">Bu seti atla</button>' : '') + '</div>' +
          ((birimOf(x) === 'sn' || birimOf(x) === 'dk') && aktifIdx >= 0 ? kronoDugme(k, aktifIdx, l[aktifIdx], x) : '') + '</section>';
      }).join('') + '</div>' +
      '<details class="t rutin-kutu"><summary><span class="k">Soğuma ve esneme · ~4 dk</span><span class="ik">bitirmeden önce</span></summary>' + rutinListe(SOGUMA[gunBolge(sg)]) + '</details>' +
      '<a class="t koyu" href="#/koc" style="flex-direction:row;align-items:center;justify-content:space-between;gap:12px"><span style="font-weight:700">Bir yerin mi ağrıdı? Koça danış</span>' + IK.ok.replace('<svg', '<svg width="18" height="18" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>' +
      '<button class="metin-btn gorunum-btn" data-act="gorunum" data-deger="' + (odakMi() ? 'liste' : 'odak') + '">' + (odakMi() ? 'Bütün hareketleri liste olarak gör' : 'Tek tek göster') + '</button>' +
      '<button class="btn siyah buyuk-btn" data-act="bitir">Antrenmanı bitir' + IK.tik.replace('<svg', '<svg style="fill:none;stroke:currentColor;stroke-width:2.6"') + '</button>' +
      '<button class="metin-btn" data-act="iptal" style="align-self:center;color:var(--ikincil)">' + (iptalOnay ? 'Emin misin? Kaydetmeden çıkmak için tekrar bas' : 'Kaydetmeden çık') + '</button>';
  }
  function seSecenek(x, k, hl) {
    const l = S.seans.setler[k] || []; const son = l[l.length - 1];
    const sg0 = S.seans && S.program ? S.program.gunler.find((g) => g.id === S.seans.gunId) : null;
    const alt = M.alternatifler(gunProfil(sg0), x, hl.map((y) => y.id)).slice(0, 8);
    return '<div class="se-panel"><div class="haplar">' +
      '<button class="btn cerceve kucuk" data-act="se-atla" data-h="' + k + '">Hareketi atla</button>' +
      (son && son.tur && !son.ok ? '<button class="btn cerceve kucuk" data-act="set-cikar" data-h="' + k + '">Son eklenen seti kaldır</button>' : '') + '</div>' +
      '<span class="k" style="margin-top:6px">Yerine yap' + (alt.length ? '' : ': uygun alternatif yok') + '</span>' +
      (alt.length ? '<div class="se-alt">' + alt.filter((a) => K.HAREKET[a]).map((a) => '<button data-act="se-degis" data-h="' + k + '" data-id="' + a + '"><b>' + esc(D.HAREKET[a].ad) + '</b><span class="ik">' + esc(K.HAREKET[a].ekipman.map((e) => K.EKIPMAN[e]).join(', ')) + '</span></button>').join('') + '</div>' +
        '<label class="se-kalici"><input type="checkbox" data-in="degis-kalici"' + (degisKalici ? ' checked' : '') + '> Programımda da kalıcı olarak değiştir</label>' : '') + '</div>';
  }
  // set listesi oluştur: ısınma setleri + çalışma setleri; kilo geçen seferkiyle aynı gelir
  function setOlustur(x, k, oran) {
    const so = S.son[k] || S.son[x.id];
    const b = birimOf(x);
    const yuv = (kg) => Math.max(0, Math.round(kg / 2.5) * 2.5);
    const kgYaz = (kg) => (kg ? String(kg).replace('.', ',') : '');
    const onceki = so ? so.setler.filter((y) => !y.tur || y.tur === 'ek') : [];
    const sonNormal = onceki.length ? onceki[Math.min(onceki.length - 1, x.set - 1)].kg : 0;
    let ilk = sonNormal || hedefKilo(k) || 0;
    if (oran < 1 && ilk) ilk = yuv(ilk * oran);
    const tekrar = String(b === 'dk' || b === 'sn' ? x.ust || parseInt(x.tekrar, 10) : x.alt);
    const l = [];
    const isOnce = so ? so.setler.filter((y) => y.tur === 'isinma') : [];
    const isinma = Math.max(0, Math.min(4, x.isinmaSet || 0));
    let onc = 0;
    [0.5, 0.7, 0.85, 0.9].slice(0, isinma).forEach((f, j) => { const kg = Math.max(isOnce[j] && oran >= 1 ? isOnce[j].kg : ilk ? yuv(ilk * f) : 0, onc); onc = kg; l.push({ kg: kgYaz(kg), tekrar: String([10, 6, 4, 3][j]), ok: false, tur: 'isinma' }); });
    for (let j = 0; j < x.set; j++) {
      let kg = onceki[j] ? onceki[j].kg : ilk;
      if (oran < 1 && onceki[j]) kg = yuv(kg * oran);
      l.push({ kg: kgYaz(kg || (j ? ilk : ilk)), tekrar, ok: false });
    }
    return l;
  }
  // kısa, rahatsız etmeyen bitiş sesi
  let sesCtx = null;
  /* kronometre: plank gibi süreli hareketler. Başlat → sayar, hedefe gelince zil; Bitir → süre sete yazılır, set tamamlanır. */
  let krono = null; let kronoZ = null;
  const kronoYaz = (sn) => Math.floor(sn / 60) + ':' + String(sn % 60).padStart(2, '0');
  function kronoHedef(y, x) { const v = oku(y.tekrar) || oku(x.alt) || oku(String(x.tekrar || '').split(/[-–]/).pop()) || 0; return birimOf(x) === 'dk' ? v * 60 : v; }
  function kronoDugme(k, i, y, x) {
    const acik = krono && krono.h === k && krono.i === i; const gecen = acik ? Math.floor((Date.now() - krono.bas) / 1000) : 0; const hedef = kronoHedef(y, x);
    return '<div class="krono' + (acik ? ' acik' : '') + '" data-krono="' + k + ':' + i + '"><span class="krono-sure num" aria-live="off">' + kronoYaz(gecen) + '</span>' +
      '<span class="krono-hedef ik">' + (hedef ? 'hedef ' + kronoYaz(hedef) : 'süre tut') + '</span>' +
      '<button type="button" class="btn ' + (acik ? 'ana' : 'siyah') + ' krono-btn" data-act="krono" data-h="' + k + '" data-i="' + i + '">' + (acik ? 'Bitir' : 'Kronometreyi başlat') + '</button></div>';
  }
  function kronoCiz() {
    if (!krono) return; const e = document.querySelector('[data-krono="' + krono.h + ':' + krono.i + '"] .krono-sure'); if (!e) return;
    const gecen = Math.floor((Date.now() - krono.bas) / 1000); e.textContent = kronoYaz(gecen);
    if (krono.hedef && gecen >= krono.hedef && !krono.caldi) { krono.caldi = true; sesHazirla(); bip(null, 1); if (navigator.vibrate) navigator.vibrate([120, 80, 120]); e.closest('.krono').classList.add('tamam'); }
  }
  function sesHazirla() { try { if (!sesCtx) sesCtx = new (window.AudioContext || window.webkitAudioContext)(); if (sesCtx.state === 'suspended') sesCtx.resume(); } catch (e) { sesCtx = null; } }
  // dinlenme sesleri: [ad, notalar: [frekans, başlangıç sn, süre sn, dalga, ses yüksekliği]]
  const SESLER = {
    cift: ['Çift ton', [[660, 0, 0.14, 'sine', 0.09], [880, 0.16, 0.14, 'sine', 0.09]]],
    zil: ['Zil · COMEBACK sesi', [[1318, 0, 0.9, 'sine', 0.07], [1975, 0, 0.6, 'sine', 0.03]]],
    damla: ['Damla', [[1200, 0, 0.09, 'sine', 0.08], [1600, 0.1, 0.08, 'sine', 0.06]]],
    gong: ['Gong', [[196, 0, 1.4, 'sine', 0.12], [392, 0, 0.9, 'sine', 0.04]]],
    uclu: ['Üçlü bip', [[880, 0, 0.08, 'square', 0.035], [880, 0.16, 0.08, 'square', 0.035], [1175, 0.32, 0.16, 'square', 0.035]]],
    yukselen: ['Yükselen', [[523, 0, 0.12, 'triangle', 0.09], [659, 0.12, 0.12, 'triangle', 0.09], [784, 0.24, 0.22, 'triangle', 0.09]]],
    yok: ['Sessiz · sadece titreşim', []]
  };
  // marka sesleri (ayar listesinde görünmez): antrenman bitişi ve rekor; hepsi Zil ailesinden
  const MARKA_SES = {
    bitis: [[196, 0, 1.1, 'sine', 0.10], [1318, 0.12, 0.9, 'sine', 0.06], [1975, 0.12, 0.6, 'sine', 0.025]],
    sayim: [[880, 0, 0.12, 'sine', 0.07]],
    git: [[1318, 0, 0.5, 'sine', 0.08], [1975, 0, 0.35, 'sine', 0.03]],
    rekor: [[98, 0, 1.3, 'sine', 0.16], [196, 0, 0.8, 'sine', 0.05], [1318, 0.32, 1.0, 'sine', 0.065], [1975, 0.32, 0.7, 'sine', 0.03]]
  };
  const sesTur = () => (S.ayar && S.ayar.ses === false ? 'yok' : (S.ayar && SESLER[S.ayar.sesTur] ? S.ayar.sesTur : 'zil'));
  // ses seviyesi: notaların kazancı bu katsayıyla çarpılır; sıkıştırıcı patlamayı önler
  const SEVIYE = { kisik: ['Kısık', 1.5], orta: ['Orta', 4], yuksek: ['Yüksek', 8], cok: ['Çok yüksek', 13] };
  const sesSeviye = () => (S.ayar && SEVIYE[S.ayar.sesSeviye] ? S.ayar.sesSeviye : 'yuksek');
  let sesCikis = null, oturumZ = 0;
  function bip(tur, tekrar) {
    const t0 = MARKA_SES[tur] ? ['', MARKA_SES[tur]] : SESLER[tur || sesTur()]; if (!sesCtx || !t0 || !t0[1].length) return;
    try {
      // iPhone'da (Safari 16.4+) müziği durdurmadan kısar, ses bitince müzik normale döner
      if (navigator.audioSession) { try { navigator.audioSession.type = 'transient'; clearTimeout(oturumZ); oturumZ = setTimeout(() => { try { navigator.audioSession.type = 'auto'; } catch (e) { /* yok */ } }, 2600); } catch (e) { /* yok */ } }
      if (!sesCikis) { const k = sesCtx.createDynamicsCompressor(); k.threshold.value = -10; k.knee.value = 6; k.ratio.value = 8; k.attack.value = 0.002; k.release.value = 0.2; k.connect(sesCtx.destination); sesCikis = k; }
      const kat = SEVIYE[sesSeviye()][1];
      const sure = Math.max.apply(null, t0[1].map((n) => n[1] + n[2]));
      for (let r = 0; r < (tekrar || 1); r++) {
        const t = sesCtx.currentTime + 0.03 + r * (sure + 0.35);
        t0[1].forEach((n) => {
          const o = sesCtx.createOscillator(); const g = sesCtx.createGain();
          o.type = n[3]; o.frequency.value = n[0];
          g.gain.setValueAtTime(0.0001, t + n[1]); g.gain.exponentialRampToValueAtTime(Math.min(0.95, n[4] * kat), t + n[1] + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + n[2]);
          o.connect(g); g.connect(sesCikis); o.start(t + n[1]); o.stop(t + n[1] + n[2] + 0.02);
        });
      }
    } catch (e) { /* ses yok */ }
  }
  // uygulama arka plandayken dinlenme bitince bildirim (izin verildiyse)
  const bildirimVar = () => 'Notification' in window && 'serviceWorker' in navigator;
  async function dinlenmeBildir() {
    return; // bildirim paneline düşmesin; bitiş uygulama içinde gösterilir
    if (!bildirimVar() || Notification.permission !== 'granted' || !document.hidden) return;
    try {
      const r = await navigator.serviceWorker.ready;
      await r.showNotification('Dinlenme bitti', { body: 'Sıradaki sete geç. COMEBACK.', tag: 'cb-dinlenme', renotify: true, vibrate: [200, 100, 200, 100, 200], icon: '/comeback/ikon-192.png?v=3', badge: '/comeback/favicon-96.png?v=4', data: { url: '/comeback/#/antrenman' } });
    } catch (e) { /* olmadı */ }
  }
  let iptalOnay = false;
  // Görünüm: gunduz (hep açık) · antrenman (antrenmanda gece, varsayılan) · gece (hep siyah) · sistem (telefona göre)
  const TEMA = {
    gunduz: ['Gündüz', 'Her yerde açık renk, antrenmanda da.', '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>'],
    antrenman: ['Antrenman', 'Antrenman sırasında siyah, gerisi açık renk.', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/></svg>'],
    gece: ['Gece', 'Her yerde siyah. Gece salonda ve karanlıkta göz yormaz.', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>'],
    sistem: ['Telefon', 'Telefonun gece modunu izler.', '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18.5h2"/></svg>']
  };
  const TEMA_SIRA = ['gunduz', 'antrenman', 'gece', 'sistem'];
  const temaAyar = () => { const a = S.ayar || {}; if (TEMA[a.tema]) return a.tema; return a.gece === false ? 'gunduz' : 'antrenman'; };
  const temaRenk = document.querySelector('meta[name="theme-color"]');
  const sistemKaranlik = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function temaUygula() {
    const t = temaAyar(); const yer = (location.hash || '').replace(/^#\/?/, '').split('/')[0];
    const gece = t === 'gece' || (t === 'antrenman' && yer === 'antrenman' && !!S.seans) || (t === 'sistem' && !!sistemKaranlik && sistemKaranlik.matches);
    document.body.classList.toggle('gece', gece);
    document.documentElement.classList.remove('gece-erken');
    document.documentElement.style.background = gece ? '#000' : '';
    if (temaRenk) temaRenk.setAttribute('content', gece ? '#000000' : '#ECECE8');
    try { localStorage.setItem('comeback:tema', t); } catch (e) { /* yok */ }
  }
  if (sistemKaranlik) { try { sistemKaranlik.addEventListener('change', temaUygula); } catch (e) { if (sistemKaranlik.addListener) sistemKaranlik.addListener(temaUygula); } }
  function anahtarCevir(el, acik) {
    if (!el) return; el.setAttribute('aria-pressed', String(!!acik));
    const a = el.querySelector('.anahtar'); if (!a) return;
    a.classList.remove('vurus'); void a.offsetWidth; if (acik) a.classList.add('vurus');
  }
  function temaSecici() {
    const t = temaAyar(); const i = TEMA_SIRA.indexOf(t);
    return '<div class="t genis tema-kutu" style="gap:10px"><span class="k">Görünüm</span>' +
      '<div class="tema-sec" role="radiogroup" aria-label="Görünüm" style="--i:' + i + '"><span class="tema-pil" aria-hidden="true"></span>' +
      TEMA_SIRA.map((k) => '<button type="button" role="radio" aria-checked="' + (k === t) + '" data-act="tema" data-tema="' + k + '">' + TEMA[k][2] + '<span>' + TEMA[k][0] + '</span></button>').join('') +
      '</div><span class="ik" id="temaNot">' + TEMA[t][1] + '</span></div>';
  }
  // uygulama simgesi: ana ekrana eklerken kullanılan simge (logo her zaman tam COMEBACK.)
  const SIMGE = {
    kobalt: ['Kobalt', 'ikon-kobalt-192.png?v=1', 'apple-touch-icon-kobalt.png?v=1', 'manifest.webmanifest?v=5'],
    gece: ['Gece', 'ikon-192.png?v=4', 'apple-touch-icon.png?v=4', 'manifest-gece.webmanifest?v=1'],
    gunduz: ['Gündüz', 'ikon-gunduz-192.png?v=1', 'apple-touch-icon-gunduz.png?v=1', 'manifest-gunduz.webmanifest?v=1']
  };
  const simgeAyar = () => { const s = (S.ayar || {}).simge; return SIMGE[s] ? s : 'kobalt'; };
  function simgeUygula() {
    const s = SIMGE[simgeAyar()];
    const m = document.querySelector('link[rel="manifest"]'); if (m && m.getAttribute('href') !== s[3]) m.setAttribute('href', s[3]);
    const a = document.querySelector('link[rel="apple-touch-icon"]'); if (a && a.getAttribute('href') !== s[2]) a.setAttribute('href', s[2]);
    try { localStorage.setItem('comeback:simge', simgeAyar()); } catch (e) { /* yok */ }
  }
  function simgeSecici() {
    const s = simgeAyar();
    return '<div class="t genis" style="gap:10px"><span class="k">Uygulama simgesi</span>' +
      '<div class="simge-sec" role="radiogroup" aria-label="Uygulama simgesi">' +
      Object.keys(SIMGE).map((k) => '<button type="button" role="radio" aria-checked="' + (k === s) + '" data-act="simge" data-simge="' + k + '"><img src="' + SIMGE[k][1] + '" alt="" width="64" height="64" loading="lazy"><span>' + SIMGE[k][0] + '</span></button>').join('') +
      '</div><span class="ik" id="simgeNot">' + (tekBasina() ? 'Yeni simge, uygulamayı ana ekrandan kaldırıp yeniden eklediğinde görünür. Verilerin hesabında durur.' : 'Uygulamayı ana ekrana eklediğinde bu simge görünür.') + '</span></div>';
  }
  // antrenman sürerken ekran kapanmasın (Screen Wake Lock); ayardan kapatılabilir
  let ekranKilidi = null; let kilitIstek = false;
  const ekranAcikAyar = () => !(S.ayar && S.ayar.ekranAcik === false);
  const kilitVar = () => 'wakeLock' in navigator;
  function ekranKilit() {
    if (!kilitVar()) return;
    const iste = !!S.seans && ekranAcikAyar() && document.visibilityState === 'visible';
    if (iste && !ekranKilidi && !kilitIstek) {
      kilitIstek = true;
      navigator.wakeLock.request('screen').then((w) => { ekranKilidi = w; w.addEventListener('release', () => { if (ekranKilidi === w) ekranKilidi = null; }); if (!(S.seans && ekranAcikAyar())) { w.release(); ekranKilidi = null; } }).catch(() => {}).finally(() => { kilitIstek = false; });
    } else if (!iste && ekranKilidi && document.visibilityState === 'visible') { ekranKilidi.release().catch(() => {}); ekranKilidi = null; }
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { ekranKilit(); if (dinlenme) dinlenmeCiz(); } });

  /* dinlenme sayacı */
  let dinlenme = null; let dinlenmeZaman = null;
  function dinlenmeBaslat(sn, kaynak) {
    if (!sn) return;
    dinlenme = { bitis: Date.now() + sn * 1000, toplam: kaynak && kaynak.toplam ? kaynak.toplam : sn, id: kaynak ? kaynak.id : null };
    clearInterval(dinlenmeZaman);
    dinlenmeZaman = setInterval(dinlenmeCiz, 1000);
    dinlenmeCiz();
  }
  function dinlenmeCiz() {
    let el = document.getElementById('dinlenme');
    if (!dinlenme || !S.seans) { if (el && (!S.seans || !el.classList.contains('bitti'))) el.remove(); clearInterval(dinlenmeZaman); return; }
    if (el && el.classList.contains('bitti')) { el.remove(); el = null; }
    const kalan = Math.max(0, Math.round((dinlenme.bitis - Date.now()) / 1000));
    if (!el) {
      el = document.createElement('div'); el.id = 'dinlenme'; el.className = 'dinlenme'; el.setAttribute('role', 'timer'); el.setAttribute('aria-label', 'Dinlenme sayacı');
      el.innerHTML = '<span class="sure"></span><div class="cubuk"><span></span></div><button data-act="dinlenme-ek">+30 sn</button><button data-act="dinlenme-atla">Atla</button>';
      document.body.appendChild(el);
    }
    el.querySelector('.sure').textContent = Math.floor(kalan / 60) + ':' + String(kalan % 60).padStart(2, '0');
    if (kalan >= 1 && kalan <= 3 && dinlenme.sonBip !== kalan && dinlenme.toplam > 10) { dinlenme.sonBip = kalan; if (sesTur() !== 'yok') { sesHazirla(); bip('sayim'); } if (navigator.vibrate) navigator.vibrate(12); }
    el.querySelector('.cubuk>span').style.width = (100 - yuzde(kalan, dinlenme.toplam)) + '%';
    if (kalan === 0) {
      dinlenme = null; clearInterval(dinlenmeZaman);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      sesHazirla(); bip(null, 2);
      dinlenmeBittiGoster(el);
    }
  }
  // dinlenme bitince çubuk "Dinlenme bitti. Bir set daha." kartına dönüşür; dokununca ya da 8 sn sonra kapanır
  let bittiZaman = null;
  function dinlenmeBittiGoster(el) {
    el.className = 'dinlenme bitti'; el.setAttribute('role', 'status'); el.setAttribute('aria-label', 'Dinlenme bitti');
    el.innerHTML = '<span class="yigin"><b>Dinlenme bitti.</b><span>Bir set daha.</span></span><button data-act="dinlenme-kapat">Tamam</button>';
    clearTimeout(bittiZaman);
    // arka plandan dönülürse kart beklesin: süre sayfa görünürken işlesin
    const kapat = () => { if (document.hidden) { bittiZaman = setTimeout(kapat, 1500); return; } const e = document.getElementById('dinlenme'); if (e && e.classList.contains('bitti')) e.remove(); };
    bittiZaman = setTimeout(kapat, 8000);
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
      '<div class="' + (hedefTamam(tp.k, h.kcal) ? 't limon' : 't') + ' h150"><span class="k">' + (hedefTamam(tp.k, h.kcal) ? 'Hedef tamam' : kalan >= 0 ? 'Kalan' : 'Hedefin üstünde') + '</span><span class="buyuk num" data-say="' + Math.round(hedefTamam(tp.k, h.kcal) ? tp.k : Math.abs(kalan)) + '">' + sayi(hedefTamam(tp.k, h.kcal) ? tp.k : Math.abs(kalan)) + '</span><span class="k num">' + sayi(tp.k) + ' / ' + sayi(h.kcal) + ' kcal</span></div>' +
      '<div class="t h150 num" style="gap:6px">' + [['Protein', tp.p, h.protein], ['Karb.', tp.kh, h.karb], ['Yağ', tp.y, h.yag]].map((m) => '<div class="yigin" style="gap:3px"><div class="satir" style="font-size:13px"><span>' + m[0] + '</span><b>' + sayi(m[1]) + '/' + m[2] + ' g</b></div><div class="cubuk' + (m[1] > m[2] * 1.1 ? ' asim' : '') + '" style="height:6px"><span style="width:' + yuzde(m[1], m[2]) + '%"></span></div></div>').join('') + '</div>' +
      '<a class="t kobalt genis" href="#/ekle/foto" style="flex-direction:row;align-items:center;justify-content:space-between;min-height:76px"><div class="yigin"><span class="k">Hızlı ekle</span><b style="font-size:18px">Tabağının fotoğrafını çek</b></div><span class="ikon-btn" style="background:#fff;color:var(--kobalt)">' + IK.kamera + '</span></a>' +
      '<a class="t h130" href="#/ekle/ara" style="min-height:100px"><span class="ik" style="color:var(--murekkep)">' + IK.ara.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2"') + '</span><b>Listeden ya da markadan ara</b></a>' +
      '<a class="t h130" href="#/ekle/elle" style="min-height:100px"><span style="color:var(--murekkep)">' + IK.arti.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2"') + '</span><b>Elle gir</b></a>' +
      bplanKutu(g) + suKutu(g) + takviyeKutu(g) + tekrarKutu(g) + oneriKutu(h.kcal - tp.k, h.protein - tp.p) +
      (grup || '<div class="t bos genis" style="align-items:flex-start"><b class="be-baslik" style="font-size:22px">Tabak boş<span class="nokta">.</span></b><span class="ik">Fotoğraf çek, listeden seç ya da <a href="#/ekle/elle" style="color:var(--kobalt);font-weight:700">elle gir</a>.</span></div>') +
      '</div>';
  }

  /* su, tekrar, kayıtlı öğün, yemek önerisi */
  const suHedef = () => Math.round(((S.kilo.length ? S.kilo[S.kilo.length - 1].kg : S.profil.kilo) * 35) / 250) * 250; // ~35 ml/kg
  function suKutu(g) {
    const ml = g.su || 0; const h = suHedef(); const bardak = Math.round(ml / 250);
    return '<div class="t genis su-kutu"><div class="satir"><span class="k">Su</span><span class="ik num">hedef ~' + sayi(h / 1000, 1) + ' L</span></div>' +
      '<div class="satir" style="align-items:center"><span class="orta num">' + sayi(ml / 1000, 2) + '<span class="ik" style="font-weight:600"> L · ' + bardak + ' bardak</span></span>' +
      '<button class="yuvarlak" data-act="su" data-ml="-250" aria-label="Bir bardak çıkar"' + (ml ? '' : ' disabled') + '>−</button></div>' +
      '<div class="haplar su-haplar"><button class="btn ana kucuk" data-act="su" data-ml="250">+ 1 bardak</button><button class="btn cerceve kucuk" data-act="su" data-ml="500">+ 0,5 L</button><button class="btn cerceve kucuk" data-act="su" data-ml="1000">+ 1 L</button>' +
      '<form data-form="su" class="su-elle" novalidate><input name="miktar" inputmode="decimal" placeholder="1,5 L ya da 330 ml" aria-label="Su miktarı, litre ya da mililitre"><button class="btn siyah kucuk" type="submit">Ekle</button></form></div>' +
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
    if (oneri && oneri.liste.length) ic = oneri.liste.map((x, i) => '<div class="oneri"><div class="satir"><b>' + esc(x.ad) + '</b><button class="btn beyaz kucuk-btn" data-act="oneri-ekle" data-i="' + i + '">Ekle</button></div><span class="ik num" style="color:var(--koyu-ikincil)">~' + sayi(x.k) + ' kcal · P ' + sayi(x.p) + ' g · ' + sayi(x.g) + ' g</span>' + (x.tarif ? '<p class="oneri-tarif">' + esc(x.tarif) + '</p>' : '') + '</div>').join('') + aiOy('yemek', 'o' + kisaKimlik(oneri.liste.map((x) => x.ad).join('|')), oneri.liste.map((x) => x.ad).join(' / '), true);
    return '<div class="t koyu genis" style="gap:10px"><div class="satir"><span class="k">' + baslik + '</span>' + (oneri ? '<button class="metin-btn kucuk-metin" data-act="oneri" style="color:var(--mavi-gece)">Başka öner</button>' : '') + '</div>' + ic +
      (!oneri ? '<button class="btn beyaz" data-act="oneri"' + (oneriYuk ? ' disabled' : '') + ' style="align-self:flex-start;min-height:44px">' + (oneriYuk ? 'Düşünüyor…' : 'Öner') + IK.ok + '</button>' : '') + '</div>';
  }

  /* öğün ekleme */
  let taslak = null;      // porsiyon ekranı için seçilen ürün (100 g değerleri)
  let aramaSonuc = null;  // marka araması sonuçları
  let fotoSonuc = null;   // fotoğraf analizi
  function ekleSekme(aktif) {
    const s = [['foto', 'Fotoğraf'], ['ara', 'Ara'], ['elle', 'Elle']];
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
    if (yol === 'barkod') { location.replace('#/ekle/foto'); return ''; }
    if (yol === 'barkod-eski') {
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
      '<input type="file" accept="image/*" capture="environment" data-in="foto" style="position:absolute;width:1px;height:1px;opacity:0" aria-label="Tabak fotoğrafı çek"></label>' +
      '<div class="foto-secim"><label class="btn ana kucuk">' + 'Fotoğraf çek<input type="file" accept="image/*" capture="environment" data-in="foto" class="gizli-dosya" aria-label="Kamerayla fotoğraf çek"></label>' +
      '<label class="btn cerceve kucuk">Galeriden yükle<input type="file" accept="image/*" data-in="foto" class="gizli-dosya" aria-label="Galeriden fotoğraf seç"></label></div>' +
      '<p class="ik" style="margin:-4px 0 0">Tabak ya da paket: paketli üründe besin değeri tablosu ya da ürünün ön yüzü görünsün. Daha önce çektiğin fotoğrafı da yükleyebilirsin.</p>' +
      '<label class="t alan foto-not"><span>Ne yiyorsun? · isteğe bağlı</span><input id="fotoNot" data-in="foto-not" maxlength="300" value="' + esc(fotoNot) + '" placeholder="Ör. tavuk sote ve pilav · paketli üründe: 1 paket, yarısını yedim" autocomplete="off" style="font-size:17px"></label>' +
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
    return '<div class="izgara"><div class="t h130"><span class="k">Bu tabak</span><span class="buyuk num">' + sayi(t) + '</span><span class="k">kcal · tahmini</span></div>' +
      '<div class="t h130 num"><div class="satir"><span>Protein</span><b style="color:var(--kobalt)">' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.p, 0)) + ' g</b></div><div class="satir"><span>Karb.</span><b>' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.kh, 0)) + ' g</b></div><div class="satir"><span>Yağ</span><b>' + sayi(fotoSonuc.kalemler.reduce((a, x) => a + x.y, 0)) + ' g</b></div></div></div>' +
      '<div class="t" style="padding:4px 16px"><div class="liste">' + fotoSonuc.kalemler.map((x, i) => '<div><div class="ad"><b>' + esc(x.ad) + '</b><span class="ik num">' + sayi(x.k) + ' kcal' + (x.veri ? ' · veriyle doğrulandı' : '') + (x.emin === 'dusuk' ? ' · emin değil, kontrol et' : '') + '</span><button class="metin-btn kucuk-metin" data-act="foto-sil-kalem" data-i="' + i + '" style="color:var(--ikincil);align-self:flex-start;padding:0">Bu yok, çıkar</button></div><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="-1" aria-label="' + esc(x.ad) + ' porsiyonunu azalt">−</button><span class="num" style="min-width:52px;text-align:center;font-weight:800">' + sayi(x.g) + ' g</span><button class="yuvarlak" data-act="foto-g" data-i="' + i + '" data-yon="1" aria-label="' + esc(x.ad) + ' porsiyonunu artır">+</button></div>').join('') + '</div></div>' +
      aiOy('foto', 'f' + kisaKimlik(fotoSonuc.kalemler.map((x) => x.ad + x.g).join('|')), fotoSonuc.kalemler.map((x) => x.ad + ' ' + x.g + ' g').join(', ')) +
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
      '<div class="t h130"><span class="k">Bu porsiyon</span><span class="buyuk num" id="porK">' + sayi(k) + '</span><span class="k">kcal</span></div>' +
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
  // Senin COMEBACK'in: ilk antrenmandan bugüne emeğin özeti (beden değil, iş)
  function seninComeback() {
    const tg = Object.keys(S.gunluk).filter((k) => S.gunluk[k].antrenman).sort(); if (tg.length < 2) return '';
    const set = tg.reduce((a, k) => a + (S.gunluk[k].antrenman.set || 0), 0); const dk = tg.reduce((a, k) => a + (S.gunluk[k].antrenman.dk || 0), 0);
    // Türkçe ayrılma eki: Ekim'den, Kasım'dan, Aralık'tan; yıl yazılırsa yıla göre (2025'ten, 2026'dan)
    const AY_EK = ['tan', 'tan', 'tan', 'dan', 'tan', 'dan', 'dan', 'tan', 'den', 'den', 'dan', 'tan'];
    const YIL_EK = ['dan', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'];
    const ilkT = new Date(tg[0]); const baskaYil = ilkT.getFullYear() !== new Date().getFullYear();
    const ilkYazi = ilkT.getDate() + ' ' + AY[ilkT.getMonth()] + (baskaYil ? ' ' + ilkT.getFullYear() + '\'' + YIL_EK[ilkT.getFullYear() % 10] : '\'' + AY_EK[ilkT.getMonth()]);
    const gel = Object.keys(S.ilk || {}).filter((h) => S.rekor[h] && D.HAREKET[h] && e1rm(S.rekor[h].kg, S.rekor[h].tekrar) > e1rm(S.ilk[h].kg, S.ilk[h].tekrar) + 0.01)
      .sort((a, b) => (e1rm(S.rekor[b].kg, S.rekor[b].tekrar) - e1rm(S.ilk[b].kg, S.ilk[b].tekrar)) - (e1rm(S.rekor[a].kg, S.rekor[a].tekrar) - e1rm(S.ilk[a].kg, S.ilk[a].tekrar))).slice(0, 3);
    return '<div class="t koyu genis senin"><span class="k">Senin COMEBACK\'in</span><span class="orta">' + esc(ilkYazi) + ' beri<span style="color:var(--mavi-gece)">.</span></span>' +
      '<div class="senin-sayilar num"><span><b>' + tg.length + '</b>antrenman</span><span><b>' + sayi(set) + '</b>set</span><span><b>' + (dk >= 120 ? sayi(dk / 60, 1) : dk) + '</b>' + (dk >= 120 ? 'saat' : 'dk') + '</span></div>' +
      (gel.length ? '<div class="senin-liste">' + gel.map((h) => '<div><span>' + esc(D.HAREKET[h].ad) + '</span><b class="num">' + sayi(S.ilk[h].kg, 1) + ' → ' + sayi(S.rekor[h].kg, 1) + ' kg</b></div>').join('') + '</div>' : '') +
      '<span class="senin-son">Kimse görmedi. Sen yaptın.</span></div>';
  }
  function ekranIlerleme() {
    if (!S.profil) return ekranKarsilama();
    const kilolar = S.kilo.slice(-12);
    const gunler = Object.keys(S.gunluk).sort();
    const haftaBas = new Date(); haftaBas.setDate(haftaBas.getDate() - haftaGunu()); const hb = tarihKey(haftaBas);
    const buHafta = gunler.filter((k) => k >= hb && S.gunluk[k].antrenman).length;
    const rekorlar = Object.keys(S.rekor).sort((a, b) => (S.rekor[b].tarih > S.rekor[a].tarih ? 1 : -1));
    let grafik = '<p class="be-mini"><b>Çizgi ikinci tartıda başlar.</b> Bugün tart, haftaya bir daha. Gerisini biz çizeriz.</p>';
    if (kilolar.length >= 2) {
      const min = Math.min.apply(null, kilolar.map((x) => x.kg)) - 0.5, max = Math.max.apply(null, kilolar.map((x) => x.kg)) + 0.5;
      const W = 320, H = 110;
      const pts = kilolar.map((x, i) => [8 + (i * (W - 16)) / (kilolar.length - 1), 12 + (H - 26) * (1 - (x.kg - min) / (max - min))]);
      grafik = '<svg class="grafik" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Kilo ' + sayi(kilolar[0].kg, 1) + ' kilogramdan ' + sayi(kilolar[kilolar.length - 1].kg, 1) + ' kilograma"><line class="izgara-c" x1="0" y1="' + (H - 6) + '" x2="' + W + '" y2="' + (H - 6) + '"/><polyline class="cizgi" points="' + pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '"/><circle class="son" cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="5"/></svg>';
    }
    const fark = kilolar.length >= 2 ? kilolar[kilolar.length - 1].kg - kilolar[0].kg : 0;
    return ust(logo) + '<h1 class="baslik">İlerleme<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + seninComeback() + kasHaritasi() + kartKoleksiyon() + antrenmanIzgara() +
      '<div class="t koyu h150">' + seriKart('Hafta serisi') + '</div>' +
      '<div class="t kobalt h150"><span class="k">' + (sozDurum(haftaBasi()) ? 'Haftalık Plan' : 'Bu hafta') + '</span><span class="buyuk num">' + buHafta + '<span style="font-size:20px;letter-spacing:0;color:var(--kobalt-yumusak)"> / ' + (sozDurum(haftaBasi()) ? sozDurum(haftaBasi()).soz : S.profil.gun) + '</span></span><span class="k">antrenman</span></div>' +
      '<div class="t genis"><div class="satir"><span class="k">Kilo</span><span class="num" style="font-weight:800">' + (kilolar.length ? sayi(kilolar[kilolar.length - 1].kg, 1) + ' kg' : '') + (kilolar.length >= 2 ? ' <span style="color:var(--kobalt)">' + (fark > 0 ? '+' : '') + sayi(fark, 1) + '</span>' : '') + '</span></div>' + grafik +
      '<form data-form="kilo" class="satir" style="margin-top:4px"><label class="mini" style="flex:1"><span>Bugünkü tartın, kg</span><input name="kg" inputmode="decimal" placeholder="' + sayi(S.profil.kilo, 1) + '"></label><button class="btn siyah" type="submit" style="align-self:flex-end;min-height:44px">Kaydet</button></form></div>' +
      '<div class="t genis"><div class="satir"><span class="k">Rozetler</span><span class="ik num">' + rozetDurum().filter((r) => r.var).length + ' / ' + ROZET.length + '</span></div><div class="rozetler">' + rozetDurum().map((r) => '<div class="rozet' + (r.var ? ' var' : '') + '">' + rozetSvg(r.id, r.var) + '<b>' + esc(r.ad) + '</b><span>' + (r.var ? esc(r.acik) : 'Kilitli · ' + esc(r.acik)) + '</span></div>').join('') + '</div></div>' +
      '<a class="t kobalt genis sira-kart" href="#/siralama" style="flex-direction:row;align-items:center;justify-content:space-between"><span class="yigin"><span class="k">Bütün üyeler arasında</span><b style="font-size:20px">Haftalık ve aylık sıralama</b><span style="opacity:.85;font-size:14px">Hacim, set, antrenman</span></span>' + IK.ok.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</a>' +
      '<a class="t h130" href="#/olcu"><span class="k">Ölçüler</span><b style="font-size:19px">' + ((S.olcu || []).length ? 'Bel ' + sayi(S.olcu[S.olcu.length - 1].bel || 0, 1) + ' cm' : 'Bel, göğüs, kol…') + '</b><span class="ik">İlk ölçüme göre fark</span></a>' +
      '<a class="t koyu h130" href="#/rapor"><span class="k">Aylık rapor</span><b style="font-size:19px">' + AY[new Date().getMonth()] + '</b><span class="ik" style="color:var(--koyu-ikincil)">Ayın özeti</span></a>' +
      '<button class="t kobalt genis" data-act="paylas" style="flex-direction:row;align-items:center;justify-content:space-between;border:0;text-align:left;cursor:pointer"><span class="yigin"><span class="k">Haftalık kartın</span><b style="font-size:19px">Bu haftanı paylaş</b><span style="opacity:.8;font-size:14px">Instagram hikâyesine hazır görsel</span></span>' + IK.ok.replace('<svg', '<svg width="22" height="22" style="fill:none;stroke:currentColor;stroke-width:2.4;flex:none"') + '</button>' +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Rekorların</span><div class="liste">' + (rekorlar.length ? rekorlar.slice(0, 8).map((h) => '<div><div class="ad"><b>' + esc(D.HAREKET[h].ad) + '</b><span class="ik">' + esc(S.rekor[h].tarih) + '</span></div><b class="num">' + sayi(S.rekor[h].kg, 1) + ' kg × ' + S.rekor[h].tekrar + '</b></div>').join('') : '<div style="display:block;border:0">' + bosEkran('Henüz rekor yok', 'İlk seti kaydet. İlk rekor zaten o.', '<a class="btn ana kucuk" href="#/antrenman">Antrenmana git' + IK.ok + '</a>') + '</div>') + '</div></div>' +
      '</div>';
  }

  /* ---------- vücut ölçüleri ve fotoğraflar (fotoğraflar yalnızca bu cihazda, IndexedDB) ---------- */
  // ölçüler: [anahtar, ad, sol anahtarı (çiftse)]
  const OLCU_GRUP = [
    ['Gövde', [['boyun', 'Boyun'], ['omuz', 'Omuz çevresi'], ['gogus', 'Göğüs'], ['bel', 'Bel'], ['karin', 'Karın'], ['kalca', 'Kalça']]],
    ['Kollar', [['sag_kol', 'Pazu', 'sol_kol'], ['sag_onkol', 'Ön kol', 'sol_onkol']]],
    ['Bacaklar', [['sag_uyluk', 'Uyluk', 'sol_uyluk'], ['sag_baldir', 'Baldır', 'sol_baldir']]],
    ['Diğer', [['yag', 'Yağ oranı']]]
  ];
  const OLCU_ESKI = [['kol', 'Kol'], ['bacak', 'Uyluk']];
  const OLCU_HEPSI = [].concat.apply([], OLCU_GRUP.map((g) => [].concat.apply([], g[1].map((o) => o[2] ? [[o[0], o[1] + ' sağ'], [o[2], o[1] + ' sol']] : [[o[0], o[1]]])))).concat(OLCU_ESKI);
  const OLCU = OLCU_HEPSI;
  const OLCU_NASIL = [['Boyun', 'gırtlağın hemen altından'], ['Omuz', 'iki omuzun en geniş yerinden, kollar yanda'], ['Göğüs', 'meme ucu hizasından, nefesi verdikten sonra'], ['Bel', 'en ince yerinden ya da göbeğin 2 cm üstünden'], ['Karın', 'göbek deliği hizasından'], ['Kalça', 'kalçanın en çıkık yerinden'], ['Pazu', 'kol gevşek ve yanda, en kalın yerinden; kasılı ölçüyorsan hep kasılı ölç'], ['Ön kol', 'dirseğin hemen altındaki en kalın yerden'], ['Uyluk', 'kasık ile diz arasının en kalın yerinden'], ['Baldır', 'ayakta, en kalın yerinden']];
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
    const son = l[l.length - 1];
    const ilkOf = (k) => l.find((x) => x[k] != null);
    const sonOf = (k) => { for (let i = l.length - 1; i >= 0; i--) if (l[i][k] != null) return l[i]; return null; };
    const deger = (k) => { const x = sonOf(k); return x ? x[k] : null; };
    const fark = (k) => { const a = ilkOf(k); const z = sonOf(k); if (!a || !z || a === z) return ''; const son = z; const d = son[k] - a[k]; return '<span class="olcu-fark ' + (d < 0 ? 'eksi' : d > 0 ? 'arti' : '') + '">' + (d > 0 ? '+' : '') + sayi(d, 1) + '</span>'; };
    const tarihOf = (a) => { const d = new Date(a.slice(0, 10)); return d.getDate() + ' ' + AY[d.getMonth()] + ' ' + d.getFullYear(); };
    const birim = (k) => (k === 'yag' ? ' %' : ' cm');
    const kutu = (k, ad) => '<div><span class="ik">' + ad + '</span><b class="num">' + sayi(deger(k), 1) + '<small>' + birim(k) + '</small></b>' + fark(k) + '</div>';
    const ozet = son ? OLCU_GRUP.map((g) => {
      const satir = g[1].map((o) => {
        if (o[2]) { // sağ/sol çifti
          const sg = deger(o[0]), sl = deger(o[2]); if (sg == null && sl == null) return '';
          const fk = sg != null && sl != null ? Math.abs(sg - sl) : null;
          return '<div class="olcu-cift"><span class="k">' + o[1] + '</span><div class="olcu-izgara">' + (sg != null ? kutu(o[0], 'Sağ') : '') + (sl != null ? kutu(o[2], 'Sol') : '') + '</div>' + (fk != null ? '<span class="ik num">Sağ–sol farkı ' + sayi(fk, 1) + ' cm' + (fk >= 1.5 ? ' · zayıf tarafa tek taraflı hareket eklemeyi düşün' : '') + '</span>' : '') + '</div>';
        }
        return deger(o[0]) != null ? kutu(o[0], o[1]) : '';
      }).filter(Boolean);
      if (!satir.length) return '';
      return '<div class="olcu-grup"><span class="k">' + g[0] + '</span><div class="olcu-izgara">' + satir.filter((x) => x.indexOf('olcu-cift') < 0).join('') + '</div>' + satir.filter((x) => x.indexOf('olcu-cift') >= 0).join('') + '</div>';
    }).join('') : '';
    const girdi = (k, ad) => '<label class="mini"><span>' + ad + '</span><input name="' + k + '" inputmode="decimal" placeholder="' + (deger(k) != null ? sayi(deger(k), 1) : '—') + '"></label>';
    const eski = son && OLCU_ESKI.some((o) => son[o[0]] != null) ? '<span class="ik">Eski kayıtların: ' + OLCU_ESKI.filter((o) => son[o[0]] != null).map((o) => o[1] + ' ' + sayi(son[o[0]], 1) + ' cm').join(' · ') + '</span>' : '';
    return ust(geri('#/ilerleme'), '<span class="alt">Vücut</span>') +
      '<h1 class="baslik">Ölçüler<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      (son ? '<div class="t genis"><div class="satir"><span class="k">Son ölçüm · ' + esc(tarihOf(son.tarih)) + '</span>' + (l.length > 1 ? '<span class="ik">ilk ölçüme göre</span>' : '') + '</div>' + ozet + eski + '</div>' : '') +
      (l.length > 1 ? olcuGecmis(l) : '') +
      '<form data-form="olcu" class="t genis" novalidate style="gap:12px"><span class="k">Bugünkü ölçülerin · cm</span>' +
      OLCU_GRUP.map((g) => '<fieldset class="olcu-fs"><legend>' + g[0] + '</legend><div class="olcu-form' + (g[1].some((o) => o[2]) ? ' cift' : '') + '">' + g[1].map((o) => o[2] ? girdi(o[0], o[1] + ' · sağ') + girdi(o[2], o[1] + ' · sol') : girdi(o[0], o[1] + (o[0] === 'yag' ? ', %' : ''))).join('') + '</div></fieldset>').join('') +
      '<details class="olcu-nasil"><summary>Nasıl ölçülür?</summary><ul>' + OLCU_NASIL.map((x) => '<li><b>' + x[0] + ':</b> ' + x[1] + '</li>').join('') + '</ul></details>' +
      '<span class="ik">Hepsini girmen gerekmez; ölçtüklerini yaz. Sabah, aç karnına ve hep aynı yerden ölç.</span><button class="btn siyah" type="submit">Kaydet</button></form>' +
      '</div>';
  }
  function olcuGecmis(l) {
    const anahtar = OLCU_HEPSI.filter((o) => l.filter((x) => x[o[0]] != null).length >= 2);
    if (!anahtar.length) return '';
    const sec = anahtar.find((o) => o[0] === olcuSec) || anahtar[0];
    const nok = l.filter((x) => x[sec[0]] != null).slice(-12);
    const deg = nok.map((x) => x[sec[0]]); const mn = Math.min.apply(null, deg), mx = Math.max.apply(null, deg); const ar = mx - mn || 1;
    const W = 320, H = 110;
    const pts = nok.map((x, i) => [12 + (i * (W - 24)) / Math.max(1, nok.length - 1), 14 + (H - 34) * (1 - (x[sec[0]] - mn) / ar)]);
    return '<div class="t genis"><div class="satir"><span class="k">Gelişim</span><span class="ik num">' + nok.length + ' ölçüm</span></div>' +
      '<div class="yatay olcu-sec">' + anahtar.map((o) => '<button class="hap" data-act="olcu-sec" data-deger="' + o[0] + '" aria-pressed="' + (o[0] === sec[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
      '<svg class="olcu-grafik" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(sec[1]) + ' gelişimi"><polyline points="' + pts.map((p) => p.join(',')).join(' ') + '"/>' + pts.map((p, i) => '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="' + (i === pts.length - 1 ? 4.5 : 3) + '"/>').join('') +
      '<text x="12" y="' + (H - 4) + '">' + sayi(deg[0], 1) + '</text><text x="' + (W - 12) + '" y="' + (H - 4) + '" text-anchor="end">' + sayi(deg[deg.length - 1], 1) + (sec[0] === 'yag' ? ' %' : ' cm') + '</text></svg></div>';
  }
  let olcuSec = 'bel';

  /* ---------- sıralama ---------- */
  let sira = { donem: 'hafta', olcut: 'hacim', veri: null, yuk: false };
  function haftaAyOzet() {
    const bas = new Date(); bas.setDate(bas.getDate() - haftaGunu()); const hb = tarihKey(bas); const ay = tarihKey().slice(0, 7);
    const t = (f) => Object.keys(S.gunluk).filter(f).map((k) => S.gunluk[k].antrenman).filter(Boolean).reduce((a, x) => ({ hacim: a.hacim + (x.hacim || 0), set: a.set + (x.set || 0), antr: a.antr + 1 }), { hacim: 0, set: 0, antr: 0 });
    return { hafta: t((k) => k >= hb), ay: t((k) => k.indexOf(ay) === 0) };
  }
  async function skorGonder() { if (!hesap) return; try { await tistek('siralama/skor', 'POST', haftaAyOzet()); } catch (e) { /* yok */ } }
  async function siraYukle() {
    sira.yuk = true;
    try { const r = await tistek('siralama?donem=' + sira.donem + '&olcut=' + sira.olcut); sira.veri = r.ok ? r.j : { hata: r.j.hata || 'Yüklenemedi.' }; } catch (e) { sira.veri = { hata: 'Bağlantı kurulamadı.' }; }
    sira.yuk = false; if (location.hash.indexOf('#/siralama') === 0) render();
  }
  function ekranSiralama() {
    if (!S.profil) return ekranKarsilama();
    if (!hesap) return ust(geri('#/ilerleme')) + '<h1 class="baslik">Sıralama<span class="nokta">.</span></h1><div class="t"><span>Sıralamayı görmek için giriş yap.</span></div>';
    if (!sira.veri && !sira.yuk) siraYukle();
    const V = sira.veri; const ben = haftaAyOzet()[sira.donem];
    const OLC = [['hacim', 'Hacim'], ['set', 'Set'], ['antr', 'Antrenman']];
    const deg = (x) => sira.olcut === 'hacim' ? sayi(x.hacim) + ' kg' : sira.olcut === 'set' ? x.set + ' set' : x.antr + ' antrenman';
    const govde = !V ? '<p class="ik" style="padding:12px 4px">Yükleniyor…</p>' : V.hata ? '<p class="ik" style="padding:12px 4px">' + esc(V.hata) + '</p>' :
      (V.liste.length ? '<div class="liste sira-liste">' + V.liste.map((x) => '<div class="' + (x.ben ? 'ben' : '') + '"><span class="sira-no num' + (x.sira <= 3 ? ' ust' + x.sira : '') + '">' + x.sira + '</span>' + avatar(x.ad, x.fid, x.fv, 'kucuk') + '<div class="ad"><b>' + esc(x.ad) + (x.ben ? ' · sen' : '') + '</b><span class="ik num">' + [sayi(x.hacim) + ' kg', x.set + ' set', x.antr + ' antrenman'].join(' · ') + '</span></div><b class="num">' + deg(x) + '</b></div>').join('') + '</div>' : '<p class="ik" style="padding:12px 4px">' + (sira.donem === 'hafta' ? 'Bu hafta' : 'Bu ay') + ' henüz kimse sıralamada değil. İlk sen ol.</p>');
    return ust(geri('#/ilerleme'), '<span class="alt">Bütün üyeler</span>') +
      '<h1 class="baslik">Sıralama<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      (V && !V.hata && !V.katildi ? '<div class="t kobalt genis" style="gap:8px"><span class="k">Katılmak senin elinde</span><b style="font-size:20px;line-height:1.25">Sıralamada görünmek ister misin?</b><span style="opacity:.9;line-height:1.45">Katılırsan adın ve soyadının baş harfi (ör. ' + esc(gorunenAd()) + ') ile haftalık ve aylık hacmin, set ve antrenman sayın diğer üyelere görünür. İstediğin zaman çıkabilirsin.</span><button class="btn" data-act="sira-katil" data-acik="1" style="background:#fff;color:var(--kobalt);align-self:flex-start">Sıralamaya katıl</button></div>' : '') +
      '<div class="t h130"><span class="k">' + (sira.donem === 'hafta' ? 'Bu haftan' : 'Bu ayın') + '</span><span class="orta num">' + sayi(ben.hacim) + '<span class="ik" style="color:inherit"> kg</span></span><span class="k num">' + ben.set + ' set · ' + ben.antr + ' antrenman</span></div>' +
      '<div class="t koyu h130"><span class="k">Sıran</span><span class="orta num">' + (V && V.benim ? V.benim.sira + '<span style="font-size:18px;color:var(--koyu-ikincil)"> / ' + V.toplam + '</span>' : '—') + '</span><span class="k" style="color:var(--koyu-ikincil)">' + (V && V.katildi ? (V.benim ? OLC.find((o) => o[0] === sira.olcut)[1].toLocaleLowerCase('tr') + ' sıralaması' : 'antrenman bitirince görünürsün') : 'katılmadın') + '</span></div>' +
      '<div class="yatay genis" role="group" aria-label="Dönem">' + [['hafta', 'Bu hafta'], ['ay', 'Bu ay']].map((d) => '<button class="hap" data-act="sira-sec" data-tur="donem" data-deger="' + d[0] + '" aria-pressed="' + (sira.donem === d[0]) + '">' + d[1] + '</button>').join('') + '</div>' +
      '<div class="yatay genis sira-olcut" role="group" aria-label="Ölçüt">' + OLC.map((o) => '<button class="hap" data-act="sira-sec" data-tur="olcut" data-deger="' + o[0] + '" aria-pressed="' + (sira.olcut === o[0]) + '">' + o[1] + '</button>').join('') + '</div>' +
      '<div class="t genis" style="padding:6px 16px">' + govde + '</div>' +
      (V && V.katildi ? '<button class="metin-btn genis" data-act="sira-katil" data-acik="0" style="color:var(--ikincil)">Sıralamadan çık</button>' : '') +
      '<p class="not genis">Hafta pazartesi başlar. Hacim = kilo × tekrar (ısınma setleri hariç). Ağır kaldıranlar hacimde öne geçer; set ve antrenman sekmeleri herkese eşit şans verir.</p>' +
      '</div>';
  }
  const gorunenAd = () => { const p = String((hesap && hesap.ad) || '').trim().split(/\s+/); return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0].toLocaleUpperCase('tr') + '.' : p[0] || 'Ad S.'; };

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
      '<div class="t h150"><span class="k">Ortalama kalori</span><span class="orta num">' + (kcal.length ? sayi(ortK) : '—') + '</span><span class="k">' + kcal.length + ' gün kayıt · ' + uyum + ' gün hedefte</span></div>' +
      '<div class="t h150"><span class="k">Ortalama protein</span><span class="orta num">' + (kcal.length ? sayi(ortP) + '<span class="ik"> g</span>' : '—') + '</span><span class="ik">hedef ' + S.hedef.protein + ' g' + (su.length ? ' · su ort. ' + sayi(su.reduce((a, b) => a + b, 0) / su.length / 1000, 1) + ' L' : '') + '</span></div>' +
      '<div class="t genis"><span class="k">Kilo</span><span class="orta num">' + (kilo.length >= 2 ? sayi(kilo[0].kg, 1) + ' → ' + sayi(kilo[kilo.length - 1].kg, 1) + ' kg <span style="color:var(--kobalt)">(' + (kilo[kilo.length - 1].kg - kilo[0].kg >= 0 ? '+' : '') + sayi(kilo[kilo.length - 1].kg - kilo[0].kg, 1) + ')</span>' : kilo.length ? sayi(kilo[0].kg, 1) + ' kg' : '—') + '</span>' +
      (olc.length >= 2 && olc[0].bel != null && olc[olc.length - 1].bel != null ? '<span class="ik">Bel ' + sayi(olc[0].bel, 1) + ' → ' + sayi(olc[olc.length - 1].bel, 1) + ' cm</span>' : '') + '</div>' +
      (() => { const h = antr.filter((a) => a.fb); if (!h.length) return ''; const z = h.filter((a) => a.fb.zor); const ort = z.length ? z.reduce((x, a) => x + a.fb.zor, 0) / z.length : 0; const iyi = {}; h.forEach((a) => a.fb.iyi.forEach((g) => { iyi[g] = (iyi[g] || 0) + 1; }));
        const enIyi = Object.keys(iyi).sort((a, b) => iyi[b] - iyi[a]).slice(0, 3);
        return '<div class="t genis"><span class="k">Antrenman notların · ' + h.length + ' antrenman</span><span style="font-weight:700">' + (ort ? 'Ortalama zorluk: ' + ZORLUK[Math.round(ort) - 1].toLocaleLowerCase('tr') : 'Zorluk işaretlenmemiş') + (enIyi.length ? ' · en iyi hissettiğin: ' + enIyi.join(', ') : '') + '</span></div>'; })() +
      hisOneriKutu(31) +
      '<div class="t genis" style="padding:12px 16px 4px"><span class="k">Bu ayın rekorları · ' + rekor.length + '</span><div class="liste">' + (rekor.length ? rekor.map((h) => '<div><div class="ad"><b>' + esc(D.HAREKET[h].ad) + '</b><span class="ik">' + esc(S.rekor[h].tarih) + '</span></div><span class="num" style="font-weight:800">' + sayi(S.rekor[h].kg, 1) + ' kg × ' + S.rekor[h].tekrar + '</span></div>').join('') : '<div><span class="ik">Bu ay rekor yok. Bir sonraki ay senin.</span></div>') + '</div></div>' +
      '</div>';
  }

  /* haftalık iş kartı: 1080×1920, siyah sahne. Beden değil emek: gün, set, süre. */
  function haftaKarti() {
    const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = getComputedStyle(document.body).fontFamily;
    const haftaBas = haftaBasi(); const hb = tarihKey(haftaBas);
    const gunler = Object.keys(S.gunluk).filter((k) => k >= hb).sort();
    const antr = gunler.filter((k) => S.gunluk[k].antrenman).map((k) => S.gunluk[k].antrenman);
    const set = antr.reduce((a, y) => a + y.set, 0), dk = antr.reduce((a, y) => a + y.dk, 0);
    const rekor = Object.keys(S.rekor).filter((h) => { const t = S.rekor[h].tarih; return gunler.some((k) => new Date(k).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }) === t); }).length;
    const yaz = (t, X, Y, boyut, kalinlik, renk, ls, hiza) => { x.fillStyle = renk; x.font = kalinlik + ' ' + boyut + 'px ' + F; if ('letterSpacing' in x) x.letterSpacing = (ls || 0) + 'px'; x.textAlign = hiza || 'left'; x.fillText(t, X, Y); x.textAlign = 'left'; return x.measureText(t).width; };
    // zemin: siyah, ortada çok hafif kobalt ışık
    x.fillStyle = '#0B0B0D'; x.fillRect(0, 0, W, H);
    const gl = x.createRadialGradient(W * 0.5, 980, 40, W * 0.5, 980, 760); gl.addColorStop(0, 'rgba(46,75,255,.20)'); gl.addColorStop(1, 'rgba(46,75,255,0)'); x.fillStyle = gl; x.fillRect(0, 0, W, H);
    const bitis = new Date(haftaBas); bitis.setDate(bitis.getDate() + 6);
    yaz(haftaBas.getDate() + ' ' + AY[haftaBas.getMonth()] + ' – ' + bitis.getDate() + ' ' + AY[bitis.getMonth()], 90, 170, 36, 700, '#8B8A92', 1);
    // başlık
    if (antr.length) { yaz('Kimse', 90, 360, 150, 900, '#F3F1EC', -7); const w2 = yaz('izlemedi', 90, 500, 150, 900, '#F3F1EC', -7); yaz('.', 90 + w2 + 4, 500, 150, 900, '#4A63FF', 0); }
    else { yaz('Her şey bir', 90, 360, 130, 900, '#F3F1EC', -6); const w2 = yaz('setle başlar', 90, 490, 130, 900, '#F3F1EC', -6); yaz('.', 90 + w2 + 4, 490, 130, 900, '#4A63FF', 0); }
    // ana sayı: antrenman
    const wN = yaz(String(antr.length), 80, 960, 330, 900, '#FFFFFF', -16);
    yaz('antrenman', 80 + wN + 34, 860, 48, 800, '#F3F1EC', -1);
    const soz = sozDurum(haftaBas); const hedef = soz ? soz.soz : (S.profil ? S.profil.gun : 0);
    if (hedef) yaz((soz ? 'plan: ' : 'hedef: ') + hedef + ' gün', 80 + wN + 34, 930, 40, 700, '#6E86FF', 0);
    // gün noktaları
    const GH = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(haftaBas); d.setDate(d.getDate() + i); const k = tarihKey(d); const v = !!(S.gunluk[k] && S.gunluk[k].antrenman);
      const cx = 140 + i * 133, cy = 1080;
      x.beginPath(); x.arc(cx, cy, 38, 0, Math.PI * 2);
      if (v) { x.fillStyle = '#2E4BFF'; x.fill(); } else { x.lineWidth = 3; x.strokeStyle = '#2C2C33'; x.stroke(); }
      yaz(GH[i], cx, cy + 112, 32, 700, v ? '#F3F1EC' : '#5A5960', 0, 'center');
    }
    // alt sayılar
    x.fillStyle = '#222228'; x.fillRect(90, 1270, 900, 2);
    const kol = [[sayi(set), 'set'], [String(dk), 'dakika'], [String(rekor), rekor === 1 ? 'rekor' : 'rekor']];
    kol.forEach((k, i) => { const X = 90 + i * 320; yaz(k[0], X, 1410, 110, 900, '#F3F1EC', -5); yaz(k[1], X, 1470, 34, 700, '#8B8A92', 0); });
    // imza: Make the COMEBACK.
    yaz('Make the', 90, 1640, 44, 700, '#B9B6AE', -1);
    const wC = yaz('COMEBACK', 86, 1760, 120, 900, '#F3F1EC', -6); yaz('.', 86 + wC + 2, 1760, 120, 900, '#4A63FF', 0);
    yaz('comeback.com.tr', 90, 1840, 30, 700, '#5A5960', 1);
    return c;
  }

  /* söz kartı: 1080×1920, siyah sahne. Kişinin kendine verdiği haftalık söz; tutulunca tek limon an. */
  function sozKarti() {
    const W = 1080, H = 1920; const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    const F = getComputedStyle(document.body).fontFamily;
    const bas = haftaBasi(); const d = sozDurum(bas) || { soz: 0, yapilan: 0, gunler: [] };
    const tuttu = d.soz > 0 && d.yapilan >= d.soz;
    const yaz = (t, X, Y, boyut, kalinlik, renk, ls, hiza) => { x.fillStyle = renk; x.font = kalinlik + ' ' + boyut + 'px ' + F; if ('letterSpacing' in x) x.letterSpacing = (ls || 0) + 'px'; x.textAlign = hiza || 'left'; x.fillText(t, X, Y); x.textAlign = 'left'; return x.measureText(t).width; };
    x.fillStyle = '#0B0B0D'; x.fillRect(0, 0, W, H);
    const gl = x.createRadialGradient(W * 0.5, 900, 40, W * 0.5, 900, 760); gl.addColorStop(0, 'rgba(46,75,255,.22)'); gl.addColorStop(1, 'rgba(46,75,255,0)'); x.fillStyle = gl; x.fillRect(0, 0, W, H);
    const son = new Date(bas); son.setDate(son.getDate() + 6);
    yaz(bas.getDate() + ' ' + AY[bas.getMonth()] + ' – ' + son.getDate() + ' ' + AY[son.getMonth()], 90, 170, 36, 700, '#8B8A92', 1);
    yaz('Plan', 90, 380, 170, 900, '#F3F1EC', -8);
    const w2 = yaz(tuttu ? 'tamam' : 'hazır', 90, 540, 170, 900, '#F3F1EC', -8); yaz('.', 90 + w2 + 4, 540, 170, 900, tuttu ? '#D9F05A' : '#4A63FF', 0);
    const wN = yaz(String(d.soz), 80, 920, 330, 900, tuttu ? '#D9F05A' : '#FFFFFF', -16);
    yaz('gün', 80 + wN + 34, 820, 56, 800, '#F3F1EC', -1);
    yaz(d.yapilan + ' / ' + d.soz + ' yapıldı', 80 + wN + 34, 900, 40, 700, '#6E86FF', 0);
    const GH = ['P', 'S', 'Ç', 'P', 'C', 'C', 'P'];
    for (let i = 0; i < 7; i++) {
      const g = d.gunler[i] || {}; const cx = 140 + i * 133, cy = 1060;
      x.beginPath(); x.arc(cx, cy, 38, 0, Math.PI * 2);
      if (g.yapildi) { x.fillStyle = '#2E4BFF'; x.fill(); } else if (g.plan) { x.lineWidth = 5; x.strokeStyle = '#2E4BFF'; x.stroke(); } else { x.lineWidth = 3; x.strokeStyle = '#2C2C33'; x.stroke(); }
      yaz(GH[i], cx, cy + 112, 32, 700, g.yapildi || g.plan ? '#F3F1EC' : '#5A5960', 0, 'center');
    }
    x.fillStyle = '#222228'; x.fillRect(90, 1290, 900, 2);
    yaz(tuttu ? 'Kimse izlemedi. Sen yine de geldin.' : 'Kendime söz verdim. Gerisi bende.', 90, 1390, 50, 800, '#F3F1EC', -1);
    yaz('Make the', 90, 1640, 44, 700, '#B9B6AE', -1);
    const wC = yaz('COMEBACK', 86, 1760, 120, 900, '#F3F1EC', -6); yaz('.', 86 + wC + 2, 1760, 120, 900, '#4A63FF', 0);
    yaz('comeback.com.tr', 90, 1840, 30, 700, '#5A5960', 1);
    return c;
  }

  async function gorselPaylas(c, ad, baslik) {
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const dosya = new File([blob], ad, { type: 'image/png' });
    try { if (navigator.canShare && navigator.canShare({ files: [dosya] })) { await navigator.share({ files: [dosya], title: baslik }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = ad; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000); toast('Görsel indirildi.');
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
  /* ---------- profil resmi ---------- */
  const basHarf = (ad) => esc((String(ad || 'C').trim()[0] || 'C').toLocaleUpperCase('tr'));
  function avatar(ad, fid, fv, cls) {
    return '<span class="av' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + (fid && fv ? '<img src="/api/comeback/topluluk/foto/' + encodeURIComponent(fid) + '?v=' + fv + '" alt="" loading="lazy" decoding="async">' : basHarf(ad)) + '</span>';
  }
  const benAvatar = (cls) => avatar((S.profil && S.profil.ad) || (hesap && hesap.ad), hesap && hesap.id, hesap && hesap.foto, cls);
  // seçilen resmi ortadan kare kırpar, 192 px JPEG'e küçültür
  function avatarHazirla(dosya) {
    return new Promise((ok, red) => {
      const url = URL.createObjectURL(dosya); const im = new Image();
      im.onload = () => {
        const k = Math.min(im.naturalWidth, im.naturalHeight); const c = document.createElement('canvas'); c.width = c.height = 192;
        const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
        x.drawImage(im, (im.naturalWidth - k) / 2, (im.naturalHeight - k) / 2, k, k, 0, 0, 192, 192);
        URL.revokeObjectURL(url);
        let q = 0.85; let d = c.toDataURL('image/jpeg', q);
        while (d.length > 55000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
        ok(d);
      };
      im.onerror = () => { URL.revokeObjectURL(url); red(new Error('okunamadı')); };
      im.src = url;
    });
  }
  // kırpma: resmi sürükle, iki parmakla ya da kaydırıcıyla yakınlaştır; daire içindeki kısım kaydedilir
  const KA = 280; let kirp = null;
  function kirpAc(dosya) {
    if (!hesap) { toast('Profil resmi için giriş yap.'); return; }
    const url = URL.createObjectURL(dosya); const im = new Image();
    im.onload = () => {
      kirp = { im, url, z: 1, x: 0, y: 0, s0: KA / Math.min(im.naturalWidth, im.naturalHeight), p: new Map() };
      const el = document.createElement('div'); el.id = 'kirp'; el.className = 'kirp-arka'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Profil resmini kırp');
      el.innerHTML = '<div class="kirp-kutu"><b class="kirp-baslik">Resmini ayarla</b><span class="ik">Sürükleyerek kaydır, yakınlaştırmak için iki parmak ya da kaydırıcı.</span>' +
        '<div class="kirp-alan" id="kirpAlan"><img alt="" draggable="false" src="' + url + '"><span class="kirp-maske" aria-hidden="true"></span></div>' +
        '<label class="kirp-zoom"><span aria-hidden="true">−</span><input type="range" id="kirpZ" min="1" max="4" step="0.01" value="1" aria-label="Yakınlaştır"><span aria-hidden="true">+</span></label>' +
        '<div class="satir" style="flex-direction:row;gap:8px"><button class="btn cerceve" data-act="kirp-iptal" style="flex:1">Vazgeç</button><button class="btn ana" data-act="kirp-kaydet" style="flex:1">Kaydet</button></div></div>';
      document.body.appendChild(el); document.body.style.overflow = 'hidden';
      const alan = el.querySelector('#kirpAlan');
      alan.addEventListener('pointerdown', (e) => { alan.setPointerCapture(e.pointerId); kirp.p.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
      alan.addEventListener('pointermove', (e) => {
        if (!kirp || !kirp.p.has(e.pointerId)) return;
        const once = kirp.p.get(e.pointerId); const l = Array.from(kirp.p.values());
        if (kirp.p.size === 1) { kirp.x += e.clientX - once.x; kirp.y += e.clientY - once.y; }
        else if (kirp.p.size === 2) {
          const diger = l.find((q) => q !== once); const d0 = Math.hypot(once.x - diger.x, once.y - diger.y); const d1 = Math.hypot(e.clientX - diger.x, e.clientY - diger.y);
          if (d0 > 10) kirp.z = Math.max(1, Math.min(4, kirp.z * d1 / d0));
        }
        kirp.p.set(e.pointerId, { x: e.clientX, y: e.clientY }); kirpCiz();
      });
      const bitir = (e) => { if (kirp) kirp.p.delete(e.pointerId); };
      alan.addEventListener('pointerup', bitir); alan.addEventListener('pointercancel', bitir);
      alan.addEventListener('wheel', (e) => { e.preventDefault(); kirp.z = Math.max(1, Math.min(4, kirp.z * (e.deltaY < 0 ? 1.08 : 0.93))); kirpCiz(); }, { passive: false });
      el.querySelector('#kirpZ').addEventListener('input', (e) => { kirp.z = +e.target.value; kirpCiz(); });
      kirpCiz(); el.querySelector('[data-act="kirp-kaydet"]').focus();
    };
    im.onerror = () => { URL.revokeObjectURL(url); toast('Bu resim açılamadı. Başka bir resim dene.'); };
    im.src = url;
  }
  function kirpCiz() {
    if (!kirp) return; const k = kirp.s0 * kirp.z; const w = kirp.im.naturalWidth * k; const h = kirp.im.naturalHeight * k;
    kirp.x = Math.max(-(w - KA) / 2, Math.min((w - KA) / 2, kirp.x)); kirp.y = Math.max(-(h - KA) / 2, Math.min((h - KA) / 2, kirp.y));
    const img = document.querySelector('#kirpAlan img'); if (img) { img.style.width = w + 'px'; img.style.height = h + 'px'; img.style.transform = 'translate(' + (KA / 2 - w / 2 + kirp.x) + 'px,' + (KA / 2 - h / 2 + kirp.y) + 'px)'; }
    const r = document.getElementById('kirpZ'); if (r && Math.abs(+r.value - kirp.z) > 0.005) r.value = kirp.z;
  }
  function kirpKapat() { const el = document.getElementById('kirp'); if (el) el.remove(); document.body.style.overflow = ''; if (kirp) URL.revokeObjectURL(kirp.url); kirp = null; }
  function kirpSonuc() {
    const k = kirp.s0 * kirp.z; const w = kirp.im.naturalWidth * k; const h = kirp.im.naturalHeight * k;
    const sol = KA / 2 - w / 2 + kirp.x, ust_ = KA / 2 - h / 2 + kirp.y;
    const c = document.createElement('canvas'); c.width = c.height = 192; const x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    x.drawImage(kirp.im, -sol / k, -ust_ / k, KA / k, KA / k, 0, 0, 192, 192);
    let q = 0.85; let d = c.toDataURL('image/jpeg', q);
    while (d.length > 55000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
    return d;
  }
  let avatarYuk = false;
  async function avatarYukle(dosya, hazir) {
    if (!hesap) { toast('Profil resmi için giriş yap.'); return; }
    avatarYuk = true; render();
    try {
      const d = hazir || await avatarHazirla(dosya);
      const r = await istek('foto', 'POST', { foto: d });
      if (r.ok) { hesap.foto = r.j.foto; toast('Profil resmin güncellendi.'); } else toast(r.j.hata || 'Yüklenemedi.');
    } catch (e) { toast('Bu resim açılamadı. Başka bir resim dene.'); }
    avatarYuk = false; render();
  }

  /* ---------- mesaj sayacı ---------- */
  let okunmamis = 0; let okunmamisZaman = null;
  let navOnceki = null;
  // boş ekran: markanın sesiyle bir başlık, bir cümle, tek eylem
  const bosEkran = (baslik, metin, eylem) => '<div class="t genis bos-ekran"><b class="be-baslik">' + baslik + '<span class="nokta">.</span></b><span class="be-metin">' + metin + '</span>' + (eylem || '') + '</div>';
  function odakKay(yon) { const e = document.querySelector('.odak-kart'); if (e && e.animate && !azHareket) e.animate([{ transform: 'translateX(' + (yon * 28) + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' }); }
  (function () { let x0 = null, y0 = 0, t0 = 0;
    document.addEventListener('touchstart', (e) => { const k = e.target.closest('.odak-kart'); if (!k || e.target.closest('input,button,a,.plaka')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
    document.addEventListener('touchend', (e) => { if (x0 == null || !S.seans) return; const dx = e.changedTouches[0].clientX - x0; const dy = e.changedTouches[0].clientY - y0; x0 = null;
      if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7 || Date.now() - t0 > 700) return;
      const hl = seansHareket(S.seans); const oi = odakIdx(S.seans, hl, seansAnahtar({ hareketler: hl })); const n = oi + (dx < 0 ? 1 : -1); if (n < 0 || n >= hl.length) return;
      EYLEM['odak-git']({ dataset: { i: String(n) } }); }, { passive: true });
  })();
  // küçük ilerleme halkası (widget): açılışta dolar
  const halka = (p) => '<svg class="halka" viewBox="0 0 44 44" aria-hidden="true"><circle class="iz" cx="22" cy="22" r="18"/><circle class="dolu" cx="22" cy="22" r="18" style="--p:' + Math.min(100, Math.max(0, p)) + '"/></svg>';
  /* antrenman bitince tek seferlik kutlama: kobalt ve krem parçalar başlıktan dökülür; rekor varsa limon da katılır */
  function kutla(rekor) {
    if (azHareket) return; const c = document.createElement('canvas'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight; c.width = W * dpr; c.height = H * dpr; c.className = 'kutlama'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c);
    const x = c.getContext('2d'); x.scale(dpr, dpr);
    const renk = rekor ? ['#2E4BFF', '#4A63FF', '#F3F1EC', '#D9F05A', '#D9F05A'] : ['#2E4BFF', '#4A63FF', '#F3F1EC', '#8EA0FF'];
    const b = document.querySelector('.baslik'); const r0 = b ? b.getBoundingClientRect() : { left: W / 2 - 100, width: 200, top: 120, height: 40 };
    const P = Array.from({ length: 70 }, () => ({ x: r0.left + Math.random() * r0.width, y: r0.top + r0.height * 0.6, vx: (Math.random() - 0.5) * 7, vy: -4 - Math.random() * 7, w: 5 + Math.random() * 6, h: 8 + Math.random() * 10, a: Math.random() * 6.3, va: (Math.random() - 0.5) * 0.3, r: renk[(Math.random() * renk.length) | 0] }));
    const t0 = performance.now();
    (function kare(t) {
      const g = (t - t0) / 1000; x.clearRect(0, 0, W, H);
      P.forEach((p) => { p.vy += 0.32; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.globalAlpha = Math.max(0, 1 - Math.max(0, g - 1.1) / 0.6); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.r; x.beginPath(); x.roundRect ? x.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, 2) : x.rect(-p.w / 2, -p.h / 2, p.w, p.h); x.fill(); x.restore(); });
      if (g < 1.7) requestAnimationFrame(kare); else c.remove();
    })(t0);
  }
  // dokunulan öğe küçük bir yayla yerine oturur
  function sicra(sec) { const e = document.querySelector(sec); if (e && e.animate && !azHareket) e.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.23,1,.32,1)' }); }
  function navRozet() { const a = nav.querySelector('a[data-tab="profil"]'); if (a) a.classList.toggle('yeni', okunmamis > 0); }
  async function okunmamisYukle() {
    if (!hesap || document.hidden) return;
    try {
      const r = await tistek('mesaj-ozet');
      if (r.ok && (r.j.okunmamis || 0) !== okunmamis) {
        okunmamis = r.j.okunmamis || 0; navRozet();
        const y = location.hash; if (y === '#/profil' || y === '#/mesajlar') { if (y === '#/mesajlar') mk.liste = null; render(); }
      }
    } catch (e) { /* çevrimdışı */ }
  }
  function okunmamisBaslat() { if (okunmamisZaman || !hesap) return; okunmamisYukle(); okunmamisZaman = setInterval(okunmamisYukle, 60000); }

  /* ---------- mesaj kutusu ---------- */
  const mk = { liste: null, yuk: false };
  async function mkYukle() {
    if (mk.yuk) return; mk.yuk = true;
    try { const r = await tistek('mesaj-kutu'); mk.liste = r.ok ? r.j.liste : { hata: r.j.hata || 'Mesajlar açılamadı.' }; } catch (e) { mk.liste = { hata: 'İnternet bağlantısı yok.' }; }
    mk.yuk = false; render();
  }
  function ekranMesajlar() {
    if (!hesap) { location.hash = '#/profil'; return ''; }
    if (!mk.liste) { mkYukle(); return ust(geri('#/profil'), '<span class="alt">Mesajlar</span>') + '<h1 class="baslik">Mesajlar<span class="nokta">.</span></h1><p class="ik" style="padding:0 4px">Yükleniyor…</p>'; }
    const L = mk.liste;
    const govde = L.hata ? '<div class="t genis"><span>' + esc(L.hata) + '</span></div>'
      : !L.length ? '<div class="t genis" style="gap:8px"><b style="font-size:18px">Henüz yazışman yok</b><span class="ik" style="line-height:1.5">' + (hocaMi() ? 'Öğrencilerin sana kodunla bağlandığında burada yazışabilirsin. Kodunu Hoca panelinde bulursun.' : 'Bir hocaya bağlandığında burada onunla yazışırsın. Hocandan aldığın kodu Menü\'deki "Hocam" kutusuna yaz.') + '</span>' + (hocaMi() ? '<a class="btn siyah" href="#/hoca" style="align-self:flex-start;min-height:44px">Hoca paneline git</a>' : '<a class="btn siyah" href="#/profil" style="align-self:flex-start;min-height:44px">Hoca koduyla bağlan</a>') + '</div>'
      : '<div class="mn-kutu genis">' + L.map((x) => '<a class="mn-satir mk-satir' + (x.yeni ? ' yeni' : '') + '" href="#/mesaj/' + encodeURIComponent(x.id) + '">' + avatar(x.ad, x.id, x.foto, 'orta') +
        '<span class="mn-yazi"><b>' + esc(x.ad) + '<small>' + (x.hoca ? 'Hocan' : 'Öğrencin') + '</small></b><span>' + (x.son ? (x.benden ? 'Sen: ' : '') + esc(x.son) : 'Henüz mesaj yok, ilk mesajı sen yaz.') + '</span></span>' +
        '<span class="mk-sag">' + (x.zaman ? '<span class="num">' + zamanOnce(x.zaman) + '</span>' : '') + (x.yeni ? '<i class="num" aria-label="' + x.yeni + ' okunmamış mesaj">' + x.yeni + '</i>' : '') + '</span></a>').join('') + '</div>';
    return ust(geri('#/profil'), '<button class="ikon-btn" data-act="mk-yenile" aria-label="Yenile" style="background:#fff">' + IK.degis + '</button>') +
      '<h1 class="baslik">Mesajlar<span class="nokta">.</span></h1>' +
      '<p class="ik" style="padding:0 4px 6px">Hocanla ya da öğrencilerinle yazışmaların. Sadece birbirine bağlı kişiler yazışabilir.</p>' +
      '<div class="izgara">' + govde + '</div>';
  }

  /* ---------- ana sayfa sıralama kartı ---------- */
  let sOzet = null; let sOzetZaman = 0; let sOzetYuk = false;
  try { sOzet = JSON.parse(localStorage.getItem('cb-sira-ozet') || 'null'); } catch (e) { /* yok */ }
  async function sOzetYukle() {
    if (!hesap || sOzetYuk || Date.now() - sOzetZaman < 180000) return;
    sOzetYuk = true; sOzetZaman = Date.now();
    try {
      await skorGonder();
      const r = await tistek('siralama/ozet');
      if (r.ok) { sOzet = r.j; try { localStorage.setItem('cb-sira-ozet', JSON.stringify(r.j)); } catch (e) { /* yok */ } if (!location.hash || location.hash === '#/') render(); }
    } catch (e) { /* çevrimdışı */ }
    sOzetYuk = false;
  }
  function siraKart() {
    if (!hesap) return '';
    sOzetYukle();
    const o = sOzet;
    if (!o) return '<a class="t genis sira-kart" href="#/siralama"><span class="k">Bu hafta · sıralama</span><span class="ik">Yükleniyor…</span></a>';
    const ilk = (o.ilk || []).map((x) => '<span class="sk-kisi' + (x.ben ? ' ben' : '') + '">' + avatar(x.ad, x.fid, x.fv, 'kucuk') + '<span><b class="num">' + x.sira + '.</b> ' + esc(x.ben ? 'Sen' : x.ad) + '</span></span>').join('');
    if (!o.katildi) return '<a class="t genis sira-kart" href="#/siralama"><div class="sk-ust"><span class="k">Bu hafta · sıralama</span>' + (o.toplam >= 3 ? '<span class="k num">' + sayi(o.toplam) + ' kişi yarışıyor</span>' : '') + '</div><b class="sk-baslik">' + (o.toplam >= 3 ? 'Sen de listeye gir' : 'Bu hafta ilk sen ol') + '</b><span class="ik">Haftalık hacmin diğer üyelerle yarışsın. Katılmak senin elinde, istediğin zaman çıkarsın.</span>' + (ilk ? '<div class="sk-ilk">' + ilk + '</div>' : '') + '<span class="btn siyah kucuk" style="align-self:flex-start">Sıralamaya katıl' + IK.ok + '</span></a>';
    if (!o.benim) return '<a class="t genis sira-kart" href="#/siralama"><div class="sk-ust"><span class="k">Bu hafta · sıralama</span><span class="k num">' + sayi(o.toplam) + ' kişi</span></div><b class="sk-baslik">Bu hafta henüz listede değilsin</b><span class="ik">Bir antrenman bitir, hacmin sayılsın ve sıran çıksın.</span>' + (ilk ? '<div class="sk-ilk">' + ilk + '</div>' : '') + '</a>';
    const yuzde = o.toplam > 1 ? Math.max(1, Math.round(o.benim.sira / o.toplam * 100)) : 0;
    return '<a class="t genis sira-kart var" href="#/siralama"><div class="sk-ust"><span class="k">Bu hafta · hacim sıralaması</span><span class="k">Tümü →</span></div>' +
      '<div class="sk-sira"><span class="sk-no num">' + o.benim.sira + '<i>.</i></span><span class="sk-yan"><b class="num">' + sayi(o.toplam) + ' kişi arasında</b><span class="num">' + sayi(o.benim.hacim) + ' kg kaldırdın' + (yuzde && o.benim.sira > 3 ? ' · ilk %' + yuzde + '\'tesin' : '') + '</span></span></div>' +
      (ilk ? '<div class="sk-ilk">' + ilk + '</div>' : '') + '</a>';
  }

  /* ---------- haftalık plan: hafta başında hangi günler geleceğini sor ---------- */
  const KISA_GUN = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
  function haftaBasi(dt) { const d = new Date(dt || new Date()); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - haftaGunu(d)); return d; }
  // pazar günü gelecek haftayı, diğer günler bu haftayı planlar
  function planHaftasi() { const b = haftaBasi(); if (haftaGunu() === 6) b.setDate(b.getDate() + 7); return b; }
  const antrenmanGunleri = () => (S.program ? S.program.gunler.filter((g) => g.hareketler.length) : []);
  let hpTaslak = null;
  function hpVarsayilan(bas) {
    const p = (S.haftaPlan || {})[tarihKey(bas)]; if (p) return p.gunler.slice();
    return antrenmanGunleri().map((g) => g.hafta).filter((h) => h >= 0 && h <= 6).sort();
  }
  function haftaPlanUygula(bas, secili) {
    S.takvim = S.takvim || {}; S.haftaPlan = S.haftaPlan || {};
    const ag = antrenmanGunleri().slice().sort((a, b) => a.hafta - b.hafta);
    const bugunK = tarihKey(); let sira = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(bas); d.setDate(d.getDate() + i); const k = tarihKey(d);
      if (S.takvim[k] && S.takvim[k].plan) delete S.takvim[k];
      if (k < bugunK || (S.gunluk[k] && S.gunluk[k].antrenman)) { if (secili.indexOf(i) >= 0) sira++; continue; }
      if (secili.indexOf(i) >= 0) { if (ag.length) S.takvim[k] = { gunId: ag[sira % ag.length].id, plan: 1 }; sira++; }
      else if (gunIcin(d)) S.takvim[k] = { off: true, plan: 1 };
    }
    S.haftaPlan[tarihKey(bas)] = { gunler: secili.slice().sort(), zaman: Date.now() };
    // eski haftaları temizle
    Object.keys(S.haftaPlan).forEach((k) => { if (k < tarihKey(haftaBasi(new Date(Date.now() - 35 * 864e5)))) delete S.haftaPlan[k]; });
  }
  // haftalık söz: planlanan gün sayısı kişinin kendine verdiği sözdür; yapılan antrenmanlarla karşılaştırılır
  function sozDurum(bas) {
    const p = (S.haftaPlan || {})[tarihKey(bas)]; if (!p || !p.gunler.length) return null;
    let yapilan = 0; const gunler = [];
    for (let i = 0; i < 7; i++) { const d = new Date(bas); d.setDate(d.getDate() + i); const k = tarihKey(d); const v = !!(S.gunluk[k] && S.gunluk[k].antrenman); if (v) yapilan++; gunler.push({ plan: p.gunler.indexOf(i) >= 0, yapildi: v, gecti: k < tarihKey(), bugun: k === tarihKey() }); }
    return { soz: p.gunler.length, yapilan, gunler };
  }
  function sozKutu() {
    const bas = haftaBasi(); const d = sozDurum(bas); if (!d) return '';
    const tuttu = d.yapilan >= d.soz;
    return '<div class="t genis soz-kutu"><div class="satir"><span class="k">Haftalık Plan</span><span class="soz-sayi num"><b>' + d.yapilan + '</b> / ' + d.soz + ' gün</span></div>' +
      '<div class="soz-gunler" aria-hidden="true">' + d.gunler.map((g, i) => '<span class="' + [g.yapildi ? 'ok' : '', g.plan ? 'plan' : '', g.gecti && g.plan && !g.yapildi ? 'kacti' : '', g.bugun ? 'bugun' : ''].join(' ').trim() + '">' + KISA_GUN[i].charAt(0) + '</span>').join('') + '</div>' +
      (tuttu ? '<span class="ik">Planını tamamladın. Fazlası senden.</span>' : '') + '</div>';
  }
  function sozSonuc() {
    // pazar: bu hafta, pazartesi: geçen hafta
    const ref = new Date(planHaftasi()); ref.setDate(ref.getDate() - 7); const d = sozDurum(ref); if (!d) return '';
    const bu = haftaGunu() === 6;
    if (d.yapilan >= d.soz) return '<span class="soz-sonuc">' + (bu ? 'Bu hafta' : 'Geçen hafta') + ' sözünü tuttun: ' + d.yapilan + ' / ' + d.soz + '.</span>';
    return '<span class="soz-sonuc">' + (bu ? 'Bu hafta şimdilik' : 'Geçen hafta') + ' ' + d.yapilan + ' / ' + d.soz + '.' + (bu ? '' : ' Sorun değil. Bıraktığın yerden.') + '</span>';
  }
  function haftaPlanKutu(tam) {
    if (!S.program || !antrenmanGunleri().length) return '';
    const bas = planHaftasi(); const anahtar = tarihKey(bas); const kayitli = (S.haftaPlan || {})[anahtar];
    if (!tam && (kayitli || (S.ayar && S.ayar.hpGec === anahtar) || [6, 0].indexOf(haftaGunu()) < 0)) return '';
    if (!hpTaslak || hpTaslak.hafta !== anahtar) hpTaslak = { hafta: anahtar, gunler: hpVarsayilan(bas) };
    const son = new Date(bas); son.setDate(son.getDate() + 6);
    const aralik = bas.getDate() + (bas.getMonth() !== son.getMonth() ? ' ' + AY[bas.getMonth()] : '') + '–' + son.getDate() + ' ' + AY[son.getMonth()];
    const n = hpTaslak.gunler.length; const pn = antrenmanGunleri().length;
    const bugunI = tarihKey(bas) === tarihKey(haftaBasi()) ? haftaGunu() : -1;
    return '<div class="t genis hp-kutu' + (tam ? '' : ' kobalt') + '" style="gap:12px"><div class="satir" style="flex-direction:row;align-items:baseline;justify-content:space-between;gap:8px"><span class="k">' + (haftaGunu() === 6 ? 'Gelecek hafta' : 'Bu hafta') + ' · ' + aralik + '</span>' + (!tam ? '<button class="metin-btn kucuk-metin" data-act="hp-gec" style="color:inherit;opacity:.8">Şimdi değil</button>' : '') + '</div>' +
      (!tam ? sozSonuc() : '') +
      '<span class="orta" style="font-size:22px;line-height:1.2">' + (kayitli && tam ? 'Sözün hazır, istersen değiştir.' : (haftaGunu() === 6 ? 'Gelecek hafta' : 'Bu hafta') + ' kaç gün geliyorsun? Kendine söz ver.') + '</span>' +
      '<div class="hp-gunler" role="group" aria-label="Antrenman günleri">' + KISA_GUN.map((g, i) => '<button class="hp-gun" data-act="hp-gun" data-i="' + i + '" aria-pressed="' + (hpTaslak.gunler.indexOf(i) >= 0) + '"' + (bugunI > i ? ' disabled' : '') + '>' + g + '</button>').join('') + '</div>' +
      '<span class="' + (tam ? 'ik' : '') + '" style="font-size:14px;line-height:1.45' + (tam ? '' : ';opacity:.9') + '">' + n + ' gün seçtin' + (n !== pn ? ', programın ' + pn + ' gün. Seçtiğin günlere antrenmanları sırayla dağıtırız' + (n < pn ? '; yetişmeyenler sonraki haftaya kayar.' : '; fazla günlerde programın baştan döner.') : '. Antrenmanlar bu günlere sırayla yerleşir.') + '</span>' +
      '<button class="btn ' + (tam ? 'ana' : 'beyaz') + '" data-act="hp-kaydet" style="align-self:flex-start"' + (n ? '' : ' disabled') + '>Söz veriyorum · ' + n + ' gün</button></div>';
  }
  // ana sayfada bu hafta: hangi günler geleceğin, hangileri bitti; gelecek günlere dokununca plan değişir
  function haftaKart() {
    if (!S.program || !antrenmanGunleri().length) return '';
    const bas = haftaBasi(); const p = (S.haftaPlan || {})[tarihKey(bas)];
    const secili = p ? p.gunler : hpVarsayilan(bas); const bugunK = tarihKey();
    let yapilan = 0; let sirada = null;
    const hucre = KISA_GUN.map((g, i) => {
      const d = new Date(bas); d.setDate(d.getDate() + i); const k = tarihKey(d);
      const bitti = !!(S.gunluk[k] && S.gunluk[k].antrenman); if (bitti) yapilan++;
      const plan = secili.indexOf(i) >= 0; const gecti = k < bugunK; const bugun = k === bugunK;
      const pg = plan && !gecti && !bitti ? gunIcin(d) : null;
      if (pg && !sirada) sirada = { i, ad: pg.ad, bugun };
      const sinif = ['hk-gun', bitti ? 'bitti' : '', plan ? 'plan' : '', gecti && plan && !bitti ? 'kacti' : '', bugun ? 'bugun' : ''].join(' ').replace(/\s+/g, ' ').trim();
      const ic = '<span class="hk-ad">' + g + '</span><span class="hk-no num">' + d.getDate() + '</span><span class="hk-isaret" aria-hidden="true"></span>';
      const durum = bitti ? 'antrenman yapıldı' : plan ? (gecti ? 'planlıydı, yapılmadı' : 'antrenman günü') : 'dinlenme';
      if (gecti || bitti || (bugun && S.seans)) return '<span class="' + sinif + '" aria-label="' + GUN_AD[i] + ' ' + d.getDate() + ', ' + durum + '">' + ic + '</span>';
      return '<button type="button" class="' + sinif + '" data-act="hk-gun" data-i="' + i + '" aria-pressed="' + plan + '" aria-label="' + GUN_AD[i] + ' ' + d.getDate() + ', ' + durum + '. Değiştirmek için dokun.">' + ic + '</button>';
    }).join('');
    const n = secili.length;
    const alt = sirada ? (sirada.bugun ? 'Bugün: ' : 'Sıradaki: ' + GUN_AD[sirada.i] + ' · ') + esc(sirada.ad) : (n ? 'Bu haftanın planlı günleri bitti.' : 'Bu hafta plan yok. Geleceğin günlere dokun.');
    return '<div class="t genis hk-kutu"><div class="satir" style="flex-direction:row;align-items:baseline;justify-content:space-between;gap:8px"><span class="k">' + (p ? 'Haftalık Plan' : 'Bu hafta') + '</span><span class="k num">' + yapilan + ' / ' + n + ' gün</span></div>' +
      '<div class="hk-gunler" role="group" aria-label="Bu haftanın günleri">' + hucre + '</div>' +
      '<div class="hk-son"><span class="hk-alt">' + alt + '</span>' + (p && n ? '<button type="button" class="metin-btn hk-paylas" data-act="soz-paylas">' + (yapilan >= n ? 'Plan tamam · paylaş' : 'Planını paylaş') + '</button>' : '') + '</div></div>';
  }
  function ekranHaftaPlan() {
    if (!S.profil) return ekranKarsilama();
    const bas = planHaftasi(); const p = (S.haftaPlan || {})[tarihKey(bas)];
    return ust(geri('#/profil')) + '<h1 class="baslik">Haftalık plan<span class="nokta">.</span></h1>' +
      '<div class="izgara">' + haftaPlanKutu(true) +
      (p ? '<div class="t genis"><span class="k">Bu haftanın takvimi</span>' + KISA_GUN.map((g, i) => { const d = new Date(bas); d.setDate(d.getDate() + i); const pg = gunIcin(d); return '<div class="satir num" style="padding:6px 0;border-top:' + (i ? '1px solid var(--zemin)' : '0') + '"><span>' + GUN_AD[i] + ' ' + d.getDate() + '</span><b>' + (pg ? esc(pg.ad) : '<span class="ik">dinlenme</span>') + '</b></div>'; }).join('') + '</div>' : '') +
      '<p class="ik genis" style="padding:0 4px">Pazar günü gelecek haftayı, pazartesi bu haftayı planlaman için ana sayfada hatırlatırız.</p></div>';
  }

  // Menü (alt çubukta COMEBACK.) — uygulamanın her köşesine buradan gidilir
  const MIK = {
    program: '<path d="M4 6h16M4 12h10M4 18h7"/><path d="M17 15l2 2 3-4"/>',
    plan: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    jam: '<circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M3 19c.8-3 2.8-4.5 5-4.5S12.2 16 13 19M11 19c.8-3 2.8-4.5 5-4.5S20.2 16 21 19"/>',
    gonder: '<path d="M4 12l16-8-6 16-3-6z"/><path d="M11 14l9-10"/>',
    hedef: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".5"/>',
    bplan: '<path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 2-2 6 0 8v10"/>',
    takviye: '<rect x="4" y="9" width="16" height="7" rx="3.5" transform="rotate(-35 12 12.5)"/><path d="M9.2 8.6l5.6 7.8"/>',
    topluluk: '<path d="M4 5h16v10H9l-5 4z"/>',
    siralama: '<path d="M8 21V11M12 21V5M16 21v-7"/>',
    ogrenci: '<path d="M3 9l9-4 9 4-9 4z"/><path d="M7 11v4c0 1.5 2.5 3 5 3s5-1.5 5-3v-4"/>',
    gorus: '<path d="M4 5h16v11H8l-4 4z"/><path d="M8 10h8"/>',
    yonetim: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    mesaj: '<path d="M4 6h16v10H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
    gizlilik: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    kisi: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
    ses: '<path d="M4 10v4h4l5 4V6L8 10z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>',
    agirlik: '<path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12"/>',
    gorunum: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>',
    zil: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    veri: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>'
  };
  const OK_SAG = '<svg class="mn-ok" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  function mSatir(href, ik, baslik, alt, renk, sayac) {
    return '<a class="mn-satir" href="' + href + '"' + (href.indexOf('http') === 0 || href.indexOf('.html') > 0 ? ' target="_blank" rel="noopener"' : '') + '><span class="mn-ik' + (renk ? ' ' + renk : '') + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + MIK[ik] + '</svg></span><span class="mn-yazi"><b>' + baslik + '</b>' + (alt ? '<span>' + alt + '</span>' : '') + '</span>' + (sayac ? '<i class="mn-sayac num" aria-label="' + sayac + ' yeni">' + sayac + '</i>' : '') + OK_SAG + '</a>';
  }
  function mGrup(ad, satirlar) {
    const ic = satirlar.filter(Boolean).join(''); if (!ic) return '';
    return '<section class="mn-grup genis" aria-label="' + ad + '"><h2 class="mn-baslik">' + ad + '</h2><div class="mn-kutu">' + ic + '</div></section>';
  }
  function ekranProfil() {
    if (!S.profil) return ekranKarsilama();
    const p = S.profil; const tk = S.takviye || [];
    const kilo = S.kilo.length ? S.kilo[S.kilo.length - 1].kg : p.kilo;
    return ust(logo) + '<h1 class="baslik">Menü<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<a class="t genis mn-profil" href="#/profilim">' + benAvatar('buyuk') + '<span class="mn-yazi"><b>' + esc(p.ad || 'Profilim') + '</b><span class="num">' + p.yas + ' yaş · ' + p.boy + ' cm · ' + sayi(kilo, 1) + ' kg</span><span>Profilim · bilgiler, hedef, hesap</span></span>' + OK_SAG + '</a>' +
      mGrup('Antrenman', [
        mSatir('#/plan', 'program', 'Programım', esc(S.program.ad) + ' · ayrıntılar ve düzenleme'),
        mSatir('#/haftaplan', 'plan', 'Haftalık plan', 'Bu hafta hangi günler geliyorsun'),
        mSatir('#/jam', 'jam', 'Ortak antrenman', 'Arkadaşınla aynı anda, Jam ile'),
        mSatir('#/paylas', 'gonder', 'Program gönder', 'Arkadaşına programını yolla')
      ]) +
      (hocaMi() ? mGrup('Hoca paneli', [mSatir('#/hoca', 'ogrenci', 'Öğrencilerim', 'Kod, programlar, antrenmanlar', 'kobalt')]) : '') +
      mGrup('Beslenme', [
        mSatir('#/hedef', 'hedef', 'Günlük hedef', sayi(S.hedef.kcal) + ' kcal · ' + S.hedef.protein + ' g protein'),
        mSatir('#/bplan', 'bplan', 'Beslenme programı', S.bplan ? esc(S.bplan.ad) : 'Yapay zekâ ile hazırla'),
        mSatir('#/takviye', 'takviye', 'Takviyeler', tk.length ? tk.map((x) => esc(x.ad)).slice(0, 3).join(', ') : 'Takviye takibini aç')
      ]) +
      mGrup('Topluluk', [
        hesap ? mSatir('#/mesajlar', 'mesaj', 'Mesajlar', okunmamis ? okunmamis + ' okunmamış mesaj' : (hocaMi() ? 'Öğrencilerinle yazış' : 'Hocanla yazış'), 'kobalt', okunmamis) : '',
        hesap ? mSatir('#/topluluk', 'topluluk', 'Forum ve meydan okuma', 'Sor, paylaş, arkadaşınla yarış', 'limon') : '',
        mSatir('#/topluluk/rehber', 'plan', 'Rehber', 'Her kas grubu için kısa yazılar'),
        hesap ? mSatir('#/siralama', 'siralama', 'Sıralama', 'Haftalık ve aylık hacim tablosu') : ''
      ]) +
      hocaKutu().replace('class="t h130"', 'class="t genis"') +
      ayarGrup() +
      mGrup('COMEBACK.', [
        mSatir('#/gorus', 'gorus', 'Görüş bildir', 'Hata, öneri, beğendiğin bir şey'),
        hesap && hesap.rol === 'admin' ? mSatir('#/yonetim', 'yonetim', 'Yönetim', 'Yalnızca sen görürsün', 'koyu') : '',
        mSatir('gizlilik.html', 'gizlilik', 'Gizlilik', 'Hangi veriyi neden saklıyoruz')
      ]) +
      '</div>';
  }
  // Profilim: kişisel bilgiler, hesap; silme ve sıfırlama en altta kapalı bölümde
  let silSet = null, silSetZ = 0;
  let veriAcik = false;
  function ekranProfilim() {
    if (!S.profil) return ekranKarsilama();
    const p = S.profil;
    const ad = { kas: 'Kas kazanmak', yag: 'Yağ yakmak', guc: 'Güçlenmek', kondisyon: 'Kondisyon' }[p.hedef];
    const spor = { fitness: 'Fitness', futbol: 'Futbol', basketbol: 'Basketbol', kosu: 'Koşu', yuzme: 'Yüzme', dovus: 'Dövüş sporları' }[p.spor];
    const kilo = S.kilo.length ? S.kilo[S.kilo.length - 1].kg : p.kilo;
    return ust(geri('#/profil')) + '<h1 class="baslik">' + esc(p.ad || 'Profilim') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      (hesap ? '<div class="t genis pf-resim">' + benAvatar('dev' + (avatarYuk ? ' yukleniyor' : '')) + '<div class="yigin" style="gap:8px;min-width:0"><span class="k">Profil resmi</span><span class="ik" style="line-height:1.45">Sıralamada, mesajlarda ve ortak antrenmanda görünür.</span><div class="haplar"><label class="btn ana kucuk" style="cursor:pointer"><input type="file" accept="image/*" data-in="avatar" class="gizli">' + (hesap.foto ? 'Değiştir' : 'Resim seç') + '</label>' + (hesap.foto ? '<button class="btn cerceve kucuk" data-act="avatar-sil">Kaldır</button>' : '') + '</div></div></div>' : '') +
      '<div class="t koyu genis num"><span class="k">Bilgilerin</span><span style="font-weight:700;font-size:15px">' + (p.cinsiyet === 'k' ? 'Kadın' : 'Erkek') + ' · ' + p.yas + ' yaş · ' + p.boy + ' cm · ' + sayi(kilo, 1) + ' kg</span><span class="ik">' + ad + ' · ' + spor + ' · haftada ' + p.gun + ' gün' + ((p.odak || []).length ? ' · odak: ' + p.odak.map((o) => (M.ODAK[o] ? M.ODAK[o].ad : o).toLowerCase()).join(', ') : '') + ((p.sakatlik || []).length ? ' · dikkat: ' + p.sakatlik.map((k) => (K.SAKATLIK.find((x) => x[0] === k) || [k, k])[1].toLowerCase()).join(', ') : '') + '</span></div>' +
      mGrup('Profil', [
        mSatir('#/kurulum', 'kisi', 'Bilgilerimi güncelle', 'Kilo, boy, yaş, spor'),
        mSatir('#/hedef', 'hedef', 'Hedefimi değiştir', 'Kas, yağ yakma, gün, odak, çalışma yeri')
      ]) +
      kadiKutu() +
      ayarGrup() +
      '</div>';
  }
  function ayarGrup() {
    return mGrup('Ayarlar', [
      mSatir('#/ayar/antrenman', 'agirlik', 'Antrenman', 'Takip detayı, zil, ekran açık kalsın'),
      mSatir('#/ayar/gorunum', 'gorunum', 'Görünüm', 'Tema, uygulama simgesi, animasyonlar'),
      mSatir('#/ayar/hatirlat', 'zil', 'Hatırlatıcılar', 'Su, takviye, antrenman'),
      mSatir('#/ayar/hesap', 'veri', 'Hesap ve veriler', hesap ? esc(hesap.eposta) : 'Cihazı sıfırla')
    ]);
  }
  function veriBolum() {
    return !veriAcik ? '<button class="mn-satir mn-dugme" data-act="veri-ac" aria-expanded="false"><span class="mn-ik"><svg viewBox="0 0 24 24" aria-hidden="true">' + MIK.veri + '</svg></span><span class="mn-yazi"><b>Hesap ve veriler</b><span>Hesabı silme, cihazı sıfırlama</span></span>' + OK_SAG + '</button>'
      : '<div class="t genis" style="gap:12px"><div class="satir" style="flex-direction:row;align-items:center"><span class="k">Hesap ve veriler</span><button class="metin-btn kucuk-metin" data-act="veri-kapat" aria-expanded="true" style="color:var(--ikincil)">Kapat</button></div>' +
        (hesap ? (silAcik ? '<form data-form="hesap-sil" novalidate style="display:flex;flex-direction:column;gap:10px"><span class="k" style="color:var(--hata)">Hesabı kalıcı sil</span><span style="font-size:14px;line-height:1.5">Hesabın, programın, öğün ve antrenman kayıtların ile sağlık verilerin sunucudan kalıcı olarak silinir. Bu geri alınamaz.</span>' + sifreAlani('sifre', 'current-password', 'Onay için şifren') + '<p class="hata" id="formHata" role="alert" hidden></p><div class="satir" style="flex-direction:row;gap:8px"><button type="button" class="btn cerceve" data-act="sil-kapat" style="flex:1">Vazgeç</button><button class="btn" id="formBtn" type="submit" style="flex:1;background:var(--hata);color:#fff">Kalıcı sil</button></div></form>'
          : '<div class="yigin" style="gap:4px"><b>Hesabımı sil</b><span class="ik">Hesabın ve sunucudaki bütün kayıtların kalıcı olarak silinir.</span><button class="btn cerceve" data-act="sil-ac" style="align-self:flex-start;min-height:40px;color:var(--hata)">Hesabımı sil</button></div>') : '') +
        '<div class="yigin" style="gap:4px;border-top:1px solid var(--zemin);padding-top:12px"><b>Bu cihazdaki verileri sıfırla</b><span class="ik">' + (hesap ? 'Programın ve bütün kayıtların sıfırlanır, hesabın da bu boş hâliyle eşitlenir. Hesabın açık kalır, baştan kurulum yaparsın.' : 'Bu telefondaki bütün kayıtlar silinir.') + '</span><button class="btn cerceve" data-act="sifirla" style="align-self:flex-start;min-height:40px;color:var(--hata)">' + (sifirOnay ? 'Emin misin? Tekrar bas' : 'Verileri sıfırla') + '</button></div></div>';
  }
  // ayar alt sayfaları: her biri tek konu
  function ekranAyar(bolum) {
    if (!S.profil) return ekranKarsilama();
    const B = { antrenman: 'Antrenman', gorunum: 'Görünüm', hatirlat: 'Hatırlatıcılar', hesap: 'Hesap' };
    if (!B[bolum]) bolum = 'antrenman';
    let ic = '';
    if (bolum === 'antrenman') ic =
      '<div class="t genis" style="gap:10px"><span class="k">Antrenman takibi</span><div class="haplar">' + Object.keys(TAKIP).map((k) => '<button class="hap" data-act="takip-sec" data-deger="' + (k === takipVarsayilan() ? '' : k) + '" aria-pressed="' + (takipSeviye() === k) + '">' + TAKIP[k][0] + (k === takipVarsayilan() ? ' · seviyene göre' : '') + '</button>').join('') + '</div>' +
        '<span class="ik">' + TAKIP[takipSeviye()][1] + '</span>' +
        (kilitVar() ? '<button class="ayar-satir" data-act="ekran-acik" aria-pressed="' + ekranAcikAyar() + '" style="background:none;padding:12px 0 0;margin-top:6px;border-top:1px solid var(--zemin)"><span class="yigin" style="min-width:0"><b>Antrenmanda ekran açık kalsın</b><span class="ik">Antrenman sürerken telefon kendiliğinden kararmaz. Bitirince normale döner.</span></span><span class="anahtar" aria-hidden="true"><i></i></span></button>' : '') +
        '</div>' +
      '<div class="t genis" style="gap:10px"><span class="k">Zil · dinlenme bitince çalan ses</span><div class="haplar">' + Object.keys(SESLER).map((k) => '<button class="hap" data-act="ses-sec" data-deger="' + k + '" aria-pressed="' + (sesTur() === k) + '">' + SESLER[k][0] + '</button>').join('') + '</div>' +
        '<span class="k" style="margin-top:6px">Ses seviyesi</span><div class="haplar">' + Object.keys(SEVIYE).map((k) => '<button class="hap" data-act="ses-seviye" data-deger="' + k + '" aria-pressed="' + (sesSeviye() === k) + '">' + SEVIYE[k][0] + '</button>').join('') + '</div>' +
        '<span class="ik">Dokununca bir kez çalar. Titreşim her zaman açık. Müzik dinlerken ses gelince müzik kısa süre kısılır, sonra devam eder (iPhone\'da iOS 16.4 ve üstü).</span>' +
        '</div>' +
      '';
    else if (bolum === 'gorunum') ic =
      temaSecici() +
      simgeSecici() +
      '<div class="t genis" style="gap:10px"><span class="k">Animasyonlar</span><div class="haplar">' + [['', 'Tam'], ['az', 'Az']].map((x) => '<button class="hap" data-act="anim-sec" data-deger="' + x[0] + '" aria-pressed="' + (((S.ayar || {}).anim || '') === x[0]) + '">' + x[1] + '</button>').join('') + '</div><span class="ik">' + (sistemAzHareket ? 'Telefonunda "hareketi azalt" açık; animasyonlar zaten sade.' : 'Az: açılış çizimi, geri sayım, kutlama ve süslü geçişler kapanır; sayaçlar ve gerekli geri bildirim kalır.') + '</span></div>' +
      '';
    else if (bolum === 'hatirlat') ic = hatirlatKutu();
    else {
      const veri = veriBolum();
      ic =
      (hesap ? '<div class="t genis satir" style="flex-direction:row"><div class="yigin" style="min-width:0"><span class="k">Hesap</span><b style="overflow:hidden;text-overflow:ellipsis">' + esc(hesap.eposta) + '</b><span class="ik">Kayıtların hesabında saklanıyor.</span></div><button class="btn cerceve" data-act="cikis" style="min-height:44px;flex-shrink:0">Çıkış yap</button></div>' : '') +
      '<div class="genis" style="display:flex;flex-direction:column;margin-top:18px">' + (veriAcik ? veri : '<div class="mn-kutu">' + veri + '</div>') + '</div>' +
      '';
    }
    return ust(geri('#/profilim')) + '<h1 class="baslik">' + B[bolum] + '<span class="nokta">.</span></h1><div class="izgara">' + ic + '</div>';
  }

  /* ---------- hafta kartları ve haftalık kapanış ----------
     Hafta bitince (pazar akşamı ya da pazartesi ilk açılış) planı tamamlayan, aşan ya da aradan sonra geri dönen
     kişiye tam ekran kapanış ve numaralı bir hafta kartı. Kartlar İlerleme'de koleksiyon olarak birikir; paylaşım yok. */
  function haftaNo(d0) { const d = new Date(Date.UTC(d0.getFullYear(), d0.getMonth(), d0.getDate())); const g = d.getUTCDay() || 7; d.setUTCDate(d.getUTCDate() + 4 - g); const y = new Date(Date.UTC(d.getUTCFullYear(), 0, 1)); return Math.ceil(((d - y) / 864e5 + 1) / 7); }
  function haftaSonucu(bas) {
    const y = haftaYapilan(bas); if (!y) return null; const hedef = haftaHedefi(bas);
    const g1 = new Date(bas); g1.setDate(g1.getDate() - 7); const g2 = new Date(bas); g2.setDate(g2.getDate() - 14);
    let tur = null;
    if (y > hedef) tur = 'asti'; else if (y >= hedef) tur = 'tuttu';
    else if (!haftaYapilan(g1) && !haftaYapilan(g2) && Object.keys(S.gunluk).some((k) => k < tarihKey(g2) && S.gunluk[k].antrenman)) tur = 'dondu';
    if (!tur) return null;
    const p = (S.haftaPlan || {})[tarihKey(bas)];
    const gunler = []; for (let i = 0; i < 7; i++) { const d = new Date(bas); d.setDate(d.getDate() + i); const gg = S.gunluk[tarihKey(d)]; gunler.push(gg && gg.antrenman ? 2 : p && p.gunler.indexOf(i) >= 0 ? 1 : 0); }
    return { hafta: tarihKey(bas), yil: bas.getFullYear(), no: haftaNo(bas), tur, hedef, yapilan: y, gunler };
  }
  const KART_AD = { tuttu: 'Tuttun', asti: 'Aştın', dondu: 'Geri döndün' };
  function kartHtml(k, cls) {
    const b = new Date(k.hafta + 'T12:00:00'); const son = new Date(b); son.setDate(son.getDate() + 6);
    const ar = b.getDate() + (b.getMonth() !== son.getMonth() ? ' ' + AY[b.getMonth()] : '') + '–' + son.getDate() + ' ' + AY[son.getMonth()];
    return '<div class="hkart t-' + k.tur + (cls ? ' ' + cls : '') + '"><div class="hkart-ust num"><span>COMEBACK. ' + k.yil + '</span><span>#' + String(k.no).padStart(2, '0') + '</span></div>' +
      '<div class="hkart-desen" aria-hidden="true"><span class="hkart-no num">' + k.yapilan + '</span></div>' +
      '<div class="hkart-ad">' + KART_AD[k.tur] + '<span class="nokta">.</span></div>' +
      '<div class="hkart-alt num"><span>' + ar + '</span><span>' + k.yapilan + ' / ' + k.hedef + '</span></div>' +
      '<div class="hkart-gun" aria-hidden="true">' + k.gunler.map((x) => '<i class="g' + x + '"></i>').join('') + '</div></div>';
  }
  function kartKoleksiyon() {
    const l = (S.kartlar || []).slice().reverse();
    return '<div class="t genis" style="gap:10px"><div class="satir"><span class="k">Hafta kartların</span><span class="k num">' + l.length + '</span></div>' +
      (l.length ? '<div class="hkart-liste">' + l.map((k) => '<button type="button" class="hkart-btn" data-act="kart-ac" data-h="' + k.hafta + '" aria-label="' + k.yil + ' ' + k.no + '. hafta kartı: ' + KART_AD[k.tur] + '">' + kartHtml(k, 'mini') + '</button>').join('') + '</div>'
        : '<span class="ik">Haftalık planını tamamladığın her hafta numaralı bir kart kazanırsın. Aşarsan ya da aradan sonra dönersen kartın değişir.</span>') + '</div>';
  }
  function kapanisGoster(k, yeni) {
    const eski = document.getElementById('kapanis'); if (eski) eski.remove();
    const baslik = { tuttu: 'Planını tamamladın', asti: 'Planını aştın', dondu: 'Geri döndün' }[k.tur];
    const alt = k.tur === 'dondu' ? 'Aradan sonra bu hafta ' + k.yapilan + ' antrenman. En zor set buydu.' : k.hedef + ' dedin, ' + k.yapilan + ' yaptın. ' + (k.tur === 'asti' ? 'Fazlası senden.' : 'Kimse izlemedi, sen yine geldin.');
    const el = document.createElement('div'); el.id = 'kapanis'; el.className = 'kapanis t-' + k.tur; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', baslik);
    el.innerHTML = '<div class="kp-sahne">' + (yeni ? '<div class="kp-bir"><span class="k num">' + k.yil + ' · ' + k.no + '. hafta</span><span class="kp-sayi num" data-say="' + k.yapilan + '">0</span><span class="kp-baslik">' + baslik + '<span class="nokta">.</span></span><span class="kp-alt">' + esc(alt) + '</span>' +
      '<button type="button" class="btn beyaz buyuk-btn kp-ac" data-act="kapanis-kart">Kartını aç' + IK.ok + '</button></div>' : '') +
      '<div class="kp-iki"' + (yeni ? ' hidden' : '') + '><div class="kp-kart">' + kartHtml(k) + '</div><button type="button" class="btn ' + (k.tur === 'asti' ? 'siyah' : 'beyaz') + ' kp-kapat" data-act="kapanis-kapat">' + (yeni ? 'Koleksiyonuma ekle' : 'Kapat') + '</button></div></div>';
    document.body.appendChild(el); document.body.classList.add('kilit');
    if (yeni) { const n = el.querySelector('.kp-sayi'); const t0 = performance.now(); const hedef = k.yapilan; (function say(t) { const p = Math.min(1, (t - t0) / 900); n.textContent = Math.round(hedef * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(say); })(t0);
      if (sesTur() !== 'yok') { sesHazirla(); bip(k.tur === 'asti' ? 'rekor' : 'bitis'); } if (navigator.vibrate) navigator.vibrate([40, 60, 120]); }
    const b = el.querySelector('button'); if (b) setTimeout(() => b.focus(), 300);
  }
  function kapanisKontrol() {
    if (!S.profil || S.seans || document.getElementById('kapanis')) return;
    S.kapanis = S.kapanis || {}; S.kartlar = S.kartlar || [];
    const adaylar = []; const onceki = haftaBasi(); onceki.setDate(onceki.getDate() - 7); adaylar.push(onceki);
    if (haftaGunu() === 6 && new Date().getHours() >= 17) adaylar.push(haftaBasi());
    for (const bas of adaylar) {
      const k0 = tarihKey(bas); if (S.kapanis[k0]) continue;
      if (tarihKey(bas) === tarihKey(haftaBasi())) { const s0 = haftaSonucu(bas); if (!s0) continue; }
      S.kapanis[k0] = 1; const sonuc = haftaSonucu(bas);
      Object.keys(S.kapanis).forEach((x) => { if (x < tarihKey(new Date(Date.now() - 70 * 864e5))) delete S.kapanis[x]; });
      if (!sonuc) { kaydet(); continue; }
      S.kartlar = S.kartlar.filter((x) => x.hafta !== sonuc.hafta).concat([sonuc]).slice(-260); kaydet(true);
      setTimeout(() => kapanisGoster(sonuc, true), 450); return;
    }
  }

  /* ---------- 3-2-1: antrenmana giriş ---------- */
  function geriSay(g) {
    if (azHareket) return; const eski = document.getElementById('gerisay'); if (eski) eski.remove();
    const ilk = g.hareketler[0]; const h = ilk && D.HAREKET[ilk.id];
    const el = document.createElement('div'); el.id = 'gerisay'; el.className = 'gerisay'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'assertive');
    const cent = Array.from({ length: 48 }, (_, i) => { const a = (-210 + i * (240 / 47)) * Math.PI / 180; const r1 = 118, r2 = i % 4 ? 110 : 102; return '<line x1="' + (130 + r1 * Math.cos(a)).toFixed(1) + '" y1="' + (130 + r1 * Math.sin(a)).toFixed(1) + '" x2="' + (130 + r2 * Math.cos(a)).toFixed(1) + '" y2="' + (130 + r2 * Math.sin(a)).toFixed(1) + '" data-i="' + i + '"/>'; }).join('');
    el.innerHTML = '<span class="k">Antrenman başlıyor</span><span class="gs-ad">' + esc(g.ad) + '<span class="nokta">.</span></span><div class="gs-kadran"><svg viewBox="0 0 260 260" aria-hidden="true">' + cent + '</svg><span class="gs-no num">3</span></div>' +
      (h ? '<span class="gs-ilk">Sıradaki · ' + esc(h.ad) + ' · ' + ilk.set + ' set</span>' : '') + '<span class="ik gs-atla">Geçmek için dokun</span>';
    document.body.appendChild(el);
    const cizgi = Array.from(el.querySelectorAll('line')); const no = el.querySelector('.gs-no'); const t0 = performance.now(); let son = 4; let bitti = false;
    const kapat = () => { if (bitti) return; bitti = true; el.classList.add('git'); setTimeout(() => el.remove(), 380); };
    el.addEventListener('click', kapat);
    (function kare(t) {
      if (bitti) return; const gecen = (t - t0) / 1000; const kalan = 3 - Math.floor(gecen);
      const p = Math.min(1, gecen / 3); const n = Math.round(p * cizgi.length); cizgi.forEach((c, i) => c.classList.toggle('on', i < n));
      if (kalan !== son) { son = kalan; if (kalan >= 1) { no.textContent = kalan; no.classList.remove('vur'); void no.offsetWidth; no.classList.add('vur'); if (sesTur() !== 'yok') bip('sayim'); if (navigator.vibrate) navigator.vibrate(15); } else { no.textContent = 'Başla'; no.classList.add('kelime'); if (sesTur() !== 'yok') bip('git'); if (navigator.vibrate) navigator.vibrate([30, 40, 60]); setTimeout(kapat, 650); return; } }
      requestAnimationFrame(kare);
    })(t0);
  }

  /* ---------- açılış: COMEBACK. kendini çizer (oturumda bir kez, dokununca geçer) ---------- */
  function acilisCiz() {
    try { if (sessionStorage.getItem('cb-acilis')) return; sessionStorage.setItem('cb-acilis', '1'); } catch (e) { return; }
    if (azHareket) return;
    const el = document.createElement('div'); el.id = 'acilis'; el.className = 'acilis'; el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<svg viewBox="0 0 640 120"><text x="320" y="88" text-anchor="middle" class="ac-yazi">COMEBACK</text><circle class="ac-nokta" cx="0" cy="80" r="11"/></svg>';
    document.body.appendChild(el);
    const tx = el.querySelector('text'); const c = el.querySelector('circle');
    try { const bb = tx.getBBox(); c.setAttribute('cx', (bb.x + bb.width + 16).toFixed(1)); } catch (e) { /* yok */ }
    const kapat = () => { el.classList.add('git'); setTimeout(() => el.remove(), 420); };
    el.addEventListener('click', kapat); setTimeout(kapat, 1650);
  }

  /* ---------- kas haritası: bu hafta hangi kas ne kadar çalıştı (birincil 1 set, ikincil 0,5) ---------- */
  function haftaKasHacmi() {
    const v = {}; const bas = tarihKey(haftaBasi());
    Object.keys(S.hgec || {}).forEach((id) => { const h = K.HAREKET[id]; if (!h || h.tip === 'k' || h.tip === 'p') return;
      (S.hgec[id] || []).filter((z) => z.t >= bas).forEach((z) => { h.birincil.forEach((m) => { v[m] = (v[m] || 0) + z.s; }); h.ikincil.forEach((m) => { v[m] = (v[m] || 0) + z.s * 0.5; }); }); });
    return v;
  }
  function kasHaritasi() {
    const v = haftaKasHacmi(); const sev = (m) => { const x = v[m] || 0; return x <= 0 ? 0 : x < 4 ? 1 : x < 8 ? 2 : 3; };
    const b = (m, sekil) => '<g class="kh k' + sev(m) + '" data-kas="' + m + '"><title>' + esc(K.KAS[m] || m) + ': ' + sayi(v[m] || 0, 1) + ' set</title>' + sekil + '</g>';
    const e = (cx, cy, rx, ry) => '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>';
    const rr = (x, y, w, h, r0) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (r0 || 6) + '"/>';
    const govde = '<g class="kh-govde"><circle cx="60" cy="16" r="11"/>' + rr(54, 27, 12, 8, 3) + e(22, 104, 6, 15) + e(98, 104, 6, 15) + '</g>';
    const on = '<svg viewBox="0 0 120 232" class="kh-svg" role="img" aria-label="Önden kas haritası">' + govde +
      b('omuz_on', e(33, 46, 10, 9) + e(87, 46, 10, 9)) + b('gogus', rr(42, 44, 17, 24, 7) + rr(61, 44, 17, 24, 7)) + b('karin', rr(47, 71, 26, 40, 8)) +
      b('biceps', e(26, 74, 7, 14) + e(94, 74, 7, 14)) + b('on_bacak', rr(41, 116, 17, 54, 8) + rr(62, 116, 17, 54, 8)) + b('baldir', rr(43, 176, 13, 40, 6) + rr(64, 176, 13, 40, 6)) + '</svg>';
    const arka = '<svg viewBox="0 0 120 232" class="kh-svg" role="img" aria-label="Arkadan kas haritası">' + govde +
      b('trapez', rr(46, 34, 28, 10, 5)) + b('omuz_arka', e(33, 46, 10, 9) + e(87, 46, 10, 9)) + b('sirt_kanat', '<path d="M41 50h17v38l-11 8z"/><path d="M79 50H62v38l11 8z"/>') + b('sirt_orta', rr(53, 48, 14, 34, 5)) +
      b('triceps', e(26, 74, 7, 14) + e(94, 74, 7, 14)) + b('bel', rr(50, 86, 20, 22, 6)) + b('kalca', e(50, 122, 11, 11) + e(70, 122, 11, 11)) +
      b('arka_bacak', rr(41, 136, 17, 36, 8) + rr(62, 136, 17, 36, 8)) + b('baldir', e(49, 192, 7, 17) + e(71, 192, 7, 17)) + '</svg>';
    const sira = Object.keys(v).filter((m) => K.KAS[m]).sort((a, c) => v[c] - v[a]);
    const az = ['gogus', 'sirt_kanat', 'omuz_yan', 'on_bacak', 'arka_bacak', 'kalca'].filter((m) => !(v[m] > 0));
    return '<div class="t genis kh-kutu" style="gap:10px"><div class="satir"><span class="k">Bu hafta çalışan kaslar</span><span class="k num">' + sayi(Object.values(v).reduce((a, x) => a + x, 0), 0) + ' set</span></div>' +
      '<div class="kh-ikili"><figure>' + on + '<figcaption>Ön</figcaption></figure><figure>' + arka + '<figcaption>Arka</figcaption></figure></div>' +
      (sira.length ? '<div class="kh-liste">' + sira.slice(0, 5).map((m) => '<span class="kh-cip k' + sev(m) + '">' + esc(K.KAS[m]) + ' <b class="num">' + sayi(v[m], 1) + '</b></span>').join('') + '</div>' : '') +
      '<span class="ik">' + (sira.length ? (az.length ? 'Bu hafta henüz çalışmayanlar: ' + az.map((m) => K.KAS[m]).join(', ') + '.' : 'Bütün büyük kas grupları bu hafta çalıştı.') : 'Bu hafta ilk antrenmanını bitirince harita dolmaya başlar.') + '</span>' +
      '<div class="kh-anahtar ik"><i class="k1"></i>az<i class="k2"></i>orta<i class="k3"></i>10+ set</div></div>';
  }

  /* ---------- son 6 ay antrenman ızgarası (gün saymaz, yalnızca görür) ---------- */
  function antrenmanIzgara() {
    const bugun = tarihKey(); const bas = haftaBasi(); bas.setDate(bas.getDate() - 25 * 7);
    let toplam = 0; let hucre = '';
    for (let w = 0; w < 26; w++) for (let d = 0; d < 7; d++) {
      const g = new Date(bas); g.setDate(g.getDate() + w * 7 + d); const k = tarihKey(g);
      const v = S.gunluk[k] && S.gunluk[k].antrenman; if (v) toplam++;
      hucre += '<i class="' + (k > bugun ? 'gel' : v ? 'on' : '') + (k === bugun ? ' bu' : '') + '" style="grid-column:' + (w + 1) + ';grid-row:' + (d + 1) + '"></i>';
    }
    return '<div class="t genis" style="gap:10px"><div class="satir"><span class="k">Son 6 ay</span><span class="k num">' + toplam + ' antrenman</span></div><div class="aizgara" role="img" aria-label="Son 6 ayda ' + toplam + ' antrenman">' + hucre + '</div><div class="aizgara-alt ik"><span>' + bas.getDate() + ' ' + AY[bas.getMonth()] + '</span><span>Bugün</span></div></div>';
  }
  // günün tonu: bacak günü derin kobalt, üst gövde mora yakın kobalt, karışık gün parlak kobalt
  function gunTonu(g) {
    let u = 0, a = 0; (g.hareketler || []).forEach((x) => { const h = D.HAREKET[x.id]; if (!h) return; if (h.bolge === 'alt') a++; else if (h.bolge === 'ust') u++; });
    return a > u * 1.5 ? 'ton-alt' : u > a * 1.5 ? 'ton-ust' : 'ton-tam';
  }

  /* ---------- yönlendirme ---------- */
  function render() {
    const yol = (location.hash.slice(1) || '/').split('?')[0];
    const parca = yol.split('/').filter(Boolean);
    if (parca[0] !== 'hareket') hareketDonus = location.hash || '#/';
    let html = ''; let sekme = '';
    const acik = !!hesap || cevrimdisi; // hesapsız yalnızca karşılama, kayıt ve giriş
    if (parca[0] === 'kayit') html = ekranKayit();
    else if (parca[0] === 'bekleme') html = ekranBekleme();
    else if (parca[0] === 'giris') html = ekranGiris();
    else if (parca[0] === 'sifre') html = ekranSifre(parca[1]);
    else if (parca[0] === 'hareket' && parca[1] && (hesap || cevrimdisi)) html = ekranHareketSayfa(decodeURIComponent(parca[1]));
    else if (parca[0] === 'basvuru' && !hesap) html = ekranKurulum(true);
    else if (parca[0] === 'topluluk' && parca[1] === 'rehber' && !hesap) html = ekranRehber(parca[2]);
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
    else if (parca[0] === 'haftaplan') { html = ekranHaftaPlan(); sekme = 'profil'; }
    else if (parca[0] === 'profilim') { if (sonRota !== 'profilim') { veriAcik = false; silAcik = false; sifirOnay = false; } html = ekranProfilim(); sekme = 'profil'; }
    else if (parca[0] === 'ayar') { if (sonRota !== 'ayar/' + parca[1]) { veriAcik = false; silAcik = false; sifirOnay = false; } html = ekranAyar(parca[1]); sekme = 'profil'; }
    else if (parca[0] === 'gorus') { html = ekranGorus(); sekme = 'profil'; }
    else if (parca[0] === 'topluluk') { html = ekranTopluluk(parca[1] || '', parca[2] ? decodeURIComponent(parca[2]) : null); sekme = 'profil'; }
    else if (parca[0] === 'mesajlar') { if (sonRota !== 'mesajlar') mk.liste = null; html = ekranMesajlar(); sekme = 'profil'; }
    else if (parca[0] === 'mesaj') { html = ekranMesaj(decodeURIComponent(parca[1] || '')); sekme = 'profil'; }
    else if (parca[0] === 'hedef') { if (sonRota !== 'hedef') hedefTaslak = null; html = ekranHedef(); sekme = 'profil'; }
    else if (parca[0] === 'olcu') { html = ekranOlcu(); sekme = 'ilerleme'; }
    else if (parca[0] === 'rapor') { html = ekranRapor(); sekme = 'ilerleme'; }
    else if (parca[0] === 'koc') { html = ekranKoc(); sekme = 'bugun'; }
    else if (parca[0] === 'hoca') { html = ekranHoca(parca[1] ? decodeURIComponent(parca[1]) : null); sekme = 'profil'; }
    else if (parca[0] === 'hoca-program') { html = ekranHocaProgram(); sekme = 'bugun'; }
    else if (parca[0] === 'jam') { html = ekranJam(); sekme = 'antrenman'; }
    else if (parca[0] === 'bplan') { html = ekranBplan(); sekme = 'beslenme'; }
    else if (parca[0] === 'siralama') { html = ekranSiralama(); sekme = 'ilerleme'; }
    else if (parca[0] === 'bitti') { html = ekranBitti(); sekme = 'antrenman'; }
    else if (parca[0] === 'takviye') { html = ekranTakviye(); sekme = 'beslenme'; }
    else if (parca[0] === 'paylas') { html = ekranPaylas(); sekme = 'antrenman'; }
    else if (parca[0] === 'gelen') { html = ekranGelen(parca[1]); sekme = 'bugun'; }
    else if (parca[0] === 'yonetim') { html = ekranYonetim(); sekme = 'profil'; }
    else { html = ekranBugun(); sekme = 'bugun'; }
    app.innerHTML = html;
    temaUygula(); simgeUygula();
    if (hesap) okunmamisBaslat(); navRozet();
    const menu = acik && !!S.profil && ['kurulum', 'kayit', 'giris', 'bekleme', 'sifre'].indexOf(parca[0]) < 0;
    const odakTam = !!app.querySelector('.od');
    document.body.classList.toggle('odak-tam', odakTam);
    nav.hidden = !menu || odakTam; app.classList.toggle('tam', !menu || odakTam);
    app.classList.toggle('dar', ['kurulum', 'ekle', 'porsiyon', 'kayit', 'giris', 'bekleme', 'sifre'].indexOf(parca[0]) >= 0);
    nav.querySelectorAll('a[data-tab]').forEach((a) => {
      if (a.dataset.tab === sekme) {
        // sekme değişince ikon kendi küçük hareketini yapar (ev zıplar, dambıl kalkar, halka dolar, çizgi çizilir)
        if (a.getAttribute('aria-current') !== 'page' && navOnceki !== null && !azHareket) { a.classList.remove('oynat'); void a.offsetWidth; a.classList.add('oynat'); setTimeout(() => a.classList.remove('oynat'), 700); }
        a.setAttribute('aria-current', 'page');
      } else a.removeAttribute('aria-current');
    });
    navOnceki = sekme;
    if (!parca[0] && acik) kapanisKontrol();
    if (S.seans && dinlenme) dinlenmeCiz(); else { const d = document.getElementById('dinlenme'); if (d && !(S.seans && d.classList.contains('bitti'))) d.remove(); }
    ekranKilit();

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
  const sistemAzHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let azHareket = sistemAzHareket || !!(S.ayar && S.ayar.anim === 'az');
  document.body.classList.toggle('az-hareket', azHareket && !sistemAzHareket);
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
  if (S.jam) setTimeout(() => { jamCek(); jamBaslatZaman(); }, 1500);
  // devam eden antrenmanda sıradaki seti içeren hareketin başına kaydır
  function aktifeKaydir(yumusak) {
    const set = document.querySelector('.seans-izgara .set.aktif'); const kutu = set && set.closest('section');
    if (!kutu) return false;
    const y = Math.max(0, kutu.getBoundingClientRect().top + window.scrollY - 12);
    const az = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: y, behavior: yumusak && !az ? 'smooth' : 'auto' });
    return true;
  }
  // açık sekmeye yeniden dokununca: en üstteysen sıradaki harekete, değilsen en başa
  nav.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]'); if (!a || a.getAttribute('href') !== location.hash) return;
    e.preventDefault();
    const az = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (location.hash === '#/antrenman' && S.seans && window.scrollY < 40 && aktifeKaydir(true)) return;
    window.scrollTo({ top: 0, behavior: az ? 'auto' : 'smooth' });
  });
  let sonHash = location.hash;
  window.addEventListener('hashchange', () => {
    const onceki = sonHash; sonHash = location.hash;
    const m = /^#\/program\/ekle\/(\d+)/.exec(onceki || '');
    if (m && !/^#\/program\/ekle\//.test(location.hash)) { pFiltreSifirla(); if (location.hash === '#/program') pDonGun = +m[1]; }
    iptalOnay = false; sifirOnay = false; offAcik = false; if (barkodAkis) barkodDurdur(); render(); window.scrollTo(0, 0);
    // antrenman sürerken sekmeye dönünce kaldığın harekete in
    if (location.hash === '#/antrenman' && S.seans && !/^#\/antrenman/.test(onceki || '')) aktifeKaydir(false);
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
      if (grup === 'yazan') { const z = document.getElementById('anlatAlan'); if (z) z.hidden = el.dataset.deger !== 'anlat'; }
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
      const hl = JSON.parse(JSON.stringify(g.hareketler)); const ks = seansAnahtar({ hareketler: hl });
      hl.forEach((x, xi) => { setler[ks[xi]] = setOlustur(x, ks[xi], oran); });
      S.seans = { gunId: g.id, tarih: tarihKey(), baslangic: Date.now(), setler, hareketler: hl, atlanan: {}, donus: oran < 1 ? { ara, oran } : null };
      if (el.dataset.kisa) { kisalt(S.seans); olay('kisa'); }
      sesHazirla(); seAcik = null; offAcik = false;
      kaydet(true);
      if (location.hash.indexOf('#/antrenman') !== 0) git('#/antrenman'); else render();
      window.scrollTo(0, 0); geriSay(g);
    },
    'kapanis-kart'() { const el = document.getElementById('kapanis'); if (!el) return; el.querySelector('.kp-bir').hidden = true; const iki = el.querySelector('.kp-iki'); iki.hidden = false; iki.classList.add('ac'); const b = iki.querySelector('button'); if (b) b.focus(); },
    'kapanis-kapat'() { const el = document.getElementById('kapanis'); if (el) { el.classList.add('git'); setTimeout(() => el.remove(), 320); } document.body.classList.remove('kilit'); if (location.hash.indexOf('#/ilerleme') === 0) { const sY = window.scrollY; render(); window.scrollTo(0, sY); } },
    'kart-ac'(el) { const k = (S.kartlar || []).find((x) => x.hafta === el.dataset.h); if (k) kapanisGoster(k, false); },
    'odak-git'(el) {
      if (!S.seans) return; const hl = seansHareket(S.seans); const i = +el.dataset.i; if (!(i >= 0 && i < hl.length)) return;
      const yon = i > odakIdx(S.seans, hl, seansAnahtar({ hareketler: hl })) ? 1 : -1;
      S.seans.odak = i; kaydet(); seAcik = null; dinAcik = null; odMenu = false; odIpucu = false; render(); window.scrollTo(0, 0); odakKay(yon);
    },
    'ap-deg'(el) {
      if (!S.seans) return; const y = (S.seans.setler[el.dataset.h] || [])[+el.dataset.i]; if (!y) return; const d = +el.dataset.d;
      if (el.dataset.alan === 'kg') { const v = Math.max(0, Math.round(((oku(y.kg) || 0) + d) * 100) / 100); y.kg = v ? String(v).replace('.', ',') : ''; }
      else { const hl = seansHareket(S.seans); const x = hl[seansAnahtar({ hareketler: hl }).indexOf(el.dataset.h)] || {}; const v = Math.max(0, (parseInt(y.tekrar, 10) || parseInt(x.alt, 10) || 0) + d); y.tekrar = v ? String(v) : ''; }
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      const b = document.querySelector('[data-ap="' + el.dataset.alan + '"]'); if (b && b.animate && !azHareket) b.animate([{ transform: 'translateY(' + (d > 0 ? 6 : -6) + 'px)', opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.23,1,.32,1)' });
      if (navigator.vibrate) navigator.vibrate(6);
    },
    'anim-sec'(el) { S.ayar = S.ayar || {}; S.ayar.anim = el.dataset.deger; kaydet(true); azHareket = sistemAzHareket || S.ayar.anim === 'az'; document.body.classList.toggle('az-hareket', azHareket && !sistemAzHareket); const sY = window.scrollY; render(); window.scrollTo(0, sY); toast(S.ayar.anim === 'az' ? 'Animasyonlar sade.' : 'Animasyonlar tam.'); },
    'gorunum'(el) { S.ayar = S.ayar || {}; S.ayar.seansGorunum = el.dataset.deger === 'liste' ? 'liste' : ''; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    tik(el) {
      const y = S.seans.setler[el.dataset.h][+el.dataset.i];
      y.ok = !y.ok; kaydet(true); sesHazirla(); if (S.jam) setTimeout(jamDurumGonder, 50);
      const hl0 = seansHareket(S.seans); const dz = hl0[seansAnahtar({ hareketler: hl0 }).indexOf(el.dataset.h)] || {};
      const lst = S.seans.setler[el.dataset.h]; const sonraki = lst.slice(+el.dataset.i + 1).find((z) => !z.ok && !z.atla);
      // odakta hareket bitince sıradaki bitmemiş harekete geç
      let gecti = false;
      if (y.ok && !sonraki && odakMi()) { const ks0 = seansAnahtar({ hareketler: hl0 }); const bu = ks0.indexOf(el.dataset.h); let n = -1; for (let j = 1; j <= ks0.length; j++) { const c = (bu + j) % ks0.length; if (!hareketBittiMi(S.seans, ks0[c])) { n = c; break; } } if (n >= 0 && n !== bu) { S.seans.odak = n; gecti = true; } }
      const sY = window.scrollY; render(); window.scrollTo(0, gecti ? 0 : sY); if (gecti) odakKay(1);
      if (y.ok) {
        if (sonraki && sonraki.tur === 'drop') { dinlenme = null; dinlenmeCiz(); toast('Drop set: kiloyu düşür, hemen devam.'); }
        else if (sonraki) { // ısınma hafif: setler arası 30 sn, son ısınmadan ilk çalışma setine 60 sn
          const sn = y.tur === 'isinma' ? (sonraki.tur === 'isinma' ? 30 : Math.min(60, dinSn(dz) || 60)) : dinSn(dz); dinlenmeBaslat(sn); jamDinlen(sn); }
        else if (Object.keys(S.seans.setler).some((h) => !(S.seans.atlanan || {})[h] && S.seans.setler[h].some((z) => !z.ok && !z.atla))) { const sn = dinSn(dz) || 90; dinlenmeBaslat(sn); jamDinlen(sn); toast('Hareket bitti. Dinlen, sonra sıradakine geç.'); }
        const b = document.querySelector('[data-act="tik"][data-h="' + el.dataset.h + '"][data-i="' + el.dataset.i + '"]');
        if (b && b.animate && !azHareket) b.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.06)', offset: 0.6 }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.23,1,.32,1)' });
      } else { dinlenme = null; dinlenmeCiz(); }
    },
    'kisa-iptal'() { kisaGeriAl(S.seans); kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); toast('Tam antrenman geri geldi.'); },
    simge(el) {
      const s = el.dataset.simge; if (!SIMGE[s] || s === simgeAyar()) return;
      S.ayar = S.ayar || {}; S.ayar.simge = s; kaydet(true); simgeUygula();
      el.closest('.simge-sec').querySelectorAll('[data-simge]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
      if (tekBasina()) toast('Simge seçildi. Görmek için uygulamayı ana ekrandan kaldırıp yeniden ekle.');
    },
    tema(el) {
      const t = el.dataset.tema; if (!TEMA[t] || t === temaAyar()) return;
      S.ayar = S.ayar || {}; S.ayar.tema = t; delete S.ayar.gece; kaydet(true);
      const kutu = el.closest('.tema-sec');
      if (kutu) { kutu.style.setProperty('--i', TEMA_SIRA.indexOf(t)); kutu.querySelectorAll('[data-tema]').forEach((b) => b.setAttribute('aria-checked', String(b === el))); }
      const n = document.getElementById('temaNot'); if (n) n.textContent = TEMA[t][1];
      const az = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (document.startViewTransition && !az) document.startViewTransition(temaUygula); else temaUygula();
    },
    'dinlenme-ek'() { if (dinlenme) { dinlenme.bitis += 30000; dinlenme.toplam += 30; dinlenmeCiz(); jamDinlen(Math.round((dinlenme.bitis - Date.now()) / 1000)); } },
    'dinlenme-kapat'() { const e = document.getElementById('dinlenme'); if (e) e.remove(); },
    'din-ac'(el) { dinAcik = dinAcik === el.dataset.h ? null : el.dataset.h; if (odakMi() && S.seans && dinAcik) odMenu = true; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'din-sec'(el) {
      S.ayar = S.ayar || {}; S.ayar.dinOzel = S.ayar.dinOzel || {}; const sn = +el.dataset.sn;
      if (sn) S.ayar.dinOzel[el.dataset.id] = sn; else delete S.ayar.dinOzel[el.dataset.id];
      dinAcik = null; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      toast(sn ? 'Bu harekette dinlenme artık ' + dakYaz(sn) + '.' : 'Önerilen süreye döndü.');
    },
    'ekran-acik'(el) { S.ayar = S.ayar || {}; S.ayar.ekranAcik = !ekranAcikAyar(); kaydet(true); ekranKilit(); anahtarCevir(el, S.ayar.ekranAcik); },
    'takip-sec'(el) { S.ayar = S.ayar || {}; if (el.dataset.deger) S.ayar.takip = el.dataset.deger; else delete S.ayar.takip; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'dinlenme-atla'() { const vardi = !!dinlenme; dinlenme = null; dinlenmeCiz(); if (vardi) jamDinlen(0, true); },
    iptal() {
      if (!iptalOnay) { iptalOnay = true; const sY = window.scrollY; render(); window.scrollTo(0, sY); return; }
      S.seans = null; iptalOnay = false; dinlenme = null; kaydet(true); git('#/antrenman');
    },
    bitir() {
      const s = S.seans; const g = S.program.gunler.find((x) => x.id === s.gunId) || { ad: s.ad || 'Ortak antrenman', hareketler: seansHareket(s) };
      let set = 0, hacim = 0, yeni = 0;
      const tarih = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
      const gecerli = new Set(seansAnahtar({ hareketler: seansHareket(s) }));
      Object.keys(s.setler).forEach((h) => {
        if (!gecerli.has(h)) return;
        const yapilan = s.setler[h].filter((x) => x.ok && !x.atla).map((x) => Object.assign({ kg: oku(x.kg) || 0, tekrar: parseInt(x.tekrar, 10) || 0 }, x.tur ? { tur: x.tur } : {}));
        if (!yapilan.length) return;
        const calisan = yapilan.filter((x) => x.tur !== 'isinma');
        set += calisan.length;
        hacim += calisan.reduce((a, x) => a + x.kg * x.tekrar, 0);
        const kh0 = kokId(h); const hid = seansHareket(s)[Array.from(gecerli).indexOf(h)];
        S.son[h] = { tarih: s.tarih, setler: yapilan };
        if (hid && hid.id !== kh0) S.son[hid.id] = { tarih: s.tarih, setler: yapilan };
        // hareket sayfası için geçmiş: her antrenmanda en ağır set ve tahmini 1 tekrar maksimum (son 40 kayıt)
        { const gid = hid ? hid.id : kh0; S.hgec = S.hgec || {}; const l0 = (S.hgec[gid] || []).filter((z) => z.t !== s.tarih);
          const en = calisan.reduce((a, x) => (x.kg > a.kg || (x.kg === a.kg && x.tekrar > a.tekrar) ? x : a), { kg: 0, tekrar: 0 });
          l0.push({ t: s.tarih, kg: en.kg, tk: en.tekrar, s: calisan.length, e1: en.kg && en.tekrar ? Math.round(en.kg * (1 + Math.min(en.tekrar, 12) / 30) * 10) / 10 : 0 });
          S.hgec[gid] = l0.slice(-40); }
        const kh = hid ? hid.id : kh0; if (!D.HAREKET[kh] || D.HAREKET[kh].tip === 's') return;
        calisan.forEach((x) => {
          if (!x.kg || !x.tekrar) return;
          const r = S.rekor[kh];
          if (!r || e1rm(x.kg, x.tekrar) > e1rm(r.kg, r.tekrar) + 0.01) { if (r && r.tarih !== tarih) yeni++; S.rekor[kh] = { kg: x.kg, tekrar: x.tekrar, tarih }; }
          S.ilk = S.ilk || {}; if (!S.ilk[kh] || (S.ilk[kh].tarih === s.tarih && e1rm(x.kg, x.tekrar) > e1rm(S.ilk[kh].kg, S.ilk[kh].tekrar))) S.ilk[kh] = { kg: x.kg, tekrar: x.tekrar, tarih: s.tarih };
        });
      });
      if (!set) { toast('Önce en az bir seti tamamla.'); return; }
      const ksB = seansAnahtar({ hareketler: seansHareket(s) }); const kaslar = [];
      seansHareket(s).forEach((x, xi) => { if (!(s.setler[ksB[xi]] || []).some(setSayilir)) return; ((K.HAREKET[x.id] || {}).birincil || []).forEach((m) => { const gr = KAS_GRUP[m]; if (gr && kaslar.indexOf(gr) < 0) kaslar.push(gr); }); });
      const dkB = Math.max(1, Math.round((Date.now() - s.baslangic) / 60000));
      gun(s.tarih).antrenman = Object.assign({ ad: g.ad, set, hacim: Math.round(hacim), dk: dkB, kaslar }, s.kisa ? { kisa: true } : {});
      S.sonSeans = { tarih: s.tarih, ad: g.ad, set, hacim: Math.round(hacim), dk: dkB, rekor: yeni, kaslar, donus: !!s.donus, kisa: !!s.kisa }; fbTaslak = null;
      if (S.jam) S.jamRekor = yeni;
      if (s.donus) S.donusYapildi = true;
      const yeniR = yeniRozetler();
      olay('antrenman_bitti');
      const jamOzet = S.jam ? { sure: Math.max(1, Math.round((Date.now() - s.baslangic) / 60000)), rekor: yeni } : null;
      if (S.jam) { const kod = S.jam.kod; setTimeout(() => { if (S.sonSeans) S.sonSeans.jam = kod; }, 0); jamDurumGonder(true, jamOzet).then(() => jamCek()); }
      S.seans = null; dinlenme = null; S.sonSeans.rekor = yeni; kaydet(true); skorGonder();
      if (sesTur() !== 'yok') { sesHazirla(); bip(yeni ? 'rekor' : 'bitis'); }
      if (navigator.vibrate) navigator.vibrate(yeni ? [60, 80, 160] : [40]);
      toast(yeniR.length ? (yeniR.length === 1 ? 'Yeni rozet: ' + yeniR[0].ad + '. Bunu sen kazandın.' : yeniR.length + ' yeni rozet. Bunu sen kazandın.') : yeni ? (yeni === 1 ? 'Yeni rekor. Bunu sen yaptın.' : yeni + ' yeni rekor. Bunu sen yaptın.') : 'Kaydedildi. Bugün de geldin.');
      git('#/bitti'); setTimeout(() => kutla(!!yeni), 260);
    },
    async 'soz-paylas'() { await gorselPaylas(sozKarti(), 'comeback-soz.png', 'COMEBACK. haftalık planım'); olay('paylas'); },
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
    su(el) { const g = gun(); g.su = Math.max(0, (g.su || 0) + (+el.dataset.ml)); if (+el.dataset.ml > 0) olay('su'); kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      const o = document.querySelector('.su-kutu .orta'); if (o && o.animate && !azHareket) o.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px) scale(1.04)', offset: 0.4 }, { transform: 'none' }], { duration: 420, easing: 'cubic-bezier(.34,1.5,.64,1)' }); },
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
      if (!hesap) { toast('Öneri için giriş yap.'); return; }
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
    'sifremi-unuttum'() { sifreGonderildi = ''; git('#/sifre'); },
    async cikis() {
      await senkronGonder();
      try { await istek('cikis', 'POST', {}); } catch (e) { /* yine de çık */ }
      hesap = null; S = bos(); try { localStorage.removeItem(ANAHTAR); } catch (e) { /* yok */ }
      toast('Çıkış yapıldı.'); git('#/');
    },
    'bekleme-hedef'(el) { beklemeHedef = el.getAttribute('aria-pressed') === 'true' ? '' : el.dataset.deger; el.parentNode.querySelectorAll('.hap').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.deger === beklemeHedef))); },
    async 'yon-mod'(el) { const r = await tistek('moderasyon', 'POST', { tur: el.dataset.tur, id: +el.dataset.id, gizli: el.dataset.gizli === '1' }); toast(r.ok ? 'Kaydedildi.' : 'Olmadı. Bir daha dene.'); yon.veri = null; render(); },
    async 'yon-rol'(el) { const r = await istek('yonetim/rol', 'POST', { eposta: el.dataset.eposta, rol: el.dataset.rol }); toast(r.ok ? 'Güncellendi.' : (r.j.hata || 'Olmadı. Bir daha dene.')); yon.veri = null; render(); },
    'yon-sekme'(el) { yon.sekme = el.dataset.deger; render(); },
    'yon-yenile'() { yon.veri = null; render(); },
    async 'yon-onay'(el) {
      el.disabled = true;
      const r = await istek('yonetim/onay', 'POST', { eposta: el.dataset.eposta, durum: el.dataset.durum }).catch(() => ({ ok: false, j: {} }));
      if (!r.ok) { el.disabled = false; toast(r.j.hata || 'Kaydedilemedi.'); return; }
      toast(el.dataset.durum === 'onayli' ? 'Onaylandı. Artık bu e-postayla kayıt olabilir.' : 'Reddedildi.');
      yon.veri = null; render();
    },
    'olcu-sec'(el) { olcuSec = el.dataset.deger; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'sira-sec'(el) { sira[el.dataset.tur] = el.dataset.deger; sira.veri = null; render(); },
    async 'sira-katil'(el) {
      const acik = el.dataset.acik === '1';
      const r = await tistek('siralama/katil', 'POST', { acik }); if (!r.ok) { toast(r.j.hata || 'Kaydedilemedi.'); return; }
      if (acik) { olay('siralama'); await skorGonder(); toast('Sıralamaya katıldın.'); } else toast('Sıralamadan çıktın; skorların silindi.');
      sira.veri = null; render();
    },
    fb(el) {
      const t = fbTaslak || (fbTaslak = { zor: 0, iyi: [], agri: [], not: '' }); const g = el.dataset.grup, d = el.dataset.deger;
      const n = document.getElementById('fbNot'); if (n) t.not = n.value;
      if (g === 'zor') t.zor = t.zor === +d ? 0 : +d;
      else if (g === 'iyi') { const i = t.iyi.indexOf(d); if (i >= 0) t.iyi.splice(i, 1); else t.iyi.push(d); }
      else if (d === 'yok') { t.agri = []; t.agriYok = !t.agriYok; }
      else { t.agriYok = false; const i = t.agri.indexOf(d); if (i >= 0) t.agri.splice(i, 1); else t.agri.push(d); }
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'fb-kaydet'() {
      const b = S.sonSeans; const t = fbTaslak; if (!b || !t) { git('#/'); return; }
      const n = document.getElementById('fbNot'); if (n) t.not = n.value.trim().slice(0, 200);
      const a = gun(b.tarih).antrenman; if (a) a.fb = { zor: t.zor || 0, iyi: t.iyi.slice(), agri: t.agri.slice(), not: t.not || '' };
      S.sonSeans = null; fbTaslak = null; olay('antrenman_his'); kaydet(true);
      toast(t.agri.length ? 'Kaydedildi. Ağrıyan bölgeyi bir sonraki antrenmanda zorlama.' : 'Kaydedildi. Teşekkürler.'); git('#/');
    },
    'fb-gec'() { S.sonSeans = null; fbTaslak = null; kaydet(); git('#/'); },
    'pd-kur'() { const t = document.getElementById('pdAnlat'); if (t) pAnlat = t.value; programKur(); },
    'tk-al'(el) {
      const g = gun(); g.takviye = g.takviye || {}; const id = el.dataset.id; const t = (S.takviye || []).find((x) => x.id === id);
      // protein tozu alınınca günlük kaloriye ve proteine de yazılır; geri alınınca silinir
      const proteinMi = t && /whey|protein tozu|izolat|kazein|casein/i.test(t.ad);
      if (g.takviye[id]) { delete g.takviye[id]; if (proteinMi) g.ogun = g.ogun.filter((o) => o.tk !== id); }
      else {
        g.takviye[id] = 1; olay('takviye');
        if (proteinMi) {
          const d = String(t.doz || ''); const gm = d.match(/(\d+(?:[.,]\d+)?)\s*g\b/i); const ol = d.match(/(\d+(?:[.,]\d+)?)\s*ölçek/i);
          const gr = gm ? oku(gm[1]) : ol ? oku(ol[1]) * 30 : 30;
          g.ogun.push({ id: kimlik(), ad: t.ad, g: gr, k: gr * 4, p: gr * 0.78, kh: gr * 0.08, y: gr * 0.06, ogun: ogunTuru(), saat: saat(), kaynak: 'takviye', tk: id });
          toast(t.ad + ' öğünlerine eklendi: +' + Math.round(gr * 0.78) + ' g protein, ' + Math.round(gr * 4) + ' kcal.');
        }
      }
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'tk-hazir'(el) { S.takviye = (S.takviye || []).concat([{ id: kimlik(), ad: el.dataset.ad, doz: el.dataset.doz || '', zaman: '' }]); kaydet(true); render(); toast(el.dataset.ad + ' eklendi.'); },
    'tk-duzen'(el) { tkDuzen = el.dataset.id || null; render(); },
    'tk-sil'(el) { S.takviye = (S.takviye || []).filter((x) => x.id !== el.dataset.id); kaydet(true); render(); },
    'ai-oy'(el) {
      S.aiOy = S.aiOy || {}; const a = el.dataset.anahtar; const oy = +el.dataset.oy;
      if (S.aiOy[a] === oy) return; S.aiOy[a] = oy; kaydet();
      if (hesap) istek('ai-oy', 'POST', { tur: el.dataset.tur, oy, ornek: el.dataset.ornek }).catch(() => {});
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'hp-gun'(el) { if (!hpTaslak) return; const i = +el.dataset.i; const j = hpTaslak.gunler.indexOf(i); if (j >= 0) hpTaslak.gunler.splice(j, 1); else hpTaslak.gunler.push(i); const sY = window.scrollY; render(); window.scrollTo(0, sY); sicra('.hp-gun[data-i="' + i + '"]'); },
    'hp-kaydet'() { if (!hpTaslak || !hpTaslak.gunler.length) return; haftaPlanUygula(planHaftasi(), hpTaslak.gunler); kaydet(true); olay('haftaplan'); toast('Söz verildi: bu hafta ' + hpTaslak.gunler.length + ' gün. Gerisi sende.'); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'hk-gun'(el) {
      const bas = haftaBasi(); const i = +el.dataset.i; const p = (S.haftaPlan || {})[tarihKey(bas)];
      const secili = (p ? p.gunler : hpVarsayilan(bas)).slice(); const j = secili.indexOf(i);
      if (j >= 0) secili.splice(j, 1); else secili.push(i);
      haftaPlanUygula(bas, secili); kaydet(true);
      const sY = window.scrollY; render(); window.scrollTo(0, sY); sicra('.hk-gun[data-i="' + i + '"]');
      toast(GUN_AD[i] + (j >= 0 ? ' dinlenme günü oldu.' : ' antrenman günü oldu.') + ' Bu hafta ' + secili.length + ' gün.');
    },
    'hp-gec'() { S.ayar = S.ayar || {}; S.ayar.hpGec = tarihKey(planHaftasi()); kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'ses-seviye'(el) { S.ayar = S.ayar || {}; S.ayar.sesSeviye = el.dataset.deger; kaydet(true); sesHazirla(); bip(); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'bildirim-izin'() { if (!bildirimVar()) return; Notification.requestPermission().then((d) => { toast(d === 'granted' ? 'Bildirimler açık.' : 'Bildirim izni verilmedi.'); S.ayar = S.ayar || {}; S.ayar.bildirimSoruldu = 1; kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY); }); },
    async 'hat-ac'(el) {
      const tur = el.dataset.tur; S.ayar = S.ayar || {}; const a = hatAyar(); const ac = !a[tur];
      if (ac && Notification.permission !== 'granted') { const d = await Notification.requestPermission(); if (d !== 'granted') { toast('Bildirim izni verilmedi. Ayarlardan açabilirsin.'); const sY = window.scrollY; render(); window.scrollTo(0, sY); return; } }
      a[tur] = ac; S.ayar.hat = a; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      await hatEsitle(true); if (hatDurum) { const y = window.scrollY; render(); window.scrollTo(0, y); }
      toast(({ su: 'Su', takviye: 'Takviye', antrenman: 'Antrenman' })[tur] + ' hatırlatıcısı ' + (ac ? 'açık.' : 'kapalı.'));
    },
    'hat-aralik'(el) { S.ayar = S.ayar || {}; const a = hatAyar(); a.suAralik = +el.dataset.deger; S.ayar.hat = a; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); hatEsitle(true); },
    async 'hat-dene'() {
      try { const ab = await hatAbonelik(false); if (!ab) { await hatEsitle(true); } const ab2 = await hatAbonelik(false); if (!ab2) { toast('Önce bir hatırlatıcı aç.'); return; }
        const r = await fetch('/api/comeback/hatirlat/dene', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ uc: ab2.endpoint }) });
        toast(r.ok ? 'Deneme bildirimi gönderildi. Birkaç saniye içinde gelir.' : 'Bildirim gönderilemedi. Biraz sonra tekrar dene.');
      } catch (e) { toast('Bildirim gönderilemedi.'); }
    },
    'bildirim-gec'() { S.ayar = S.ayar || {}; S.ayar.bildirimSoruldu = 1; kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'ses-sec'(el) { S.ayar = S.ayar || {}; S.ayar.sesTur = el.dataset.deger; S.ayar.ses = el.dataset.deger !== 'yok'; kaydet(true); sesHazirla(); bip(el.dataset.deger); if (navigator.vibrate) navigator.vibrate([120, 80, 120]); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'ses-ayar'() { S.ayar = S.ayar || {}; S.ayar.ses = S.ayar.ses === false; kaydet(true); if (S.ayar.ses) { sesHazirla(); bip(); } render(); },
    'pd-isinma'(el) { const x = ptaslak.gunler[+el.dataset.g].hareketler[+el.dataset.i]; x.isinmaSet = ((x.isinmaSet || 0) + 1) % 4; if (x.isinmaSet) x.isinma = false; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
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
      if (!hesap) { toast('Program göndermek için giriş yap.'); return; }
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
      const onceki = kocTaslak || S.kocSec || { tarz: 'kararli', ad: 'Arnold' }; const eskiVarsayilan = KOCLAR.some((x) => x[1] === (inp ? inp.value.trim() : onceki.ad));
      kocTaslak = { tarz: k[0], ad: eskiVarsayilan || !inp || !inp.value.trim() ? k[1] : inp.value.trim() }; render();
    },
    'koc-kaydet'() {
      const t = kocTaslak || S.kocSec || { tarz: 'kararli', ad: 'Arnold' }; const inp = document.getElementById('kocAd');
      const ad = (inp && inp.value.trim()) || (KOCLAR.find((x) => x[0] === t.tarz) || KOCLAR[0])[1];
      S.kocSec = { tarz: t.tarz, ad: ad.slice(0, 20) }; kocTaslak = null; kocSecAcik = false; kaydet(true); render();
      toast('Koçun artık ' + S.kocSec.ad + '.');
    },
    'koc-degis'() { kocSecAcik = true; kocTaslak = null; render(); },
    krono(el) {
      if (!S.seans) return; const h = el.dataset.h; const i = +el.dataset.i; const y = (S.seans.setler[h] || [])[i]; if (!y) return;
      const hl = seansHareket(S.seans); const x = hl[seansAnahtar({ hareketler: hl }).indexOf(h)] || {};
      if (krono && krono.h === h && krono.i === i) {
        const gecen = Math.max(1, Math.floor((Date.now() - krono.bas) / 1000)); krono = null; clearInterval(kronoZ);
        y.tekrar = String(birimOf(x) === 'dk' ? Math.max(1, Math.round(gecen / 60)) : gecen);
        if (!y.ok) EYLEM.tik({ dataset: { h, i: String(i) } }); else { kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY); }
        return;
      }
      sesHazirla(); dinlenme = null; dinlenmeCiz();
      krono = { h, i, bas: Date.now(), hedef: kronoHedef(y, x), caldi: false }; clearInterval(kronoZ); kronoZ = setInterval(kronoCiz, 250);
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'set-ekle'(el) {
      if (!S.seans) return; const l = S.seans.setler[el.dataset.h]; if (!l) return; const tur = el.dataset.tur || 'ek';
      if (l.length >= 20) { toast('Bir harekette en fazla 20 set.'); return; }
      let sonOk = -1; l.forEach((z, i) => { if (z.ok && z.tur !== 'isinma') sonOk = i; });
      const calisan = l.filter((z) => !z.tur || z.tur === 'ek' || z.tur === 'drop');
      // drop: sıradaki (henüz yapılmamış) çalışma setine eklenir; set öncesi planlanır. Hepsi bittiyse son yapılan sete.
      let hedefI = l.findIndex((z) => !z.ok && !z.atla && z.tur !== 'isinma' && z.tur !== 'drop');
      if (hedefI < 0) hedefI = sonOk;
      const son = (tur === 'drop' && hedefI >= 0 ? l[hedefI] : null) || calisan[calisan.length - 1] || l[l.length - 1] || {};
      const kg = oku(son.kg) || 0; const yuv = (v) => Math.max(0, Math.round(v / 2.5) * 2.5);
      let yer = l.length;
      let yeni;
      if (tur === 'isinma') { yer = l.filter((z) => z.tur === 'isinma').length; yeni = { kg: kg ? String(yuv(kg * 0.5)).replace('.', ',') : '', tekrar: '8', ok: false, tur }; }
      else if (tur === 'drop') { if (hedefI >= 0) { yer = hedefI + 1; while (l[yer] && l[yer].tur === 'drop') yer++; } yeni = { kg: kg ? String(yuv(kg * 0.75)).replace('.', ',') : '', tekrar: '', ok: false, tur }; }
      else yeni = { kg: son.kg || '', tekrar: '', ok: false, tur: 'ek' };
      l.splice(yer, 0, yeni);
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      // klavye kendiliğinden açılmasın: yeni satır kısa bir vurguyla gösterilir, yazmak isteyen dokunur
      const g = document.querySelector('[data-in="kg"][data-h="' + el.dataset.h + '"][data-i="' + yer + '"]'); const satir = g && g.closest('.set');
      if (satir && satir.animate && !azHareket) satir.animate([{ background: 'color-mix(in srgb, var(--kobalt) 22%, transparent)' }, { background: 'transparent' }], { duration: 900, easing: 'cubic-bezier(.23,1,.32,1)' });
      if (tur === 'drop') toast(l[yer - 1] && !l[yer - 1].ok ? 'Drop sıradaki sete eklendi: o seti bitirince kiloyu düşür, dinlenmeden devam.' : 'Drop set eklendi: hemen ardından, dinlenmeden.');
    },
    'set-sil'(el) {
      if (!S.seans) return; const l = S.seans.setler[el.dataset.h]; const i = +el.dataset.i; if (!l || !l[i] || !l[i].tur) return;
      if (!el.dataset.tutuldu && Date.now() - (window.__tutSil || 0) < 600) return;
      if (!el.dataset.tutuldu && silSet !== el.dataset.h + ':' + i) { silSet = el.dataset.h + ':' + i; toast('Silmek için basılı tut (ya da bir kez daha dokun).'); clearTimeout(silSetZ); silSetZ = setTimeout(() => { silSet = null; }, 3000); return; }
      silSet = null; l.splice(i, 1); kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); toast('Set silindi.');
    },
    'set-cikar'(el) {
      if (!S.seans) return; const l = S.seans.setler[el.dataset.h]; if (!l) return;
      let i = -1; for (let j = l.length - 1; j >= 0; j--) if (l[j].tur && !l[j].ok) { i = j; break; }
      if (i < 0) return; l.splice(i, 1); kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'set-atla'(el) {
      const y = S.seans && (S.seans.setler[el.dataset.h] || [])[+el.dataset.i]; if (!y) return;
      y.atla = !y.atla; y.ok = false; kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'od-menu'() { odMenu = !odMenu; if (!odMenu) { seAcik = null; dinAcik = null; } iptalOnay = false; render(); },
    'od-ipucu'() { odIpucu = !odIpucu; render(); },
    'se-ac'(el) { seAcik = seAcik === el.dataset.h ? null : el.dataset.h; if (odakMi() && S.seans && seAcik) odMenu = true; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'se-atla'(el) {
      S.seans.atlanan = S.seans.atlanan || {}; S.seans.atlanan[el.dataset.h] = true; seAcik = null;
      (S.seans.setler[el.dataset.h] || []).forEach((y) => { if (!y.ok) y.atla = true; });
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY); toast('Hareket bugün atlandı.');
    },
    'se-geri'(el) {
      if (S.seans.atlanan) delete S.seans.atlanan[el.dataset.h];
      (S.seans.setler[el.dataset.h] || []).forEach((y) => { y.atla = false; });
      kaydet(); const sY = window.scrollY; render(); window.scrollTo(0, sY);
    },
    'se-degis'(el) {
      const s = S.seans; const hl = seansHareket(s); if (!s.hareketler) s.hareketler = JSON.parse(JSON.stringify(hl));
      const ks0 = seansAnahtar({ hareketler: s.hareketler }); const xi = ks0.indexOf(el.dataset.h); if (xi < 0) return;
      const eski = s.hareketler[xi]; const yeni = M.degistir(S.profil, eski, el.dataset.id); if (!yeni) return;
      yeni.isinmaSet = eski.isinmaSet;
      s.hareketler[xi] = yeni; const ks1 = seansAnahtar({ hareketler: s.hareketler });
      const eskiSet = s.setler; const ys = {}; const eskiAtla = s.atlanan || {}; const ya = {};
      ks1.forEach((k1, i) => { if (i === xi) ys[k1] = setOlustur(yeni, k1, 1); else { ys[k1] = eskiSet[ks0[i]] || []; if (eskiAtla[ks0[i]]) ya[k1] = true; } });
      s.setler = ys; s.atlanan = ya; seAcik = null;
      if (degisKalici) { const pg = S.program.gunler.find((g) => g.id === s.gunId); if (pg && pg.hareketler[xi] && pg.hareketler[xi].id === eski.id) pg.hareketler[xi] = Object.assign({}, yeni); }
      kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY);
      toast(D.HAREKET[eski.id].ad + ' yerine ' + D.HAREKET[yeni.id].ad + (degisKalici ? '. Programında da değişti.' : ', sadece bugün.'));
    },
    'off-ac'() { offAcik = !offAcik; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'jam-gecmis'(el) { jamGecmisSec = jamGecmisSec === +el.dataset.i ? null : +el.dataset.i; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    async 'jam-yenile'() { await jamCek(); const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    async 'jam-ortak'(el) { if (!S.jam) return; const r = await tistek('jam/' + S.jam.kod + '/ortak', 'POST', { acik: el.checked }); if (!r.ok) { toast(r.j.hata || 'Değiştirilemedi.'); el.checked = !el.checked; return; } if (jamV) jamV.ortak = el.checked; toast(el.checked ? 'Dinlenme süreleri artık ortak.' : 'Herkes kendi dinlenme süresini kullanıyor.'); },
    'jam-paylas'(el) { jamPaylas = el.checked; },
    async 'jam-olustur'() {
      const b = bugunkuGun(); jamYuk = true; render();
      const r = await tistek('jam/olustur', 'POST', { ad: b ? b.ad : 'Ortak antrenman', program: jamPaylas && b ? { ad: b.ad, hareketler: b.hareketler } : null });
      jamYuk = false; if (!r.ok) { toast(r.j.hata || 'Açılamadı.'); render(); return; }
      S.jam = { kod: r.j.kod }; kaydet(); olay('jam'); jamV = null; await jamCek(); jamBaslatZaman(); render();
    },
    async 'jam-katil'() {
      const i = document.getElementById('jamKod'); const kod = (i ? i.value : jamKodGir).toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (kod.length !== 5) { toast('Kod 5 karakter.'); return; }
      const r = await tistek('jam/' + kod + '/katil', 'POST', {}); if (!r.ok) { toast(r.j.hata || 'Katılamadın.'); return; }
      S.jam = { kod }; kaydet(); olay('jam'); jamV = null; await jamCek(); jamBaslatZaman(); render();
      toast(r.j.program && r.j.program.hareketler && r.j.program.hareketler.length && !S.seans ? 'Jam\'e katıldın. Ortak antrenman hazır: "Bu antrenmanı birlikte yap"a bas.' : 'Jam\'e katıldın.');
    },
    'jam-basla'() {
      const pr = jamV && jamV.program; if (!pr || !pr.hareketler) return;
      const hl = pr.hareketler.filter((x) => D.HAREKET[x.id]).map((x) => Object.assign({ blok: 'ana', rir: '', not: '' }, x));
      const setler = {}; const ks = seansAnahtar({ hareketler: hl });
      hl.forEach((x, xi) => { setler[ks[xi]] = setOlustur(x, ks[xi], 1); });
      S.seans = { gunId: 'jam:' + S.jam.kod, ad: pr.ad || 'Ortak antrenman', tarih: tarihKey(), baslangic: Date.now(), setler, hareketler: hl, atlanan: {}, donus: null };
      sesHazirla(); kaydet(true); jamDurumGonder(); git('#/antrenman');
    },
    'jam-kopya'() { const t = 'COMEBACK. Jam kodum: ' + S.jam.kod + ' · Antrenman > Jam > Koda katıl'; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => toast('Kopyalandı.')).catch(() => toast('Kod: ' + S.jam.kod)); },
    async 'jam-ayril'() { if (!S.jam) return; jamKaydet(); tistek('jam/' + S.jam.kod + '/ayril', 'POST', {}).catch(() => {}); S.jam = null; jamV = null; kaydet(); render(); toast('Jam\'den çıktın.'); },
    'bp-sec'(el) { bpTaslak[el.dataset.tur] = +el.dataset.deger; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'bp-hazirla'() { bpHazirla(); },
    'bp-gun'(el) { bpSec = +el.dataset.i; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'bp-ye'(el) {
      const b = S.bplan; if (!b) return; const j = +el.dataset.j; const o = b.gunler[bpBugunIdx()].ogunler[j]; if (!o) return;
      const g = gun(); g.bplan = g.bplan || {}; if (g.bplan[j]) return;
      const idler = o.kalemler.map(bpKalem).filter(Boolean).map((x) => { const id = kimlik(); g.ogun.push({ id, ad: x.ad, g: x.g, k: x.k, p: x.p, kh: x.kh, y: x.y, ogun: o.ogun, saat: saat(), kaynak: 'plan' }); return id; });
      g.bplan[j] = idler; kaydet(true); const sY = window.scrollY; render(); window.scrollTo(0, sY); toast(OGUN_AD[o.ogun] + ' günlüğüne eklendi.');
    },
    'bp-geri'(el) { const g = gun(); const j = +el.dataset.j; const idler = (g.bplan || {})[j]; if (!idler) return; g.ogun = g.ogun.filter((x) => (Array.isArray(idler) ? idler : []).indexOf(x.id) < 0); delete g.bplan[j]; kaydet(true); render(); },
    'bp-sil'() { S.bplan = null; kaydet(true); render(); toast('Beslenme programı kaldırıldı.'); },
    'gd-ac'() { gunDegisAcik = !gunDegisAcik; offAcik = false; const sY = window.scrollY; render(); window.scrollTo(0, sY); },
    'gun-degis'(el) {
      const x = S.program.gunler.find((g) => g.id === el.dataset.id); if (!x) return;
      S.takvim = S.takvim || {}; takvimTemizle(); const bugun = tarihKey(); const t = bugunkuGun();
      const z = yakinGunler(7).find((y) => y.gun && y.gun.id === x.id);
      S.takvim[bugun] = { gunId: x.id, kaynak: z ? z.k : '' };
      if (z) { if (t) S.takvim[z.k] = { gunId: t.id, kaynak: bugun }; else S.takvim[z.k] = { off: true, kaynak: bugun }; }
      gunDegisAcik = false; olay('gun_degis'); kaydet(true); render();
      toast('Bugün ' + x.ad + '.' + (t && z ? ' ' + t.ad + ' ' + (GUN_AD[haftaGunu(z.d)] || '').toLocaleLowerCase('tr') + ' gününe geçti.' : ''));
    },
    off(el) {
      const g = bugunkuGun(); if (!g) return; S.takvim = S.takvim || {}; takvimTemizle();
      const bugun = tarihKey();
      if (el.dataset.tur === 'kaydir') { const y = new Date(); y.setDate(y.getDate() + 1); S.takvim[tarihKey(y)] = { gunId: g.id, kaynak: bugun }; }
      if (el.dataset.tur === 'zincir') {
        // bugünkü antrenman yarına, yarınki ertesi güne… ilk boş güne kadar
        let tasinan = g; let onceki = bugun;
        for (const y of yakinGunler(7)) { const var_ = y.gun; S.takvim[y.k] = { gunId: tasinan.id, kaynak: onceki }; if (!var_) break; tasinan = var_; onceki = y.k; }
      }
      S.takvim[bugun] = { off: true, gunId0: g.id };
      offAcik = false; olay('off_gun'); kaydet(true); render();
      toast(el.dataset.tur === 'kaydir' ? g.ad + ' yarına kaydı. Bugün dinlen.' : el.dataset.tur === 'zincir' ? 'Program bir gün kaydı. Bugün dinlen.' : 'Bugün dinlen. ' + g.ad + ' bu hafta atlandı; program seni bekliyor.');
    },
    'off-geri'() {
      const bugun = tarihKey(); if (!S.takvim || !S.takvim[bugun]) return;
      delete S.takvim[bugun];
      // bugünden başlayan zinciri de geri al
      let anahtar = bugun; for (let i = 0; i < 8; i++) { const k = Object.keys(S.takvim).find((x) => S.takvim[x].kaynak === anahtar); if (!k) break; delete S.takvim[k]; anahtar = k; }
      kaydet(true); render(); toast('Bugünün antrenmanı geri geldi.');
    },
    async 'pd-yorum'() {
      const pr = ptaslak; if (!pr.gunler.some((g) => g.hareketler.length)) { toast('Önce birkaç hareket ekle.'); return; }
      if (!hesap) { toast(adIlgi(kocAdi()) + ' yorumu için giriş yap.'); return; }
      pYorumYuk = true; render();
      try {
        const ozet = { ad: pr.ad, gunler: pr.gunler.map((g) => ({ ad: g.ad, gun: GUN_AD[g.hafta], hareketler: g.hareketler.map((x) => D.HAREKET[x.id].ad + ' ' + x.set + 'x' + x.tekrar + (x.birim !== 'tekrar' ? ' ' + BIRIM[x.birim].toLowerCase() : '')) })) };
        const p = pProfil(); const profil = { cinsiyet: p.cinsiyet === 'k' ? 'kadın' : 'erkek', yas: p.yas, hedef: p.hedef, deneyim: p.deneyim, ortam: p.ortam, spor: p.spor, sakatlik: (p.sakatlik || []).map((b) => (K.SAKATLIK.find((x) => x[0] === b) || [b, b])[1]) };
        const r = await fetch('/api/comeback/koc', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tur: 'program', program: ozet, profil, analiz: M.ozelAnaliz(pr.gunler, p).uyari, hisler: hisler(45).slice(0, 12).map((x) => ({ tarih: x.tarih, gun: x.ad, zorluk: x.zorluk, calistigi: x.kaslar, iyi_hissettigi: x.iyi, agri: x.agri, not: x.not })) }) });
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
      if (g === 'ortam') { const l = ortamlar(p).slice(); const i = l.indexOf(d); if (i >= 0) { if (l.length === 1) return; l.splice(i, 1); } else l.push(d); p.ortam = l[0]; if (l.length > 1) p.ortamlar = l; else delete p.ortamlar; }
      else if (g === 'odak') { const l = p.odak || []; const i = l.indexOf(d); if (i >= 0) l.splice(i, 1); else { if (l.length >= 2) { toast('En fazla 2 bölge seçebilirsin.'); return; } l.push(d); } p.odak = l; }
      else if (g === 'gun' || g === 'sure') p[g] = parseInt(d, 10); else p[g] = d;
      if (g === 'protSeviye' && d === 'ozel' && !p.protG) p.protG = M.hedefHesapla(Object.assign({}, p, { protSeviye: '' })).protein;
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
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
    async 'tp-sikayet'(el) { const r = await tistek('sikayet', 'POST', { tur: el.dataset.tur, id: +el.dataset.id, neden: 'uygunsuz' }); tp.menu = null; toast(r.ok ? 'Şikâyetin alındı. İnceleyeceğiz.' : (r.j.hata || 'Olmadı. Bir daha dene.')); render(); },
    async 'tp-engel'(el) { const r = await tistek('engel', 'POST', { kullanici: el.dataset.k }); tp.menu = null; if (r.ok) { toast('Engellendi. Yazılarını artık görmeyeceksin.'); tp.konu = null; tp.liste = null; } render(); },
    async 'tp-sil'(el) { const r = await tistek('sil', 'POST', { tur: el.dataset.tur, id: +el.dataset.id }); tp.menu = null; if (!r.ok) { toast(r.j.hata || 'Silinemedi.'); return; } toast('Silindi.'); tp.liste = null; if (el.dataset.tur === 'konu') { tp.konu = null; git('#/topluluk'); } else { tp.konu = null; render(); } },
    async 'tp-meydan-paylas'(el) { const t = 'COMEBACK. uygulamasında "' + el.dataset.ad + '" meydan okumasına katıl: Topluluk → Meydan okuma → kod ' + el.dataset.kod; try { if (navigator.share) { await navigator.share({ text: t }); return; } } catch (e) { if (e.name === 'AbortError') return; } try { await navigator.clipboard.writeText(t); toast('Kopyalandı.'); } catch (e) { toast(t); } },
    async 'tp-meydan-ayril'(el) { if (el.dataset.onay !== '1') { el.dataset.onay = '1'; el.textContent = 'Emin misin? Tekrar bas'; return; } await tistek('meydan/' + tp.meydanId + '/ayril', 'POST'); tp.meydanlar = null; tp.meydan = null; git('#/topluluk/meydan'); },
    'tp-mesaj-yenile'() { tp.mesaj = null; render(); },
    'gorus-tur'(el) { gorusTur = el.dataset.deger; el.parentNode.querySelectorAll('.hap').forEach((b) => b.setAttribute('aria-pressed', String(b === el))); },
    'mk-yenile'() { mk.liste = null; render(); },
    'kirp-iptal'() { kirpKapat(); },
    'kirp-kaydet'() { if (!kirp) return; let d; try { d = kirpSonuc(); } catch (e) { d = null; } kirpKapat(); if (d) avatarYukle(null, d); else toast('Bu resim kırpılamadı. Başka bir resim dene.'); },
    'avatar-sil'() { istek('foto', 'DELETE').then((r) => { if (r.ok) { hesap.foto = 0; toast('Profil resmi kaldırıldı.'); render(); } else toast(r.j.hata || 'Olmadı. Bir daha dene.'); }); },
    'veri-ac'() { veriAcik = true; render(); },
    'veri-kapat'() { veriAcik = false; silAcik = false; sifirOnay = false; render(); },
    'sil-ac'() { silAcik = true; render(); const i = document.querySelector('[data-form="hesap-sil"] input'); if (i) i.focus(); },
    'sil-kapat'() { silAcik = false; render(); },
    sifirla() {
      if (!sifirOnay) { sifirOnay = true; render(); return; }
      S = bos(); kaydet(true); sifirOnay = false; try { indexedDB.deleteDatabase('comeback-foto'); } catch (e) { /* yok */ } fotoListe = null; fotoUrl = {}; git('#/');
    }
  };
  /* program düzenleme: hareketi tutup sürükle (dokunmatik + fare), ok tuşlarıyla da taşınır */
  (function () {
    let sur = null;
    const bitir = (iptal) => {
      if (!sur) return; const d = sur; sur = null; cancelAnimationFrame(d.raf);
      d.satirlar.forEach((e) => { e.style.transform = ''; e.style.transition = ''; e.classList.remove('surukle'); });
      document.body.classList.remove('pd-suruklen');
      if (!iptal && d.hedef !== d.i) { const l = ptaslak.gunler[d.g].hareketler; const [x] = l.splice(d.i, 1); l.splice(d.hedef, 0, x); if (navigator.vibrate) navigator.vibrate(12); }
      const sY = window.scrollY; render(); window.scrollTo(0, sY);
    };
    const ciz = () => {
      if (!sur) return; const d = sur;
      const dy = d.y - d.y0 + (window.scrollY - d.s0);
      d.el.style.transform = 'translateY(' + dy + 'px) scale(1.02)';
      const merkez = d.ust0 + d.h / 2 + dy; let hedef = 0;
      d.konum.forEach((k, j) => { if (j !== d.i && merkez > k.ust + k.h / 2) hedef = j < d.i ? j + 1 : j; });
      if (merkez < d.konum[0].ust + d.konum[0].h / 2) hedef = 0;
      d.hedef = Math.max(0, Math.min(d.satirlar.length - 1, hedef));
      d.satirlar.forEach((e, j) => { if (j === d.i) return; let kay = 0; if (d.i < d.hedef && j > d.i && j <= d.hedef) kay = -d.h; else if (d.i > d.hedef && j < d.i && j >= d.hedef) kay = d.h; e.style.transform = kay ? 'translateY(' + kay + 'px)' : ''; });
      // kenara yaklaşınca sayfayı kaydır
      if (d.y < 90) window.scrollBy(0, -10); else if (d.y > window.innerHeight - 120) window.scrollBy(0, 10);
      d.raf = requestAnimationFrame(ciz);
    };
    document.addEventListener('pointerdown', (e) => {
      const ss = e.target.closest('.set-sil');
      if (ss) { ss.classList.add('tut'); clearTimeout(ss._z); ss._z = setTimeout(() => { ss.classList.remove('tut'); ss.dataset.tutuldu = '1'; window.__tutSil = Date.now(); if (navigator.vibrate) navigator.vibrate(25); EYLEM['set-sil'](ss); }, 650);
        const birak = () => { clearTimeout(ss._z); ss.classList.remove('tut'); document.removeEventListener('pointerup', birak); document.removeEventListener('pointercancel', birak); }; document.addEventListener('pointerup', birak); document.addEventListener('pointercancel', birak); }
      const bt = e.target.closest('.btn.ana,.btn.beyaz'); if (bt) { const r = bt.getBoundingClientRect(); bt.style.setProperty('--bx', (e.clientX - r.left) + 'px'); bt.style.setProperty('--by', (e.clientY - r.top) + 'px'); }
      const t = e.target.closest('.pd-tut'); if (!t || sur || !ptaslak) return; e.preventDefault();
      const g = +t.dataset.g; const i = +t.dataset.i; const kutu = t.closest('.pd-gun'); const satirlar = Array.from(kutu.querySelectorAll('.pd-hareket'));
      const el = satirlar[i]; if (!el) return; const r0 = el.getBoundingClientRect();
      const konum = satirlar.map((x) => { const r = x.getBoundingClientRect(); return { ust: r.top + window.scrollY, h: r.height }; });
      sur = { g, i, hedef: i, el, satirlar, konum, y0: e.clientY, y: e.clientY, s0: window.scrollY, ust0: r0.top + window.scrollY, h: r0.height + 0 };
      // satır yükseklikleri farklı olabilir: kaydırma payı olarak sürüklenenin yüksekliği kullanılır
      try { t.setPointerCapture(e.pointerId); } catch (x) { /* yok */ }
      el.classList.add('surukle'); document.body.classList.add('pd-suruklen');
      satirlar.forEach((x, j) => { if (j !== i) x.style.transition = 'transform 220ms cubic-bezier(.23,1,.32,1)'; });
      if (navigator.vibrate) navigator.vibrate(8);
      sur.raf = requestAnimationFrame(ciz);
    });
    document.addEventListener('pointermove', (e) => { if (sur) { sur.y = e.clientY; e.preventDefault(); } }, { passive: false });
    document.addEventListener('pointerup', () => bitir(false));
    document.addEventListener('pointercancel', () => bitir(true));
    document.addEventListener('keydown', (e) => {
      const t = e.target.closest && e.target.closest('.pd-tut'); if (!t || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || !ptaslak) return; e.preventDefault();
      const g = +t.dataset.g; const i = +t.dataset.i; const l = ptaslak.gunler[g].hareketler; const j = i + (e.key === 'ArrowUp' ? -1 : 1); if (j < 0 || j >= l.length) return;
      const x = l[i]; l[i] = l[j]; l[j] = x; const sY = window.scrollY; render(); window.scrollTo(0, sY);
      const yeni = document.querySelector('.pd-tut[data-g="' + g + '"][data-i="' + j + '"]'); if (yeni) yeni.focus();
    });
  })();
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const f = EYLEM[el.dataset.act]; if (!f) return;
    // tam ekran odak menüsü: içindeki bir işlem yapılınca menü kapanır (paneli açan işlemler hariç)
    if (odMenu && el.closest('.od-sayfa') && ['se-ac', 'din-ac', 'iptal'].indexOf(el.dataset.act) < 0) odMenu = false;
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
    if (el.dataset && el.dataset.in === 'pd-anlat') { pAnlat = el.value; return; }
    if (el.dataset && el.dataset.in === 'prot-g') { if (hedefTaslak) hedefTaslak.protG = parseInt(el.value, 10) || 0; return; }
    if (el.dataset && el.dataset.in === 'bp-not') { bpTaslak.not = el.value; return; }
    if (el.dataset && el.dataset.in === 'jam-kod') { jamKodGir = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); return; }
    if (el.dataset && el.dataset.in === 'fb-not') { if (fbTaslak) fbTaslak.not = el.value; return; }
    if (el.dataset && el.dataset.in === 'degis-kalici') { degisKalici = el.checked; return; }
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
    if (e.target.dataset && e.target.dataset.hat && /^\d{2}:\d{2}$/.test(e.target.value)) { S.ayar = S.ayar || {}; const a = hatAyar(); a[e.target.dataset.hat] = e.target.value; S.ayar.hat = a; kaydet(true); hatEsitle(true); toast('Hatırlatıcı saati ' + e.target.value + '.'); return; }
    if (e.target.dataset && e.target.dataset.in === 'avatar' && e.target.files[0]) { kirpAc(e.target.files[0]); e.target.value = ''; return; }
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
    if (e.submitter && e.submitter.name) { v[e.submitter.name] = e.submitter.value; v._tus = e.submitter.value; }
    if (f.dataset.form === 'kurulum') return kurulumKaydet(f, v);
    if (f.dataset.form === 'kayit' || f.dataset.form === 'giris') return hesapFormu(f.dataset.form, f, v);
    if (f.dataset.form === 'sifre-unuttum' || f.dataset.form === 'sifre-yenile') return sifreFormu(f.dataset.form, v);
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
      const ta = f.querySelector('textarea'); if (ta) ta.value = '';
      tistek('mesaj/' + encodeURIComponent(tp.mesajId), 'POST', { metin }).then(async (r) => { if (!r.ok) { if (ta) ta.value = metin; toast(r.j.hata || 'Gönderilemedi.'); return; } const r2 = await tistek('mesaj/' + encodeURIComponent(tp.mesajId)); if (r2.ok) tp.mesaj = r2.j; const a = document.getElementById('kocAkis'); if (a) { a.innerHTML = mesajAkis(); kocKaydir(); } mk.liste = null; });
      return;
    }
    if (f.dataset.form === 'yon-hoca') { istek('yonetim/rol', 'POST', { eposta: String(v.eposta || '').trim(), rol: 'koc' }).then((r) => { toast(r.ok ? 'Artık hoca.' : (r.j.hata || 'Olmadı. Bir daha dene.')); if (r.ok) { yon.veri = null; render(); } }); return; }
    if (f.dataset.form === 'takviye') {
      const ad = String(v.ad || '').trim().replace(/[<>]/g, '').slice(0, 40); if (!ad) { toast('Takviyenin adını yaz.'); return; }
      const mk = String(v.miktar || '').trim().replace(/[^\d.,]/g, '').slice(0, 8); const doz = mk ? mk + ' ' + (TK_BIRIM.indexOf(v.birim) >= 0 ? v.birim : 'g') : '';
      if (v.id) { const x = (S.takviye || []).find((t) => t.id === v.id); if (x) { x.ad = ad; x.doz = doz; x.zaman = v.zaman || ''; } tkDuzen = null; kaydet(true); render(); toast(ad + ' güncellendi.'); return; }
      S.takviye = (S.takviye || []).concat([{ id: kimlik(), ad, doz, zaman: v.zaman || '' }]); kaydet(true); render(); toast(ad + ' eklendi.'); return;
    }
    if (f.dataset.form === 'su') {
      let x = oku(v.miktar); if (!x || x <= 0) { toast('Miktarı yaz: 1,5 (litre) ya da 330 (ml).'); return; }
      const ml = Math.round(x <= 10 ? x * 1000 : x); const g = gun(); g.su = Math.max(0, (g.su || 0) + Math.min(ml, 5000)); olay('su'); kaydet(); render(); toast(sayi(ml) + ' ml su eklendi.'); return;
    }
    if (f.dataset.form === 'demo') {
      const g0 = { eposta: String(v.eposta || '').trim(), sifre: String(v.sifre || ''), ad: String(v.ad || '').trim(), sifirla: v._tus === 'sifirla', sil: v._tus === 'sil' };
      istek('yonetim/demo', 'POST', g0).then((r) => { if (!r.ok) { toast(r.j.hata || 'Kaydedilemedi.'); return; } toast(r.j.silindi ? 'Demo hesap silindi.' : r.j.sifirlandi ? 'Demo verisi sıfırlandı; ilk girişte örnek verilerle dolar.' : r.j.yeni ? 'Demo hesap açıldı.' : 'Demo hesabın şifresi güncellendi.'); yon.veri = null; render(); }).catch(() => toast('Bağlantı kurulamadı.'));
      return;
    }
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
      if (!v.riza) { toast('Hocanın verilerini görebilmesi için onay kutusunu işaretle.'); return; }
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
      OLCU.forEach((x) => { if (v[x[0]] == null) return; const d = oku(v[x[0]]); if (d > 0 && d < (x[0] === 'yag' ? 70 : 250)) { o[x[0]] = d; n++; } });
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
      if (sifre !== String(v.sifre2 || '')) return goster('İki şifre aynı değil. Tekrar yaz.');
      if (!v.yetiskin) return goster('COMEBACK. 18 yaş ve üstü içindir; onay kutusunu işaretle.');
      if (!v.riza) return goster('Kayıtlarının hesabında saklanması için onay kutusunu işaretle.');
      if (!v.saglikRiza) return goster('Sağlık verilerin için açık rıza kutusunu işaretle.');
    } else if (!eposta || !sifre) return goster('E-posta ve şifreni yaz.');
    btn.disabled = true; const eski = btn.innerHTML; btn.textContent = tur === 'kayit' ? 'Hesap oluşturuluyor…' : 'Giriş yapılıyor…'; btn.classList.add('isliyor');
    try {
      const r = await istek(tur, 'POST', tur === 'kayit' ? { ad: v.ad, eposta, sifre, yetiskin: true, riza: true, saglikRiza: true } : { eposta, sifre });
      if (!r.ok && r.j.beta) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); goster(r.j.hata); if (r.j.beta === 'yok') { hataEl.insertAdjacentHTML('beforeend', ' <a href="#/bekleme" style="color:inherit;font-weight:800">Bekleme listesine katıl →</a>'); } return; }
      if (!r.ok) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); return goster(r.j.hata || 'Bir sorun oluştu. Tekrar dene.'); }
      hesap = r.j.kullanici; cevrimdisi = false; paylasimYukle(); delete S.basvuru;
      if (hesap.rol === 'demo') { await veriCek(); if (!S.profil) { demoDoldur(); kaydet(true); } }
      if (tur === 'giris') { const yerel = S.profil; S = yerel ? S : bos(); await veriCek(); }
      else if (S.profil) await senkronGonder();
      toast(tur === 'kayit' ? 'Hesabın hazır. Hoş geldin, ' + hesap.ad + '.' : 'Tekrar hoş geldin, ' + hesap.ad + '.');
      git(S.profil ? '#/' : '#/kurulum');
    } catch (e) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); goster('Bağlantı kurulamadı. İnternetini kontrol et.'); }
  }

  async function basvuruGonder(f, v, p) {
    const hataEl = document.getElementById('kurulumHata'); const btn = document.getElementById('formBtn');
    const goster = (m) => { hataEl.textContent = m; hataEl.hidden = false; hataEl.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    const eposta = String(v.eposta || '').trim(); const sifre = String(v.sifre || '');
    S.basvuruTaslak = Object.assign({}, p, { eposta });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta)) return goster('Geçerli bir e-posta adresi yaz.');
    if (sifre.length < 8) return goster('Şifre en az 8 karakter olmalı.');
    if (sifre !== String(v.sifre2 || '')) return goster('İki şifre aynı değil. Tekrar yaz.');
    if (!v.riza) return goster('Kayıtlarının hesabında saklanması için onay kutusunu işaretle.');
    if (!v.saglikRiza) return goster('Sağlık verilerin için açık rıza kutusunu işaretle.');
    if (String(p.ad || '').length < 2) return goster('Adını yaz.');
    const st = Object.assign(bos(), { profil: p, hedef: hedefHesapla(p), program: programOlustur(p), hedefSurum: 2, kilo: [{ tarih: tarihKey(), kg: p.kilo }] });
    st.guncelleme = Date.now();
    btn.disabled = true; const eski = btn.innerHTML; btn.textContent = 'Gönderiliyor…'; btn.classList.add('isliyor');
    try {
      const r = await istek('basvuru', 'POST', { ad: p.ad, eposta, sifre, yetiskin: true, riza: true, saglikRiza: true, kaynak: String(v.kaynak || '').slice(0, 60), json: JSON.stringify(st) });
      if (!r.ok) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); return goster(r.j.hata || 'Bir sorun oluştu. Tekrar dene.'); }
      delete S.basvuruTaslak;
      if (r.j.durum === 'onayli' && r.j.kullanici) {
        S = st; hesap = r.j.kullanici; cevrimdisi = false; kaydet(true); paylasimYukle();
        toast('Başvurun zaten onaylıydı. Hoş geldin, ' + hesap.ad + '.'); git('#/plan'); return;
      }
      S = bos(); S.basvuru = { eposta, zaman: Date.now() }; kaydet(true);
      toast('Başvurun alındı.'); git('#/');
    } catch (e) { btn.disabled = false; btn.innerHTML = eski; btn.classList.remove('isliyor'); goster('Bağlantı kurulamadı. İnternetini kontrol et.'); }
  }
  function kurulumKaydet(f, v) {
    const secili = (g) => { const b = f.querySelector('[data-grup="' + g + '"][aria-pressed="true"]'); return b ? b.dataset.deger : null; };
    const p = {
      ad: String(v.ad || '').trim().slice(0, 30), cinsiyet: secili('cinsiyet') || 'e',
      yas: 0, boy: oku(v.boy), kilo: oku(v.kilo),
      hedef: secili('hedef') || 'kas', spor: secili('spor') || 'fitness', deneyim: secili('deneyim') || 'orta',
      gun: parseInt(document.getElementById('gunSay').textContent, 10),
      sakatlik: Array.from(f.querySelectorAll('[data-grup="sakatlik"][aria-pressed="true"]')).map((b) => b.dataset.deger),
      odak: Array.from(f.querySelectorAll('[data-grup="odak"][aria-pressed="true"]')).map((b) => b.dataset.deger).slice(0, 2),
      ortamlar: Array.from(f.querySelectorAll('[data-grup="ortam"][aria-pressed="true"]')).map((b) => b.dataset.deger), sure: parseInt(secili('sure') || '60', 10), sezon: secili('sezon') || 'disi', saglik: secili('saglik') === 'evet'
    };
    if (p.spor === 'fitness') p.sezon = 'disi';
    if (!p.ortamlar.length) p.ortamlar = ['salon'];
    p.ortam = p.ortamlar[0]; if (p.ortamlar.length < 2) delete p.ortamlar;
    const dG = parseInt(v.dgun, 10), dA = parseInt(v.day, 10), dY = parseInt(v.dyil, 10);
    const dTarih = new Date(dY, dA - 1, dG);
    const dogumOk = dY > 1900 && dA >= 1 && dA <= 12 && dG >= 1 && dTarih.getMonth() === dA - 1 && dTarih.getDate() === dG;
    if (dogumOk) { p.dogum = dY + '-' + String(dA).padStart(2, '0') + '-' + String(dG).padStart(2, '0'); p.yas = yasHesapla(p.dogum); }
    else if (!v.dgun && !v.day && !v.dyil && S.profil && S.profil.yas && f.dataset.mod !== 'basvuru') p.yas = S.profil.yas;
    const hata = document.getElementById('kurulumHata');
    if (!p.yas && !dogumOk) { hata.textContent = (v.dgun || v.day || v.dyil) ? 'Doğum tarihin geçerli değil; gün, ay ve yılı kontrol et.' : 'Doğum tarihini gir: gün, ay ve yıl.'; hata.hidden = false; hata.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const sorun = !(p.yas >= 18 && p.yas <= 90) ? (p.yas > 0 && p.yas < 18 ? 'COMEBACK. 18 yaş ve üstü içindir.' : 'Yaşını 18–90 arasında gir.') : !v.yetiskin ? '18 yaşından büyük olduğunu onayla.' : !(p.boy >= 120 && p.boy <= 230) ? 'Boyunu santimetre olarak gir (120–230).' : !(p.kilo >= 30 && p.kilo <= 250) ? 'Kilonu 30–250 kg arasında gir.' : '';
    if (sorun) { hata.textContent = sorun; hata.hidden = false; hata.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    if (f.dataset.mod === 'basvuru') return basvuruGonder(f, v, p);
    const yazan = secili('yazan'); const kendim = yazan === 'ben' || yazan === 'anlat'; olay('kurulum');
    if (S.profil) { p.protSeviye = S.profil.protSeviye; p.protG = S.profil.protG; }
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
      kaydet(true); ptaslak = null;
      if (yazan === 'anlat' && String(v.anlat || '').trim().length >= 8) { pAnlat = String(v.anlat).trim(); git('#/program'); setTimeout(programKur, 50); return; }
      git('#/program'); return;
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
  /* fotoğraf sonucu veri tabanına bağlanır: yapay zekâ gramı tahmin eder, besin değeri doğrulanmış 100 g değerinden gelir.
     Ad (Türkçe ya da İngilizce) veri tabanındaki bir yemekle sözcük sözcük örtüşürse kalori ve makrolar oradan hesaplanır;
     iki değer çok farklıysa (sos, yağ gibi görünmeyen kalori olabilir) ortalaması alınır. */
  // iki sözcük aynı kökten mi: salata/salatası, kızarmış/kızartması (en az 5 harf ortak baş)
  function benzer(a, b) { if (a === b) return true; const n = Math.min(a.length, b.length); if (n < 4) return false; let i = 0; while (i < n && a[i] === b[i]) i++; return i >= Math.min(5, n); }
  function veriyeBagla(x) {
    const kel = (t) => normal(t || '').split(/\s+/).filter((w) => w.length >= 3);
    const aranan = [kel(x.ad), kel(x.en)].filter((l) => l.length);
    if (!aranan.length || !D.YEMEK) return x;
    let en = null; let enP = 0;
    D.YEMEK.forEach((y) => {
      const adK = kel(y.ad); const tumK = kel(yAra(y));
      aranan.forEach((l) => {
        const kapsar = l.filter((w) => tumK.some((t) => benzer(w, t))).length / l.length;
        const geri = adK.filter((w) => l.some((v) => benzer(v, w))).length / Math.max(1, adK.length);
        const p = kapsar * 0.6 + geri * 0.4;
        if (p > enP) { enP = p; en = y; }
      });
    });
    if (!en || enP < 0.85) return x;
    const o = x.g / 100; const v = { k: en.k * o, p: en.p * o, kh: en.kh * o, y: en.y * o };
    const fark = x.k ? Math.abs(v.k - x.k) / Math.max(v.k, x.k) : 0;
    const kar = fark > 0.45 ? 0.5 : 1;
    ['k', 'p', 'kh', 'y'].forEach((m) => { x[m] = Math.round((v[m] * kar + x[m] * (1 - kar)) * 10) / 10; });
    x.veri = en.ad; if (x.emin === 'dusuk' && kar === 1) x.emin = 'orta';
    return x;
  }
  async function fotoAnaliz(file, eskiResim) {
    let resim = eskiResim;
    if (!resim) { try { resim = await kucult(file); } catch (e) { toast('Bu fotoğraf açılamadı. Başka bir fotoğraf dene.'); return; } }
    fotoSonuc = { resim, durum: 'Tabağın inceleniyor…' }; render();
    try {
      const r = await fetch('/api/comeback/foto', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resim, not: fotoNot.trim().slice(0, 300) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { fotoSonuc.durum = j.hata || 'Analiz şu an yapılamıyor.'; render(); return; }
      if (!j.kalemler || !j.kalemler.length) { fotoSonuc.durum = 'Tabakta yemek bulamadık. Daha yakından çekmeyi dene.'; render(); return; }
      fotoSonuc.kalemler = j.kalemler.map((x) => veriyeBagla({ emin: x.emin || 'orta', ad: String(x.ad || 'Yemek').slice(0, 50), en: String(x.en || ''), pisirme: x.pisirme || '', g: Math.max(1, +x.g || 100), k: Math.max(0, +x.k || 0), p: Math.max(0, +x.p || 0), kh: Math.max(0, +x.kh || 0), y: Math.max(0, +x.y || 0) }));
      fotoSonuc.durum = fotoSonuc.kalemler.length + ' yemek bulundu';
      render();
    } catch (e) { fotoSonuc.durum = 'Bağlantı kurulamadı.'; render(); }
  }

  app.innerHTML = '<header class="ust"><span class="logo">COMEBACK<i>.</i></span></header>';
  acilisCiz();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('kapanis')) EYLEM['kapanis-kapat'](); });
  gocEt();
  hesapYukle().then(render, render);
})();
