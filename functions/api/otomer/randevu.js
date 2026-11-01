// Otomer randevu API — müşteri tarafı (Cloudflare Pages Function)
// POST /api/otomer/randevu        → yeni talep kaydeder, { code, status } döner
// GET  /api/otomer/randevu?code=  → müşterinin kartı için yalnızca durum ve saat döner
// Veri: KV OTOMER_RANDEVU bağlıysa o, yoksa sitenin ODEME_LINKS KV'si; anahtar "otomer:randevu:<kod>"
// E-posta: varsayılan Gmail köprüsü (functions/api/eposta.js, ayar gerekmez); RESEND_API_KEY varsa Resend. OTOMER_BILDIRIM: yeni talepte Otomer'e haber

import { gmailGonder } from '../eposta.js';

export const kv = env => env.OTOMER_RANDEVU || env.ODEME_LINKS;
export const PFX = 'otomer:randevu:';
export const J = (d, s = 200) => new Response(JSON.stringify(d), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const clean = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const ALPHA = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
const GUNLER = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const ADRES = 'Dokuz Eylül Mah. 312 Sk. No:24, 35410 Gaziemir / İzmir';

// "2026-11-02" + "10.30" → "2 Kasım Pazartesi · 10.30"
export function whenText(day, slot) {
  const [y, m, d] = day.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d} ${AYLAR[m - 1]} ${GUNLER[wd]}${slot ? ' · ' + slot : ''}`;
}
// KV liste metadata'sı: panelin her kaydı ayrı okumadan çalışabilmesi için (1 KB sınırı içinde)
export function meta(r) {
  return { day: r.day, slot: r.slot, status: r.status, name: r.name, tel: r.tel, email: r.email || '', brand: r.brand, year: r.year || '',
    job: r.job, vin: r.vin || '', km: r.km || '', createdAt: r.createdAt, updatedAt: r.updatedAt || '', not: (r.not || '').slice(0, 120), mail: r.mail || '' };
}
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// --- e-posta (Resend). Anahtar yoksa sessizce "ayar-yok" döner. ---
export async function mailGonder(env, { to, subject, html, text, ics }) {
  if (!to) return 'eposta-yok';
  const replyTo = env.OTOMER_REPLY_TO || 'info@otomerizmir.com';
  // 1) Resend anahtarı varsa onu kullan; yoksa Gmail köprüsü (cartemenusistemleri@gmail.com)
  if (!env.RESEND_API_KEY) return gmailGonder(env, { to, subject, html, text, name: 'Otomer', replyTo, ics: ics ? btoa(unescape(encodeURIComponent(ics))) : '' });
  // 2) Resend (yedek)
  const body = { from: env.MAIL_FROM || 'Otomer <randevu@cartemenusistemleri.com.tr>', to: [to], subject, html, text, reply_to: env.OTOMER_REPLY_TO || 'info@otomerizmir.com' };
  if (ics) body.attachments = [{ filename: 'otomer-randevu.ics', content: btoa(unescape(encodeURIComponent(ics))) }];
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? 'gonderildi' : 'hata';
  } catch { return 'hata'; }
}
export function ics(r) {
  const [hh, mm] = r.slot.split('.'), d = r.day.replace(/-/g, '');
  const end = String(Math.min(23, +hh + 1)).padStart(2, '0') + mm;
  const e = v => String(v).replace(/[\\;,]/g, m => '\\' + m).replace(/\n/g, '\\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Otomer//Randevu//TR', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${r.code}@otomerizmir.com`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;TZID=Europe/Istanbul:${d}T${hh}${mm}00`, `DTEND;TZID=Europe/Istanbul:${d}T${end}00`,
    `SUMMARY:${e('Otomer · ' + r.job)}`, `LOCATION:${e('Otomer, ' + ADRES)}`, `DESCRIPTION:${e('Talep kodu: ' + r.code)}`,
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}
// Metal plaka görünümlü e-posta (tablo + satır içi stil: e-posta istemcileri için)
export function plakaMail(r, baslik, aciklama) {
  const row = (l, v) => `<td style="padding:8px 14px 8px 0;vertical-align:top"><div style="font:600 10px Georgia,serif;letter-spacing:3px;color:#4A4F55;text-transform:uppercase">${l}</div><div style="font:500 16px Arial,sans-serif;color:#22262B;margin-top:4px">${esc(v)}</div></td>`;
  return `<!doctype html><html lang="tr"><body style="margin:0;background:#0B0C0D;padding:28px 12px;font-family:Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#D6DADF;background-image:linear-gradient(100deg,#BFC4CA,#E9ECEF 30%,#B6BCC3 57%,#DCE0E4);border-radius:16px;border:1px solid #9AA1A8">
<tr><td style="padding:26px 30px 6px"><table width="100%" role="presentation"><tr><td style="font:600 12px Georgia,serif;letter-spacing:5px;color:#22262B">OTOMER</td><td align="right" style="font:500 11px Georgia,serif;letter-spacing:4px;color:#40454B">RANDEVU KARTI</td></tr></table></td></tr>
<tr><td align="center" style="padding:6px 30px 4px;font:italic 400 54px 'Snell Roundhand','Brush Script MT',cursive;color:#2A2E33">Otomer</td></tr>
<tr><td style="padding:0 30px"><div style="border-top:1px solid #8E949B;margin:6px 0 4px"></div>
<div style="font:600 20px Georgia,serif;color:#22262B;margin:14px 0 4px">${esc(baslik)}</div><div style="font:15px/1.5 Arial,sans-serif;color:#33383E;margin-bottom:10px">${aciklama}</div>
<table role="presentation" width="100%"><tr>${row('Gün ve saat', r.when)}${row('İş', r.job)}</tr><tr>${row('Araç', [r.brand, r.year].filter(Boolean).join(' · '))}${row('Talep kodu', r.code)}</tr></table></td></tr>
<tr><td style="padding:14px 30px 26px;font:14px/1.5 Arial,sans-serif;color:#33383E">${esc(ADRES)} · <a href="https://maps.app.goo.gl/kfHaCNXfLk6vD5QUA" style="color:#22262B">Yol tarifi</a><br>0232 386 33 88 · info@otomerizmir.com</td></tr>
</table></td></tr></table></body></html>`;
}

export async function onRequestPost({ request, env }) {
  const db = kv(env);
  if (!db) return J({ error: 'Kayıt sistemi hazır değil' }, 503);
  let b;
  try { b = await request.json(); } catch { return J({ error: 'Geçersiz istek' }, 400); }
  const r = {
    brand: clean(b.brand, 20), year: clean(b.year, 12), job: clean(b.job, 40),
    day: clean(b.day, 10), slot: clean(b.slot, 5),
    vin: clean(b.vin, 17).toUpperCase(), km: clean(b.km, 12), name: clean(b.name, 80), tel: clean(b.tel, 24),
    email: clean(b.email, 120).toLowerCase()
  };
  if (!['Mercedes-Benz', 'BMW'].includes(r.brand) || !r.job || !/^\d{4}-\d{2}-\d{2}$/.test(r.day) ||
      !/^\d{2}\.\d{2}$/.test(r.slot) || !r.name || r.tel.replace(/\D/g, '').length < 10)
    return J({ error: 'Eksik ya da hatalı bilgi' }, 422);
  if (r.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(r.vin)) return J({ error: 'Şase numarası hatalı' }, 422);
  if (r.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) return J({ error: 'E-posta adresi hatalı' }, 422);

  // basit sınır: aynı IP'den 10 dakikada en fazla 5 talep
  const ip = request.headers.get('cf-connecting-ip') || 'yok';
  const rk = 'otomer:rl:' + ip;
  const n = +(await db.get(rk) || 0);
  if (n >= 5) return J({ error: 'Çok fazla deneme; lütfen 0232 386 33 88\'i arayın' }, 429);
  await db.put(rk, String(n + 1), { expirationTtl: 600 });

  const rnd = crypto.getRandomValues(new Uint8Array(4));
  const code = 'OT-' + r.day.slice(5).replace('-', '') + '-' + [...rnd].map(x => ALPHA[x % ALPHA.length]).join('');
  const rec = { ...r, code, when: whenText(r.day, r.slot), status: 'bekliyor', createdAt: new Date().toISOString() };
  await db.put(PFX + code, JSON.stringify(rec), { metadata: meta(rec) });

  // Otomer'e yeni talep bildirimi (ayarlıysa)
  if (env.OTOMER_BILDIRIM) {
    const satir = [`Talep kodu: ${code}`, `Gün ve saat: ${rec.when}`, `Araç: ${[r.brand, r.year].filter(Boolean).join(' · ')}`, `İş: ${r.job}`, r.vin && `Şase: ${r.vin}`, r.km && `Km: ${r.km}`, `Ad: ${r.name}`, `Telefon: ${r.tel}`, r.email && `E-posta: ${r.email}`].filter(Boolean);
    await mailGonder(env, { to: env.OTOMER_BILDIRIM, subject: `Yeni randevu talebi · ${rec.when} · ${r.name}`,
      text: satir.join('\n') + '\n\nPanel: https://cartemenusistemleri.com.tr/otomer/panel/',
      html: '<pre style="font:14px/1.6 monospace">' + esc(satir.join('\n')) + '</pre><p><a href="https://cartemenusistemleri.com.tr/otomer/panel/">Panele git</a></p>' });  }
  return J({ code, status: 'bekliyor', when: rec.when }, 201);
}

export async function onRequestGet({ request, env }) {
  const db = kv(env);
  if (!db) return J({ error: 'Kayıt sistemi hazır değil' }, 503);
  const code = new URL(request.url).searchParams.get('code') || '';
  if (!/^OT-\d{4}-[A-Z0-9]{4}$/.test(code)) return J({ error: 'Kod hatalı' }, 400);
  const v = await db.get(PFX + code, 'json');
  if (!v) return J({ error: 'Bulunamadı' }, 404);
  return J({ code, status: v.status, when: v.when, day: v.day, slot: v.slot }); // kişisel bilgiler dönmez
}
