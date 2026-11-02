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
export async function mailGonder(env, { to, subject, html, text, ics, kart }) {
  if (!to) return 'eposta-yok';
  const replyTo = env.OTOMER_REPLY_TO || 'info@otomerizmir.com';
  // 1) Resend anahtarı varsa onu kullan; yoksa Gmail köprüsü (cartemenusistemleri@gmail.com)
  if (!env.RESEND_API_KEY) return gmailGonder(env, { to, subject, html, text, name: 'Otomer', replyTo, ics: ics ? btoa(unescape(encodeURIComponent(ics))) : '', kart: kart || '' });
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
// E-posta gövdesi — açık zemin, sitedeki randevu kartı + bilgi kutusu.
// kartVar: panel kartı sitedeki çizimle birebir JPEG olarak yolladıysa (cid:kart) o gösterilir; yoksa
// sitenin yazı tipleriyle önceden çizilmiş başlık görselli (/otomer/eposta/*.png) metal plaka.
// E-posta istemcileri web yazı tipi yüklemediği için başlık ve etiketler görsel, değişken bilgiler metin.
const IMG = 'https://cartemenusistemleri.com.tr/otomer/eposta/';
const SANS = "font-family:'Jost','Helvetica Neue',Helvetica,Arial,sans-serif";
const BW = { onay: 289, iptal: 303, saat: 408 }; // başlık görsellerinin genişliği (px)
export function plakaMail(r, baslik, aciklama, kartVar) {
  const tur = /iptal/.test(baslik) ? 'iptal' : /saati/.test(baslik) ? 'saat' : 'onay';
  const arac = [r.brand, r.year].filter(Boolean).join(' · ');
  const lbl = (k, alt) => `<img src="${IMG}etiket-${k}.png" width="200" height="16" alt="${alt}" style="display:block;border:0;width:200px;height:16px;color:#4A4F55;font-size:10px;letter-spacing:2px">`;
  const cell = (k, alt, v) => `<td valign="top" width="50%" style="padding:0 12px 18px 0">${lbl(k, alt)}<div style="${SANS};font-size:17px;line-height:1.35;font-weight:500;color:#22262B;margin-top:5px">${esc(v)}</div></td>`;
  const kart = kartVar
    ? `<img src="cid:kart" width="600" alt="Otomer randevu kartı · ${esc(r.when)} · ${esc(r.code)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:14px">`
    : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#D6DADF" style="background:#D6DADF;background-image:linear-gradient(100deg,#BFC4CA 0%,#E9ECEF 30%,#B6BCC3 57%,#DCE0E4 100%);border:1px solid #9AA1A8;border-radius:18px"><tr><td style="padding:12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #8F959C;border-radius:10px"><tr><td style="padding:20px 18px 4px">
<img src="${IMG}baslik.png" width="536" alt="OTOMER · Randevu kartı" style="display:block;border:0;width:100%;max-width:536px;height:auto">
<div style="border-top:1px solid #8E949B;margin:12px 0 18px;font-size:0;line-height:0">&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cell('gun', 'GÜN VE SAAT', r.when)}${cell('is', 'İŞ', r.job)}</tr><tr>${cell('arac', 'ARAÇ', arac)}${cell('kod', 'TALEP KODU', r.code)}</tr></table>
</td></tr></table></td></tr></table>`;
  const btn = (href, t, dark) => `<a href="${href}" style="display:inline-block;${SANS};font-size:14px;font-weight:600;text-decoration:none;padding:12px 18px;border-radius:8px;margin:0 8px 8px 0;${dark ? 'background:#22262B;color:#FFFFFF' : 'background:#FFFFFF;color:#22262B;border:1px solid #C9CED4'}">${t}</a>`;
  const ln = 'color:#5A6068;text-decoration:none';
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light">
<style>@import url('https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap');</style></head>
<body style="margin:0;padding:0;background:#E9EBEE">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(baslik)} · ${esc(r.when)} · ${esc(r.code)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#E9EBEE" style="background:#E9EBEE"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
<tr><td>${kart}</td></tr>
<tr><td style="padding-top:14px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="background:#FFFFFF;border-radius:14px;border:1px solid #D9DDE1">
<tr><td style="padding:26px 26px 6px">
<img src="${IMG}baslik-${tur}.png?v=2" width="${BW[tur]}" height="42" alt="${esc(baslik)}" style="display:block;border:0;width:${BW[tur]}px;max-width:100%;height:auto;color:#1E2226;font-size:24px">
<div style="${SANS};font-size:19px;line-height:1.35;font-weight:600;color:#1E2226;margin-top:14px;padding:12px 14px;background:#F2F3F5;border-radius:8px">${esc(r.when)}<div style="font-size:13px;font-weight:400;color:#5A6068;margin-top:3px">${esc(r.job)} · ${esc(arac)}</div></div>
<div style="${SANS};font-size:15px;line-height:1.6;color:#3A3F45;margin-top:12px">${aciklama}</div></td></tr>
<tr><td style="padding:14px 26px 18px">${btn('https://maps.app.goo.gl/kfHaCNXfLk6vD5QUA', 'Yol tarifi', true)}${btn('tel:+902323863388', 'Ara · 0232 386 33 88')}</td></tr>
<tr><td style="padding:0 26px 24px;${SANS};font-size:13px;line-height:1.6;color:#5A6068;border-top:1px solid #ECEEF1"><div style="padding-top:16px"><a href="https://maps.app.goo.gl/kfHaCNXfLk6vD5QUA" style="${ln}">${esc(ADRES)}</a><br><a href="mailto:info@otomerizmir.com" style="${ln}">info@otomerizmir.com</a> · Talep kodu <span style="color:#22262B;font-weight:600;letter-spacing:.04em">${esc(r.code)}</span></div></td></tr>
</table></td></tr>
<tr><td style="padding:16px 4px 0;${SANS};font-size:11px;line-height:1.5;color:#7A8088">Bu e-posta Otomer randevu formundan aldığınız talep için gönderildi. Yanıtlarsanız Otomer'e ulaşır.</td></tr>
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
