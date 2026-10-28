// Şube menüleri: /cafe-solen/<şube>/  -> aynı menü sayfası (şube, adresten okunur)
// Şube olmayan yollar (panel, personel, img, data.js ...) normal dosya olarak sunulur.
import { subeIdleri } from '../../api/oturum.js';

export async function onRequest({ request, env, params, next }) {
  const sube = String(params.sube || '');
  if (subeIdleri('cafe-solen').indexOf(sube) === -1) return next();
  const url = new URL(request.url);
  if (!url.pathname.endsWith('/')) return Response.redirect(url.origin + url.pathname + '/' + url.search, 301);
  const r = await env.ASSETS.fetch(new URL('/cafe-solen/', url));
  const h = new Headers(r.headers);
  h.set('cache-control', 'public, max-age=0, must-revalidate');
  return new Response(r.body, { status: r.status, headers: h });
}
