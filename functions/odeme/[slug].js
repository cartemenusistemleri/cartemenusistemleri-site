function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function formatIban(iban) {
  return iban.replace(/(.{4})/g, '$1 ').trim();
}

function renderPage(data) {
  const ibanRaw = data.iban;
  const ibanDisplay = formatIban(ibanRaw);
  const isim = data.isim;
  const isletme = data.isletme || '';
  const banka = data.banka || '';
  return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>
<title>Ödeme Bilgileri</title>
<link rel="icon" href="data:,">
<style>
  :root{
    --ink:#4A1826; --ink-soft:#8B6E76; --ink-faint:#B49CA0;
    --surface:#FFFDF8; --surface-2:#FAF3E4; --surface-3:#F3E8D0;
    --line:rgba(74,24,38,0.12);
    --shadow:0 1px 2px rgba(74,24,38,0.04), 0 10px 26px -14px rgba(74,24,38,0.16);
    --page-bg:#4A1826; --page-bg-soft:#5A2130;
    --cream:#FFFDF6; --cream-soft:rgba(255,253,246,0.72);
    --good:#0ca30c;
    color-scheme: light;
  }
  *{ box-sizing:border-box; }
  body{
    background:linear-gradient(180deg, var(--page-bg) 0%, var(--page-bg-soft) 100%); color:var(--ink);
    font-family:'Jost', -apple-system, 'Segoe UI', sans-serif;
    padding-inline:16px; padding-block:36px 60px;
    font-variant-numeric:tabular-nums;
    min-height:100vh;
  }
  h1{ font-family:'Cormorant', Georgia, serif; font-style:italic; font-weight:600; margin:0; font-size:26px; color:var(--cream); }
  p{ margin:0; }
  .wrap{ max-width:480px; margin:0 auto; display:flex; flex-direction:column; gap:22px; align-items:center; }
  .wordmark{ display:flex; align-items:center; gap:10px; }
  .wordmark .logo{ font-family:'Allura',cursive; font-size:36px; color:var(--cream); line-height:1; }
  .wordmark .tag{
    font-size:11px; letter-spacing:0.28em; text-transform:uppercase; color:var(--cream); font-weight:600;
    background:var(--ink); border:1px solid var(--cream); border-radius:999px; padding:4px 11px; display:inline-block;
  }
  .heading{ text-align:center; display:flex; flex-direction:column; gap:6px; }
  .heading .subtitle{ font-size:13.5px; color:var(--cream-soft); }
  .card{
    width:100%; background:var(--surface); border:1px solid var(--line); border-radius:16px;
    box-shadow:var(--shadow); padding:22px 20px 20px; display:flex; flex-direction:column; gap:16px;
  }
  .business-name{
    font-family:'Cormorant', Georgia, serif; font-style:italic; font-weight:600; font-size:19px;
    color:var(--ink); text-align:center; padding-bottom:14px; border-bottom:1px solid var(--line);
  }
  .box{ background:var(--surface-2); border:1px solid var(--line); border-radius:12px; padding:13px 14px; display:flex; flex-direction:column; gap:8px; }
  .box-label{ font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--ink-soft); }
  .box-row{ display:flex; align-items:center; gap:10px; justify-content:space-between; }
  .box-value{ font-family:'Jost',sans-serif; font-size:16.5px; font-weight:600; color:var(--ink); letter-spacing:0.01em; word-break:break-word; line-height:1.35; }
  .box-value.iban-value{ font-variant-numeric:tabular-nums; letter-spacing:0.045em; }
  .copy-btn{
    flex:none; width:38px; height:38px; border-radius:9px; border:1px solid var(--line);
    background:var(--surface); color:var(--ink-soft); cursor:pointer; display:flex; align-items:center; justify-content:center;
    transition:background .15s ease, color .15s ease;
  }
  .copy-btn:hover{ background:var(--surface-3); color:var(--ink); }
  .copy-btn svg{ width:17px; height:17px; }
  .copy-note{ font-size:11.5px; font-weight:600; min-height:14px; }
  .copy-note.good{ color:var(--good); }
  .site-footer{ margin-top:2px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .site-footer-text{ font-size:12px; color:var(--cream-soft); line-height:1.5; max-width:300px; }
  .site-footer-links{ display:flex; align-items:center; gap:10px; }
  .site-footer-links a{
    font-size:12.5px; font-weight:600; color:var(--cream); text-decoration:none;
    border:1px solid rgba(255,253,246,0.28); border-radius:999px; padding:7px 15px;
    transition:background .15s ease;
  }
  .site-footer-links a:hover{ background:rgba(255,253,246,0.12); }
  @media (max-width:420px){ .card{ padding:18px 15px 16px; } }
</style>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Allura&family=Cormorant:ital,wght@0,500;0,600;1,500;1,600&family=Jost:wght@300;400;500;600;700&display=swap">

<div class="wrap">
  <a class="wordmark" href="https://cartemenusistemleri.com.tr/" style="text-decoration:none;"><span class="logo">Carte</span><span class="tag">IBAN ile Öde</span></a>
  <div class="heading">
    <h1>Ödeme Bilgileri</h1>
    <p class="subtitle">Kartı okutan herkes bu bilgilerle havale/EFT gönderebilir.</p>
  </div>
  <div class="card">
    ${isletme ? `<div class="business-name">${esc(isletme)}</div>` : ''}
    ${banka ? `<div class="box">
      <span class="box-label">Banka</span>
      <div class="box-row">
        <span class="box-value" id="bankaDisplay">${esc(banka)}</span>
        <button type="button" class="copy-btn" id="copyBankaBtn" title="Banka adını kopyala">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
      <span class="copy-note" id="copyBankaNote"></span>
    </div>` : ''}
    <div class="box">
      <span class="box-label">IBAN</span>
      <div class="box-row">
        <span class="box-value iban-value" id="ibanDisplay">${esc(ibanDisplay)}</span>
        <button type="button" class="copy-btn" id="copyIbanBtn" title="IBAN'ı kopyala">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
      <span class="copy-note" id="copyIbanNote"></span>
    </div>
    <div class="box">
      <span class="box-label">Hesap Sahibi</span>
      <div class="box-row">
        <span class="box-value" id="adSoyadDisplay">${esc(isim)}</span>
        <button type="button" class="copy-btn" id="copyAdBtn" title="İsmi kopyala">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
      </div>
      <span class="copy-note" id="copyAdNote"></span>
    </div>
  </div>

  <div class="site-footer">
    <p class="site-footer-text">Bu kartı <strong>Carte Menü Sistemleri</strong> hazırladı — siz de işletmeniz için ister misiniz?</p>
    <div class="site-footer-links">
      <a href="https://cartemenusistemleri.com.tr/">İnternet Sitemiz</a>
      <a href="https://instagram.com/cartemenusistemleri" target="_blank" rel="noopener">Instagram</a>
      <a href="mailto:cartemenusistemleri@gmail.com">E-posta</a>
    </div>
  </div>
</div>

<script>
(function(){
  'use strict';
  function copyText(text, cb){
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(function(){ cb(true); }).catch(function(){ cb(false); });
    } else {
      try{
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.focus(); ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        cb(ok);
      }catch(e){ cb(false); }
    }
  }
  function wire(btnId, noteId, text){
    document.getElementById(btnId).addEventListener('click', function(){
      var note = document.getElementById(noteId);
      copyText(text, function(ok){
        note.textContent = ok ? 'Kopyalandı ✓' : 'Kopyalanamadı';
        note.className = 'copy-note ' + (ok ? 'good' : '');
        setTimeout(function(){ note.textContent = ''; }, 2000);
      });
    });
  }
  wire('copyIbanBtn', 'copyIbanNote', ${JSON.stringify(ibanRaw)});
  wire('copyAdBtn', 'copyAdNote', ${JSON.stringify(isim)});
  if (document.getElementById('copyBankaBtn')) wire('copyBankaBtn', 'copyBankaNote', ${JSON.stringify(banka)});
})();
</script>
</body></html>`;
}

function renderNotFound() {
  return `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"><title>Bulunamadı</title><link rel="icon" href="data:,"><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#4A1826;color:#FFFDF6;font-family:-apple-system,'Segoe UI',sans-serif;text-align:center;padding:24px}</style></head><body><div><h1 style="font-size:22px;margin:0 0 8px">Bu bağlantı bulunamadı</h1><p style="opacity:.8;margin:0">Link geçersiz veya kaldırılmış olabilir.</p></div></body></html>`;
}

export async function onRequestGet(context) {
  const slug = context.params.slug;
  if (!slug || Array.isArray(slug)) {
    return new Response(renderNotFound(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  const raw = await context.env.ODEME_LINKS.get(String(slug));
  if (!raw) {
    return new Response(renderNotFound(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return new Response(renderNotFound(), { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  }
  return new Response(renderPage(data), { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
