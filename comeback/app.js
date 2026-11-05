/* COMEBACK. — web uygulaması (1. aşama: veriler bu cihazda saklanır) */
(function () {
  'use strict';

  const D = window.CB_DATA;
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
    const yaz = () => { try { localStorage.setItem(ANAHTAR, JSON.stringify(S)); } catch (e) { toast('Kaydedilemedi: tarayıcı depolaması kapalı.'); } };
    if (hemen) yaz(); else kayitZaman = setTimeout(yaz, 300);
  }
  const gun = (k) => { const key = k || tarihKey(); if (!S.gunluk[key]) S.gunluk[key] = { ogun: [], antrenman: null }; return S.gunluk[key]; };

  /* ---------- program motoru ---------- */
  function hedefHesapla(p) {
    const bmr = 10 * p.kilo + 6.25 * p.boy - 5 * p.yas + (p.cinsiyet === 'k' ? -161 : 5);
    const sporcu = ['futbol', 'basketbol', 'kosu', 'dovus', 'yuzme'].indexOf(p.spor) >= 0;
    const akt = ({ 2: 1.35, 3: 1.4, 4: 1.5, 5: 1.6, 6: 1.7 })[p.gun] + (sporcu ? 0.05 : 0);
    const tdee = bmr * akt;
    let kcal = ({ kas: tdee + 250, yag: tdee * 0.8, guc: tdee + 150, kondisyon: tdee })[p.hedef];
    if (p.hedef === 'yag') kcal = Math.max(kcal, p.cinsiyet === 'k' ? 1300 : 1600, bmr * 1.05);
    if (p.yas < 18) kcal = Math.max(kcal, tdee);
    kcal = Math.round(kcal / 10) * 10;
    const protein = Math.round(p.kilo * ({ kas: 1.8, yag: 2.0, guc: 1.8, kondisyon: 1.6 })[p.hedef]);
    const yag = Math.round(Math.max(p.kilo * 0.8, (kcal * 0.25) / 9));
    const karb = Math.max(0, Math.round((kcal - protein * 4 - yag * 9) / 4));
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, yag, karb };
  }

  const bolgeOf = (gid) => (gid.indexOf('full') === 0 ? 'tum' : (['upper_a', 'upper_b', 'push', 'pull'].indexOf(gid) >= 0 ? 'ust' : 'alt'));
  const engelli = (h, p) => (p.sakatlik || []).some((s) => D.SAKATLIK[s] && Object.prototype.hasOwnProperty.call(D.SAKATLIK[s], h));

  function doz(h, p) {
    const t = D.HAREKET[h].tip;
    const bas = p.deneyim === 'baslangic';
    if (h === 'bike') return { set: 1, alt: 0, ust: 0, tekrar: p.hedef === 'kondisyon' ? '15 dk' : '10 dk', dinlenme: 0, sure: true };
    if (t === 's') return { set: 3, alt: 30, ust: 45, tekrar: '30–45 sn', dinlenme: 45, sure: true };
    const tablo = ({
      kas: { b: [bas ? 3 : 4, 6, 10, 120], i: [3, 10, 15, 75] },
      guc: { b: [bas ? 4 : 5, 3, 5, 180], i: [3, 8, 12, 90] },
      yag: { b: [3, 8, 12, 90], i: [3, 12, 15, 60] },
      kondisyon: { b: [3, 10, 12, 60], i: [2, 15, 20, 45] }
    })[p.hedef][t === 'b' ? 'b' : 'i'];
    let set = tablo[0];
    if (p.deneyim === 'ileri' && t === 'i') set += 1;
    return { set, alt: tablo[1], ust: tablo[2], tekrar: tablo[1] + '–' + tablo[2], dinlenme: tablo[3], sure: false };
  }

  function programOlustur(p) {
    const b = D.BOLUNME[p.gun];
    const gunler = b.gunler.map((gid, i) => {
      let liste = D.GUN[gid].liste.slice();
      if (p.deneyim === 'baslangic') liste = liste.map((h) => D.BASLANGIC[h] || h);
      (p.sakatlik || []).forEach((s) => {
        const m = D.SAKATLIK[s]; if (!m) return;
        liste = liste.map((h) => (Object.prototype.hasOwnProperty.call(m, h) ? m[h] : h)).filter(Boolean);
      });
      const ek = D.SPOR_EK[p.spor];
      const bolge = bolgeOf(gid);
      if (ek && (ek.gun === 'hepsi' || ek.gun === bolge || (bolge === 'tum' && ek.gun !== 'ust')) && !engelli(ek.hareket, p)) liste.push(ek.hareket);
      const gorulen = new Set();
      const temiz = [];
      liste.forEach((h) => {
        if (!gorulen.has(h)) { gorulen.add(h); temiz.push(h); return; }
        const y = D.YEDEK.find((x) => !gorulen.has(x) && !engelli(x, p) && D.HAREKET[x].bolge === D.HAREKET[h].bolge);
        if (y) { gorulen.add(y); temiz.push(y); }
      });
      let son = temiz;
      if (p.deneyim === 'baslangic') son = son.slice(0, 5);
      if (p.hedef === 'yag' || p.hedef === 'kondisyon') son = son.concat('bike');
      return { id: gid + '-' + i, gid, ad: D.GUN[gid].ad, hafta: b.hafta[i], hareketler: son.map((h) => Object.assign({ id: h }, doz(h, p))) };
    });
    return { ad: b.ad, gunler };
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
    return hepsi ? kg + (hr.bolge === 'alt' ? 5 : 2.5) : kg;
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
      '<a class="btn ana buyuk-btn" href="#/kurulum" style="margin-top:6px">Programımı oluştur' + IK.ok + '</a>' +
      '<p class="not">18 yaş ve üstü içindir. Bu ilk sürümde verilerin yalnızca bu cihazda saklanır.</p>' +
      '</div><div class="izgara">' +
      '<div class="t kobalt genis h130"><span class="k">Kişiye özel program</span><span class="orta">Yaşın, kilon, hedefin ve sporuna göre.</span></div>' +
      '<div class="t limon h150"><span class="k">Beslenme</span><span class="orta">Fotoğrafla, barkodla, listeden.</span></div>' +
      '<div class="t koyu h150"><span class="k">Antrenman</span><span class="orta">Set, kilo, tekrar, rekor.</span></div>' +
      '</div></div>';
  }

  function ekranKurulum() {
    const p = S.profil || { ad: '', cinsiyet: 'e', yas: '', boy: '', kilo: '', hedef: 'kas', spor: 'fitness', deneyim: 'orta', gun: 4, sakatlik: [] };
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
      '<fieldset class="t genis"><legend>Uğraştığın spor</legend><div class="haplar">' + tekli('spor', [['fitness', 'Fitness'], ['futbol', 'Futbol'], ['basketbol', 'Basketbol'], ['kosu', 'Koşu'], ['yuzme', 'Yüzme'], ['dovus', 'Dövüş sporları']], p.spor) + '</div></fieldset>' +
      '<fieldset class="t"><legend>Deneyim</legend><div class="haplar">' + tekli('deneyim', [['baslangic', 'Yeni'], ['orta', 'Orta'], ['ileri', 'İleri']], p.deneyim) + '</div></fieldset>' +
      '<div class="t limon ara-sb"><span class="k">Haftada</span><div class="satir"><button type="button" class="yuvarlak" data-act="gun" data-yon="-1" aria-label="Gün azalt">−</button><span class="buyuk num" id="gunSay">' + p.gun + '</span><button type="button" class="yuvarlak" data-act="gun" data-yon="1" aria-label="Gün artır">+</button></div><span class="k">gün antrenman</span></div>' +
      '<fieldset class="t genis"><legend>Ağrı ya da sakatlık var mı?</legend><div class="haplar">' + [['diz', 'Diz'], ['bel', 'Bel'], ['omuz', 'Omuz']].map((x) => hap('sakatlik', x[0], x[1], (p.sakatlik || []).indexOf(x[0]) >= 0, true)).join('') + '</div><span class="ik">Seçersen o bölgeyi zorlayan hareketlerin yerine güvenli olanları koyarız.</span></fieldset>' +
      '<label class="t genis onay"><input type="checkbox" name="yetiskin"' + (S.profil ? ' checked' : '') + '><span>18 yaşından büyüğüm. Programın ve kalori hedeflerinin genel bilgi olduğunu, tıbbi tavsiye yerine geçmediğini biliyorum.</span></label>' +
      '<p class="hata genis" id="kurulumHata" role="alert" hidden></p>' +
      '<button class="btn ana buyuk-btn genis" type="submit">Programımı oluştur' + IK.ok + '</button>' +
      '</form>';
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
      '<div class="t koyu genis num"><span class="k">Nasıl hesapladık</span><span style="font-size:14px;line-height:1.5">Bazal metabolizman ' + sayi(h.bmr) + ' kcal (Mifflin-St Jeor). Haftada ' + p.gun + ' gün antrenmanla günlük harcaman yaklaşık ' + sayi(h.tdee) + ' kcal. Hedefine göre ' + sayi(h.kcal) + ' kcal ayarladık.</span></div>' +
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
      '<div class="t genis tum"><span class="k">Öğün ekle</span><div class="haplar"><a class="hap" href="#/ekle/foto">' + IK.kamera.replace('<svg', '<svg width="16" height="16" style="fill:none;stroke:currentColor;stroke-width:2"') + 'Fotoğrafla</a><a class="hap" href="#/ekle/ara">Listeden</a><a class="hap" href="#/ekle/barkod">Barkod</a><a class="hap" href="#/ekle/elle">Elle</a></div></div>' +
      '</div>';
  }

  /* --- antrenman --- */
  let secilenGun = null;
  function ekranAntrenman() {
    if (!S.profil) return ekranKarsilama();
    if (S.seans) return ekranSeans();
    const pr = S.program;
    const bugunku = bugunkuGun();
    const sg = pr.gunler.find((x) => x.id === secilenGun) || bugunku || pr.gunler[0];
    const bitti = gun().antrenman;
    return ust(logo, '<span class="alt">' + esc(pr.ad) + '</span>') +
      '<h1 class="baslik">Antrenman<span class="nokta">.</span></h1>' +
      '<div class="yatay" role="tablist" aria-label="Program günleri">' + pr.gunler.map((g) => '<button class="hap" role="tab" data-act="gunsec" data-id="' + g.id + '" aria-pressed="' + (g.id === sg.id) + '">' + GUN_KISA[g.hafta] + ' · ' + esc(g.ad) + (g === bugunku ? ' · bugün' : '') + '</button>').join('') + '</div>' +
      '<div class="izgara"><div class="t kobalt genis ara-sb" style="min-height:150px"><div class="k satir num"><span>' + GUN_AD[sg.hafta] + '</span><span>' + sg.hareketler.reduce((a, x) => a + x.set, 0) + ' set</span></div><span class="dev" style="font-size:46px">' + esc(sg.ad) + '<span style="color:var(--koyu)">.</span></span></div>' +
      '<div class="t genis" style="padding:4px 16px"><div class="liste">' + sg.hareketler.map((x) => {
        const hk = hedefKilo(x.id);
        return '<div><div class="ad"><b>' + esc(D.HAREKET[x.id].ad) + '</b><span class="ik">' + esc(D.HAREKET[x.id].kas) + '</span></div><span class="num" style="font-weight:800;font-size:14px;text-align:right">' + x.set + ' × ' + esc(x.tekrar) + (hk ? '<br><span class="ik" style="font-weight:600">' + sayi(hk, 1) + ' kg</span>' : '') + '</span></div>';
      }).join('') + '</div></div></div>' +
      (bitti ? '<div class="t limon"><span class="k">Bugün ' + esc(bitti.ad) + ' tamamlandı</span><span style="font-weight:700">İstersen yine de yeni bir antrenman başlatabilirsin.</span></div>' : '') +
      '<button class="btn ana buyuk-btn" data-act="basla" data-id="' + sg.id + '">' + esc(sg.ad) + ' başlat' + IK.ok + '</button>';
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
        return '<section class="t" aria-label="' + esc(hr.ad) + '" style="padding-bottom:6px"><div class="satir"><div class="yigin"><b style="font-size:18px;letter-spacing:-.01em">' + esc(hr.ad) + '</b><span class="ik num">Hedef ' + x.set + ' × ' + esc(x.tekrar) + (S.rekor[x.id] ? ' · rekor ' + sayi(S.rekor[x.id].kg, 1) + ' × ' + S.rekor[x.id].tekrar : '') + '</span></div></div>' +
          '<div class="setler"><div class="set bas"><span>Set</span><span>Önceki</span><span style="text-align:center">' + (x.sure ? 'Kg' : 'Kg') + '</span><span style="text-align:center">' + (x.sure ? (x.id === 'bike' ? 'Dk' : 'Sn') : 'Tekrar') + '</span><span></span></div>' +
          l.map((y, i) => {
            const o = once && once.setler[i];
            return '<div class="set' + (i === aktifIdx ? ' aktif' : '') + '"><span class="no num">' + (i + 1) + '</span><span class="once num">' + (o ? sayi(o.kg, 1) + ' × ' + o.tekrar : '—') + '</span>' +
              '<input aria-label="' + (i + 1) + '. set kilo" inputmode="decimal" data-in="kg" data-h="' + x.id + '" data-i="' + i + '" value="' + esc(y.kg) + '" placeholder="—">' +
              '<input aria-label="' + (i + 1) + '. set ' + (x.sure ? 'süre' : 'tekrar') + '" inputmode="numeric" data-in="tekrar" data-h="' + x.id + '" data-i="' + i + '" value="' + esc(y.tekrar) + '" placeholder="' + (x.alt || '') + '">' +
              '<button class="tik" data-act="tik" data-h="' + x.id + '" data-i="' + i + '" aria-pressed="' + (y.ok ? 'true' : 'false') + '" aria-label="' + (i + 1) + '. seti ' + (y.ok ? 'geri al' : 'tamamla') + '">' + IK.tik + '</button></div>';
          }).join('') + '</div></section>';
      }).join('') + '</div>' +
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
      return '<div class="t genis" style="padding:12px 16px 4px;align-self:start"><div class="satir"><span style="font-size:13px;font-weight:800">' + OGUN_AD[t] + '</span><span class="ik num">' + sayi(toplam(l).k) + ' kcal</span></div><div class="liste">' +
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
      (grup || '<div class="t bos genis" style="align-items:flex-start"><b>Bugün henüz bir şey eklemedin.</b><span class="ik">Fotoğraf çek, listeden seç ya da <a href="#/ekle/elle" style="color:var(--kobalt);font-weight:700">elle gir</a>.</span></div>') +
      '</div>';
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
      const kamera = 'BarcodeDetector' in window && navigator.mediaDevices;
      return bas + (kamera ? '<div class="foto" id="barkodAlan"><video id="barkodVideo" playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover"></video><span class="durum" id="barkodDurum">Kamera kapalı</span></div><button class="btn ana" data-act="barkod-kamera">' + IK.kamera + 'Kamerayla okut</button>' : '<div class="uyari">Bu tarayıcı kamerayla barkod okumayı desteklemiyor. Barkodun altındaki numarayı yazabilirsin.</div>') +
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
  let sifirOnay = false;
  function ekranProfil() {
    if (!S.profil) return ekranKarsilama();
    const p = S.profil;
    const ad = { kas: 'Kas kazanmak', yag: 'Yağ yakmak', guc: 'Güçlenmek', kondisyon: 'Kondisyon' }[p.hedef];
    const spor = { fitness: 'Fitness', futbol: 'Futbol', basketbol: 'Basketbol', kosu: 'Koşu', yuzme: 'Yüzme', dovus: 'Dövüş sporları' }[p.spor];
    return ust(logo) + '<h1 class="baslik">' + esc(p.ad || 'Profil') + '<span class="nokta">.</span></h1>' +
      '<div class="izgara">' +
      '<div class="t koyu genis num"><span class="k">Bilgilerin</span><span style="font-weight:700;font-size:15px">' + (p.cinsiyet === 'k' ? 'Kadın' : 'Erkek') + ' · ' + p.yas + ' yaş · ' + p.boy + ' cm · ' + sayi(p.kilo, 1) + ' kg</span><span class="ik">' + ad + ' · ' + spor + ' · haftada ' + p.gun + ' gün' + ((p.sakatlik || []).length ? ' · dikkat: ' + p.sakatlik.join(', ') : '') + '</span></div>' +
      '<div class="t limon h130"><span class="k">Günlük hedef</span><span class="buyuk num" style="font-size:40px">' + sayi(S.hedef.kcal) + '</span><span class="k">kcal · ' + S.hedef.protein + ' g protein</span></div>' +
      '<a class="t kobalt h130" href="#/plan"><span class="k">Program</span><span class="orta" style="font-size:22px">' + esc(S.program.ad) + '</span><span class="k">Ayrıntılar →</span></a>' +
      '<a class="btn cerceve genis" href="#/kurulum">Bilgilerimi güncelle, programı yeniden kur</a>' +
      '<div class="t bos h130"><span class="k">Hocam</span><b>Hoca bağlantısı</b><span class="ik">Yakında: davet koduyla hocana bağlan.</span></div>' +
      '<div class="t bos h130"><span class="k">Topluluk</span><b>Forum ve meydan okumalar</b><span class="ik">Yakında açılıyor.</span></div>' +
      '</div>' +
      '<button class="metin-btn" data-act="sifirla" style="align-self:center;color:var(--hata)">' + (sifirOnay ? 'Emin misin? Bütün kayıtlar silinecek, tekrar bas' : 'Bu cihazdaki verileri sıfırla') + '</button>';
  }

  /* ---------- yönlendirme ---------- */
  function render() {
    const yol = (location.hash.slice(1) || '/').split('?')[0];
    const parca = yol.split('/').filter(Boolean);
    let html = ''; let sekme = '';
    if (!parca.length) { html = ekranBugun(); sekme = 'bugun'; }
    else if (parca[0] === 'kurulum') html = ekranKurulum();
    else if (parca[0] === 'plan') { html = ekranPlan(); sekme = 'profil'; }
    else if (parca[0] === 'antrenman') { html = ekranAntrenman(); sekme = 'antrenman'; }
    else if (parca[0] === 'beslenme') { html = ekranBeslenme(); sekme = 'beslenme'; }
    else if (parca[0] === 'ekle') { html = ekranEkle(parca[1] || 'foto'); sekme = 'beslenme'; }
    else if (parca[0] === 'porsiyon') { html = ekranPorsiyon(); sekme = 'beslenme'; }
    else if (parca[0] === 'ilerleme') { html = ekranIlerleme(); sekme = 'ilerleme'; }
    else if (parca[0] === 'profil') { html = ekranProfil(); sekme = 'profil'; }
    else { html = ekranBugun(); sekme = 'bugun'; }
    app.innerHTML = html;
    const menu = !!S.profil && parca[0] !== 'kurulum';
    nav.hidden = !menu; app.classList.toggle('tam', !menu);
    app.classList.toggle('dar', ['kurulum', 'ekle', 'porsiyon'].indexOf(parca[0]) >= 0);
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
      if (el.dataset.coklu) { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); return; }
      document.querySelectorAll('[data-grup="' + grup + '"]').forEach((b) => b.setAttribute('aria-pressed', b === el ? 'true' : 'false'));
      if (grup === 'ogun' && taslak) taslak.ogun = el.dataset.deger;
    },
    gun(el) {
      const s = document.getElementById('gunSay');
      s.textContent = Math.max(2, Math.min(6, parseInt(s.textContent, 10) + parseInt(el.dataset.yon, 10)));
    },
    gunsec(el) { secilenGun = el.dataset.id; render(); },
    basla(el) {
      const g = S.program.gunler.find((x) => x.id === el.dataset.id);
      const setler = {};
      g.hareketler.forEach((x) => {
        const hk = hedefKilo(x.id);
        setler[x.id] = Array.from({ length: x.set }, () => ({ kg: hk ? String(hk).replace('.', ',') : '', tekrar: x.sure ? String(x.id === 'bike' ? parseInt(x.tekrar, 10) : x.ust) : String(x.alt), ok: false }));
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
      S.seans = null; dinlenme = null; kaydet(true);
      toast(yeni ? 'Antrenman kaydedildi. ' + yeni + ' yeni rekor!' : 'Antrenman kaydedildi. Bir sonrakinde görüşürüz.');
      git('#/');
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
      kaydet(true); toast('Tabağın kaydedildi.'); fotoSonuc = null; git('#/beslenme');
    },
    'barkod-kamera'() { barkodBaslat(); },
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
  document.addEventListener('submit', (e) => {
    const f = e.target; if (!f.dataset.form) return;
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f).entries());
    if (f.dataset.form === 'kurulum') return kurulumKaydet(f, v);
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
      kaydet(true); toast(ad + ' eklendi.'); git('#/beslenme');
    }
  });

  function kurulumKaydet(f, v) {
    const secili = (g) => { const b = f.querySelector('[data-grup="' + g + '"][aria-pressed="true"]'); return b ? b.dataset.deger : null; };
    const p = {
      ad: String(v.ad || '').trim().slice(0, 30), cinsiyet: secili('cinsiyet') || 'e',
      yas: parseInt(v.yas, 10), boy: oku(v.boy), kilo: oku(v.kilo),
      hedef: secili('hedef') || 'kas', spor: secili('spor') || 'fitness', deneyim: secili('deneyim') || 'orta',
      gun: parseInt(document.getElementById('gunSay').textContent, 10),
      sakatlik: Array.from(f.querySelectorAll('[data-grup="sakatlik"][aria-pressed="true"]')).map((b) => b.dataset.deger)
    };
    const hata = document.getElementById('kurulumHata');
    const sorun = !(p.yas >= 18 && p.yas <= 90) ? (p.yas > 0 && p.yas < 18 ? 'COMEBACK. 18 yaş ve üstü içindir.' : 'Yaşını 18–90 arasında gir.') : !v.yetiskin ? '18 yaşından büyük olduğunu onayla.' : !(p.boy >= 120 && p.boy <= 230) ? 'Boyunu santimetre olarak gir (120–230).' : !(p.kilo >= 30 && p.kilo <= 250) ? 'Kilonu 30–250 kg arasında gir.' : '';
    if (sorun) { hata.textContent = sorun; hata.hidden = false; hata.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    S.profil = p; S.hedef = hedefHesapla(p); S.program = programOlustur(p);
    const k = tarihKey(); if (!S.kilo.some((x) => x.tarih === k)) S.kilo.push({ tarih: k, kg: p.kilo });
    S.seans = null; kaydet(true); git('#/plan');
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
  let barkodAkis = null;
  async function barkodBaslat() {
    const durum = document.getElementById('barkodDurum'); const video = document.getElementById('barkodVideo');
    try {
      const algila = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      barkodAkis = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      video.srcObject = barkodAkis; await video.play(); durum.textContent = 'Barkodu kameraya göster';
      const dongu = async () => {
        if (!barkodAkis) return;
        try { const k = await algila.detect(video); if (k.length) { durum.textContent = 'Bulundu: ' + k[0].rawValue; return barkodBul(k[0].rawValue.replace(/\D/g, '')); } } catch (e) { /* kare atla */ }
        setTimeout(dongu, 250);
      };
      dongu();
    } catch (e) { durum.textContent = 'Kameraya izin verilmedi. Numarayı yazabilirsin.'; barkodDurdur(); }
  }
  function barkodDurdur() { if (barkodAkis) { barkodAkis.getTracks().forEach((t) => t.stop()); barkodAkis = null; } }

  async function kucult(file) {
    const img = await createImageBitmap(file);
    const s = Math.min(1, 1024 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
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

  render();
})();
