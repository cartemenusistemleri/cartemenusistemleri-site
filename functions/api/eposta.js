// Gmail e-posta köprüsü (cartemenusistemleri@gmail.com · Google Apps Script "Carte e-posta köprüsü")
// Gizli anahtar yok: site e-postayı D1'de tek kullanımlık, 128 bit rastgele bir kimlikle 5 dakika bekletir,
// köprüye yalnızca kimliği yollar; köprü GET /api/eposta?id=<kimlik> ile içeriği bir kez alır ve gönderir.
// Kimliği bilmeyen içerik okuyamaz; kimliği bilen de yalnızca sitenin zaten hazırladığı e-postayı tetikler.

export const KOPRU_URL = 'https://script.google.com/macros/s/AKfycby87IouiSMQONR2SARVOUrMYfNFwq_qRt87yYgHGoZn1IbAw3SsM1-yBdmCIV_e7N_30Q/exec';
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const tablo = db => db.prepare('CREATE TABLE IF NOT EXISTS eposta_kuyruk (id TEXT PRIMARY KEY, veri TEXT NOT NULL, t INTEGER NOT NULL)').run();

// Site içinden: e-postayı kuyruğa koy, köprüyü tetikle. Dönüş: 'gonderildi' | 'hata'
export async function gmailGonder(env, posta) {
  const db = env.ISTATISTIK;
  if (!db) return 'hata';
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
  try {
    await tablo(db);
    await db.prepare('DELETE FROM eposta_kuyruk WHERE t < ?').bind(Date.now() - 300000).run();
    await db.prepare('INSERT INTO eposta_kuyruk (id, veri, t) VALUES (?, ?, ?)').bind(id, JSON.stringify(posta), Date.now()).run();
    const r = await fetch(env.MAIL_WEBHOOK_URL || KOPRU_URL, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ id }) });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) await db.prepare('DELETE FROM eposta_kuyruk WHERE id = ?').bind(id).run();
    return j.ok ? 'gonderildi' : 'hata';
  } catch { return 'hata'; }
}

// Köprü buradan alır (tek kullanımlık)
export async function onRequestGet({ request, env }) {
  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-f0-9]{32}$/.test(id) || !env.ISTATISTIK) return J({ ok: false }, 404);
  const db = env.ISTATISTIK;
  await tablo(db);
  const row = await db.prepare('DELETE FROM eposta_kuyruk WHERE id = ? AND t > ? RETURNING veri').bind(id, Date.now() - 300000).first();
  if (!row) return J({ ok: false }, 404);
  return J({ ok: true, posta: JSON.parse(row.veri) });
}
