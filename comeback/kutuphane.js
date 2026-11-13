/* COMEBACK. — program veritabanı (ana kaynak). Sunucudaki D1 tabloları bu dosyadan tohumlanır.
   Hareket satırı: [id, ad, kalıp, birincil kaslar, ikincil kaslar, ekipman, seviye(1-3), tip, artış kg, sakatlık uyarısı, ipucu]
   tip: b = bileşik, i = izolasyon, s = süreli (sn), p = patlayıcı/plyometrik, k = koşu/kardiyo
   Kalıp içindeki sıra önceliktir: motor ana hareket için listedeki ilk uygun hareketi seçer. */
(function (kok) {
  'use strict';

  const KAS = {
    gogus: 'Göğüs', sirt_kanat: 'Kanat (lat)', sirt_orta: 'Orta sırt', omuz_on: 'Ön omuz', omuz_yan: 'Yan omuz', omuz_arka: 'Arka omuz',
    rotator: 'Rotator manşet', biceps: 'Ön kol (biceps)', triceps: 'Arka kol (triceps)', onkol: 'Önkol ve kavrama', on_bacak: 'Ön bacak',
    arka_bacak: 'Arka bacak', kalca: 'Kalça', kalca_yan: 'Yan kalça', adduktor: 'İç bacak (adduktor)', baldir: 'Baldır',
    karin: 'Karın', yan_karin: 'Yan karın', bel: 'Bel (erektör)', boyun: 'Boyun', trapez: 'Trapez'
  };
  // Hacim analizinde takip edilen ana kas grupları ve kalıp → üst/alt gövde
  const ANA_KAS = ['gogus', 'sirt_kanat', 'sirt_orta', 'omuz_yan', 'omuz_arka', 'biceps', 'triceps', 'on_bacak', 'arka_bacak', 'kalca', 'baldir'];

  const EKIPMAN = {
    barbell: 'Barbell', dambil: 'Dambıl', kablo: 'Kablo istasyonu', makine: 'Makine', bench: 'Bench', barfiks: 'Barfiks barı',
    paralel: 'Paralel bar', kutu: 'Kutu / sandalye / basamak', bant: 'Lastik bant', kettlebell: 'Kettlebell', top: 'Sağlık topu', alan: 'Koşu alanı', vucut: 'Ekipman yok'
  };
  const ORTAM = {
    salon: { ad: 'Spor salonu', ekipman: ['barbell', 'dambil', 'kablo', 'makine', 'bench', 'barfiks', 'paralel', 'kutu', 'bant', 'kettlebell', 'top', 'alan', 'vucut'] },
    ev: { ad: 'Evde dambılla', ekipman: ['dambil', 'bant', 'kutu', 'vucut'] },
    vucut: { ad: 'Sadece vücut ağırlığı', ekipman: ['kutu', 'vucut'] },
    dis: { ad: 'Dışarıda / parkta', ekipman: ['barfiks', 'paralel', 'kutu', 'alan', 'vucut'] }
  };

  const H = [
    // yatay itme
    ['bench', 'Bench press', 'yatay_itme', 'gogus', 'omuz_on,triceps', 'barbell,bench', 2, 'b', 2.5, 'omuz', 'Kürek kemiklerini geriye sıkıştır, bar göğsün alt kısmına kontrollü insin.'],
    ['db_bench', 'Dambıl bench press', 'yatay_itme', 'gogus', 'omuz_on,triceps', 'dambil,bench', 1, 'b', 2, '', 'Dirsekler gövdeye yaklaşık 45 derece, dambıllar göğüs hizasına insin.'],
    ['machine_chest', 'Makinede göğüs press', 'yatay_itme', 'gogus', 'triceps', 'makine', 1, 'b', 5, '', 'Tutamaklar göğüs ortası hizasında, sırt pedden kalkmasın.'],
    ['db_floor', 'Yerde dambıl press', 'yatay_itme', 'gogus', 'triceps', 'dambil', 1, 'b', 2, '', 'Sırtüstü yat; dirsek yere hafifçe değince dur ve it.'],
    ['pushup', 'Şınav', 'yatay_itme', 'gogus', 'triceps,omuz_on,karin', 'vucut', 1, 'b', 0, '', 'Baştan topuğa tek çizgi; göğüs yere bir yumruk mesafesine insin.'],
    ['pushup_incline', 'Eğimli şınav (eller yüksekte)', 'yatay_itme', 'gogus', 'triceps', 'kutu', 1, 'b', 0, '', 'Eller sandalye ya da basamakta; ne kadar yüksekse o kadar kolay.'],
    // eğimli itme
    ['incline_db', 'Eğimli dambıl press', 'egimli_itme', 'gogus,omuz_on', 'triceps', 'dambil,bench', 1, 'b', 2, 'omuz', 'Sehpa 30 derece; dambıllar üst göğse insin.'],
    ['incline_bb', 'Eğimli bench press', 'egimli_itme', 'gogus,omuz_on', 'triceps', 'barbell,bench', 2, 'b', 2.5, 'omuz', 'Bar köprücük kemiğinin biraz altına insin.'],
    ['landmine', 'Landmine press', 'egimli_itme', 'omuz_on,gogus', 'triceps', 'barbell', 1, 'b', 2.5, '', 'Omuz dostu açı; barı yukarı ve hafif öne it.'],
    ['pushup_decline', 'Ayaklar yüksekte şınav', 'egimli_itme', 'gogus,omuz_on', 'triceps', 'kutu', 2, 'b', 0, 'omuz', 'Ayaklar basamakta, kalça düşmesin.'],
    // dikey itme
    ['ohp', 'Ayakta omuz press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps,karin', 'barbell', 2, 'b', 2.5, 'omuz,bel', 'Karın ve kalça sıkı, bar yüzünün önünden düz yukarı.'],
    ['db_ohp', 'Dambıl omuz press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps', 'dambil', 1, 'b', 2, 'omuz', 'Dambıllar kulak hizasından başlasın, belini kavislendirme.'],
    ['machine_shoulder', 'Makinede omuz press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps', 'makine', 1, 'b', 5, 'omuz', 'Koltuğu tutamaklar omuz hizasında olacak şekilde ayarla.'],
    ['pike_pushup', 'Pike şınav', 'dikey_itme', 'omuz_on', 'triceps,omuz_yan', 'vucut', 2, 'b', 0, 'omuz', 'Kalça yukarıda ters V; başın ellerin önüne insin.'],
    ['hs_pushup', 'Duvarda amut şınavı', 'dikey_itme', 'omuz_on,triceps', 'omuz_yan', 'vucut', 3, 'b', 0, 'omuz', 'Önce duvarda amutta 30 sn durabildiğinde dene.'],
    // dips ve arka kol
    ['dips', 'Paralel bar dips', 'dips', 'gogus,triceps', 'omuz_on', 'paralel', 2, 'b', 2.5, 'omuz', 'Omuz dirsek hizasının çok altına inmesin.'],
    ['bench_dips', 'Sandalye dips', 'triceps', 'triceps', 'gogus', 'kutu', 1, 'i', 0, 'omuz', 'Kalça sandalyeye yakın, dirsekler geriye baksın.'],
    ['pushdown', 'Kablo pushdown', 'triceps', 'triceps', '', 'kablo', 1, 'i', 2.5, '', 'Dirsekler gövdeye yapışık, yalnızca ön kol hareket etsin.'],
    ['oh_ext', 'Dambıl baş üstü triceps', 'triceps', 'triceps', '', 'dambil', 1, 'i', 1, 'omuz', 'Dirsekler tavana baksın, dambılı başın arkasına indir.'],
    ['skull', 'Skull crusher', 'triceps', 'triceps', '', 'barbell,bench', 2, 'i', 1, '', 'Bar alnın biraz arkasına insin, dirsekler sabit.'],
    ['diamond', 'Elmas şınav', 'triceps', 'triceps,gogus', 'omuz_on', 'vucut', 2, 'b', 0, '', 'Eller göğsün altında birbirine yakın.'],
    ['band_pushdown', 'Bant pushdown', 'triceps', 'triceps', '', 'bant', 1, 'i', 0, '', 'Bandı kapıya ya da bara sabitle, dirsekler sabit.'],
    // yan omuz
    ['lateral', 'Dambıl yana açış', 'yan_omuz', 'omuz_yan', '', 'dambil', 1, 'i', 1, '', 'Dirsekler hafif bükük, omuz hizasında dur; sallanma.'],
    ['cable_lateral', 'Kablo yana açış', 'yan_omuz', 'omuz_yan', '', 'kablo', 1, 'i', 1, '', 'Kablo vücudun önünden geçsin, yavaş indir.'],
    ['band_lateral', 'Bant yana açış', 'yan_omuz', 'omuz_yan', '', 'bant', 1, 'i', 0, '', 'Bandın üstüne bas, kolları omuz hizasına kaldır.'],
    // arka omuz ve rotator
    ['facepull', 'Face pull', 'arka_omuz', 'omuz_arka,rotator', 'sirt_orta', 'kablo', 1, 'i', 2.5, '', 'İpi yüzüne doğru çek, ellerin kulak hizasında açılsın.'],
    ['band_pullapart', 'Bant pull-apart', 'arka_omuz', 'omuz_arka', 'sirt_orta,rotator', 'bant', 1, 'i', 0, '', 'Kollar düz, bandı göğüs hizasında iki yana aç.'],
    ['rear_fly', 'Eğilerek ters açış', 'arka_omuz', 'omuz_arka', 'sirt_orta', 'dambil', 1, 'i', 1, 'bel', 'Gövde yere paralele yakın, kollar yana açılsın.'],
    ['ytw', 'Yüzüstü Y-T-W', 'arka_omuz', 'omuz_arka,rotator', 'sirt_orta', 'vucut', 1, 'i', 0, '', 'Yüzüstü yat; kollarla sırayla Y, T ve W harfi yap.'],
    ['ext_rot', 'Bant dış rotasyon', 'rotator', 'rotator', 'omuz_arka', 'bant', 1, 'i', 0, '', 'Dirsek beline yapışık, ön kolu dışa çevir.'],
    ['prone_er', 'Yüzüstü dış rotasyon (ağırlıksız)', 'rotator', 'rotator', 'omuz_arka', 'vucut', 1, 'i', 0, '', 'Yüzüstü, kol 90 derece yana açık; ön kolu yavaşça yukarı çevir.'],
    ['db_ext_rot', 'Yan yatarak dış rotasyon', 'rotator', 'rotator', 'omuz_arka', 'dambil', 1, 'i', 0.5, '', 'Hafif dambıl; dirsek beline sabit, yavaş çevir.'],
    // yatay çekme
    ['row', 'Barbell row', 'yatay_cekme', 'sirt_orta,sirt_kanat', 'biceps,omuz_arka,bel', 'barbell', 2, 'b', 2.5, 'bel', 'Bel düz, gövde 45 derece; barı göbeğe çek.'],
    ['cs_row', 'Göğüs destekli dambıl row', 'yatay_cekme', 'sirt_orta,sirt_kanat', 'biceps,omuz_arka', 'dambil,bench', 1, 'b', 2, '', 'Göğsün eğimli sehpada, dirsekleri geriye çek.'],
    ['cable_row', 'Oturarak kablo row', 'yatay_cekme', 'sirt_orta', 'sirt_kanat,biceps,omuz_arka', 'kablo', 1, 'b', 2.5, '', 'Göğüs dik, tutamağı karnına çek ve kürek kemiklerini sık.'],
    ['machine_row', 'Makinede row', 'yatay_cekme', 'sirt_orta', 'sirt_kanat,biceps', 'makine', 1, 'b', 5, '', 'Göğüs pedde, dirsekleri geriye götür.'],
    ['db_row', 'Tek kol dambıl row', 'yatay_cekme', 'sirt_kanat,sirt_orta', 'biceps', 'dambil,kutu', 1, 'b', 2, '', 'Bir el ve diz destekte; dambılı kalçana doğru çek.'],
    ['inverted_row', 'Ters çekiş (barda)', 'yatay_cekme', 'sirt_orta,sirt_kanat', 'biceps,omuz_arka', 'barfiks', 1, 'b', 0, '', 'Alçak barın altında vücut tek çizgi, göğsünü bara çek.'],
    ['table_row', 'Masa altı ters çekiş', 'yatay_cekme', 'sirt_orta', 'biceps', 'kutu', 1, 'b', 0, '', 'Sağlam bir masanın kenarından tut; masa devrilmeyecek kadar ağır olsun.'],
    ['band_row', 'Bant row', 'yatay_cekme', 'sirt_orta', 'biceps,omuz_arka', 'bant', 1, 'b', 0, '', 'Bandı ayaklarına ya da kapıya sabitle, dirsekleri geriye çek.'],
    // dikey çekme
    ['pullup', 'Barfiks', 'dikey_cekme', 'sirt_kanat', 'biceps,onkol', 'barfiks', 2, 'b', 2.5, 'omuz', 'Omuz genişliğinden biraz geniş tut, göğsünü bara yaklaştır.'],
    ['lat', 'Lat pulldown', 'dikey_cekme', 'sirt_kanat', 'biceps', 'kablo', 1, 'b', 2.5, '', 'Barı köprücük kemiğine çek, gövdeyi geriye atma.'],
    ['chinup', 'Ters tutuş barfiks', 'dikey_cekme', 'sirt_kanat,biceps', 'onkol', 'barfiks', 2, 'b', 2.5, '', 'Avuçlar sana dönük; çeneyi barın üstüne getir.'],
    ['assisted_pullup', 'Bant destekli barfiks', 'dikey_cekme', 'sirt_kanat', 'biceps', 'barfiks,bant', 1, 'b', 0, '', 'Bandı bara bağla, dizini bandın içine koy.'],
    ['negative_pullup', 'Negatif barfiks', 'dikey_cekme', 'sirt_kanat', 'biceps', 'barfiks', 1, 'b', 0, '', 'Zıplayarak yukarı çık, 3–5 saniyede yavaşça in.'],
    ['band_pulldown', 'Bant pulldown', 'dikey_cekme', 'sirt_kanat', 'biceps', 'bant', 1, 'b', 0, '', 'Bandı yükseğe sabitle, dirsekleri beline doğru çek.'],
    // ön kol
    ['curl', 'Dambıl curl', 'biceps', 'biceps', 'onkol', 'dambil', 1, 'i', 1, '', 'Dirsekler gövdenin yanında, sallanmadan kaldır.'],
    ['hammer', 'Hammer curl', 'biceps', 'biceps,onkol', '', 'dambil', 1, 'i', 1, '', 'Avuçlar birbirine dönük; bilekler düz.'],
    ['bb_curl', 'Barbell curl', 'biceps', 'biceps', 'onkol', 'barbell', 1, 'i', 2.5, '', 'Dirsekler sabit, barı omuz hizasına getir.'],
    ['cable_curl', 'Kablo curl', 'biceps', 'biceps', '', 'kablo', 1, 'i', 2.5, '', 'Kablo boyunca gerilim kalsın, yavaş indir.'],
    ['band_curl', 'Bant curl', 'biceps', 'biceps', '', 'bant', 1, 'i', 0, '', 'Bandın ortasına bas, iki elle kaldır.'],
    // diz baskın
    ['squat', 'Back squat', 'diz', 'on_bacak,kalca', 'adduktor,bel', 'barbell', 2, 'b', 5, 'diz,bel', 'Ayaklar omuz genişliğinde, dizler parmak ucu yönünde; kalça diz hizasına insin.'],
    ['goblet', 'Goblet squat', 'diz', 'on_bacak,kalca', 'karin', 'dambil', 1, 'b', 2, 'diz', 'Dambılı göğsünde tut, dirsekler dizlerin arasına insin.'],
    ['legpress', 'Leg press', 'diz', 'on_bacak,kalca', '', 'makine', 1, 'b', 10, 'diz', 'Bel pedden kalkmayacak kadar in, dizleri kilitleme.'],
    ['hack', 'Hack squat', 'diz', 'on_bacak', 'kalca', 'makine', 2, 'b', 5, 'diz', 'Sırt pedde, kontrollü in.'],
    ['front_squat', 'Front squat', 'diz', 'on_bacak', 'kalca,karin', 'barbell', 3, 'b', 2.5, 'diz', 'Dirsekler yukarıda, gövde dik.'],
    ['box_squat', 'Box squat', 'diz', 'on_bacak,kalca', '', 'barbell,kutu', 2, 'b', 5, '', 'Kutuya kontrollü otur, duraksa ve kalk; diz dostu.'],
    ['goblet_box', 'Kutuya goblet squat', 'diz', 'on_bacak,kalca', '', 'dambil,kutu', 1, 'b', 2, '', 'Kutu derinliği belirler; dizin rahat olduğu yüksekliği seç.'],
    ['bw_squat', 'Squat (vücut ağırlığı)', 'diz', 'on_bacak,kalca', '', 'vucut', 1, 'b', 0, 'diz', 'Kollar önde, kalça geriye ve aşağı.'],
    ['chair_squat', 'Sandalyeye otur-kalk', 'diz', 'on_bacak,kalca', '', 'kutu', 1, 'b', 0, '', 'Sandalyeye dokunur dokunmaz kalk; diz dostu.'],
    // kalça baskın
    ['deadlift', 'Deadlift', 'kalca', 'arka_bacak,kalca,bel', 'sirt_orta,onkol', 'barbell', 2, 'b', 5, 'bel', 'Bar bacaklara yakın, bel düz; yerden ayaklarınla it.'],
    ['rdl', 'Romanian deadlift', 'kalca', 'arka_bacak,kalca', 'bel', 'barbell', 2, 'b', 5, 'bel', 'Dizler hafif bükük, kalçayı geriye it; arka bacakta gerilme hisset.'],
    ['hipthrust', 'Hip thrust', 'kalca', 'kalca', 'arka_bacak', 'barbell,bench', 1, 'b', 5, '', 'Sırt sehpada, kalçayı tepede bir saniye sık.'],
    ['db_rdl', 'Dambıl RDL', 'kalca', 'arka_bacak,kalca', 'bel', 'dambil', 1, 'b', 2, 'bel', 'Dambıllar bacaklarına yakın aşağı kaysın.'],
    ['db_hipthrust', 'Dambıl hip thrust', 'kalca', 'kalca', 'arka_bacak', 'dambil,kutu', 1, 'b', 2, '', 'Sırt kanepe ya da sehpada, dambıl kalçada.'],
    ['kb_swing', 'Kettlebell swing', 'kalca', 'kalca,arka_bacak', 'bel,karin', 'kettlebell', 2, 'b', 4, 'bel', 'Hareket kalçadan; kollar yalnızca taşır.'],
    ['back_ext', '45 derece sırt ekstansiyonu', 'kalca', 'bel,kalca', 'arka_bacak', 'makine', 1, 'i', 2.5, '', 'Yavaş in, kalçayı sıkarak çık.'],
    ['sl_bridge', 'Tek bacak kalça köprüsü', 'kalca', 'kalca', 'arka_bacak', 'vucut', 1, 'b', 0, '', 'Topuktan it, kalça bir yana düşmesin.'],
    ['glute_bridge', 'Kalça köprüsü', 'kalca', 'kalca', 'arka_bacak', 'vucut', 1, 'b', 0, '', 'Topuklar kalçaya yakın, tepede sık.'],
    // tek bacak
    ['split_squat', 'Bulgarian split squat', 'tek_bacak', 'on_bacak,kalca', 'adduktor', 'dambil,kutu', 2, 'b', 2, 'diz', 'Arka ayak sandalyede, ön diz ayak bileği üstünde.'],
    ['lunge', 'Dambıl yürüyüş lunge', 'tek_bacak', 'on_bacak,kalca', 'adduktor', 'dambil', 1, 'b', 2, 'diz', 'Arka diz yere yaklaşsın, gövde dik.'],
    ['step_up', 'Dambıl step-up', 'tek_bacak', 'on_bacak,kalca', '', 'dambil,kutu', 1, 'b', 2, 'diz', 'Üstteki bacakla it, arka ayakla zıplama.'],
    ['sl_rdl', 'Tek bacak RDL', 'tek_bacak', 'arka_bacak,kalca', 'bel', 'dambil', 2, 'b', 2, '', 'Kalça seviyede kalsın, arka bacak gövdeyle tek çizgi.'],
    ['rev_lunge', 'Geri lunge', 'tek_bacak', 'on_bacak,kalca', '', 'vucut', 1, 'b', 0, '', 'Geriye adım at; ileri lungeden daha diz dostu.'],
    ['bw_split', 'Bulgarian split squat (vücut)', 'tek_bacak', 'on_bacak,kalca', '', 'kutu', 1, 'b', 0, 'diz', 'Arka ayak sandalyede; yavaş in.'],
    ['bw_step_up', 'Basamak çıkma', 'tek_bacak', 'on_bacak,kalca', '', 'kutu', 1, 'b', 0, '', 'Sağlam basamak kullan, tek bacakla it.'],
    ['sl_rdl_bw', 'Tek bacak RDL (vücut)', 'tek_bacak', 'arka_bacak,kalca', '', 'vucut', 1, 'b', 0, '', 'Denge için duvara parmak ucuyla dokunabilirsin.'],
    ['lateral_lunge', 'Yana lunge', 'tek_bacak', 'adduktor,on_bacak,kalca', '', 'vucut', 1, 'b', 0, 'diz', 'Bir yana geniş adım, diğer bacak düz kalsın.'],
    // izole bacak
    ['legcurl', 'Yatarak leg curl', 'hamstring_izo', 'arka_bacak', '', 'makine', 1, 'i', 2.5, '', 'Kalça pedden kalkmasın, yavaş indir.'],
    ['nordic', 'Nordic hamstring', 'hamstring_izo', 'arka_bacak', '', 'vucut', 2, 'i', 0, '', 'Ayak bileklerini sabitlet, olabildiğince yavaş öne düş; ellerle karşıla.'],
    ['slider_curl', 'Havluyla kaydırmalı leg curl', 'hamstring_izo', 'arka_bacak', 'kalca', 'vucut', 1, 'i', 0, '', 'Topuklar havluda, kalça yukarıda; topukları kalçaya çek.'],
    ['legext', 'Leg extension', 'quad_izo', 'on_bacak', '', 'makine', 1, 'i', 2.5, 'diz', 'Tepede bir saniye dur, yavaş indir.'],
    ['spanish_squat', 'Bantla İspanyol squat', 'quad_izo', 'on_bacak', '', 'bant', 1, 'i', 0, '', 'Bant dizlerin arkasında sabit; gövde dik otur. Diz tendonu için iyi.'],
    ['wall_sit', 'Duvarda oturma', 'quad_izo', 'on_bacak', '', 'vucut', 1, 's', 0, '', 'Sırt duvarda, dizler 90 derece.'],
    ['calf', 'Ayakta calf raise', 'baldir', 'baldir', '', 'kutu', 1, 'i', 2, '', 'Basamak kenarında tam aşağı in, parmak ucunda bir saniye dur.'],
    ['seated_calf', 'Oturarak calf raise', 'baldir', 'baldir', '', 'makine', 1, 'i', 5, '', 'Dizler bükük çalışınca soleus kası çalışır; koşucular için önemli.'],
    ['sl_calf', 'Tek bacak calf raise', 'baldir', 'baldir', '', 'kutu', 1, 'i', 0, '', 'Basamakta tek ayak; tam hareket açıklığı.'],
    ['copenhagen', 'Copenhagen plank', 'adduktor', 'adduktor', 'yan_karin', 'kutu', 2, 'i', 0, '', 'Üst bacak sehpada, alttaki havada; kalçayı kaldırıp indir.'],
    ['copenhagen_kisa', 'Diz destekli Copenhagen', 'adduktor', 'adduktor', 'yan_karin', 'kutu', 1, 'i', 0, '', 'Dizin sehpada; kısa kol daha kolay.'],
    ['band_walk', 'Bantla yana yürüyüş', 'abduktor', 'kalca_yan', '', 'bant', 1, 'i', 0, '', 'Bant dizlerin üstünde, yarım squatta yana adımla.'],
    ['side_lying_abd', 'Yan yatarak bacak kaldırma', 'abduktor', 'kalca_yan', '', 'vucut', 1, 'i', 0, '', 'Üst bacak hafif geride, parmak ucu öne baksın.'],
    // gövde
    ['plank', 'Plank', 'core_anti_ext', 'karin', '', 'vucut', 1, 's', 0, '', 'Dirsekler omuz altında; kalçayı sık, beli çökertme.'],
    ['deadbug', 'Dead bug', 'core_anti_ext', 'karin', '', 'vucut', 1, 'i', 0, '', 'Bel yere yapışık; zıt kol ve bacağı yavaşça uzat.'],
    ['hanging_raise', 'Asılı diz kaldırma', 'core_anti_ext', 'karin', 'onkol', 'barfiks', 2, 'i', 0, '', 'Sallanmadan dizleri göğse çek.'],
    ['pallof', 'Pallof press', 'core_anti_rot', 'yan_karin,karin', '', 'kablo', 1, 'i', 2.5, '', 'Kabloya yan dur, kolları öne it; gövde dönmesin.'],
    ['band_pallof', 'Bant pallof press', 'core_anti_rot', 'yan_karin,karin', '', 'bant', 1, 'i', 0, '', 'Bandı yana sabitle, kolları öne it ve 2 sn tut.'],
    ['birddog', 'Bird dog', 'core_anti_rot', 'karin,bel', 'kalca', 'vucut', 1, 'i', 0, '', 'Dört ayakta zıt kol ve bacağı uzat; bel kıpırdamasın.'],
    ['side_plank', 'Yan plank', 'core_lat', 'yan_karin', 'kalca_yan', 'vucut', 1, 's', 0, '', 'Dirsek omuz altında, kalça yukarıda tek çizgi.'],
    ['suitcase', 'Tek el taşıma', 'core_lat', 'yan_karin,onkol', '', 'dambil', 1, 's', 2, '', 'Tek elde ağırlık, gövde dik yürü; yana eğilme.'],
    ['farmer', 'Farmer yürüyüşü', 'tasima', 'onkol', 'sirt_orta,karin', 'dambil', 1, 's', 2, '', 'İki elde ağır dambıl, omuzlar geride yürü.'],
    ['woodchop', 'Kablo woodchop', 'core_rot', 'yan_karin', 'omuz_on', 'kablo', 1, 'i', 2.5, '', 'Gücü kalçadan al, kolları çapraz aşağı çek.'],
    ['band_woodchop', 'Bant woodchop', 'core_rot', 'yan_karin', '', 'bant', 1, 'i', 0, '', 'Bandı yükseğe sabitle, çapraz aşağı çek.'],
    ['mb_rot_throw', 'Sağlık topu yana fırlatma', 'core_rot', 'yan_karin,kalca', 'omuz_on', 'top', 2, 'p', 0, 'bel', 'Duvara yan dur, kalçadan dönerek topu fırlat.'],
    ['neck_iso', 'Boyun izometrik', 'boyun', 'boyun', '', 'vucut', 1, 's', 0, 'boyun', 'Elinle başına öne, arkaya, yanlara hafif bastır; baş kıpırdamasın.'],
    ['dead_hang', 'Barda asılma', 'kavrama', 'onkol', 'sirt_kanat', 'barfiks', 1, 's', 0, 'omuz', 'Omuzlar hafif aktif, sallanmadan asıl.'],
    // patlayıcı ve sürat
    ['box_jump', 'Box jump', 'plyo_dikey', 'on_bacak,kalca', 'baldir', 'kutu', 2, 'p', 0, 'diz', 'Kutuya yumuşak in, aşağı adımlayarak in.'],
    ['squat_jump', 'Squat jump', 'plyo_dikey', 'on_bacak,kalca', 'baldir', 'vucut', 1, 'p', 0, 'diz', 'Yarım squattan patlayıcı sıçra, yumuşak in.'],
    ['pogo', 'Pogo sıçrama', 'plyo_dikey', 'baldir', '', 'vucut', 1, 'p', 0, '', 'Dizler neredeyse düz, ayak bileğinden kısa ve hızlı sıçra.'],
    ['drop_landing', 'İniş tekniği (drop landing)', 'plyo_inis', 'on_bacak,kalca', 'baldir', 'kutu', 1, 'p', 0, '', 'Alçak kutudan in; dizler içe kaçmasın, kalça geride.'],
    ['broad_jump', 'Uzun atlama', 'plyo_yatay', 'kalca,on_bacak', 'arka_bacak', 'vucut', 2, 'p', 0, 'diz', 'Kollarla öne savrul, iki ayakla yumuşak in.'],
    ['lateral_bound', 'Yana sıçrama (skater)', 'plyo_yatay', 'kalca_yan,kalca', 'on_bacak', 'vucut', 1, 'p', 0, '', 'Tek ayaktan yana sıçra, diğer ayakla dengede in.'],
    ['mb_chest_pass', 'Sağlık topu göğüs pası', 'plyo_ust', 'gogus,triceps', 'omuz_on', 'top', 1, 'p', 0, '', 'Topu duvara patlayıcı şekilde it.'],
    ['mb_slam', 'Sağlık topu yere vurma', 'plyo_ust', 'sirt_kanat,karin', 'omuz_on', 'top', 1, 'p', 0, 'bel', 'Topu baş üstüne kaldır, bütün gövdeyle yere vur.'],
    ['sprint_acc', 'Hızlanma koşusu (10–20 m)', 'surat', 'on_bacak,arka_bacak,kalca', 'baldir', 'alan', 1, 'k', 0, '', 'Öne eğik başla, ilk adımlar kısa ve güçlü.'],
    ['shuttle', '5-10-5 mekik koşusu', 'ceviklik', 'on_bacak,kalca', 'adduktor', 'alan', 1, 'k', 0, 'diz', 'Dönüşlerde alçal, dış ayakla it.'],
    // kondisyon
    ['bike', 'Bisiklet interval', 'kardiyo', '', '', 'makine', 1, 'k', 0, '', '30 sn hızlı, 60 sn yavaş tempo.'],
    ['rower', 'Kürek makinesi interval', 'kardiyo', '', '', 'makine', 1, 'k', 0, 'bel', 'Bacakla it, sonra kolla çek.'],
    ['run_interval', 'Koşu interval', 'kardiyo', '', '', 'alan', 1, 'k', 0, 'diz', '1 dk tempolu, 1 dk yürüyüş.'],
    ['burpee', 'Burpee interval', 'kardiyo', '', '', 'vucut', 2, 'k', 0, 'diz', '30 sn çalış, 30 sn dinlen.'],
    ['shadow_box', 'Gölge boksu interval', 'kardiyo', '', '', 'vucut', 1, 'k', 0, '', '3 dk tur, 1 dk dinlenme.'],
    // --- ek hareketler (makine, kablo, kettlebell, bant, dışarı) ---
    ['smith_bench', 'Smith makinede bench press', 'yatay_itme', 'gogus', 'omuz_on,triceps', 'makine,bench', 1, 'b', 2.5, 'omuz', 'Bar raylı; göğüs ortasına insin, kürek kemikleri sıkı.'],
    ['pec_deck', 'Pec deck (kelebek makinesi)', 'yatay_itme', 'gogus', 'omuz_on', 'makine', 1, 'i', 2.5, 'omuz', 'Dirsekler hafif bükük, kolları göğsün önünde birleştir, yavaş aç.'],
    ['cable_fly', 'Kablo crossover (göğüs)', 'yatay_itme', 'gogus', 'omuz_on', 'kablo', 1, 'i', 2.5, 'omuz', 'Bir adım öne çık, kolları yay çizerek göğsün önünde buluştur.'],
    ['db_fly', 'Dambıl fly', 'yatay_itme', 'gogus', 'omuz_on', 'dambil,bench', 1, 'i', 1, 'omuz', 'Dirsekler hafif bükük; göğüste gerilim hissedince dur, aşağı zorlama.'],
    ['band_chest_press', 'Bant göğüs press', 'yatay_itme', 'gogus', 'triceps', 'bant', 1, 'b', 0, '', 'Bandı sırtından geçir ya da arkaya sabitle, kolları öne it.'],
    ['machine_incline', 'Makinede eğimli göğüs press', 'egimli_itme', 'gogus,omuz_on', 'triceps', 'makine', 1, 'b', 5, '', 'Tutamaklar üst göğüs hizasında, sırt pedde.'],
    ['smith_incline', 'Smith makinede eğimli press', 'egimli_itme', 'gogus,omuz_on', 'triceps', 'makine,bench', 1, 'b', 2.5, 'omuz', 'Sehpa 30 derece; bar köprücük kemiğinin altına insin.'],
    ['arnold', 'Arnold press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps', 'dambil', 2, 'b', 2, 'omuz', 'Avuçlar sana dönük başla, iterken dışa çevir.'],
    ['kb_press', 'Kettlebell omuz press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps,karin', 'kettlebell', 1, 'b', 4, 'omuz', 'Kettlebell ön kolunun dışında dursun, bilek düz.'],
    ['band_ohp', 'Bant omuz press', 'dikey_itme', 'omuz_on,omuz_yan', 'triceps', 'bant', 1, 'b', 0, 'omuz', 'Bandın üstüne bas, kolları baş üstüne it.'],
    ['machine_lateral', 'Makinede yana açış (lateral raise makinesi)', 'yan_omuz', 'omuz_yan', '', 'makine', 1, 'i', 2.5, '', 'Dirsekler pedde, omuz hizasına kadar kaldır, yavaş indir.'],
    ['cable_upright', 'Kablo upright row', 'yan_omuz', 'omuz_yan', 'omuz_on,trapez', 'kablo', 2, 'i', 2.5, 'omuz', 'Dirsekleri omuz hizasına kadar kaldır, daha yukarı zorlama.'],
    ['rear_delt_machine', 'Makinede ters kelebek (arka omuz)', 'arka_omuz', 'omuz_arka', 'sirt_orta', 'makine', 1, 'i', 2.5, '', 'Göğüs pedde, kolları yana aç; kürek kemiklerini fazla sıkma.'],
    ['cable_rear_fly', 'Kablo ters açış', 'arka_omuz', 'omuz_arka', 'sirt_orta', 'kablo', 1, 'i', 1, '', 'Kabloları çaprazla, kolları yana ve geriye aç.'],
    ['rope_pushdown', 'İp ile pushdown', 'triceps', 'triceps', '', 'kablo', 1, 'i', 2.5, '', 'Altta ipi iki yana aç, dirsekler gövdede sabit.'],
    ['cable_oh_ext', 'Kablo baş üstü triceps', 'triceps', 'triceps', '', 'kablo', 1, 'i', 2.5, 'omuz', 'Kabloya sırtını dön, dirsekler kulak hizasında sabit.'],
    ['machine_triceps', 'Makinede triceps (dips makinesi)', 'triceps', 'triceps', 'gogus', 'makine', 1, 'i', 5, '', 'Omuzlar aşağıda, tutamakları aşağı it.'],
    ['triceps_machine', 'Triceps makinesi (oturarak extension)', 'triceps', 'triceps', '', 'makine', 1, 'i', 2.5, '', 'Üst kollar pede yaslı ve sabit; yalnızca dirsekten aç, en altta bir an sık.'],
    ['triceps_press_machine', 'Triceps press makinesi', 'triceps', 'triceps', 'gogus', 'makine', 1, 'i', 5, '', 'Sırt pedde, dirsekler gövdeye yakın; tutamakları aşağı doğru sonuna kadar it.'],
    ['close_bench', 'Dar tutuş bench press', 'triceps', 'triceps,gogus', 'omuz_on', 'barbell,bench', 2, 'b', 2.5, 'omuz', 'Eller omuz genişliğinde, dirsekler gövdeye yakın.'],
    ['db_kickback', 'Dambıl kickback', 'triceps', 'triceps', '', 'dambil', 1, 'i', 1, '', 'Gövde öne eğik, üst kol sabit; kolu geriye düzleştir.'],
    ['tbar', 'T-bar row', 'yatay_cekme', 'sirt_orta,sirt_kanat', 'biceps,omuz_arka', 'barbell', 2, 'b', 2.5, 'bel', 'Bel düz, göğüs açık; tutamağı karnına çek.'],
    ['kb_row', 'Kettlebell row', 'yatay_cekme', 'sirt_kanat,sirt_orta', 'biceps', 'kettlebell', 1, 'b', 4, '', 'Bir el destekte, dirseği beline doğru çek.'],
    ['machine_pulldown', 'Makinede pulldown', 'dikey_cekme', 'sirt_kanat', 'biceps', 'makine', 1, 'b', 5, '', 'Dizler pedde sabit, dirsekleri aşağı ve geriye çek.'],
    ['close_lat', 'Dar tutuş (V-bar) pulldown', 'dikey_cekme', 'sirt_kanat', 'biceps,sirt_orta', 'kablo', 1, 'b', 2.5, '', 'V-barı göğsünün üstüne çek, gövde hafif geride.'],
    ['assisted_machine', 'Makine destekli barfiks', 'dikey_cekme', 'sirt_kanat', 'biceps', 'makine', 1, 'b', 5, '', 'Destek ağırlığını azalttıkça zorlaşır; çene bara kadar.'],
    ['straight_pulldown', 'Kablo pullover (düz kol pulldown)', 'dikey_cekme', 'sirt_kanat', '', 'kablo', 1, 'i', 2.5, '', 'Kollar neredeyse düz, barı ya da ipi kalçana doğru indir.'],
    ['machine_pullover', 'Pullover makinesi', 'dikey_cekme', 'sirt_kanat', 'gogus', 'makine', 1, 'i', 5, 'omuz', 'Dirsekler pedde, kolları baş üstünden karnına doğru indir.'],
    ['db_pullover', 'Dambıl pullover', 'dikey_cekme', 'sirt_kanat,gogus', 'triceps', 'dambil,bench', 1, 'i', 1, 'omuz', 'Sehpaya çapraz ya da boylu yat, dambılı baş arkasına kontrollü indir.'],
    ['cable_pullover_rope', 'İp ile kablo pullover', 'dikey_cekme', 'sirt_kanat', '', 'kablo', 1, 'i', 2.5, '', 'Hafif öne eğil, ipi kalçana çekerken iki yana aç.'],
    ['db_shrug', 'Dambıl shrug', 'trapez', 'trapez', 'onkol', 'dambil', 1, 'i', 2, 'boyun', 'Omuzları kulaklara doğru kaldır, tepede bir saniye dur.'],
    ['bb_shrug', 'Barbell shrug', 'trapez', 'trapez', 'onkol', 'barbell', 1, 'i', 2.5, 'boyun', 'Kollar düz, yalnızca omuzlar yukarı aşağı.'],
    ['preacher', 'Preacher curl (Scott sehpası)', 'biceps', 'biceps', '', 'dambil,bench', 1, 'i', 1, '', 'Üst kol pedde sabit, kolu tam açmadan önce yavaşla.'],
    ['machine_curl', 'Makinede biceps curl', 'biceps', 'biceps', '', 'makine', 1, 'i', 2.5, '', 'Dirsekler pedde, yavaş indir.'],
    ['incline_curl', 'Eğimli sehpada dambıl curl', 'biceps', 'biceps', '', 'dambil,bench', 1, 'i', 1, '', 'Kollar gövdenin gerisinde sarkık başlasın.'],
    ['rope_hammer', 'İp ile hammer curl', 'biceps', 'biceps,onkol', '', 'kablo', 1, 'i', 2.5, '', 'Avuçlar birbirine dönük, dirsekler sabit.'],
    ['smith_squat', 'Smith makinede squat', 'diz', 'on_bacak,kalca', '', 'makine', 1, 'b', 5, 'diz', 'Ayaklar barın biraz önünde, kontrollü in.'],
    ['kb_goblet', 'Kettlebell goblet squat', 'diz', 'on_bacak,kalca', 'karin', 'kettlebell', 1, 'b', 4, 'diz', 'Kettlebell göğsünde, dirsekler dizlerin içinden geçsin.'],
    ['band_squat', 'Bantlı squat', 'diz', 'on_bacak,kalca', '', 'bant', 1, 'b', 0, 'diz', 'Bandın üstüne bas, tutamaklar omuzda.'],
    ['sumo_deadlift', 'Sumo deadlift', 'kalca', 'kalca,arka_bacak,adduktor', 'bel,on_bacak', 'barbell', 2, 'b', 5, 'bel', 'Geniş duruş, eller bacakların içinde; göğüs dik.'],
    ['good_morning', 'Good morning', 'kalca', 'arka_bacak,kalca', 'bel', 'barbell', 2, 'b', 2.5, 'bel', 'Hafif ağırlık; dizler hafif bükük, kalçayı geriye it.'],
    ['kb_deadlift', 'Kettlebell deadlift', 'kalca', 'kalca,arka_bacak', 'bel', 'kettlebell', 1, 'b', 4, 'bel', 'Kettlebell ayaklarının arasında, bel düz.'],
    ['hipthrust_machine', 'Makinede hip thrust', 'kalca', 'kalca', 'arka_bacak', 'makine', 1, 'b', 5, '', 'Kemer kalça kemiğinde; tepede sık.'],
    ['cable_pullthrough', 'Kablo pull-through', 'kalca', 'kalca,arka_bacak', '', 'kablo', 1, 'b', 2.5, '', 'Kabloya sırtını dön, kalçadan menteşe yap ve öne it.'],
    ['glute_kickback', 'Kablo glute kickback', 'kalca', 'kalca', '', 'kablo', 1, 'i', 2.5, '', 'Bel kıpırdamasın, bacağı kalçadan geriye it.'],
    ['glute_machine', 'Makinede glute kickback', 'kalca', 'kalca', '', 'makine', 1, 'i', 5, '', 'Gövde sabit, kalçayı tepede bir saniye sık.'],
    ['seated_legcurl', 'Oturarak leg curl', 'hamstring_izo', 'arka_bacak', '', 'makine', 1, 'i', 2.5, '', 'Uyluk pedi sıkı, topuğu altına doğru çek.'],
    ['legpress_calf', 'Leg press makinesinde calf', 'baldir', 'baldir', '', 'makine', 1, 'i', 5, '', 'Yalnızca parmak uçları platformda, tam aç ve kapat.'],
    ['machine_calf', 'Makinede ayakta calf raise', 'baldir', 'baldir', '', 'makine', 1, 'i', 5, '', 'Omuzlar pedde, tam aşağı in, tepede dur.'],
    ['adductor_machine', 'Adduktor makinesi (iç bacak)', 'adduktor', 'adduktor', '', 'makine', 1, 'i', 5, '', 'Bacakları kontrollü birleştir, yavaş aç.'],
    ['abductor_machine', 'Abduktor makinesi (dış kalça)', 'abduktor', 'kalca_yan', '', 'makine', 1, 'i', 5, '', 'Gövde hafif öne, bacakları dışa aç.'],
    ['cable_abduction', 'Kablo yana bacak açma', 'abduktor', 'kalca_yan', '', 'kablo', 1, 'i', 1, '', 'Ayak bileğine bağla, bacağı yana aç, gövde dik.'],
    ['crunch', 'Mekik (crunch)', 'core_anti_ext', 'karin', '', 'vucut', 1, 'i', 0, 'boyun', 'Bel yerde, kürek kemiklerini kaldır; boynu çekme.'],
    ['leg_raise', 'Yerde bacak kaldırma', 'core_anti_ext', 'karin', '', 'vucut', 1, 'i', 0, 'bel', 'Bel yere yapışık kalacak kadar indir.'],
    ['cable_crunch', 'Kablo crunch', 'core_anti_ext', 'karin', '', 'kablo', 1, 'i', 2.5, '', 'Dizlerin üstünde, gövdeyi karınla aşağı kıvır.'],
    ['ab_machine', 'Makinede karın (crunch makinesi)', 'core_anti_ext', 'karin', '', 'makine', 1, 'i', 5, '', 'Hareket karından gelsin, kollarla çekme.'],
    ['russian_twist', 'Russian twist', 'core_rot', 'yan_karin', 'karin', 'vucut', 1, 'i', 0, 'bel', 'Gövde hafif geride, omuzları iki yana çevir.'],
    ['mountain_climber', 'Mountain climber', 'kardiyo', '', '', 'vucut', 1, 'k', 0, 'bilek', '30 sn hızlı, 30 sn dinlen.'],
    ['jumping_jack', 'Jumping jack', 'kardiyo', '', '', 'vucut', 1, 'k', 0, 'diz', '40 sn çalış, 20 sn dinlen.'],
    ['treadmill', 'Koşu bandı', 'kardiyo', '', '', 'makine', 1, 'k', 0, 'diz', 'Tempolu koşu ya da 1 dk hızlı, 1 dk yavaş.'],
    ['incline_walk', 'Eğimli yürüyüş (koşu bandı)', 'kardiyo', '', '', 'makine', 1, 'k', 0, '', 'Eğim 8–12, tutamaklara tutunmadan tempolu yürü.'],
    ['elliptical', 'Eliptik bisiklet', 'kardiyo', '', '', 'makine', 1, 'k', 0, '', 'Eklem dostu; konuşabileceğin tempoda başla.'],
    ['stair', 'Merdiven makinesi', 'kardiyo', '', '', 'makine', 2, 'k', 0, 'diz', 'Dik dur, tutamaklara yaslanma.'],
    ['brisk_walk', 'Tempolu yürüyüş', 'kardiyo', '', '', 'alan', 1, 'k', 0, '', 'Konuşabilirsin ama şarkı söyleyemezsin temposu.'],
    ['stair_run', 'Merdiven koşusu', 'kardiyo', '', '', 'alan', 2, 'k', 0, 'diz', 'Yukarı koş, aşağı yürüyerek in.'],
    ['hill_sprint', 'Yokuş koşusu', 'surat', 'on_bacak,kalca', 'baldir', 'alan', 2, 'k', 0, 'diz', '10–15 sn yokuş yukarı hızlı, yürüyerek in.'],
    ['park_pushup', 'Bankta eğimli şınav', 'yatay_itme', 'gogus', 'triceps', 'kutu', 1, 'b', 0, '', 'Eller parktaki bankın kenarında, gövde tek çizgi.'],
    ['bar_leg_raise', 'Barda bacak kaldırma', 'core_anti_ext', 'karin', 'onkol', 'barfiks', 3, 'i', 0, '', 'Bacaklar düz, ayaklar bara doğru; sallanma.']
  ];

  // Gün şablonları: "kalıp:rol". Roller: ana, yard (yardımcı), izo (izolasyon), core
  const GUN = {
    full_a:  { ad: 'Tüm vücut A',  bolge: 'tum', slot: ['diz:ana', 'yatay_itme:ana', 'yatay_cekme:ana', 'kalca:yard', 'yan_omuz:izo', 'core_anti_ext:core'] },
    full_b:  { ad: 'Tüm vücut B',  bolge: 'tum', slot: ['kalca:ana', 'dikey_itme:ana', 'dikey_cekme:ana', 'tek_bacak:yard', 'biceps:izo', 'triceps:izo', 'core_anti_rot:core'] },
    full_c:  { ad: 'Tüm vücut C',  bolge: 'tum', slot: ['tek_bacak:ana', 'egimli_itme:ana', 'yatay_cekme:yard', 'hamstring_izo:izo', 'arka_omuz:izo', 'core_lat:core'] },
    upper_a: { ad: 'Üst gövde A',  bolge: 'ust', slot: ['yatay_itme:ana', 'yatay_cekme:ana', 'dikey_itme:yard', 'dikey_cekme:yard', 'yan_omuz:izo', 'triceps:izo', 'biceps:izo'] },
    lower_a: { ad: 'Alt gövde A',  bolge: 'alt', slot: ['diz:ana', 'kalca:yard', 'tek_bacak:yard', 'hamstring_izo:izo', 'baldir:izo', 'core_anti_ext:core'] },
    upper_b: { ad: 'Üst gövde B',  bolge: 'ust', slot: ['egimli_itme:ana', 'dikey_cekme:ana', 'yatay_cekme:yard', 'yatay_itme:yard', 'yan_omuz:izo', 'arka_omuz:izo', 'biceps:izo'] },
    lower_b: { ad: 'Alt gövde B',  bolge: 'alt', slot: ['kalca:ana', 'diz:yard', 'tek_bacak:yard', 'quad_izo:izo', 'baldir:izo', 'core_anti_rot:core'] },
    push:    { ad: 'İtme günü',    bolge: 'ust', slot: ['yatay_itme:ana', 'dikey_itme:ana', 'egimli_itme:yard', 'yan_omuz:izo', 'triceps:izo', 'yan_omuz:izo'] },
    pull:    { ad: 'Çekme günü',   bolge: 'ust', slot: ['dikey_cekme:ana', 'yatay_cekme:ana', 'yatay_cekme:yard', 'arka_omuz:izo', 'biceps:izo', 'biceps:izo'] },
    legs:    { ad: 'Bacak günü',   bolge: 'alt', slot: ['diz:ana', 'kalca:yard', 'tek_bacak:yard', 'hamstring_izo:izo', 'quad_izo:izo', 'baldir:izo'] }
  };
  const BOLUNME = {
    2: { ad: 'Tüm vücut', gunler: ['full_a', 'full_b'], hafta: [0, 3] },
    3: { ad: 'Tüm vücut', gunler: ['full_a', 'full_b', 'full_c'], hafta: [0, 2, 4] },
    4: { ad: 'Üst / Alt', gunler: ['upper_a', 'lower_a', 'upper_b', 'lower_b'], hafta: [0, 1, 3, 4] },
    5: { ad: 'İtme / Çekme / Bacak + Üst / Alt', gunler: ['push', 'pull', 'legs', 'upper_a', 'lower_b'], hafta: [0, 1, 2, 4, 5] },
    6: { ad: 'İtme / Çekme / Bacak ×2', gunler: ['push', 'pull', 'legs', 'push', 'pull', 'legs'], hafta: [0, 1, 2, 3, 4, 5] }
  };
  // Salon dışı ortamlarda itme/çekme günlerini dolduracak kadar hareket yok: ayrı günler yerine üst/alt + tüm vücut
  const BOLUNME_VUCUT = {
    5: { ad: 'Üst / Alt + Tüm vücut', gunler: ['upper_a', 'lower_a', 'full_b', 'upper_b', 'lower_b'], hafta: [0, 1, 2, 4, 5] },
    6: { ad: 'Üst / Alt ×3', gunler: ['upper_a', 'lower_a', 'upper_b', 'lower_b', 'upper_a', 'lower_b'], hafta: [0, 1, 2, 3, 4, 5] }
  };

  // Spor profilleri: basla = antrenmanın başında güç/sürat (taze kas), onleme = sakatlık önleme (haftada 2 kez),
  // vurgu = ek kalıplar, kacin = bu sporda kaçınılan hareketler, ust_azalt = üst gövde izolasyonunu kıs
  const SPOR = {
    fitness: { ad: 'Fitness', basla: [], onleme: [], vurgu: [], kacin: [], not: 'Genel kuvvet ve vücut kompozisyonu programı.' },
    futbol: {
      ad: 'Futbol', basla: ['surat', 'plyo_yatay'], onleme: ['nordic', 'copenhagen'], vurgu: ['core_anti_rot:core'], kacin: [],
      not: 'Hamstring ve kasık sakatlıklarını önleyen Nordic ve Copenhagen haftada 2 kez; hızlanma ve yön değiştirme gücü. Maçtan önceki 48 saatte ağır bacak antrenmanı yapma.',
      kaynak: ['nordic', 'copenhagen', 'fifa11']
    },
    basketbol: {
      ad: 'Basketbol', basla: ['plyo_dikey'], onleme: ['drop_landing', 'sl_calf'], vurgu: ['tek_bacak:yard', 'core_anti_rot:core'], kacin: [],
      not: 'Sıçrama gücü ve güvenli iniş tekniği; diz bağı sakatlıklarını önleyen nöromüsküler çalışma, tek bacak kuvveti.',
      kaynak: ['acl']
    },
    kosu: {
      ad: 'Koşu', basla: ['plyo_dikey'], onleme: ['seated_calf', 'side_plank', 'band_walk'], vurgu: ['tek_bacak:yard', 'baldir:izo'], kacin: [], ust_azalt: true,
      not: 'Ağır kuvvet ve patlayıcı çalışma koşu ekonomisini iyileştirir. Üst gövde hacmi düşük, tek bacak ve baldır (soleus) öncelikli. Haftada 2–3 kuvvet günü yeterli.',
      kaynak: ['kosu']
    },
    yuzme: {
      ad: 'Yüzme', basla: [], onleme: ['ext_rot', 'band_pullapart'], vurgu: ['dikey_cekme:yard', 'core_anti_ext:core'], kacin: ['ohp', 'db_ohp', 'machine_shoulder', 'pike_pushup', 'hs_pushup', 'dips', 'skull', 'arnold', 'kb_press', 'band_ohp'],
      not: 'Omuz sağlığı öncelikli: dış rotasyon ve kürek kemiği kasları, güçlü kanat kası ve gövde. Ağır baş üstü itmeler sınırlı.'
    },
    dovus: {
      ad: 'Dövüş sporları', basla: ['plyo_ust', 'core_rot'], onleme: ['neck_iso', 'ext_rot'], vurgu: ['tasima:core', 'kavrama:core'], kacin: [], finisaj: 'shadow_box',
      not: 'Patlayıcı güç (atış ve dönüş), kavrama, boyun ve omuz dayanıklılığı; tur temposunda kondisyon.'
    },
    tenis: {
      ad: 'Tenis', basla: ['core_rot', 'plyo_yatay'], onleme: ['ext_rot', 'ytw'], vurgu: ['biceps:izo'], kacin: [],
      not: 'Dönüş gücü, yana hareket, omuz rotator kasları ve önkol dayanıklılığı.'
    }
  };

  const KAYNAK = {
    acsm: { ad: 'ACSM — Sağlıklı yetişkinlerde direnç antrenmanında ilerleme modelleri (2009)', url: 'https://pubmed.ncbi.nlm.nih.gov/19204579/' },
    hacim: { ad: 'Schoenfeld ve ark. — Haftalık hacim ile kas kazancı arasındaki doz-yanıt (2017)', url: 'https://pubmed.ncbi.nlm.nih.gov/27433992/' },
    siklik: { ad: 'Schoenfeld ve ark. — Antrenman sıklığının kas gelişimine etkisi (2016)', url: 'https://pubmed.ncbi.nlm.nih.gov/27102172/' },
    protein: { ad: 'ISSN — Protein ve egzersiz tutum bildirisi (2017)', url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/' },
    kalori: { ad: 'Frankenfield ve ark. — Dinlenme metabolizması denklemlerinin karşılaştırması (2005)', url: 'https://pure.psu.edu/en/publications/comparison-of-predictive-equations-for-resting-metabolic-rate-in-/' },
    kayip: { ad: 'Helms, Aragon, Fitschen — Doğal vücut geliştirmede beslenme önerileri (2014)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4033492/' },
    nordic: { ad: 'Nordic hamstring egzersizinin sakatlık ve performansa etkisi — şemsiye derleme (2024)', url: 'https://pubmed.ncbi.nlm.nih.gov/39120165/' },
    copenhagen: { ad: 'Adduktor güçlendirme programı futbolcularda kasık sorunlarını azaltıyor (2019)', url: 'https://pubmed.ncbi.nlm.nih.gov/29891614/' },
    fifa11: { ad: 'FIFA 11 ve 11+ programlarının sakatlık oranına etkisi — meta-analiz (2017)', url: 'https://pubmed.ncbi.nlm.nih.gov/28087568/' },
    acl: { ad: 'Kadın sporcularda nöromüsküler antrenmanın kritik bileşenleri — meta-regresyon', url: 'https://pubmed.ncbi.nlm.nih.gov/27251898/' },
    kosu: { ad: 'Kuvvet antrenmanının iyi antrenmanlı koşucularda koşu ekonomisine etkisi — meta-analiz', url: 'https://pubmed.ncbi.nlm.nih.gov/26694507/' }
  };

  const HAREKET = {};
  // "ek hareketler" bölümündekiler otomatik programa girmez (mevcut programlar değişmesin); kendi programını yazarken ve "değiştir" listesinde çıkar
  const EK_BAS = H.findIndex((r) => r[0] === 'smith_bench');
  H.forEach((r, i) => {
    const s = (x) => (x ? x.split(',') : []);
    HAREKET[r[0]] = { id: r[0], ad: r[1], kalip: r[2], birincil: s(r[3]), ikincil: s(r[4]), ekipman: s(r[5]), seviye: r[6], tip: r[7], artis: r[8], kontra: s(r[9]), ipucu: r[10] };
    if (EK_BAS >= 0 && i >= EK_BAS) HAREKET[r[0]].ek = true;
  });

  // Ek sakatlık bölgeleri: bu bölgede ağrısı olanın programına bu hareketler girmez (yerine aynı kalıptan güvenli olan gelir)
  const EK_KONTRA = {
    bilek: ['bench', 'pushup', 'pushup_incline', 'pushup_decline', 'front_squat', 'ohp', 'dips', 'bench_dips', 'hs_pushup', 'pike_pushup', 'burpee', 'birddog', 'mb_slam', 'skull', 'bb_curl', 'landmine', 'diamond'],
    dirsek: ['skull', 'oh_ext', 'dips', 'bench_dips', 'diamond', 'bb_curl', 'chinup', 'hs_pushup'],
    ayak_bilegi: ['box_jump', 'squat_jump', 'pogo', 'drop_landing', 'broad_jump', 'lateral_bound', 'sprint_acc', 'shuttle', 'run_interval', 'burpee', 'lunge', 'lateral_lunge'],
    kalca: ['lateral_lunge', 'copenhagen', 'copenhagen_kisa', 'split_squat', 'lunge', 'bw_split', 'kb_swing', 'broad_jump'],
    boyun: ['neck_iso', 'hs_pushup', 'pike_pushup', 'mb_slam'],
    sirt: ['squat', 'deadlift', 'row', 'rdl', 'kb_swing', 'farmer', 'rower', 'good_morning']
  };
  Object.keys(EK_KONTRA).forEach((b) => EK_KONTRA[b].forEach((id) => { if (HAREKET[id] && HAREKET[id].kontra.indexOf(b) < 0) HAREKET[id].kontra.push(b); }));
  const SAKATLIK = [['diz', 'Diz'], ['bel', 'Bel'], ['omuz', 'Omuz'], ['sirt', 'Sırt'], ['kalca', 'Kalça'], ['bilek', 'El bileği'], ['dirsek', 'Dirsek'], ['ayak_bilegi', 'Ayak bileği'], ['boyun', 'Boyun']];
  const veri = { surum: 2, SAKATLIK, KAS, ANA_KAS, EKIPMAN, ORTAM, HAREKET, GUN, BOLUNME, BOLUNME_VUCUT, SPOR, KAYNAK, satirlar: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = veri;
  else kok.CB_KUTUPHANE = veri;
})(typeof window !== 'undefined' ? window : globalThis);
