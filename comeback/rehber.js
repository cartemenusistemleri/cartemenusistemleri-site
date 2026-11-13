/* COMEBACK. — Rehber: her kas grubu için kısa, açıklayıcı yazılar (toplulukta "Rehber" sekmesi)
   Her yazı: id, ad, kas (kutuphane KAS anahtarı), ozet, bolumler [[başlık, metin]], hareketler (kutuphane id), sure */
(function (kok) {
  const GENEL = [
    ['Haftada kaç set?', 'Kas büyütmek için çoğu insanda her kas grubuna haftada 10–20 zorlayıcı set yeterli. Yeniysen 8–10 setle başla, toparlanabildikçe artır. Bu setleri haftaya 2 güne bölmek, hepsini tek günde yapmaktan genelde daha verimli.'],
    ['Ne kadar zorlamalı?', 'Setin sonunda 1–3 tekrar daha yapabilecek kadar güç kalmalı. Her seti tükenene kadar götürmek gerekmez; yorgunluğu artırır, ilerlemeyi hızlandırmaz. Tekniğin bozulduğu yerde set biter.']
  ];
  const R = [
    {
      id: 'gogus', ad: 'Göğüs', kas: 'gogus', sure: '3 dk',
      ozet: 'Göğüs kası kolu öne ve içe doğru getirir. Üst kısmı eğimli, orta ve alt kısmı düz ve hafif aşağı açılı itişlerle daha çok çalışır.',
      bolumler: [
        ['Nasıl çalışır?', 'Büyük göğüs kası (pectoralis major) köprücük kemiğinden ve göğüs kemiğinden başlayıp üst kolda biter. Görevi kolu gövdenin önüne getirmek ve öne itmek. Bu yüzden itiş hareketleri ve kol kapatma (fly) hareketleri onu çalıştırır.'],
        ['Programda nasıl olmalı?', 'Bir ağır itiş (bench press ya da dambıl press) ve bir eğimli itiş temel olsun. Üstüne isterse bir kapatma hareketi ekle. Ağır itişlerde 5–10, kapatmalarda 10–15 tekrar iyi çalışır.'],
        ['Sık yapılan hatalar', 'Kürek kemiklerini geriye sıkıştırmadan basmak omzu öne iter ve yükü göğüsten alır. Barı göğse çarptırıp sektirmek, hareketin en verimli kısmını atlar. Dirsekleri gövdeye 90 derece açmak omuzları zorlar; 45–60 derece daha güvenli.'],
        ['Kısa ipucu', 'Her tekrarda göğsü esnetecek kadar in, sonra kollarını birbirine yaklaştırıyormuş gibi düşünerek it. Hareketi kollarla değil göğüsle bitirdiğini hissedeceksin.']
      ],
      hareketler: ['bench', 'db_bench', 'incline_db', 'incline_bb', 'machine_chest', 'dips', 'cable_fly', 'pec_deck', 'pushup']
    },
    {
      id: 'sirt', ad: 'Sırt: kanat ve orta sırt', kas: 'sirt_kanat', sure: '3 dk',
      ozet: 'Kanat kası (lat) sırtı genişletir, orta sırt kasları kalınlık verir ve duruşu toparlar. İkisi için iki farklı çekiş gerekir: yukarıdan aşağı ve önden geriye.',
      bolumler: [
        ['Nasıl çalışır?', 'Kanat kası (latissimus dorsi) kolu yukarıdan aşağı ve gövdeye doğru çeker: barfiks ve lat pulldown. Orta sırttaki trapez ve romboidler kürek kemiklerini geriye toplar: row (kürek) hareketleri.'],
        ['Programda nasıl olmalı?', 'Haftada en az bir dikey çekiş (barfiks, pulldown) ve bir yatay çekiş (row) olsun. Göğüs için yaptığın itiş setleri kadar çekiş seti yapmak omuz sağlığı için de iyidir. 6–12 tekrar çoğu çekişte iyi sonuç verir.'],
        ['Sık yapılan hatalar', 'Gövdeyi sallayarak ağırlığı savurmak yükü sırttan beline aktarır. Hareketi kollarla başlatmak bicepsi yorar; önce kürek kemiklerini aşağı ve geriye çek, sonra dirseklerini. Rowda belini yuvarlamak en sık sakatlık sebebidir.'],
        ['Kısa ipucu', 'Elleri kanca gibi düşün, dirseklerinle çek. Pulldownda dirsekleri arka cebine, rowda kalçana doğru götür.']
      ],
      hareketler: ['pullup', 'chinup', 'lat', 'row', 'cable_row', 'db_row', 'cs_row', 'tbar', 'inverted_row', 'straight_pulldown']
    },
    {
      id: 'omuz', ad: 'Omuz', kas: 'omuz_yan', sure: '3 dk',
      ozet: 'Omuzun üç bölümü var: ön, yan ve arka. Ön bölüm göğüs itişlerinde zaten çalışır; geniş ve dengeli omuz için yan ve arka bölüm ayrıca hedeflenmeli.',
      bolumler: [
        ['Nasıl çalışır?', 'Deltoid kası kolu öne (ön), yana (yan) ve geriye (arka) kaldırır. Baş üstü pres en çok ön ve yanı, yana açış yanı, arka omuz fly ve face pull arkayı çalıştırır.'],
        ['Programda nasıl olmalı?', 'Bir baş üstü pres temel olsun. Yan omuz için haftada 2 gün yana açış ekle; küçük kas olduğu için 12–20 tekrarla, hafif kiloyla iyi çalışır. Arka omuz için face pull ya da arka omuz fly yeterli.'],
        ['Sık yapılan hatalar', 'Yana açışta ağır kiloyla savurmak işi trapeze verir. Preste beli fazla geriye bükmek yükü bele bindirir; karnı ve kalçayı sık. Omzu ağrıyan biri baş üstü presi ağrısız açıyla, gerekirse eğimli sehpada yapmalı.'],
        ['Kısa ipucu', 'Yana açışta kolları yukarı değil, duvarlara doğru uzatıyormuş gibi düşün; dirsek bilekten biraz önde gitsin.']
      ],
      hareketler: ['ohp', 'db_ohp', 'machine_shoulder', 'arnold', 'lateral', 'cable_lateral', 'rear_fly', 'facepull']
    },
    {
      id: 'biceps', ad: 'Ön kol: biceps', kas: 'biceps', sure: '2 dk',
      ozet: 'Biceps dirseği büker ve avucu yukarı çevirir. Çekiş hareketlerinde zaten çalışır; ayrı curl setleri kolun büyümesine ek katkı sağlar.',
      bolumler: [
        ['Nasıl çalışır?', 'Biceps omuzdan başlayıp dirseğin altında biter, bu yüzden kolun gövdenin gerisinde olduğu hareketler (eğimli curl) onu daha çok esnetir. Hammer curl bicepsin altındaki brakialis kasını ve önkolu da çalıştırır.'],
        ['Programda nasıl olmalı?', 'Sırt günlerinde çekişlere ek olarak haftada 6–10 curl seti çoğu kişiye yeter. 8–15 tekrar iyi çalışır. Bir düz curl ve bir hammer curl çeşitlilik için yeterli.'],
        ['Sık yapılan hatalar', 'Gövdeyi geriye atıp ağırlığı savurmak, dirseği öne kaydırıp omzu işe katmak ve aşağıda kolu tam açmamak. Kontrolsüz iniş, hareketin yarısını boşa harcar.'],
        ['Kısa ipucu', 'Dirseklerin gövdenin yanında sabit kalsın; inişi kaldırıştan yavaş yap, yaklaşık 2–3 saniye.']
      ],
      hareketler: ['curl', 'bb_curl', 'hammer', 'incline_curl', 'preacher', 'cable_curl']
    },
    {
      id: 'triceps', ad: 'Arka kol: triceps', kas: 'triceps', sure: '2 dk',
      ozet: 'Triceps üst kolun yaklaşık üçte ikisini oluşturur ve dirseği açar. Kalın kol istiyorsan bicepsten çok triceps önemlidir.',
      bolumler: [
        ['Nasıl çalışır?', 'Üç başlı bir kas. Uzun baş omuzdan başladığı için kol başının üstündeyken en çok esner; baş üstü triceps hareketleri bu yüzden değerlidir. Pushdown ve dar tutuş bench diğer başları iyi çalıştırır.'],
        ['Programda nasıl olmalı?', 'Göğüs ve omuz itişleri tricepsi zaten çalıştırır. Üstüne haftada 6–10 ayrı set ekle: bir baş üstü hareket ve bir pushdown ya da makine. 8–15 tekrar uygun.'],
        ['Sık yapılan hatalar', 'Pushdownda dirsekleri öne arkaya oynatmak, gövdeyle bastırmak ve kafatası kırıcıda dirsekleri dışa açmak. Dirsek ağrısı varsa ağır skull crusher yerine kablo ve makine çeşitleri daha rahattır.'],
        ['Kısa ipucu', 'Her tekrarın sonunda kolu tamamen aç ve bir an sık. Kilo değil bu sıkma hissi ilerletir.']
      ],
      hareketler: ['pushdown', 'rope_pushdown', 'oh_ext', 'skull', 'close_bench', 'triceps_machine', 'dips']
    },
    {
      id: 'onkol', ad: 'Önkol ve kavrama', kas: 'onkol', sure: '2 dk',
      ozet: 'Güçlü kavrama ağır çekişleri ve deadlifti mümkün kılar. Önkol çoğu antrenmanda dolaylı çalışır; zayıfsa birkaç doğrudan set yeterli.',
      bolumler: [
        ['Nasıl çalışır?', 'Önkol kasları parmakları kapatır, bileği büker ve çevirir. Ağır taşımalar, asılmalar ve hammer curl bu kasları en iyi çalıştıran hareketlerdendir.'],
        ['Programda nasıl olmalı?', 'Haftada 2–3 kez çiftçi yürüyüşü ya da barfiks barında asılma (30–60 saniye) çoğu insan için yeter. Deadliftte kayış kullanıyorsan kavrama için ayrıca bir iki set eklemek iyi olur.'],
        ['Sık yapılan hatalar', 'Her seti kayışla yapıp kavramayı hiç çalıştırmamak, ya da tam tersi; kavrama yüzünden sırtı yeterince yükleyememek. İkisini dengelemek en iyisi.'],
        ['Kısa ipucu', 'Taşımalarda omuzları aşağıda ve geride tut; ağırlığı parmak uçlarında değil avucun derininde kavra.']
      ],
      hareketler: ['farmer', 'dead_hang', 'suitcase', 'hammer']
    },
    {
      id: 'on_bacak', ad: 'Ön bacak: quadriceps', kas: 'on_bacak', sure: '3 dk',
      ozet: 'Uyluğun önündeki dört kas dizi açar. Squat ve türevleri temel hareketlerdir; derin ve kontrollü inmek kasın büyümesi için önemlidir.',
      bolumler: [
        ['Nasıl çalışır?', 'Quadriceps diz açılırken çalışır: squat, leg press, lunge ve leg extension. Diz ne kadar çok bükülürse kas o kadar esner; tam ve kontrollü açıyla çalışmak yarım tekrarlardan daha etkilidir.'],
        ['Programda nasıl olmalı?', 'Bir ağır hareket (squat, hack squat ya da leg press) ve bir tek bacak hareketi (Bulgarian split squat, lunge) temel olsun. Leg extension tamamlayıcı olarak iyidir. 6–12 tekrar ağır hareketlerde, 10–15 makinelerde uygun.'],
        ['Sık yapılan hatalar', 'Topukların kalkması, dizlerin içe çökmesi ve inişte gevşemek. Dizlerin ayak ucunu geçmesi tek başına tehlikeli değil; önemli olan dizin ayakla aynı yöne bakması.'],
        ['Kısa ipucu', 'Ayağını yere üç noktadan bas: topuk, başparmak dibi, serçe parmak dibi. Kalkarken yeri ittiğini düşün.']
      ],
      hareketler: ['squat', 'front_squat', 'hack', 'legpress', 'goblet', 'split_squat', 'lunge', 'step_up', 'legext']
    },
    {
      id: 'arka_bacak', ad: 'Arka bacak: hamstring', kas: 'arka_bacak', sure: '3 dk',
      ozet: 'Arka bacak hem kalçayı açar hem dizi büker. Bu yüzden iki tür hareket gerekir: kalçadan menteşe (RDL) ve diz bükme (leg curl).',
      bolumler: [
        ['Nasıl çalışır?', 'Hamstringler kalçadan başlayıp dizin altında biter. Romanian deadlift onları kalçadan esnetir, leg curl dizden büker. İkisini birlikte yapmak tek başına yapmaktan daha dengeli gelişim sağlar.'],
        ['Programda nasıl olmalı?', 'Haftada bir menteşe hareketi (RDL, good morning) ve bir curl (yatarak ya da oturarak leg curl) iyi bir temel. Nordic curl sporcular için sakatlık önlemede öne çıkar; düşük tekrarla başla.'],
        ['Sık yapılan hatalar', 'RDL sırasında belin yuvarlanması ve hareketin kalça yerine bel ile yapılması. Bar bacaklara yakın insin, dizler hafif bükük kalsın, kalçayı geriye it.'],
        ['Kısa ipucu', 'RDLde aşağı inmeyi değil kalçanı arkadaki duvara değdirmeyi düşün. Arka bacakta güçlü bir gerilme hissedince dön.']
      ],
      hareketler: ['rdl', 'good_morning', 'deadlift', 'legcurl', 'seated_legcurl', 'nordic', 'back_ext']
    },
    {
      id: 'kalca', ad: 'Kalça', kas: 'kalca', sure: '3 dk',
      ozet: 'Büyük kalça kası vücudun en güçlü kaslarından biri. Kalçayı açar, koşu ve sıçramada güç üretir, beli ve dizleri korur.',
      bolumler: [
        ['Nasıl çalışır?', 'Gluteus maximus kalçayı açar (bacağı geriye götürür), küçük kalça kasları (medius) bacağı yana açar ve dizi dengede tutar. Hip thrust kası kısalmış hâlde, squat ve RDL esnemiş hâlde güçlü çalıştırır.'],
        ['Programda nasıl olmalı?', 'Bir hip thrust ya da köprü, bir squat ya da tek bacak hareketi ve bir menteşe hareketi kalçayı her açıdan çalıştırır. Yan kalça için abductor makinesi ya da bantla yan yürüyüş eklenebilir.'],
        ['Sık yapılan hatalar', 'Hip thrustta beli bükerek kalkmak; kaburgaları aşağıda tut, çeneyi göğse yaklaştır. Üstte kalçayı sıkmadan inmek hareketin en iyi kısmını kaçırır.'],
        ['Kısa ipucu', 'Hip thrustta ayaklarını, üst noktada kaval kemiğin dik duracak şekilde yerleştir; topuklardan it.']
      ],
      hareketler: ['hipthrust', 'glute_bridge', 'split_squat', 'rdl', 'step_up', 'cable_pullthrough', 'abductor_machine']
    },
    {
      id: 'baldir', ad: 'Baldır', kas: 'baldir', sure: '2 dk',
      ozet: 'Baldır kasları ayak bileğini uzatır. Gün boyu çalıştıkları için dayanıklıdırlar; büyümeleri için tam açıyla ve sabırla çalışmak gerekir.',
      bolumler: [
        ['Nasıl çalışır?', 'İki ana kas var: gastroknemius dizi düz tutarken (ayakta), soleus dizi bükükken (oturarak) daha çok çalışır. İkisini de çalıştırmak için iki çeşit hareket gerekir.'],
        ['Programda nasıl olmalı?', 'Haftada 2 gün, 8–12 set yeterli. 10–20 tekrar, altta 1–2 saniye bekleyerek. Ayakta ve oturarak çeşitleri dönüşümlü kullan.'],
        ['Sık yapılan hatalar', 'Yaylanarak hızlı tekrarlar yapmak. Aşil tendonu yükü taşır, kas az çalışır. Altta tamamen esnemek ve üstte tamamen yükselmek şart.'],
        ['Kısa ipucu', 'Ağırlığı başparmak dibine ver ve üstte bir saniye dur. Yavaş tekrar, ağır kiloyla yarım tekrardan iyidir.']
      ],
      hareketler: ['calf', 'seated_calf', 'sl_calf', 'legpress_calf']
    },
    {
      id: 'karin', ad: 'Karın ve core', kas: 'karin', sure: '3 dk',
      ozet: 'Core yalnızca karın kası değil; gövdeyi sabit tutan bütün kaslar. Görevi çoğu zaman hareket etmek değil, hareketi durdurmak.',
      bolumler: [
        ['Nasıl çalışır?', 'Rectus abdominis gövdeyi öne büker, yan karın kasları döndürür ve yana bükülmeyi engeller, derin kaslar beli korur. Plank ve dead bug bükülmeyi, Pallof press dönmeyi, side plank yana devrilmeyi engellemeyi öğretir.'],
        ['Programda nasıl olmalı?', 'Haftada 2–3 kez, 2–3 hareket yeter: bir bükme (kablo crunch ya da asılı bacak kaldırma), bir dönmeyi engelleme (Pallof) ve bir plank çeşidi. Ağır squat ve deadlift de core’u güçlü çalıştırır.'],
        ['Sık yapılan hatalar', 'Plankta kalçayı düşürüp beli çukurlaştırmak ya da kalçayı havaya dikmek. Bacak kaldırmada hareketi kalçayla sallanarak yapmak. Görünür karın kası için asıl belirleyici yağ oranıdır, sit-up sayısı değil.'],
        ['Kısa ipucu', 'Her core hareketinde önce nefesi ver ve kaburgaları aşağı indir. Belinin yere yapıştığını hissetmek doğru pozisyonun işareti.']
      ],
      hareketler: ['plank', 'side_plank', 'deadbug', 'pallof', 'birddog', 'hanging_raise', 'cable_crunch']
    },
    {
      id: 'trapez', ad: 'Trapez ve üst sırt', kas: 'trapez', sure: '2 dk',
      ozet: 'Trapez boyundan sırtın ortasına uzanır. Üst kısmı omuzları kaldırır, orta ve alt kısmı kürek kemiklerini toplar ve omuzu sağlıklı tutar.',
      bolumler: [
        ['Nasıl çalışır?', 'Üst trapez omuz silkmede (shrug) ve ağır taşımalarda, orta ve alt trapez row ve face pull gibi geriye çekişlerde çalışır. Deadlift ve çiftçi yürüyüşü de güçlü bir uyarandır.'],
        ['Programda nasıl olmalı?', 'Deadlift ve row yapıyorsan trapez zaten çalışır. Üst trapezi ayrıca büyütmek istersen haftada 6–8 set shrug, 10–15 tekrarla eklemek yeterli.'],
        ['Sık yapılan hatalar', 'Shrug sırasında omuzları döndürmek; gereksizdir ve omzu zorlar. Düz yukarı kaldır, üstte bir an tut. Başı öne uzatmak boynu zorlar.'],
        ['Kısa ipucu', 'Shrugda omuzlarını kulaklarına değdirmeye çalış, sonra yavaşça indir.']
      ],
      hareketler: ['bb_shrug', 'db_shrug', 'farmer', 'facepull', 'cable_upright', 'row']
    }
  ];
  kok.COMEBACK_REHBER = { R, GENEL };
})(typeof window !== 'undefined' ? window : globalThis);
