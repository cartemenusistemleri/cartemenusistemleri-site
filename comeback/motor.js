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
  const UST = ['yatay_itme', 'egimli_itme', 'dikey_itme', 'dips', 'triceps', 'yan_omuz', 'arka_omuz', 'rotator', 'yatay_cekme', 'dikey_cekme', 'biceps', 'plyo_ust', 'boyun', 'kavrama'];
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
    const protein = Math.round(p.kilo * ({ kas: 1.8, yag: 2.2, guc: 1.8, kondisyon: 1.6 })[p.hedef]);
    const yag = Math.round(Math.max(p.kilo * 0.8, (kcal * 0.25) / 9));
    const karb = Math.max(0, Math.round((kcal - protein * 4 - yag * 9) / 4));
    const haftalikKg = Math.round((((kcal - tdee) * 7) / 7700) * 100) / 100;
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), kcal, protein, yag, karb, haftalikKg };
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
  function adaylar(kalip, p, kullanilan) {
    return Object.keys(HAREKET).map((id) => HAREKET[id]).filter((h) => h.kalip === kalip && uygun(h, p, kullanilan));
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

  kok.CB_MOTOR = { hedefHesapla, programOlustur, bolgeOf, SEVIYE };
  if (typeof module !== 'undefined' && module.exports) module.exports = kok.CB_MOTOR;
})(typeof window !== 'undefined' ? window : globalThis);
