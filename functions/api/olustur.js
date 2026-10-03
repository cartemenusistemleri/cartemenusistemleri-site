const SLUG_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0,o,1,l,i (ambiguous)

function randomSlug(len) {
  len = len || 6;
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let s = '';
  for (let i = 0; i < len; i++) s += SLUG_CHARS[bytes[i] % SLUG_CHARS.length];
  return s;
}

function cleanIban(raw) {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = request.headers.get('x-admin-secret') || '';
  if (!env.ADMIN_SECRET || auth !== env.ADMIN_SECRET) {
    return jsonResponse({ ok: false, error: 'Yetkisiz' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: 'Geçersiz istek' }, 400);
  }

  const iban = cleanIban(body.iban);
  const isim = (body.isim || '').trim().slice(0, 80);

  if (!iban || iban.length < 15 || iban.length > 34 || !iban.startsWith('TR')) {
    return jsonResponse({ ok: false, error: "Geçerli bir IBAN girin (TR ile başlamalı)" }, 400);
  }
  if (!isim) {
    return jsonResponse({ ok: false, error: 'Hesap sahibi adı gerekli' }, 400);
  }

  let slug = '';
  for (let i = 0; i < 6; i++) {
    const candidate = randomSlug(6);
    const existing = await env.ODEME_LINKS.get(candidate);
    if (!existing) {
      slug = candidate;
      break;
    }
  }
  if (!slug) {
    return jsonResponse({ ok: false, error: 'Link üretilemedi, tekrar deneyin' }, 500);
  }

  await env.ODEME_LINKS.put(slug, JSON.stringify({ iban, isim, created_at: new Date().toISOString() }));

  const origin = new URL(request.url).origin;
  return jsonResponse({ ok: true, slug, url: `${origin}/odeme/${slug}` });
}

export async function onRequestGet() {
  return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
}
