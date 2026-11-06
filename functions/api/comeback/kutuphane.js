// COMEBACK. — program veritabanı ucu
// GET /api/comeback/kutuphane → { surum, hareketler: [...], sporlar: {...}, sablonlar: [...] }
// Tablolar (D1 COMEBACK_DB): hareketler(id, json, kaynak 'sistem'|'koc', olusturan, guncelleme),
//   sporlar(id, json, guncelleme), sablonlar(id, koc_id, ad, json, herkese_acik, olusturma, guncelleme)
// Ana kaynak /comeback/kutuphane.js: sistem hareketleri ve spor profilleri tablo boşsa ya da eksikse buradan tohumlanır.
// Koçların ekleyeceği hareketler kaynak='koc' olarak aynı tabloda tutulur ve tohumlamada ezilmez.
import * as kut from '../../../comeback/kutuphane.js';

const K = globalThis.CB_KUTUPHANE || (kut && kut.default) || kut;
const json = (veri, durum = 200) => new Response(JSON.stringify(veri), {
  status: durum, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=300' }
});

async function tohumla(db) {
  const t = Date.now();
  const h = Object.values(K.HAREKET).map((x) => db.prepare("INSERT OR REPLACE INTO hareketler (id, json, kaynak, olusturan, guncelleme) VALUES (?, ?, 'sistem', NULL, ?)").bind(x.id, JSON.stringify(x), t));
  const s = Object.keys(K.SPOR).map((id) => db.prepare('INSERT OR REPLACE INTO sporlar (id, json, guncelleme) VALUES (?, ?, ?)').bind(id, JSON.stringify(Object.assign({ id }, K.SPOR[id])), t));
  await db.batch(h.concat(s));
}

export async function onRequestGet({ env }) {
  if (!K || !K.HAREKET) return json({ hata: 'Kütüphane yüklenemedi.' }, 500);
  const db = env.COMEBACK_DB;
  if (!db) return json({ surum: K.surum, hareketler: Object.values(K.HAREKET), sporlar: K.SPOR, sablonlar: [], kaynak: 'dosya' });
  const say = await db.prepare("SELECT COUNT(*) AS n FROM hareketler WHERE kaynak = 'sistem'").first();
  if (!say || say.n < Object.keys(K.HAREKET).length) await tohumla(db);
  const [h, s, sb] = await db.batch([
    db.prepare('SELECT json, kaynak FROM hareketler ORDER BY kaynak, id'),
    db.prepare('SELECT id, json FROM sporlar'),
    db.prepare('SELECT id, ad, json FROM sablonlar WHERE herkese_acik = 1 ORDER BY guncelleme DESC LIMIT 100')
  ]);
  const sporlar = {};
  s.results.forEach((r) => { sporlar[r.id] = JSON.parse(r.json); });
  return json({
    surum: K.surum,
    hareketler: h.results.map((r) => Object.assign(JSON.parse(r.json), { kaynak: r.kaynak })),
    sporlar,
    sablonlar: sb.results.map((r) => ({ id: r.id, ad: r.ad, program: JSON.parse(r.json) }))
  });
}
