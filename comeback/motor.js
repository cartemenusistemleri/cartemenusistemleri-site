/* COMEBACK. — program motoru
   Girdi: profil { cinsiyet, yas, boy, kilo, hedef, spor, deneyim, gun, sakatlik[], ortam, sure, sezon, saglik }
   Çıktı: hedefler (kalori/makro) ve haftalık program (günler, hareketler, dozlar, hacim analizi, notlar, kaynaklar).
   Kurallar: ACSM 2009 (yük/tekrar/dinlenme/ilerleme), Schoenfeld 2016–2017 (haftada 2 sıklık, kas başına 10+ set),
   ISSN 2017 (protein), Helms 2014 (kayıp hızı), Mifflin-St Jeor (kalori). Ayrıntı: kutuphane.js → KAYNAK */
(function (kok) {
  'use strict';
  const K = kok.CB_KUTUPHANE || (typeof require === 'function' ? require('./kutuphane.js') : null);
  const { HAREKET, GUN, BOLUNME, BOLUNME_VUCUT, SPOR, ORTAM, ANA_KAS, KAS } = K;

  const ALT = ['diz', 'kalca', 'tek_bacak', 'hamstring_izo', 'quad_izo', 'baldir', 'adduktor', 'abduktor', 'plyo_dikey', 'plyo_yatay', 'plyo_inis', 'surat', 'ceviklik'];
  const UST = ['yatay_itme', 'egimli_itme', 'dikey_itme', 'dips', 'triceps', 'yan_omuz', 'arka_omuz', 'rotator', 'yatay_cekme', 'dikey_cekme', 'biceps', 'plyo_ust', 'boyun', 'kavrama', 'trapez'];
  const bolgeOf = (kalip) => (ALT.indexOf(kalip) >= 0 ? 'alt' : UST.indexOf(kalip) >= 0 ? 'ust' : 'notr');
  const gunAlir = (gunBolge, kalip) => { const b = bolgeOf(kalip); return gunBolge === 'tum' || b === 'notr' || b === gunBolge; };
  const SEVIYE = { baslangic: 1, orta: 2, ileri: 3 };

  /* ---------- kalori ve makro ---------- */
  function hedefHesapla(p) {
    const bmr = 10 * p.kilo + 6.25 * p.boy - 5 * p.yas + (p.cinsiyet === 'k' ? -161 : 5);
    const sporcu = p.spor && p.spor !== 'fitness';
    const akt = ({ 2: 1.35, 3: 1.4, 4: 1.5, 5: 1.6, 6: 1.7 })[p.gun] + (sporcu ? 0.1 : 0);
    const tdee = bmr * akt;
    let kcal = ({ kas: tdee + 250, yag: tdee * 0.8, guc: tdee + 150, kondisyon: tdee })[p.hedef];
    if (p.hedef === 'yag') {
      // haftalık kayıp vücut ağırlığının %1'ini geçmesin (Helms 2014: %0,5–1)
      const enCokAcik = (p.kilo * 0.01 * 7700) / 7;
      kcal = Math.max(kcal, tdee - enCokAcik, p.cinsiyet === 'k' ? 1300 : 1600, bmr * 1.05);
    }
    kcal = Math.round(kcal / 10) * 10;
    // protein: araştırmalar ~1,6 g/kg üstünde ek fayda görmüyor (Morton 2018); fazla kilolularda boya göre BKİ 25 ağırlığı esas alınır
    const refKg = Math.min(p.kilo, Math.round(25 * Math.pow(p.boy / 100, 2)));
    const PSEV = { dusuk: 1.2, orta: 1.6, yuksek: 2.0 };
    const varsayilan = ({ kas: 1.6, yag: 1.8, guc: 1.6, kondisyon: 1.4 })[p.hedef] || 1.6;
    let protein = Math.round(refKg * (PSEV[p.protSeviye] || varsayilan));
    if (p.protSeviye === 'ozel' && p.protG > 0) protein = Math.round(Math.max(40, Math.min(300, p.protG)));
    const yag = Math.round(Math.max(p.kilo * 0.8, (kcal * 0.25) / 9));
    const karb = Math.max(0, Math.round((kcal - protein * 4 - yag * 9) / 4));
    const protKg = Math.round((protein / p.kilo) * 10) / 10;
    const haftalikKg = Math.round((((kcal - tdee) * 7) / 7700) * 100) / 100;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, yag, karb, haftalikKg, protKg, refKg };
  }

  /* ---------- hareket seçimi ---------- */
  function uygun(h, p, kullanilan) {
    const ekip = (ORTAM[p.ortam] || ORTAM.salon).ekipman;
    const spor = SPOR[p.spor] || SPOR.fitness;
    return h.ekipman.every((e) => ekip.indexOf(e) >= 0) &&
      h.seviye <= (SEVIYE[p.deneyim] || 2) &&
      !h.kontra.some((k) => (p.sakatlik || []).indexOf(k) >= 0) &&
      spor.kacin.indexOf(h.id) < 0 &&
      !kullanilan.has(h.id);
  }
  function adaylar(kalip, p, kullanilan, hepsi) {
    return Object.keys(HAREKET).map((id) => HAREKET[id]).filter((h) => h.kalip === kalip && (hepsi || !h.ek) && uygun(h, p, kullanilan));
  }
  // belirli bir hareket uygun değilse aynı kalıptan uygun olanı seç
  function belirliYaDaYedek(id, p, kullanilan) {
    const h = HAREKET[id];
    if (h && uygun(h, p, kullanilan)) return h;
    const a = h ? adaylar(h.kalip, p, kullanilan) : [];
    return a[0] || null;
  }

  /* ---------- doz ---------- */
  const DOZ = {
    kas:       { ana: [4, 6, 10, 120], yard: [3, 8, 12, 90],  izo: [3, 10, 15, 60] },
    guc:       { ana: [5, 3, 5, 180],  yard: [3, 5, 8, 120],  izo: [2, 8, 12, 60] },
    yag:       { ana: [3, 8, 12, 90],  yard: [3, 10, 12, 75], izo: [3, 12, 15, 60] },
    kondisyon: { ana: [3, 10, 15, 60], yard: [3, 12, 15, 45], izo: [2, 15, 20, 45] }
  };
  const ONLEME_DOZ = {
    nordic: [2, 4, 6, 90, 'tekrar'], copenhagen: [2, 6, 10, 60, 'tekrar', 'her yan'], copenhagen_kisa: [2, 8, 12, 60, 'tekrar', 'her yan'],
    drop_landing: [3, 5, 5, 60, 'tekrar'], sl_calf: [3, 12, 15, 60, 'tekrar', 'her bacak'], seated_calf: [3, 12, 15, 60, 'tekrar'], calf: [3, 12, 15, 60, 'tekrar'],
    side_plank: [2, 20, 40, 45, 'sn', 'her yan'], band_walk: [2, 10, 15, 45, 'tekrar', 'her yöne'], side_lying_abd: [2, 12, 15, 45, 'tekrar', 'her bacak'],
    ext_rot: [2, 12, 15, 45, 'tekrar', 'her kol'], db_ext_rot: [2, 12, 15, 45, 'tekrar', 'her kol'], band_pullapart: [2, 12, 15, 45, 'tekrar'], ytw: [2, 8, 10, 45, 'tekrar'],
    neck_iso: [2, 15, 20, 45, 'sn', 'her yön'], prone_er: [2, 10, 15, 45, 'tekrar', 'her kol'], rear_fly: [2, 12, 15, 45, 'tekrar'], facepull: [2, 12, 15, 45, 'tekrar']
  };
  const yaz = (x) => (x.birim === 'm' ? x.alt + ' m' : x.alt === x.ust ? String(x.alt) : x.alt + '–' + x.ust) + (x.birim === 'sn' ? ' sn' : x.birim === 'dk' ? ' dk' : '');
  function doz(h, rol, p) {
    const bas = p.deneyim === 'baslangic';
    const o = { id: h.id, rol, blok: rol, birim: 'tekrar', not: '' };
    if (h.tip === 'k') {
      if (h.kalip === 'surat') Object.assign(o, { set: bas ? 4 : 6, alt: 20, ust: 20, birim: 'm', dinlenme: 90, rir: 'tam hız' });
      else if (h.kalip === 'ceviklik') Object.assign(o, { set: 4, alt: 1, ust: 1, dinlenme: 90, rir: 'tam hız' });
      else Object.assign(o, { set: 1, alt: p.hedef === 'kondisyon' ? 15 : 10, ust: p.hedef === 'kondisyon' ? 20 : 15, birim: 'dk', dinlenme: 0, rir: 'nefes nefese ama konuşabilir' });
    } else if (h.tip === 'p') {
      Object.assign(o, { set: 3, alt: bas ? 4 : 5, ust: bas ? 4 : 6, dinlenme: 90, rir: 'her tekrar en yüksek hız' });
      if (h.id === 'lateral_bound' || h.id === 'mb_rot_throw') o.not = 'her yan';
    } else if ((rol === 'onleme' || ['nordic', 'copenhagen', 'copenhagen_kisa', 'drop_landing'].indexOf(h.id) >= 0) && ONLEME_DOZ[h.id]) {
      const d = ONLEME_DOZ[h.id];
      Object.assign(o, { set: d[0], alt: d[1], ust: d[2], dinlenme: d[3], birim: d[4], not: d[5] || '', rir: 'kontrollü' });
      if (h.id === 'nordic' && bas) Object.assign(o, { alt: 3, ust: 5 });
    } else if (h.tip === 's') {
      Object.assign(o, { set: 3, alt: bas ? 20 : 30, ust: bas ? 30 : 45, birim: 'sn', dinlenme: 60, rir: 'kontrollü' });
      if (h.id === 'farmer' || h.id === 'suitcase') Object.assign(o, { alt: 30, ust: 40, not: h.id === 'suitcase' ? 'her el' : '' });
    } else if (rol === 'core') {
      Object.assign(o, { set: 3, alt: 8, ust: 12, dinlenme: 60, rir: 'kontrollü', not: ['pallof', 'band_pallof', 'birddog', 'woodchop', 'band_woodchop'].indexOf(h.id) >= 0 ? 'her yan' : '' });
    } else {
      const r = DOZ[p.hedef][rol === 'ana' ? 'ana' : rol === 'yard' ? 'yard' : 'izo'];
      let set = r[0]; let alt = r[1]; let ust = r[2]; let din = r[3];
      if (bas && rol === 'ana') { set = 3; if (p.hedef === 'guc') { alt = 6; ust = 8; din = 120; } else { alt = 8; ust = 12; } }
      if (p.deneyim === 'ileri' && rol === 'izo' && p.hedef === 'kas') set += 1;
      if (h.artis === 0 && h.tip === 'b') { alt += 4; ust += 6; } // vücut ağırlığında tekrar aralığı yüksek
      if (h.tip === 'i' && rol !== 'izo') din = Math.min(din, 90);
      Object.assign(o, { set, alt, ust, dinlenme: din, rir: bas ? 'yedekte 3 tekrar' : rol === 'ana' ? 'yedekte 2–3 tekrar' : rol === 'yard' ? 'yedekte 1–2 tekrar' : 'yedekte 0–2 tekrar' });
      if (['split_squat', 'lunge', 'step_up', 'sl_rdl', 'rev_lunge', 'bw_split', 'bw_step_up', 'sl_rdl_bw', 'lateral_lunge', 'db_row', 'sl_bridge'].indexOf(h.id) >= 0) o.not = 'her bacak/kol';
    }
    o.sure = o.birim !== 'tekrar';
    o.tekrar = yaz(o);
    return o;
  }

  function sureDk(g) {
    let sn = 6 * 60; // ısınma
    g.hareketler.forEach((x) => {
      const h = HAREKET[x.id];
      if (x.birim === 'dk') { sn += x.ust * 60; return; }
      const is = x.birim === 'sn' ? x.ust : x.birim === 'm' ? 8 : h.tip === 'p' ? 10 : h.tip === 'b' ? 35 : 30;
      const yan = x.not && /her (yan|bacak|kol|el)/.test(x.not) ? 2 : 1;
      sn += x.set * (is * yan + x.dinlenme) + 30; // hareket arası geçiş
    });
    return Math.round(sn / 60);
  }

  /* ---------- odak bölge: haftada 2 gün ek hareket ---------- */
  const ODAK = {
    gogus: { ad: 'Göğüs', slot: ['yatay_itme:yard', 'egimli_itme:yard'] },
    sirt: { ad: 'Sırt', slot: ['yatay_cekme:yard', 'dikey_cekme:yard'] },
    omuz: { ad: 'Omuz', slot: ['yan_omuz:izo', 'arka_omuz:izo'] },
    kol: { ad: 'Kol', slot: ['biceps:izo', 'triceps:izo'] },
    bacak: { ad: 'Bacak', slot: ['quad_izo:izo', 'hamstring_izo:izo'] },
    kalca: { ad: 'Kalça', slot: ['kalca:yard', 'tek_bacak:yard'] },
    baldir: { ad: 'Baldır', slot: ['baldir:izo', 'baldir:izo'] },
    karin: { ad: 'Karın', slot: ['core_anti_ext:core', 'core_lat:core'] }
  };

  /* ---------- program ---------- */
  function programOlustur(p0) {
    const p = Object.assign({ ortam: 'salon', sure: 60, sezon: 'disi', sakatlik: [], spor: 'fitness' }, p0);
    const spor = SPOR[p.spor] || SPOR.fitness;
    const sporcu = p.spor !== 'fitness';
    const sezonIci = sporcu && p.sezon === 'ici';
    const b = p.ortam !== 'salon' && BOLUNME_VUCUT[p.gun] ? BOLUNME_VUCUT[p.gun] : BOLUNME[p.gun];
    const notlar = [];
    const sayac = {};

    // 1) şablon günleri → hareketler
    const gunler = b.gunler.map((gid, i) => {
      const sab = GUN[gid];
      let slotlar = sab.slot.slice();
      if (spor.ust_azalt) slotlar = slotlar.filter((s) => ['biceps:izo', 'triceps:izo', 'yan_omuz:izo'].indexOf(s) < 0);
      if (sezonIci) slotlar = slotlar.filter((s) => !/:izo$/.test(s));
      return { id: gid + '-' + i, gid, ad: sab.ad, hafta: b.hafta[i], bolge: sab.bolge, slotlar, hareketler: [], kullanilan: new Set() };
    });
    const ekle = (g, h, rol, blok) => { const d = doz(h, rol, p); d.blok = blok || rol; g.hareketler.push(d); g.kullanilan.add(h.id); return d; };
    const secVeEkle = (g, kalip, rol, blok) => {
      const a = adaylar(kalip, p, g.kullanilan);
      if (!a.length) return null;
      const k = kalip + ':' + rol; const n = sayac[k] || 0; sayac[k] = n + 1;
      let h;
      if (rol === 'ana') { const bil = a.filter((x) => x.tip === 'b'); h = (bil.length ? bil : a)[0]; }
      else h = a[n % a.length];
      return ekle(g, h, rol, blok);
    };

    // 2) spora özel başlangıç blokları (güç/sürat) — taze kasla, antrenmanın başında
    gunler.forEach((g) => {
      spor.basla.filter((k) => gunAlir(g.bolge, k)).slice(0, 2).forEach((k) => secVeEkle(g, k, 'guc', 'guc'));
    });
    // 3) şablon slotları
    gunler.forEach((g) => g.slotlar.forEach((s) => { const [k, r] = s.split(':'); secVeEkle(g, k, r); }));
    // 4) spora özel vurgu (haftada 2 gün)
    spor.vurgu.forEach((s) => {
      const [k, r] = s.split(':'); let n = 0;
      gunler.forEach((g) => { if (n < 2 && gunAlir(g.bolge, k) && !g.hareketler.some((x) => HAREKET[x.id].kalip === k)) { if (secVeEkle(g, k, r, 'vurgu')) n++; } });
    });
    // 4b) odak bölgeler (en fazla 2): haftada 2 gün, uygun güne birer ek hareket
    const odaklar = (p.odak || []).filter((o) => ODAK[o]).slice(0, 2);
    odaklar.forEach((o) => {
      let n = 0; const verilen = new Set();
      ODAK[o].slot.forEach((s) => {
        const [k, r] = s.split(':');
        const uygunGun = gunler.filter((g) => gunAlir(g.bolge, k));
        const bos = uygunGun.filter((g) => !verilen.has(g));
        const g = (bos.length ? bos : uygunGun).sort((a, c) => a.hareketler.length - c.hareketler.length)[0];
        if (g && secVeEkle(g, k, r, 'odak')) { n++; verilen.add(g); }
      });
      if (!n) notlar.push(ODAK[o].ad + ' için seçtiğin ortamda uygun ek hareket bulamadık.');
    });
    // 5) sakatlık önleme (her biri haftada 2 kez)
    spor.onleme.forEach((id) => {
      const h0 = HAREKET[id]; if (!h0) return;
      const tercih = gunler.filter((g) => gunAlir(g.bolge, h0.kalip));
      const sira = tercih.concat(gunler.filter((g) => tercih.indexOf(g) < 0));
      let n = 0;
      sira.forEach((g) => {
        if (n >= 2) return;
        // hareket o gün şablondan zaten geldiyse önleme dozuna çevir
        const var_ = g.hareketler.find((x) => x.id === id || (HAREKET[x.id].kalip === h0.kalip && x.blok !== 'ana' && x.blok !== 'onleme'));
        if (var_ && !g.hareketler.some((x) => x.blok === 'onleme' && HAREKET[x.id].kalip === h0.kalip)) {
          const d = doz(HAREKET[var_.id], 'onleme', p); d.blok = 'onleme'; Object.assign(var_, d); n++; return;
        }
        const h = belirliYaDaYedek(id, p, g.kullanilan); if (h) { ekle(g, h, 'onleme', 'onleme'); n++; }
      });
    });
    // 6) kondisyon / yağ yakımı bitirişi ve dövüş tur çalışması
    const kardiyoSec = (g) => { const a = adaylar('kardiyo', p, g.kullanilan); return a[0] || null; };
    gunler.forEach((g, i) => {
      if (p.hedef === 'yag' || p.hedef === 'kondisyon') { const h = kardiyoSec(g); if (h) ekle(g, h, 'kardiyo', 'kardiyo'); }
      else if (spor.finisaj && i < 2) { const h = belirliYaDaYedek(spor.finisaj, p, g.kullanilan); if (h) ekle(g, h, 'kardiyo', 'kardiyo'); }
    });
    // 7) sezon içi: ana ve yardımcı setleri azalt
    if (sezonIci) gunler.forEach((g) => g.hareketler.forEach((x) => { if (x.blok === 'ana' || x.blok === 'yard') x.set = Math.max(2, x.set - 1); }));
    // 8) ısınma: günün ilk ağırlıklı ana hareketi
    gunler.forEach((g) => { const x = g.hareketler.find((y) => y.blok === 'ana' && HAREKET[y.id].artis > 0); if (x) x.isinma = true; });

    // 9) haftalık hacim analizi (birincil kas = 1 set, ikincil = 0,5 set)
    const hacimHesapla = () => {
      const v = {}; ANA_KAS.forEach((m) => { v[m] = 0; });
      gunler.forEach((g) => g.hareketler.forEach((x) => {
        const h = HAREKET[x.id]; if (h.tip === 'k' || h.tip === 'p') return;
        h.birincil.forEach((m) => { if (m in v) v[m] += x.set; });
        h.ikincil.forEach((m) => { if (m in v) v[m] += x.set * 0.5; });
      }));
      return v;
    };
    let hacim = hacimHesapla();
    const HEDEF_HACIM = { kas: [10, 20], guc: [6, 15], yag: [8, 16], kondisyon: [4, 12] }[p.hedef];
    if (p.hedef === 'kas' && p.deneyim !== 'baslangic' && !sezonIci) {
      // eksik kas gruplarına izolasyon/yardımcı setleri ekle (en fazla 5 set)
      for (let tur = 0; tur < 6; tur++) {
        let degisti = false;
        ANA_KAS.forEach((m) => {
          if (hacim[m] >= HEDEF_HACIM[0]) return;
          const x = [].concat.apply([], gunler.map((g) => g.hareketler)).filter((y) => (y.blok === 'izo' || y.blok === 'yard') && HAREKET[y.id].birincil.indexOf(m) >= 0 && y.set < 4 && ['nordic', 'copenhagen', 'copenhagen_kisa'].indexOf(y.id) < 0).sort((a, c) => a.set - c.set)[0];
          if (x) { x.set += 1; degisti = true; hacim = hacimHesapla(); }
        });
        if (!degisti) break;
      }
    }
    // 10) seans süresi sınırı
    let kardiyoAyri = false;
    gunler.forEach((g) => {
      let dk = sureDk(g); let guv = 0;
      const sil = (fn) => { for (let i = g.hareketler.length - 1; i >= 0; i--) if (fn(g.hareketler[i], i)) { g.hareketler.splice(i, 1); return true; } return false; };
      while (dk > p.sure + 5 && guv++ < 25) {
        const ok =
          sil((x) => x.blok === 'izo') ||
          sil((x) => x.blok === 'vurgu') ||
          (g.hareketler.filter((x) => x.blok === 'guc').length > 1 && sil((x) => x.blok === 'guc')) ||
          sil((x) => x.blok === 'core') ||
          (() => { const k = g.hareketler.find((x) => x.blok === 'kardiyo' && x.ust > x.alt); if (k) { k.ust = k.alt; return true; } return false; })() ||
          (() => { const y = g.hareketler.find((x) => x.blok === 'yard' && x.set > 2); if (y) { y.set -= 1; return true; } return false; })() ||
          (() => { const a = g.hareketler.find((x) => x.blok === 'ana' && x.set > 3); if (a) { a.set -= 1; return true; } return false; })() ||
          (g.hareketler.filter((x) => x.blok === 'yard').length > 1 && sil((x) => x.blok === 'yard')) ||
          (sil((x) => x.blok === 'kardiyo') && (kardiyoAyri = true)) ||
          (() => { const a = g.hareketler.find((x) => (x.blok === 'guc' || x.blok === 'ana') && x.set > 2); if (a) { a.set -= 1; return true; } return false; })();
        if (!ok) break;
        dk = sureDk(g);
      }
      g.dk = dk;
      g.hareketler.forEach((x) => { x.tekrar = yaz(x); });
      delete g.kullanilan; delete g.slotlar;
    });
    hacim = hacimHesapla();

    // 11) notlar
    const eksik = ANA_KAS.filter((m) => hacim[m] < HEDEF_HACIM[0] * 0.6);
    if (p.hedef === 'kas' && eksik.length && p.ortam !== 'salon') notlar.push('Seçtiğin ortamda ' + eksik.map((m) => KAS[m].toLowerCase()).join(', ') + ' için hareket seçeneği sınırlı; bir lastik bant ya da dambıl eklemek hacmi artırır.');
    const enUzun = Math.max.apply(null, gunler.map((g) => g.dk));
    if (enUzun > p.sure + 5) notlar.push('Bazı günler seçtiğin ' + p.sure + ' dakikayı aşıyor (en uzunu yaklaşık ' + enUzun + ' dk). Sakatlık önleme ve güç bölümlerini kısaltmadık; istersen seans süresini artır.');
    if (kardiyoAyri) notlar.push('Seans süresine sığmadığı için bazı günlerde kardiyo bitirişini çıkardık; 10–15 dakikalık kardiyoyu başka bir saatte ya da dinlenme gününde yap.');
    if (sporcu && p.gun > 4) notlar.push('Spor antrenmanlarına ek olarak haftada 5–6 kuvvet günü fazla olabilir; çoğu sporcu için 2–3 gün yeterli.');
    if (sezonIci) notlar.push('Sezon içindesin: setler azaltıldı, izolasyon çıkarıldı. Amaç kazanılan kuvveti korumak; maçtan önceki 48 saatte ağır bacak çalışması yapma.');
    if (spor.not) notlar.push(spor.not);
    if (p.hedef === 'yag' || p.hedef === 'kondisyon') notlar.push('Kuvvete ek olarak haftada 150–300 dk orta tempolu yürüyüş, bisiklet ya da yüzme önerilir (DSÖ).');
    if (odaklar.length) notlar.push('Odak: ' + odaklar.map((o) => ODAK[o].ad.toLowerCase()).join(' ve ') + ' için haftada 2 gün ek hareket koyduk (programda "odak" olarak işaretli).');
    if (p.saglik) notlar.unshift('Sağlık sorularından en az birine "evet" dedin: programa başlamadan önce doktorundan onay al.');

    const kurallar = [
      'Isınma: 5 dakika hafif kardiyo, sonra ilk büyük harekette 2 hafif ısınma seti (önce çok hafif × 8, sonra orta × 4).',
      'Efor: her harekette yazan "yedekte tekrar" kadar güç bırak; teknik bozulunca seti bitir.',
      'İlerleme: bütün setlerde üst tekrar sayısına ulaşınca bir sonraki antrenmanda ağırlığı artır (çoğunlukla %2–5). Vücut ağırlığı hareketlerinde tekrarı artır ya da zor varyasyona geç.',
      'Takılırsan: iki antrenman üst üste alt tekrar sayısına ulaşamazsan ağırlığı %5–10 azalt ve yeniden yüksel.',
      'Hafif hafta: 6–8 haftada bir ya da çok yorgun hissettiğinde setlerin yarısını yap.'
    ];
    const kaynaklar = ['acsm', 'hacim', 'siklik', 'protein', 'kalori'].concat(p.hedef === 'yag' ? ['kayip'] : []).concat(spor.kaynak || []);
    return { surum: 2, ad: b.ad + (sporcu ? ' · ' + spor.ad : ''), gunler, hacim, hacimHedef: HEDEF_HACIM, notlar, kurallar, kaynaklar, ortam: p.ortam, spor: p.spor };
  }

  // "Bu hareket bende yok": aynı kalıptan, yoksa aynı ana kası çalıştıran uygun hareketler
  function alternatifler(p0, x, gunIdleri) {
    const p = Object.assign({ ortam: 'salon', sakatlik: [], spor: 'fitness' }, p0);
    const h0 = HAREKET[x.id]; if (!h0) return [];
    const kul = new Set((gunIdleri || []).filter((id) => id !== x.id)); kul.add(x.id);
    const ayni = adaylar(h0.kalip, p, kul, true);
    const kas = Object.keys(HAREKET).map((id) => HAREKET[id]).filter((h) => h.kalip !== h0.kalip && h.tip === h0.tip && h.birincil[0] === h0.birincil[0] && uygun(h, p, kul));
    return ayni.concat(kas).slice(0, 6).map((h) => h.id);
  }
  function degistir(p0, x, yeniId) {
    const h = HAREKET[yeniId]; if (!h) return x;
    const d = doz(h, x.rol === 'onleme' ? 'izo' : x.rol, Object.assign({ deneyim: 'orta', hedef: 'kas' }, p0));
    d.blok = x.blok; d.isinma = x.isinma; if (x.set && x.set < d.set) d.set = x.set;
    return d;
  }

  /* ---------- kullanıcının kendi programı ---------- */
  const CORE_KALIP = ['core_anti_ext', 'core_anti_rot', 'core_lat', 'core_rot', 'tasima', 'kavrama', 'boyun'];
  function rolTahmin(h) {
    if (h.tip === 'k') return 'kardiyo';
    if (h.tip === 'p') return 'guc';
    if (CORE_KALIP.indexOf(h.kalip) >= 0) return 'core';
    if (h.tip === 'i' || h.tip === 's') return 'izo';
    return h.artis >= 5 ? 'ana' : 'yard';
  }
  // kütüphaneden seçilen harekete, profile göre başlangıç dozu (kullanıcı sonra değiştirir)
  function ozelHareket(p0, id) {
    const h = HAREKET[id]; if (!h) return null;
    const p = Object.assign({ deneyim: 'orta', hedef: 'kas' }, p0);
    const rol = rolTahmin(h);
    const d = doz(h, rol === 'kardiyo' || rol === 'guc' ? 'yard' : rol, p);
    d.blok = rol === 'kardiyo' ? 'kardiyo' : rol;
    return d;
  }
  // "8-12", "10", "30 sn" gibi yazılardan alt/üst/birim
  function tekrarCoz(yazi, birim) {
    const t = String(yazi || '').replace(/\s+/g, '').replace('–', '-');
    const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(t);
    if (!m) return null;
    let alt = +m[1], ust = m[2] ? +m[2] : +m[1];
    if (ust < alt) { const z = alt; alt = ust; ust = z; }
    if (alt < 1 || ust > (birim === 'tekrar' ? 100 : 600)) return null;
    return { alt, ust, tekrar: alt === ust ? String(alt) : alt + '–' + ust };
  }
  // hacim, süre ve uyarılar: kendi programı ya da düzenlenen hazır program için
  function ozelAnaliz(gunler, p0) {
    const p = Object.assign({ hedef: 'kas' }, p0);
    const v = {}; ANA_KAS.forEach((m) => { v[m] = 0; });
    gunler.forEach((g) => g.hareketler.forEach((x) => {
      const h = HAREKET[x.id]; if (!h || h.tip === 'k' || h.tip === 'p') return;
      h.birincil.forEach((m) => { if (m in v) v[m] += x.set; });
      h.ikincil.forEach((m) => { if (m in v) v[m] += x.set * 0.5; });
    }));
    const hedef = { kas: [10, 20], guc: [6, 15], yag: [8, 16], kondisyon: [4, 12] }[p.hedef] || [10, 20];
    const uyari = [];
    const az = ANA_KAS.filter((m) => v[m] < hedef[0] * 0.6).map((m) => KAS[m]);
    const fazla = ANA_KAS.filter((m) => v[m] > hedef[1] + 4).map((m) => KAS[m]);
    if (az.length) uyari.push('Haftada az çalışan kaslar: ' + az.join(', ') + '.');
    if (fazla.length) uyari.push('Haftalık set çok yüksek: ' + fazla.join(', ') + '. Toparlanma zorlaşabilir.');
    gunler.forEach((g) => {
      const set = g.hareketler.reduce((a, x) => a + (x.birim === 'dk' ? 0 : x.set), 0);
      if (set > 30) uyari.push(g.ad + ': ' + set + ' set, tek gün için çok fazla.');
      const kon = g.hareketler.filter((x) => HAREKET[x.id] && (HAREKET[x.id].kontra || []).some((b) => (p.sakatlik || []).indexOf(b) >= 0));
      if (kon.length) uyari.push(g.ad + ': ' + kon.map((x) => HAREKET[x.id].ad).join(', ') + ' sakatlık bölgeni zorlayabilir.');
    });
    const haftaSirasi = gunler.map((g) => g.hafta).sort((a, b) => a - b);
    for (let i = 0; i < haftaSirasi.length; i++) {
      const g1 = gunler.find((g) => g.hafta === haftaSirasi[i]); const g2 = gunler.find((g) => g.hafta === (haftaSirasi[i] + 1) % 7);
      if (!g1 || !g2) continue;
      const kas = (g) => new Set([].concat.apply([], g.hareketler.filter((x) => HAREKET[x.id] && HAREKET[x.id].tip !== 'k').map((x) => HAREKET[x.id].birincil)));
      const ortak = [...kas(g1)].filter((m) => kas(g2).has(m) && ['on_bacak', 'arka_bacak', 'kalca', 'gogus', 'sirt_kanat'].indexOf(m) >= 0);
      if (ortak.length >= 2) uyari.push(g1.ad + ' ve ertesi gün ' + g2.ad + ' aynı büyük kasları çalıştırıyor (' + ortak.map((m) => KAS[m]).join(', ') + '). Arada bir gün dinlenme iyi olur.');
    }
    return { hacim: v, hacimHedef: hedef, dk: gunler.map((g) => Math.round(sureDk(g))), uyari };
  }

  kok.CB_MOTOR = { hedefHesapla, programOlustur, bolgeOf, SEVIYE, alternatifler, degistir, ODAK, ozelHareket, tekrarCoz, ozelAnaliz, rolTahmin };
  if (typeof module !== 'undefined' && module.exports) module.exports = kok.CB_MOTOR;
})(typeof window !== 'undefined' ? window : globalThis);
