// Otomer randevu paneli API — Carte oturum sistemiyle (Cloudflare Pages Function)
// Kimlik: yalnızca x-oturum (Otomer panel kullanıcısı, "randevu" yetkisi). Carte yöneticisi buraya erişemez.
// GET  /api/otomer/panel?from=2026-11-01&to=2026-11-30   → aralıktaki talepler (boşsa hepsi)
// POST /api/otomer/panel  { code, status?, day?, slot?, not?, mail?:false }
//      status: "bekliyor" | "onaylandi" | "iptal". Onay/iptalde müşteriye e-posta gider (e-posta varsa ve mail:false değilse).

import { kimlik, izinli } from '../oturum.js';
import { kv, PFX, J, meta, whenText, mailGonder, plakaMail, ics } from './randevu.js';

// Carte yöneticisi (ADMIN_SECRET) randevu verisini göremez; diğer işletmelerdeki gibi yalnızca kullanıcı/yetki yönetir (/api/kullanici).
// Randevuları görmek isteyen Carte çalışanı kendine "randevu" yetkili bir Otomer kullanıcısı açar.
const yetkili = async (request, env) => { const k = await kimlik(request, env); return k && !k.admin && izinli(k, 'otomer', 'randevu', null) ? k : null; };

export async function onRequestGet({ request, env }) {
  const kim = await yetkili(request, env);
  if (!kim) return J({ error: 'Oturum geçersiz' }, 401);
  const db = kv(env);
  const u = new URL(request.url), from = u.searchParams.get('from') || '', to = u.searchParams.get('to') || '9999';
  const out = []; let cursor;
  do {
    const page = await db.list({ prefix: PFX, cursor });
    for (const k of page.keys) {
      const m = k.metadata || {};
      if ((!from || m.day >= from) && m.day <= to) out.push({ code: k.name.slice(PFX.length), ...m });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  out.sort((a, b) => (a.day + a.slot).localeCompare(b.day + b.slot));
  return J({ items: out, ad: kim.ad });
}

export async function onRequestPost({ request, env }) {
  const kim = await yetkili(request, env);
  if (!kim) return J({ error: 'Oturum geçersiz' }, 401);
  const db = kv(env);
  let b; try { b = await request.json(); } catch { return J({ error: 'Geçersiz istek' }, 400); }
  if (!/^OT-\d{4}-[A-Z0-9]{4}$/.test(b.code || '')) return J({ error: 'Kod hatalı' }, 400);
  if (b.status && !['bekliyor', 'onaylandi', 'iptal'].includes(b.status)) return J({ error: 'Durum hatalı' }, 400);
  if (b.day && !/^\d{4}-\d{2}-\d{2}$/.test(b.day)) return J({ error: 'Gün hatalı' }, 400);
  if (b.slot && !/^\d{2}\.\d{2}$/.test(b.slot)) return J({ error: 'Saat hatalı' }, 400);
  const key = PFX + b.code;
  const rec = await db.get(key, 'json');
  if (!rec) return J({ error: 'Bulunamadı' }, 404);

  const eskiDurum = rec.status, eskiZaman = rec.when;
  if (b.day) rec.day = b.day;
  if (b.slot) rec.slot = b.slot;
  rec.when = whenText(rec.day, rec.slot);
  if (b.status) rec.status = b.status;
  if (b.not !== undefined) rec.not = String(b.not).slice(0, 300);
  rec.updatedAt = new Date().toISOString();
  rec.updatedBy = kim.ad;
  rec.log = (rec.log || []).concat([{ t: rec.updatedAt, by: rec.updatedBy, status: rec.status, when: rec.when }]).slice(-20);

  // müşteriye e-posta: onaylandığında, iptalde ya da onaylı randevunun saati değiştiğinde
  let mail = '';
  const degisti = rec.status !== eskiDurum || (rec.status === 'onaylandi' && rec.when !== eskiZaman);
  if (degisti && b.mail !== false && (rec.status === 'onaylandi' || rec.status === 'iptal')) {
    const onay = rec.status === 'onaylandi';
    const baslik = onay ? (eskiDurum === 'onaylandi' ? 'Randevunuzun saati güncellendi' : 'Randevunuz onaylandı') : 'Randevunuz iptal edildi';
    const aciklama = onay ? 'Sizi bekliyoruz. Takvim kaydı ektedir; saatinizi değiştirmeniz gerekirse bizi arayın.'
      : 'Randevunuz iptal edildi' + (rec.not ? ': ' + rec.not.replace(/[<>]/g, '') : '.') + ' Yeni bir saat için bizi arayabilirsiniz.';
    mail = await mailGonder(env, { to: rec.email, subject: `Otomer · ${baslik} · ${rec.when}`, html: plakaMail(rec, baslik, aciklama),
      text: `${baslik}\n${rec.when}\n${rec.job} · ${[rec.brand, rec.year].filter(Boolean).join(' · ')}\nTalep kodu: ${rec.code}\n\nOtomer · 0232 386 33 88`,
      ics: onay ? ics(rec) : null });
    rec.mail = mail + ' · ' + rec.updatedAt.slice(0, 16);
  }
  await db.put(key, JSON.stringify(rec), { metadata: meta(rec) });
  return J({ ok: true, item: { code: rec.code, ...meta(rec) }, mail });
}
