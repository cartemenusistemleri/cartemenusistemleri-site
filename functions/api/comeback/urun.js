// COMEBACK. — paketli ürün besin değerleri (Open Food Facts vekili)
// GET /api/comeback/urun?barkod=8690...   → { urun }
// GET /api/comeback/urun?ara=ayran         → { urunler: [...] }
// Değerler 100 g başınadır. Kaynak: Open Food Facts (ODbL), https://world.openfoodfacts.org

const UA = 'COMEBACK/0.1 (https://cartemenusistemleri.com.tr/comeback)';
const ALAN = 'code,product_name,product_name_tr,brands,nutriments,serving_quantity';

const json = (veri, durum = 200, onbellek = 0) => new Response(JSON.stringify(veri), {
  status: durum,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': onbellek ? 'public, max-age=' + onbellek : 'no-store' }
});

function duzenle(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  let k = Number(n['energy-kcal_100g']);
  if (!isFinite(k) || k <= 0) { const kj = Number(n.energy_100g); k = isFinite(kj) && kj > 0 ? kj / 4.184 : NaN; }
  if (!isFinite(k)) return null;
  const s = (v) => { const x = Number(v); return isFinite(x) && x >= 0 ? Math.round(x * 10) / 10 : 0; };
  const ad = String(p.product_name_tr || p.product_name || '').trim();
  if (!ad) return null;
  const g = Number(p.serving_quantity);
  return {
    kod: String(p.code || ''),
    ad: ad.slice(0, 80),
    marka: String(p.brands || '').split(',')[0].trim().slice(0, 40),
    k: Math.round(k), p: s(n.proteins_100g), kh: s(n.carbohydrates_100g), y: s(n.fat_100g),
    g: isFinite(g) && g > 0 && g < 2000 ? Math.round(g) : 100
  };
}

async function getir(url, ctx) {
  const cache = caches.default;
  const anahtar = new Request(url, { method: 'GET' });
  const eski = await cache.match(anahtar);
  if (eski) return eski.json();
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
  if (!r.ok) throw new Error('off ' + r.status);
  const metin = await r.text();
  const yanit = new Response(metin, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=86400' } });
  ctx.waitUntil(cache.put(anahtar, yanit));
  return JSON.parse(metin);
}

export async function onRequestGet(ctx) {
  const u = new URL(ctx.request.url);
  const barkod = (u.searchParams.get('barkod') || '').replace(/\D/g, '');
  const ara = (u.searchParams.get('ara') || '').trim().slice(0, 60);
  try {
    if (barkod) {
      if (barkod.length < 8 || barkod.length > 14) return json({ hata: 'Geçersiz barkod.' }, 400);
      const j = await getir('https://world.openfoodfacts.org/api/v2/product/' + barkod + '.json?fields=' + ALAN, ctx);
      const urun = j && j.status === 1 ? duzenle(j.product) : null;
      return urun ? json({ urun }, 200, 3600) : json({ hata: 'Bu barkodla ürün bulunamadı. Elle ekleyebilirsin.' }, 404);
    }
    if (ara.length >= 2) {
      const temel = 'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&search_simple=1&page_size=20&fields=' + ALAN + '&search_terms=' + encodeURIComponent(ara);
      let j = await getir(temel + '&tagtype_0=countries&tag_contains_0=contains&tag_0=turkey', ctx);
      let urunler = (j.products || []).map(duzenle).filter(Boolean);
      if (urunler.length < 3) {
        j = await getir(temel, ctx);
        const ek = (j.products || []).map(duzenle).filter(Boolean);
        const gorulen = new Set(urunler.map((x) => x.kod));
        urunler = urunler.concat(ek.filter((x) => !gorulen.has(x.kod)));
      }
      return json({ urunler: urunler.slice(0, 15) }, 200, 3600);
    }
    return json({ hata: 'barkod ya da ara parametresi gerekli.' }, 400);
  } catch (e) {
    return json({ hata: 'Ürün veritabanına şu an ulaşılamıyor. Biraz sonra tekrar dene.' }, 502);
  }
}
