export async function onRequestGet(context) {
  const secret = context.request.headers.get('x-admin-secret');
  if (!secret || secret !== context.env.ADMIN_SECRET) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
  }

  const items = [];
  let cursor = undefined;
  do {
    const list = await context.env.ODEME_LINKS.list(cursor ? { cursor } : {});
    for (const key of list.keys) {
      const raw = await context.env.ODEME_LINKS.get(key.name);
      let data = null;
      try { data = JSON.parse(raw); } catch (e) { data = raw; }
      items.push({ slug: key.name, data });
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  return new Response(JSON.stringify({
    ok: true,
    exportedAt: new Date().toISOString(),
    count: items.length,
    items
  }, null, 2), {
    headers: { 'content-type': 'application/json' }
  });
}
