// Cafe Carte (demo) Panel -> Ürün güncellemeleri: Carte yönetim sayfasının işletme kipi
export async function onRequest({ request, env }) {
  const r = await env.ASSETS.fetch(new URL('/yonetim/', request.url));
  const h = new Headers(r.headers);
  h.set('cache-control', 'no-store');
  return new Response(r.body, { status: r.status, headers: h });
}
