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
    { ad: 'Whey protein tozu',           k: 400, p: 78,   kh: 8,   y: 6,   g: 30,  birim: '1 ölçek' },
    // 8 Kasım ekleri: 100 g başına yaklaşık değerler (USDA FoodData Central ve yaygın tarif ortalamaları)
    { ad: 'Ezogelin çorbası', k: 62, p: 3, kh: 9, y: 1.6, g: 250, birim: '1 kase' },
    { ad: 'Tarhana çorbası', k: 60, p: 2, kh: 9, y: 1.8, g: 250, birim: '1 kase' },
    { ad: 'Yayla çorbası', k: 58, p: 2.5, kh: 7, y: 2.2, g: 250, birim: '1 kase' },
    { ad: 'Domates çorbası', k: 50, p: 1.2, kh: 7, y: 2, g: 250, birim: '1 kase' },
    { ad: 'Tavuk suyu çorbası', k: 45, p: 3.5, kh: 5, y: 1.3, g: 250, birim: '1 kase' },
    { ad: 'İşkembe çorbası', k: 70, p: 6, kh: 3, y: 4, g: 250, birim: '1 kase' },
    { ad: 'Nohut yemeği', k: 120, p: 6, kh: 16, y: 3.5, g: 250, birim: '1 tabak' },
    { ad: 'Etli kuru fasulye', k: 130, p: 8, kh: 14, y: 4.5, g: 250, birim: '1 tabak' },
    { ad: 'Zeytinyağlı taze fasulye', k: 65, p: 1.8, kh: 7, y: 3.5, g: 200, birim: '1 tabak' },
    { ad: 'Ispanak yemeği', k: 60, p: 3, kh: 5, y: 3.5, g: 200, birim: '1 tabak' },
    { ad: 'Karnıyarık', k: 130, p: 5, kh: 8, y: 9, g: 250, birim: '1 porsiyon' },
    { ad: 'İmam bayıldı', k: 110, p: 1.5, kh: 8, y: 8, g: 200, birim: '1 porsiyon' },
    { ad: 'Türlü', k: 75, p: 2, kh: 8, y: 4, g: 250, birim: '1 tabak' },
    { ad: 'Etli nohut', k: 145, p: 10, kh: 13, y: 6, g: 250, birim: '1 tabak' },
    { ad: 'Biber dolması (etli)', k: 120, p: 6, kh: 13, y: 5, g: 250, birim: '1 porsiyon' },
    { ad: 'Yaprak sarma (zeytinyağlı)', k: 160, p: 3, kh: 22, y: 7, g: 150, birim: '6 adet' },
    { ad: 'Tavuk sote', k: 135, p: 16, kh: 4, y: 6, g: 250, birim: '1 tabak' },
    { ad: 'Tavuk şiş', k: 165, p: 27, kh: 1, y: 6, g: 200, birim: '1 porsiyon' },
    { ad: 'Adana kebap', k: 260, p: 17, kh: 2, y: 21, g: 180, birim: '1 porsiyon' },
    { ad: 'Urfa kebap', k: 240, p: 18, kh: 2, y: 18, g: 180, birim: '1 porsiyon' },
    { ad: 'İskender', k: 210, p: 12, kh: 14, y: 12, g: 350, birim: '1 porsiyon' },
    { ad: 'Et sote', k: 185, p: 22, kh: 3, y: 9, g: 200, birim: '1 porsiyon' },
    { ad: 'Kuzu pirzola', k: 290, p: 25, kh: 0, y: 21, g: 150, birim: '3 adet' },
    { ad: 'Dana biftek (ızgara)', k: 215, p: 29, kh: 0, y: 11, g: 180, birim: '1 porsiyon' },
    { ad: 'Sucuk', k: 450, p: 22, kh: 2, y: 40, g: 40, birim: '4 dilim' },
    { ad: 'Pastırma', k: 250, p: 30, kh: 1, y: 13, g: 40, birim: '4 dilim' },
    { ad: 'Tavuk but (fırın, derisiz)', k: 180, p: 25, kh: 0, y: 9, g: 150, birim: '1 adet' },
    { ad: 'Mantı (yoğurtlu)', k: 190, p: 8, kh: 24, y: 7, g: 300, birim: '1 tabak' },
    { ad: 'Karışık pizza', k: 265, p: 11, kh: 30, y: 11, g: 300, birim: '3 dilim' },
    { ad: 'Hamburger', k: 250, p: 13, kh: 24, y: 12, g: 220, birim: '1 adet' },
    { ad: 'Kıymalı pide', k: 250, p: 12, kh: 32, y: 8, g: 250, birim: '1 adet' },
    { ad: 'Kaşarlı pide', k: 280, p: 12, kh: 33, y: 11, g: 250, birim: '1 adet' },
    { ad: 'Su böreği', k: 250, p: 9, kh: 25, y: 13, g: 150, birim: '1 dilim' },
    { ad: 'Sigara böreği', k: 300, p: 8, kh: 26, y: 18, g: 100, birim: '4 adet' },
    { ad: 'Gözleme (peynirli)', k: 230, p: 9, kh: 30, y: 8, g: 250, birim: '1 adet' },
    { ad: 'Tavuk dürüm', k: 210, p: 13, kh: 22, y: 8, g: 300, birim: '1 adet' },
    { ad: 'Çiğ köfte dürüm', k: 200, p: 5, kh: 38, y: 3, g: 250, birim: '1 adet' },
    { ad: 'Kumpir', k: 160, p: 5, kh: 20, y: 7, g: 500, birim: '1 adet' },
    { ad: 'Midye dolma', k: 180, p: 8, kh: 24, y: 6, g: 100, birim: '5 adet' },
    { ad: 'Balık ekmek', k: 210, p: 14, kh: 22, y: 7, g: 300, birim: '1 adet' },
    { ad: 'Hamsi tava', k: 230, p: 18, kh: 8, y: 14, g: 200, birim: '1 porsiyon' },
    { ad: 'Levrek (ızgara)', k: 125, p: 23, kh: 0, y: 3.5, g: 250, birim: '1 balık' },
    { ad: 'Poğaça', k: 340, p: 8, kh: 40, y: 16, g: 80, birim: '1 adet' },
    { ad: 'Açma', k: 360, p: 7, kh: 42, y: 18, g: 90, birim: '1 adet' },
    { ad: 'Börek (kıymalı, tepsi)', k: 270, p: 10, kh: 24, y: 15, g: 150, birim: '1 dilim' },
    { ad: 'Lavaş', k: 275, p: 9, kh: 56, y: 1.5, g: 60, birim: '1 adet' },
    { ad: 'Bazlama', k: 260, p: 8, kh: 50, y: 2.5, g: 120, birim: '1 adet' },
    { ad: 'Granola', k: 450, p: 10, kh: 64, y: 17, g: 50, birim: '1 kase' },
    { ad: 'Mısır gevreği', k: 380, p: 7, kh: 84, y: 1, g: 40, birim: '1 kase' },
    { ad: 'Kefir', k: 55, p: 3.3, kh: 4.5, y: 2.5, g: 250, birim: '1 bardak' },
    { ad: 'Lor peyniri', k: 90, p: 13, kh: 3, y: 3, g: 100, birim: '3 yemek kaşığı' },
    { ad: 'Labne', k: 230, p: 6, kh: 4, y: 21, g: 30, birim: '2 yemek kaşığı' },
    { ad: 'Tulum peyniri', k: 350, p: 22, kh: 1, y: 29, g: 40, birim: '1 dilim' },
    { ad: 'Süt (yarım yağlı)', k: 47, p: 3.3, kh: 4.8, y: 1.6, g: 250, birim: '1 bardak' },
    { ad: 'Haşlanmış yumurta', k: 155, p: 13, kh: 1.1, y: 11, g: 50, birim: '1 adet' },
    { ad: 'Baklava', k: 430, p: 6, kh: 48, y: 24, g: 80, birim: '2 dilim' },
    { ad: 'Künefe', k: 330, p: 8, kh: 40, y: 16, g: 180, birim: '1 porsiyon' },
    { ad: 'Sütlaç', k: 125, p: 3.5, kh: 20, y: 3, g: 200, birim: '1 kase' },
    { ad: 'Kazandibi', k: 150, p: 4, kh: 22, y: 5, g: 150, birim: '1 porsiyon' },
    { ad: 'Lokma', k: 380, p: 4, kh: 52, y: 17, g: 100, birim: '6 adet' },
    { ad: 'Sütlü çikolata', k: 535, p: 7.5, kh: 59, y: 30, g: 30, birim: '3 kare' },
    { ad: 'Bitter çikolata (%70)', k: 600, p: 8, kh: 33, y: 43, g: 20, birim: '2 kare' },
    { ad: 'Dondurma (sade)', k: 210, p: 3.5, kh: 24, y: 11, g: 100, birim: '2 top' },
    { ad: 'Türk kahvesi (şekersiz)', k: 2, p: 0.1, kh: 0.3, y: 0, g: 65, birim: '1 fincan' },
    { ad: 'Çay (şekersiz)', k: 1, p: 0, kh: 0.2, y: 0, g: 200, birim: '1 ince belli' },
    { ad: 'Kola', k: 42, p: 0, kh: 10.6, y: 0, g: 330, birim: '1 kutu' },
    { ad: 'Portakal suyu', k: 45, p: 0.7, kh: 10.4, y: 0.2, g: 250, birim: '1 bardak' },
    { ad: 'Karpuz', k: 30, p: 0.6, kh: 7.6, y: 0.2, g: 300, birim: '1 dilim' },
    { ad: 'Üzüm', k: 69, p: 0.7, kh: 18, y: 0.2, g: 150, birim: '1 kase' },
    { ad: 'Çilek', k: 32, p: 0.7, kh: 7.7, y: 0.3, g: 150, birim: '1 kase' },
    { ad: 'Kayısı kurusu', k: 240, p: 3.4, kh: 63, y: 0.5, g: 40, birim: '5 adet' },
    { ad: 'Hurma', k: 280, p: 2.5, kh: 75, y: 0.4, g: 40, birim: '4 adet' },
    { ad: 'Avokado', k: 160, p: 2, kh: 8.5, y: 15, g: 100, birim: 'yarım' },
    { ad: 'Fındık', k: 630, p: 15, kh: 17, y: 61, g: 30, birim: '1 avuç' },
    { ad: 'Kaju', k: 553, p: 18, kh: 30, y: 44, g: 30, birim: '1 avuç' },
    { ad: 'Leblebi', k: 360, p: 19, kh: 58, y: 5, g: 40, birim: '1 avuç' },
    { ad: 'Ay çekirdeği (iç)', k: 585, p: 21, kh: 20, y: 51, g: 30, birim: '1 avuç' },
    { ad: 'Haşlanmış nohut', k: 165, p: 9, kh: 27, y: 2.6, g: 150, birim: '1 kase' },
    { ad: 'Haşlanmış brokoli', k: 35, p: 2.4, kh: 7, y: 0.4, g: 150, birim: '1 kase' },
    { ad: 'Mevsim salata (soslu)', k: 70, p: 1.5, kh: 5, y: 5, g: 200, birim: '1 kase' },
    { ad: 'Cacık', k: 45, p: 2.5, kh: 3.5, y: 2.3, g: 200, birim: '1 kase' },
    { ad: 'Humus', k: 170, p: 7, kh: 14, y: 10, g: 60, birim: '3 yemek kaşığı' },
    { ad: 'Haydari', k: 150, p: 6, kh: 4, y: 12, g: 50, birim: '2 yemek kaşığı' },
    { ad: 'Tahin pekmez', k: 420, p: 7, kh: 52, y: 22, g: 40, birim: '2 yemek kaşığı' },
    { ad: 'Reçel', k: 250, p: 0.4, kh: 62, y: 0.1, g: 20, birim: '1 yemek kaşığı' },
    { ad: 'Protein bar', k: 360, p: 30, kh: 40, y: 10, g: 60, birim: '1 adet' }
  ];

  window.CB_DATA = { HAREKET, GUN, BOLUNME, BASLANGIC, SAKATLIK, SPOR_EK, YEDEK, YEMEK };
})();
