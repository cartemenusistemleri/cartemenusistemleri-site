/* COMEBACK. — sabit veriler: hareketler, gün şablonları, yemekler.
   Besin değerleri 100 g (sıvılarda 100 ml) başınadır ve yaklaşıktır. */
(function () {
  'use strict';

  // tip: b = bileşik (çok eklemli), i = izolasyon, s = süreli (sn/dk)
  // alt: üst gövde mi alt gövde mi (kilo artış adımı için)
  const HAREKET = {
    bench:        { ad: 'Bench press',                 kas: 'Göğüs · ön omuz · arka kol', tip: 'b', bolge: 'ust' },
    db_bench:     { ad: 'Dambıl bench press',          kas: 'Göğüs · ön omuz · arka kol', tip: 'b', bolge: 'ust' },
    incline_db:   { ad: 'Eğimli dambıl press',         kas: 'Üst göğüs · ön omuz',        tip: 'b', bolge: 'ust' },
    ohp:          { ad: 'Ayakta omuz press',           kas: 'Omuz · arka kol',            tip: 'b', bolge: 'ust' },
    db_ohp:       { ad: 'Dambıl omuz press',           kas: 'Omuz · arka kol',            tip: 'b', bolge: 'ust' },
    landmine:     { ad: 'Landmine press',              kas: 'Omuz · üst göğüs',           tip: 'b', bolge: 'ust' },
    dips:         { ad: 'Dips',                        kas: 'Alt göğüs · arka kol',       tip: 'b', bolge: 'ust' },
    lateral:      { ad: 'Yana açış',                   kas: 'Yan omuz',                   tip: 'i', bolge: 'ust' },
    pushdown:     { ad: 'Kablo pushdown',              kas: 'Arka kol',                   tip: 'i', bolge: 'ust' },
    row:          { ad: 'Barbell row',                 kas: 'Sırt · arka omuz',           tip: 'b', bolge: 'ust' },
    cs_row:       { ad: 'Göğüs destekli dambıl row',   kas: 'Sırt · arka omuz',           tip: 'b', bolge: 'ust' },
    cable_row:    { ad: 'Oturarak kablo row',          kas: 'Orta sırt',                  tip: 'b', bolge: 'ust' },
    pullup:       { ad: 'Barfiks',                     kas: 'Kanat · ön kol',             tip: 'b', bolge: 'ust' },
    lat:          { ad: 'Lat pulldown',                kas: 'Kanat · ön kol',             tip: 'b', bolge: 'ust' },
    facepull:     { ad: 'Face pull',                   kas: 'Arka omuz · rotator',        tip: 'i', bolge: 'ust' },
    curl:         { ad: 'Dambıl curl',                 kas: 'Ön kol',                     tip: 'i', bolge: 'ust' },
    hammer:       { ad: 'Hammer curl',                 kas: 'Ön kol · bilek',             tip: 'i', bolge: 'ust' },
    squat:        { ad: 'Back squat',                  kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    goblet:       { ad: 'Goblet squat',                kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    box_squat:    { ad: 'Box squat',                   kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    legpress:     { ad: 'Leg press',                   kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    deadlift:     { ad: 'Deadlift',                    kas: 'Arka bacak · sırt · kalça',  tip: 'b', bolge: 'alt' },
    rdl:          { ad: 'Romanian deadlift',           kas: 'Arka bacak · kalça',         tip: 'b', bolge: 'alt' },
    hipthrust:    { ad: 'Hip thrust',                  kas: 'Kalça',                      tip: 'b', bolge: 'alt' },
    split_squat:  { ad: 'Bulgarian split squat',       kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    step_up:      { ad: 'Step-up',                     kas: 'Ön bacak · kalça',           tip: 'b', bolge: 'alt' },
    legcurl:      { ad: 'Leg curl',                    kas: 'Arka bacak',                 tip: 'i', bolge: 'alt' },
    legext:       { ad: 'Leg extension',               kas: 'Ön bacak',                   tip: 'i', bolge: 'alt' },
    calf:         { ad: 'Ayakta calf raise',           kas: 'Baldır',                     tip: 'i', bolge: 'alt' },
    nordic:       { ad: 'Nordic hamstring',            kas: 'Arka bacak',                 tip: 'i', bolge: 'alt' },
    box_jump:     { ad: 'Box jump',                    kas: 'Patlayıcı güç',              tip: 'i', bolge: 'alt' },
    plank:        { ad: 'Plank',                       kas: 'Karın',                      tip: 's', bolge: 'alt' },
    pallof:       { ad: 'Pallof press',                kas: 'Karın · yan karın',          tip: 'i', bolge: 'alt' },
    woodchop:     { ad: 'Kablo woodchop',              kas: 'Yan karın · dönüş gücü',     tip: 'i', bolge: 'alt' },
    bike:         { ad: 'Bisiklet interval',           kas: 'Kondisyon',                  tip: 's', bolge: 'alt' }
  };

  const GUN = {
    full_a:  { ad: 'Tüm vücut A',  liste: ['squat', 'bench', 'row', 'rdl', 'lateral', 'plank'] },
    full_b:  { ad: 'Tüm vücut B',  liste: ['legpress', 'ohp', 'lat', 'hipthrust', 'curl', 'pushdown'] },
    upper_a: { ad: 'Üst gövde A',  liste: ['bench', 'row', 'ohp', 'lat', 'curl', 'pushdown'] },
    lower_a: { ad: 'Alt gövde A',  liste: ['squat', 'rdl', 'legpress', 'legcurl', 'calf', 'plank'] },
    upper_b: { ad: 'Üst gövde B',  liste: ['incline_db', 'cable_row', 'db_ohp', 'pullup', 'lateral', 'hammer'] },
    lower_b: { ad: 'Alt gövde B',  liste: ['deadlift', 'split_squat', 'hipthrust', 'legext', 'calf', 'pallof'] },
    push:    { ad: 'İtme günü',    liste: ['bench', 'ohp', 'incline_db', 'lateral', 'dips', 'pushdown'] },
    pull:    { ad: 'Çekme günü',   liste: ['pullup', 'row', 'cable_row', 'facepull', 'curl', 'hammer'] },
    legs:    { ad: 'Bacak günü',   liste: ['squat', 'rdl', 'legpress', 'legcurl', 'calf', 'plank'] }
  };

  // Haftalık gün sayısına göre bölünme ve hafta günleri (0 = Pazartesi)
  const BOLUNME = {
    2: { ad: 'Tüm vücut',               gunler: ['full_a', 'full_b'],                                   hafta: [0, 3] },
    3: { ad: 'Tüm vücut',               gunler: ['full_a', 'full_b', 'full_a'],                         hafta: [0, 2, 4] },
    4: { ad: 'Üst / Alt',               gunler: ['upper_a', 'lower_a', 'upper_b', 'lower_b'],           hafta: [0, 1, 3, 4] },
    5: { ad: 'İtme / Çekme / Bacak + Üst / Alt', gunler: ['push', 'pull', 'legs', 'upper_a', 'lower_b'], hafta: [0, 1, 2, 4, 5] },
    6: { ad: 'İtme / Çekme / Bacak ×2', gunler: ['push', 'pull', 'legs', 'push', 'pull', 'legs'],       hafta: [0, 1, 2, 3, 4, 5] }
  };

  // Yeni başlayanlar için daha kolay öğrenilen karşılıklar
  const BASLANGIC = { squat: 'goblet', deadlift: 'rdl', pullup: 'lat', row: 'cs_row', ohp: 'db_ohp' };

  // Sakatlıkta zorlayan hareketin yerine geçenler (null = çıkar)
  const SAKATLIK = {
    diz:  { squat: 'box_squat', goblet: 'box_squat', split_squat: 'hipthrust', step_up: 'hipthrust', legext: 'legcurl', box_jump: null, nordic: null },
    bel:  { deadlift: 'hipthrust', rdl: 'legcurl', squat: 'legpress', goblet: 'legpress', row: 'cs_row' },
    omuz: { ohp: 'landmine', db_ohp: 'landmine', dips: 'pushdown', pullup: 'lat', bench: 'db_bench', incline_db: 'landmine' }
  };

  // Spor dalına özel ek hareket: hangi gün tipine eklenir
  const SPOR_EK = {
    futbol:    { hareket: 'nordic',   gun: 'alt' },
    basketbol: { hareket: 'box_jump', gun: 'alt' },
    kosu:      { hareket: 'step_up',  gun: 'alt' },
    dovus:     { hareket: 'woodchop', gun: 'hepsi' },
    yuzme:     { hareket: 'facepull', gun: 'ust' }
  };

  // Yedek listesi: aynı günde tekrar eden hareket olursa sırayla dener
  const YEDEK = ['hipthrust', 'legcurl', 'facepull', 'lateral', 'cable_row', 'pallof', 'calf'];

  // Türk mutfağından sık yenenler. k = kcal, p = protein, kh = karbonhidrat, y = yağ (100 g/ml başına)
  const YEMEK = [
    { ad: 'Tavuk göğsü (ızgara)',        k: 165, p: 31,   kh: 0,   y: 3.6, g: 150, birim: '1 porsiyon' },
    { ad: 'Yumurta',                     k: 143, p: 12.6, kh: 0.7, y: 9.5, g: 50,  birim: '1 adet' },
    { ad: 'Beyaz peynir',                k: 264, p: 17,   kh: 1.5, y: 21,  g: 30,  birim: '1 dilim' },
    { ad: 'Kaşar peyniri',               k: 370, p: 26,   kh: 1,   y: 29,  g: 30,  birim: '1 dilim' },
    { ad: 'Yoğurt (tam yağlı)',          k: 61,  p: 3.5,  kh: 4.7, y: 3.3, g: 150, birim: '1 kase' },
    { ad: 'Süzme yoğurt',                k: 97,  p: 9,    kh: 4,   y: 5,   g: 150, birim: '1 kase' },
    { ad: 'Ayran',                       k: 38,  p: 1.8,  kh: 2.6, y: 2.2, g: 200, birim: '1 bardak' },
    { ad: 'Süt (tam yağlı)',             k: 61,  p: 3.2,  kh: 4.8, y: 3.3, g: 200, birim: '1 bardak' },
    { ad: 'Beyaz ekmek',                 k: 265, p: 9,    kh: 49,  y: 3.2, g: 25,  birim: '1 dilim' },
    { ad: 'Tam buğday ekmeği',           k: 247, p: 13,   kh: 41,  y: 3.4, g: 30,  birim: '1 dilim' },
    { ad: 'Simit',                       k: 300, p: 9.5,  kh: 55,  y: 5,   g: 110, birim: '1 adet' },
    { ad: 'Pirinç pilavı',               k: 160, p: 2.8,  kh: 28,  y: 4,   g: 150, birim: '1 porsiyon' },
    { ad: 'Bulgur pilavı',               k: 110, p: 3.2,  kh: 19,  y: 2.5, g: 150, birim: '1 porsiyon' },
    { ad: 'Makarna (haşlanmış)',         k: 158, p: 5.8,  kh: 31,  y: 0.9, g: 200, birim: '1 tabak' },
    { ad: 'Mercimek çorbası',            k: 65,  p: 3.5,  kh: 9,   y: 1.8, g: 250, birim: '1 kase' },
    { ad: 'Kuru fasulye',                k: 115, p: 6,    kh: 15,  y: 3.5, g: 250, birim: '1 porsiyon' },
    { ad: 'Izgara köfte',                k: 240, p: 18,   kh: 6,   y: 16,  g: 150, birim: '1 porsiyon' },
    { ad: 'Tavuk döner',                 k: 215, p: 20,   kh: 5,   y: 13,  g: 150, birim: '1 porsiyon' },
    { ad: 'Et döner',                    k: 260, p: 18,   kh: 4,   y: 19,  g: 150, birim: '1 porsiyon' },
    { ad: 'Lahmacun',                    k: 235, p: 10,   kh: 32,  y: 7,   g: 150, birim: '1 adet' },
    { ad: 'Menemen',                     k: 105, p: 5,    kh: 4,   y: 7.5, g: 200, birim: '1 porsiyon' },
    { ad: 'Mercimek köftesi',            k: 165, p: 6,    kh: 27,  y: 4,   g: 100, birim: '4 adet' },
    { ad: 'Somon',                       k: 208, p: 20,   kh: 0,   y: 13,  g: 150, birim: '1 porsiyon' },
    { ad: 'Ton balığı (suda)',           k: 116, p: 26,   kh: 0,   y: 1,   g: 80,  birim: '1 kutu' },
    { ad: 'Dana kıyma (pişmiş)',         k: 250, p: 26,   kh: 0,   y: 16,  g: 100, birim: '100 g' },
    { ad: 'Hindi füme',                  k: 110, p: 18,   kh: 2,   y: 3,   g: 30,  birim: '3 dilim' },
    { ad: 'Yulaf ezmesi',                k: 379, p: 13,   kh: 67,  y: 6.5, g: 40,  birim: '4 yemek kaşığı' },
    { ad: 'Muz',                         k: 89,  p: 1.1,  kh: 23,  y: 0.3, g: 120, birim: '1 orta' },
    { ad: 'Elma',                        k: 52,  p: 0.3,  kh: 14,  y: 0.2, g: 150, birim: '1 orta' },
    { ad: 'Portakal',                    k: 47,  p: 0.9,  kh: 12,  y: 0.1, g: 150, birim: '1 orta' },
    { ad: 'Haşlanmış patates',           k: 87,  p: 1.9,  kh: 20,  y: 0.1, g: 150, birim: '1 orta' },
    { ad: 'Patates kızartması',          k: 312, p: 3.4,  kh: 41,  y: 15,  g: 120, birim: '1 porsiyon' },
    { ad: 'Siyah zeytin',                k: 145, p: 1,    kh: 3.8, y: 15,  g: 30,  birim: '8–10 adet' },
    { ad: 'Fıstık ezmesi',               k: 588, p: 25,   kh: 20,  y: 50,  g: 15,  birim: '1 yemek kaşığı' },
    { ad: 'Badem',                       k: 579, p: 21,   kh: 22,  y: 50,  g: 25,  birim: '1 avuç' },
    { ad: 'Ceviz',                       k: 654, p: 15,   kh: 14,  y: 65,  g: 25,  birim: '1 avuç' },
    { ad: 'Bal',                         k: 304, p: 0.3,  kh: 82,  y: 0,   g: 20,  birim: '1 tatlı kaşığı' },
    { ad: 'Tereyağı',                    k: 717, p: 0.9,  kh: 0.1, y: 81,  g: 10,  birim: '1 tatlı kaşığı' },
    { ad: 'Zeytinyağı',                  k: 884, p: 0,    kh: 0,   y: 100, g: 13,  birim: '1 yemek kaşığı' },
    { ad: 'Çoban salata',                k: 55,  p: 1,    kh: 5,   y: 3.5, g: 150, birim: '1 kase' },
    { ad: 'Kaşarlı tost',                k: 290, p: 12,   kh: 30,  y: 13,  g: 130, birim: '1 adet' },
    { ad: 'Whey protein tozu',           k: 400, p: 78,   kh: 8,   y: 6,   g: 30,  birim: '1 ölçek' }
  ];

  window.CB_DATA = { HAREKET, GUN, BOLUNME, BASLANGIC, SAKATLIK, SPOR_EK, YEDEK, YEMEK };
})();
