// COMEBACK. — fotoğraftan kalori tahmini
// POST /api/comeback/foto  { resim: "data:image/jpeg;base64,..." }  → { kalemler: [{ ad, g, k, p, kh, y }] }
// Ortam değişkenleri (Cloudflare Pages → Settings → Variables):
//   COMEBACK_AI_KEY    Anthropic API anahtarı (yoksa uç 503 döner, uygulama elle eklemeye yönlendirir)
//   COMEBACK_AI_MODEL  isteğe bağlı, varsayılan claude-haiku-5-5
//   COMEBACK_FOTO_LIMIT isteğe bağlı, kişi (IP) başına günlük analiz sayısı, varsayılan 20
// Günlük sayaç: KV COMEBACK_KV bağlıysa o, yoksa sitenin ODEME_LINKS KV'si; anahtar "comeback:foto:<ip>:<gün>"

const json = (veri, durum = 200) => new Response(JSON.stringify(veri), {
  status: durum, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const ISTEM = 'Bu fotoğraftaki yemekleri tanı ve porsiyonları tahmin et. Türk mutfağını iyi bil. ' +
  'Yalnızca şu biçimde geçerli JSON döndür, başka hiçbir şey yazma: ' +
  '{"kalemler":[{"ad":"Türkçe kısa yemek adı","g":gram,"k":kilokalori,"p":protein_gram,"kh":karbonhidrat_gram,"y":yag_gram}]}. ' +
  'Değerler o porsiyonun toplamı olsun (100 g başına değil). Tabakta görünen her ayrı yemeği ayrı kalem yap, en fazla 8 kalem. ' +
  'Fotoğrafta yemek yoksa {"kalemler":[]} döndür.';

export async function onRequestPost(ctx) {
  const { request, env } = ctx;
  if (!env.COMEBACK_AI_KEY) return json({ hata: 'Fotoğraf analizi yakında açılıyor. Şimdilik listeden ya da elle ekleyebilirsin.' }, 503);

  let govde;
  try { govde = await request.json(); } catch (e) { return json({ hata: 'Geçersiz istek.' }, 400); }
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(govde && govde.resim || ''));
  if (!m) return json({ hata: 'Fotoğraf okunamadı.' }, 400);
  if (m[2].length > 3_000_000) return json({ hata: 'Fotoğraf çok büyük.' }, 413);

  const kv = env.COMEBACK_KV || env.ODEME_LINKS;
  const limit = parseInt(env.COMEBACK_FOTO_LIMIT || '20', 10);
  const ip = request.headers.get('cf-connecting-ip') || 'yok';
  const anahtar = 'comeback:foto:' + ip + ':' + new Date().toISOString().slice(0, 10);
  if (kv) {
    const n = parseInt((await kv.get(anahtar)) || '0', 10);
    if (n >= limit) return json({ hata: 'Bugünkü fotoğraf analizi hakkın doldu. Yarın tekrar deneyebilir ya da elle ekleyebilirsin.' }, 429);
    ctx.waitUntil(kv.put(anahtar, String(n + 1), { expirationTtl: 60 * 60 * 30 }));
  }

  let yanit;
  try {
    yanit = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.COMEBACK_AI_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.COMEBACK_AI_MODEL || 'claude-haiku-5-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: ISTEM }
        ] }]
      })
    });
  } catch (e) { return json({ hata: 'Analiz servisine ulaşılamadı.' }, 502); }
  if (!yanit.ok) return json({ hata: 'Analiz şu an yapılamıyor. Biraz sonra tekrar dene.' }, 502);

  const veri = await yanit.json().catch(() => null);
  const metin = veri && Array.isArray(veri.content) ? veri.content.filter((c) => c.type === 'text').map((c) => c.text).join('') : '';
  const bas = metin.indexOf('{'), son = metin.lastIndexOf('}');
  let sonuc;
  try { sonuc = JSON.parse(metin.slice(bas, son + 1)); } catch (e) { return json({ hata: 'Fotoğraf yorumlanamadı. Daha yakından ve aydınlık bir fotoğraf dene.' }, 422); }

  const sayi = (v, ust) => { const x = Number(v); return isFinite(x) && x >= 0 ? Math.min(ust, Math.round(x * 10) / 10) : 0; };
  const kalemler = (Array.isArray(sonuc.kalemler) ? sonuc.kalemler : []).slice(0, 8).map((x) => ({
    ad: String(x && x.ad || 'Yemek').replace(/[<>]/g, '').slice(0, 50),
    g: sayi(x.g, 2000) || 100, k: sayi(x.k, 4000), p: sayi(x.p, 300), kh: sayi(x.kh, 500), y: sayi(x.y, 300)
  })).filter((x) => x.k > 0);
  return json({ kalemler });
}
