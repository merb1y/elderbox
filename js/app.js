/* ============================================================
   Netflix tarzı arayüz — CloudStream içerik akışına bağlı sürüm
   Tüm içerik aktif depodaki sağlayıcılardan gelir (CS.getHome).
   ============================================================ */
'use strict';

/* ---------- Yardımcılar ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function avatarSVG(color) {
  return `<span class="avatar" style="background:${color}">
    <svg viewBox="0 0 100 100">
      <rect x="24" y="34" width="10" height="12" rx="2" fill="#fff"/>
      <rect x="66" y="34" width="10" height="12" rx="2" fill="#fff"/>
      <path d="M30 62 Q50 78 70 62" stroke="#fff" stroke-width="7" fill="none" stroke-linecap="round"/>
    </svg>
  </span>`;
}

const state = {
  profile: null,
  view: 'home',
  homeCache: { rows: [], backendOnly: [], repo: null }, // son getHome sonucu
  typeFilter: null, // ana sayfa tür filtresi (Türler menüsü)
  uid: 0,
};

/* Kart <-> gerçek içerik eşlemesi */
const itemRegistry = new Map();
function registerItem(item, providerName) {
  const uid = 'it' + (++state.uid);
  itemRegistry.set(uid, { item, providerName });
  return uid;
}
const getReg = (uid) => itemRegistry.get(uid) || null;

/* ============================================================
   UYGULAMA GİRİŞİ — profil sistemi kaldırıldı
   ============================================================ */
function enterApp() {
  $('#app').classList.remove('hidden');
  renderHome();
}

/* ============================================================
   DEPO + KANAL SEÇİCİ — ana sayfada tekil seçim
   Depo seçilir, ardından o depo içindeki bir kanal (sağlayıcı)
   seçilir; ana sayfa yalnızca seçili kanalın içeriğini gösterir.
   ============================================================ */
function renderRepoPicker() {
  const wrap = $('#repo-picker');
  const repos = CS.repos;
  if (!repos.length) { wrap.innerHTML = ''; wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const active = CS.getActiveRepo();
  const prov = CS.getActiveProvider(active?.url);
  const counts = Object.fromEntries(repos.map((r) => [r.url, CS.repoProviders(r.url).length]));
  const chans = active ? CS.repoProviders(active.url) : [];

  wrap.innerHTML = `
    <button class="rp-btn" id="rp-btn" title="Depo / Kanal seç">
      ${prov?.iconUrl ? `<img src="${esc(prov.iconUrl.replace('%size%', '64'))}" alt="" onerror="this.style.display='none'">`
        : active?.iconUrl ? `<img src="${esc(active.iconUrl)}" alt="">` : '<span class="rp-mini">CS</span>'}
      <span class="rp-name">${esc(prov ? prov.name : 'Kanal seç')}</span>
      <span class="caret">▾</span>
    </button>
    <div class="dd-menu rp-menu">
      <div class="rp-menu-title">Depo</div>
      ${repos.map((r) => `
        <button class="rp-item ${active && active.url === r.url ? 'active' : ''}" data-url="${esc(r.url)}">
          ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" alt="">` : `<span class="rp-mini">${esc((r.name || 'C')[0])}</span>`}
          <span class="rp-item-name">${esc(r.name)}</span>
          <span class="rp-item-count">${counts[r.url]} sağlayıcı</span>
          ${active && active.url === r.url ? '<span class="rp-check">✓</span>' : ''}
        </button>`).join('')}
      <div class="rp-menu-title rp-chan-title">Kanal <span class="rp-note">seçilen kanalın içeriği gösterilir</span></div>
      ${chans.map((p) => `
        <button class="rp-item ${prov && prov.__key === p.__key ? 'active' : ''}" data-prov="${esc(p.__key)}">
          ${p.iconUrl ? `<img src="${esc(p.iconUrl.replace('%size%', '64'))}" alt="" onerror="this.outerHTML='<span class=&quot;rp-mini&quot;>${esc((p.name || 'K')[0])}</span>'">` : `<span class="rp-mini">${esc((p.name || 'K')[0])}</span>`}
          <span class="rp-item-name">${esc(p.name)}</span>
          ${CS.hasAdapter(p) ? '<span class="cs-badge s-ok">canlı</span>' : '<span class="cs-badge s-slow">masaüstü</span>'}
          ${prov && prov.__key === p.__key ? '<span class="rp-check">✓</span>' : ''}
        </button>`).join('')}
      <button class="rp-item rp-add" data-add>
        <span class="rp-mini">+</span>
        <span class="rp-item-name">Depo ekle / yönet</span>
      </button>
    </div>`;

  $$('.rp-item[data-url]', wrap).forEach((b) => b.addEventListener('click', () => {
    CS.setActiveRepo(b.dataset.url);
    CS.setActiveProviderKey(null); // yeni depoda kanal yeniden seçilir
    renderHome();
  }));
  $$('.rp-item[data-prov]', wrap).forEach((b) => b.addEventListener('click', () => {
    CS.setActiveProviderKey(b.dataset.prov || null);
    renderHome();
  }));
  $('[data-add]', wrap).addEventListener('click', () => {
    $('#settings-btn').click();
  });

  /* Menü ekranın sağ/sol kenarına taşmasın: gereken kaydırmayı hesapla */
  const alignMenu = () => {
    const menu = $('.rp-menu', wrap);
    if (!menu) return;
    const wr = wrap.getBoundingClientRect();
    const half = menu.offsetWidth / 2;
    const center = wr.left + wr.width / 2;
    const pad = 14;
    let shift = 0;
    if (center + half > window.innerWidth - pad) shift = window.innerWidth - pad - (center + half);
    else if (center - half < pad) shift = pad - (center - half);
    menu.style.setProperty('--rp-shift', shift + 'px');
  };
  wrap.addEventListener('mouseenter', alignMenu);
  new MutationObserver(alignMenu).observe(wrap, { attributes: true, attributeFilter: ['class'] });
  alignMenu();
}

/* ============================================================
   ANA SAYFA — hero + sıralar (tamamen aktif depodan)
   ============================================================ */
async function renderHome() {
  state.view = 'home';
  $('#grid-view').classList.add('hidden');
  $('#cs-view').classList.add('hidden');
  $('#hero').classList.remove('hidden');
  $('#rows').classList.remove('hidden');

  let repo0 = CS.getActiveRepo();
  /* Kanal seçimi: hiçbiri seçili değilse ilk canlı kanal, o da yoksa ilk kanal seçilir.
     "Tüm kanallar" modu yok — her zaman tek bir kanal seçili kalır. */
  if (repo0 && !CS.getActiveProviderKey()) {
    const provs = CS.repoProviders(repo0.url);
    const firstLive = provs.find((p) => CS.hasAdapter(p));
    if (firstLive) CS.setActiveProviderKey(firstLive.__key);
    else if (provs.length) CS.setActiveProviderKey(provs[0].__key);
  }
  renderRepoPicker();

  const repo = CS.getActiveRepo();
  const hero = $('#hero');
  const rowsEl = $('#rows');

  if (!repo) {
    hero.innerHTML = `
      <div class="hero-empty">
        <div class="he-logo">CS</div>
        <h1>Henüz depo eklenmedi</h1>
        <p>İçerikler CloudStream depolarından gelen sağlayıcılarla yüklenir.<br>
        Kendi deponu ekleyerek başla — önerilen depolar listesinden seçebilir
        veya elindeki depo adresini yapıştırabilirsin.</p>
        <button class="btn-play" id="he-add">Depo Ekle</button>
      </div>`;
    $('#he-add').addEventListener('click', () => showSettingsView('deps'));
    rowsEl.innerHTML = '';
    return;
  }

  /* Kanal: otomatik seçim yukarıda yapıldı */
  const prov = CS.getActiveProvider(repo.url);

  /* Depoda yüklü kanal yoksa içerik sorgulanmaz — yükleme ekranı göster */
  if (!CS.repoProviders(repo.url).length) {
    hero.innerHTML = `<div class="hero-empty">
      <div class="he-logo">CS</div>
      <h1>Kanal yüklü değil</h1>
      <p>"${esc(repo.name)}" deposu eklendi ama henüz kanal (eklenti) yüklemedin.<br>
      Kanal yüklemeden içerik gösterilmez.</p>
      <button class="btn-play" id="he-channels">Kanal Yükle</button>
    </div>`;
    $('#he-channels').addEventListener('click', () => showSettingsView('deps'));
    rowsEl.innerHTML = '';
    state.homeCache = { rows: [], backendOnly: [], repo, prov: null };
    return;
  }

  /* Hero: seçili kanalın gerçek kimliği (kanal yoksa depo) */
  const liveChip = prov
    ? (CS.hasAdapter(prov)
      ? '<span class="cs-chip live">● canlı — tarayıcıdan içerik gelir</span>'
      : '<span class="cs-chip dim">masaüstü altyapısı gerekli</span>')
    : '';
  hero.innerHTML = `
    <div class="hero-bg" style="background-image:url('${esc(prov?.iconUrl?.replace('%size%', '256') || repo.iconUrl || '')}');opacity:.18"></div>
    <div class="hero-fade-l"></div><div class="hero-fade-b"></div>
    <div class="hero-content hero-repo">
      <div class="hero-tag"><span class="htag-cs">${prov ? 'CLOUDSTREAM KANALI' : 'CLOUDSTREAM DEPOSU'}</span></div>
      <h1 class="hero-repo-name">${esc(prov ? prov.name : repo.name)}</h1>
      ${prov?.description || repo.description ? `<p class="hero-desc">${esc((prov?.description || repo.description || '').slice(0, 240))}</p>` : ''}
      <div class="hero-meta">
        ${liveChip}
        ${prov && prov.__source ? `<span class="cs-chip">kaynak: ${esc(prov.__source)}</span>` : ''}
        ${(prov?.tvTypes || []).map((tv) => `<span class="cs-chip dim">${esc(typeLabel(tv))}</span>`).join('')}
        <span class="cs-chip dim">${esc(repo.name)}</span>
      </div>
      <div class="hero-btns">
        <button class="btn-play" id="hero-browse">İçeriklere Göz At</button>
        <button class="btn-info" id="hero-channel">Kanal / Depo Değiştir</button>
      </div>
    </div>`;
  $('#hero-browse').addEventListener('click', () => $('#rows').scrollIntoView({ behavior: 'smooth' }));
  $('#hero-channel').addEventListener('click', () => {
    const dd = $('#repo-picker');
    if (!dd) return;
    dd.classList.add('open');
    setTimeout(() => dd.classList.remove('open'), 6000);
  });
  // Kaynak sitesini dex'ten çözüp hero'ya işle
  if (prov && !prov.__source) {
    CS.probeSource(prov).then((src) => { if (src && state.view === 'home') renderHome(); });
  }

  /* Sıralar: seçili kanalın (veya tüm kanalların) gerçek HomePageList'leri
     Yüklenirken Netflix tarzı kart iskeletleri + ortalanmış durum pill'i göster */
  const skCard = '<div class="card sk-card"><div class="sk sk-thumb"></div></div>';
  const skRow = `
    <section class="row">
      <div class="row-head"><div class="sk sk-title"></div></div>
      <div class="row-body"><div class="row-track">${skCard.repeat(8)}</div></div>
    </section>`;
  rowsEl.innerHTML = `
    <div class="cs-loading-pill"><span class="spin"></span> İçerik yükleniyor…</div>
    ${skRow}${skRow}`;
  const { rows, backendOnly } = await CS.getHome(repo.url);
  state.homeCache = { rows, backendOnly, repo, prov };

  /* Hero: kanaldan rastgele gerçek bir içerik (Netflix giriş banner'ı gibi) */
  const heroItems = rows.flatMap((r) => r.items).filter((i) => i.poster);
  if (heroItems.length) {
    renderHeroFeatured(heroItems[Math.floor(Math.random() * heroItems.length)], prov, repo);
  }

  const visible = state.typeFilter
    ? rows.map((r) => ({ ...r, items: r.items.filter((i) => i.type === state.typeFilter) })).filter((r) => r.items.length)
    : rows;

  /* İzlemeye devam et — yarım bırakılan içerikler en üstte */
  const cont = CS.getHistory().filter((h) => h.poster && h.posPct > 0.5 && h.posPct < 95);
  const contHtml = cont.length ? rowHTML({ name: 'İzlemeye Devam Et', items: cont }) : '';
  let html = contHtml;
  for (const r of visible) html += rowHTML(r);
  // Yer imleri
  let bms = [];
  try { bms = JSON.parse(localStorage.getItem('cs-bookmarks-v1') || '[]'); } catch {}
  const bmHtml = bms.length ? rowHTML({ name: 'Yer İmleri', items: bms }) : '';

  if (prov && !CS.hasAdapter(prov)) {
    html += `<div class="backend-note">
      <b>Bu kanal masaüstü altyapısı gerekiyor</b>
      <span>${esc(prov.name)}${prov.__source ? ` (kaynak: ${esc(prov.__source)})` : ''} — kaynak sitesi tarayıcıdan doğrudan
      erişilemez. CloudStream altyapısı bağlandığında bu kanalın içeriği burada görünür.</span>
      ${bridgeNoteHtml()}
    </div>`;
  } else if (backendOnly.length && !prov) {
    html += `<div class="backend-note">
      <b>${backendOnly.length} kanal için masaüstü altyapısı gerekiyor:</b>
      <span>${esc(backendOnly.map((p) => p.name).join(', '))}</span>
      ${bridgeNoteHtml()}
    </div>`;
  }
  if (!visible.length && !backendOnly.length) {
    // Not devam-et / yer imleri satırlarını ezmesin
    const note = `<div class="backend-note"><b>Bu kanaldan içerik alınamadı.</b><span>Seçicide başka bir kanal dene veya depoyu yenile.</span></div>`;
    html = contHtml + bmHtml + note;
  } else {
    html += bmHtml;
  }
  rowsEl.innerHTML = html;
  bindCardEvents(rowsEl);
  bindBridgeStart(rowsEl);
}

/* Hero: kanaldan rastgele seçilen içeriğin Netflix tarzı banner'ı */
function renderHeroFeatured(item, prov, repo) {
  const hero = $('#hero');
  const live = item.type === 'Live';
  itemRegistry.set('hero', { item, providerName: item.apiName || prov?.name });
  hero.innerHTML = `
    <div class="hero-bg" style="background-image:url('${esc(item.poster || '')}')"></div>
    <div class="hero-fade-l"></div><div class="hero-fade-b"></div>
    <div class="hero-content hero-repo">
      <div class="hero-tag"><span class="htag-cs">CLOUDSTREAM · ${esc((item.apiName || prov?.name || '').toUpperCase())}</span></div>
      <h1 class="hero-repo-name hero-item-name">${esc(item.name)}</h1>
      <div class="hero-meta">
        <span class="cs-chip">${esc(typeLabel(item.type))}</span>
        ${item.year ? `<span class="cs-chip dim">${esc(item.year)}</span>` : ''}
        ${live ? '<span class="cs-chip live">● canlı</span>' : ''}
        <span class="cs-chip dim">${esc(repo.name)}</span>
      </div>
      <div class="hero-btns">
        <button class="btn-play" id="hero-play">
          <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#000"><path d="M6 4l14 8-14 8z"/></svg> Oynat
        </button>
        <button class="btn-info" id="hero-info">
          <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#fff"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>
          Daha Fazla Bilgi
        </button>
      </div>
    </div>`;
  $('#hero-play').addEventListener('click', () => heroPlay(item));
  $('#hero-info').addEventListener('click', () => openItemModal(item, item.apiName || prov?.name));
}

/* Hero Oynat: film/canlıysa doğrudan, diziyse ilk bölümden */
async function heroPlay(item) {
  if (item.embed) { playItem(item); return; }
  const repoUrl = state.homeCache.repo?.url || CS.getActiveRepo()?.url;
  toast('İçerik çözülüyor…');
  const det = await CS.getDetails(repoUrl, item).catch(() => null);
  if (det?.dataUrl) { playEpisode(item, det.dataUrl, ''); return; }
  if (det?.episodes?.length) {
    const e0 = det.episodes[0];
    const label = `${e0.season ? 'S' + e0.season + ':' : ''}B${e0.episode ?? '?'} ${e0.name || ''}`.trim();
    playEpisode(item, e0.data, label);
    return;
  }
  openItemModal(item, item.apiName);
}

/* HomePageList → HTML satırı */
function rowHTML(r) {
  const cards = r.items.slice(0, 14).map((it) => realCard(it, it.apiName)).join('');
  return `
    <section class="row">
      <div class="row-head">
        <h2 class="row-title">${esc(r.name)}</h2>
        <span class="row-explore">${esc(r.items[0]?.apiName || '')}</span>
      </div>
      <div class="row-body">
        <button class="row-arrow left"><svg viewBox="0 0 24 24"><path d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4-6-6 6-6z"/></svg></button>
        <div class="row-track">${cards}</div>
        <button class="row-arrow right"><svg viewBox="0 0 24 24"><path d="M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12z"/></svg></button>
      </div>
    </section>`;
}

/* Gerçek SearchResponse kartı */
function realCard(item, providerName) {
  const uid = registerItem(item, providerName);
  const poster = item.poster || '';
  return `<div class="card" data-uid="${uid}">
    <div class="card-thumb">
      ${poster
        ? `<img class="card-img" src="${esc(poster)}" alt="${esc(item.name)}" loading="lazy" onerror="this.classList.add('img-broken')">`
        : `<div class="card-img card-noimg"><span>${esc(item.name)}</span></div>`}
      <div class="card-shade"></div>
      <div class="card-title-strip"><div class="card-item-name">${esc(item.name)}</div></div>
      <div class="card-cs"><span>CS · ${esc(providerName || item.apiName || '')}</span></div>
      ${item.posPct ? `<div class="card-progress"><span style="width:${Math.min(100, item.posPct)}%"></span></div>` : ''}
    </div>
  </div>`;
}

/* Kart tıklamaları + hover önizleme */
function bindCardEvents(root) {
  $$('.row-track', root).forEach((track) => {
    const row = track.closest('.row');
    $('.left', row).addEventListener('click', () => track.scrollBy({ left: -track.clientWidth * 0.85 }));
    $('.right', row).addEventListener('click', () => track.scrollBy({ left: track.clientWidth * 0.85 }));
  });
  $$('.card', root).forEach((card) => card.addEventListener('click', () => {
    const reg = getReg(card.dataset.uid);
    if (reg) openItemModal(reg.item, reg.providerName);
  }));
}

/* Hover önizleme — gerçek içerikle */
let pvTimer = null, pvHideTimer = null;
document.addEventListener('mouseover', (e) => {
  const card = e.target.closest('.card');
  if (card && $('#modal-overlay').classList.contains('hidden') && $('#player').classList.contains('hidden')) {
    clearTimeout(pvTimer);
    pvTimer = setTimeout(() => showPreview(card), 450);
  } else if (!e.target.closest('#preview')) {
    schedulePreviewHide(160);
  }
});
function schedulePreviewHide(delay = 0) {
  clearTimeout(pvHideTimer);
  pvHideTimer = setTimeout(() => { if (!$('#preview').matches(':hover')) hidePreview(); }, delay);
}
function hidePreview() { clearTimeout(pvTimer); const pv = $('#preview'); pv.classList.add('hidden'); pv.innerHTML = ''; }
function showPreview(card) {
  const reg = getReg(card.dataset.uid);
  if (!reg) return;
  const { item } = reg;
  const pv = $('#preview');
  const bm = CS.isBookmarked(item.url);
  pv.innerHTML = `
    <div class="pv-img-wrap">
      ${item.poster ? `<img class="pv-img" src="${esc(item.poster)}" alt="">` : `<div class="pv-img card-noimg"><span>${esc(item.name)}</span></div>`}
      <div class="pv-shade"></div>
      <span class="pv-ntag">CS</span>
      <span class="pv-name">${esc(item.name)}</span>
    </div>
    <div class="pv-body">
      <div class="pv-btns">
        <button class="pv-play" data-act="play" title="Oynat"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></button>
        <button class="pv-add ${bm ? 'pv-added' : ''}" data-act="bm" title="${bm ? 'Yer iminden çıkar' : 'Yer imine ekle'}">
          <svg viewBox="0 0 24 24"><path d="${bm ? 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z' : 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'}"/></svg>
        </button>
        <button class="pv-more" data-act="more" title="Daha fazla bilgi"><svg viewBox="0 0 24 24"><path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm12 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"/></svg></button>
      </div>
      <div class="pv-meta">
        <span class="match">${esc(item.apiName || reg.providerName || '')}</span>
        <span class="maturity">${esc(typeLabel(item.type))}</span>
        ${item.year ? `<span>${esc(item.year)}</span>` : ''}
      </div>
    </div>`;
  pv.classList.remove('hidden');
  const r = card.getBoundingClientRect();
  const W = 340, H = pv.offsetHeight || 340;
  let x = r.left + r.width / 2 - W / 2;
  x = Math.max(12, Math.min(x, innerWidth - W - 12));
  let y = r.top - (H - r.height) / 2 - 14;
  y = Math.max(76, Math.min(y, innerHeight - H - 12));
  pv.style.left = x + 'px'; pv.style.top = y + 'px';

  $$('[data-act]', pv).forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const act = b.dataset.act;
    if (act === 'play') { hidePreview(); playItem(item); }
    if (act === 'more') { hidePreview(); openItemModal(item, reg.providerName); }
    if (act === 'bm') {
      const added = CS.toggleBookmark(item);
      b.classList.toggle('pv-added', added);
      toast(added ? 'Yer imine eklendi ✓' : 'Yer iminden çıkarıldı');
    }
  }));
  pv.onmouseenter = () => clearTimeout(pvHideTimer);
  pv.onmouseleave = () => hidePreview();
}

const TYPE_LABELS = { Movie: 'Film', TvSeries: 'Dizi', Anime: 'Anime', Documentary: 'Belgesel', Live: 'Canlı', Others: 'Video', Other: 'Video' };
const typeLabel = (t) => TYPE_LABELS[t] || t || 'İçerik';

/* ============================================================
   İÇERİK DETAY MODALI — gerçek veriyle
   ============================================================ */
async function openItemModal(item, providerName) {
  const m = $('#modal');
  m.innerHTML = `
    <div class="md-backdrop">
      ${item.poster ? `<img class="md-bg" src="${esc(item.poster)}" style="opacity:.55" alt="">` : ''}
      <div class="md-fade"></div>
      <button class="md-close" title="Kapat"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 5.7 18.3 4.3 16.9 10.6 10.6 4.3 4.3 5.7 2.9 12 9.4l4.9-4.9z"/></svg></button>
      <div class="md-head">
        <h2 class="md-item-title">${esc(item.name)}</h2>
        <div class="md-btns">
          <button class="btn-play" style="font-size:17px;padding:8px 22px" data-play>
            <svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg> Oynat
          </button>
          <button class="pv-add ${CS.isBookmarked(item.url) ? 'pv-added' : ''}" style="width:42px;height:42px" data-bm title="Yer imi">
            <svg viewBox="0 0 24 24"><path d="${CS.isBookmarked(item.url) ? 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z' : 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'}"/></svg>
          </button>
        </div>
      </div>
    </div>
    <div class="md-body">
      <div>
        <div class="md-meta">
          <span class="match">${esc(item.apiName || providerName || 'CloudStream')}</span>
          <span class="maturity">${esc(typeLabel(item.type))}</span>
          ${item.year ? `<span class="year">${esc(item.year)}</span>` : ''}
          <span id="md-det-state" class="cs-pill">detaylar yükleniyor…</span>
        </div>
        <p class="md-desc" id="md-desc">Sağlayıcıdan detaylar alınıyor…</p>
      </div>
      <div class="md-facts">
        <div><span class="fl">Kaynak:</span> <span class="fv">${esc(providerName || item.apiName || '')}</span></div>
        <div><span class="fl">Depo:</span> <span class="fv">${esc(state.homeCache.repo?.name || '')}</span></div>
        <div><span class="fl">Bağlantı:</span> <span class="fv md-url">${esc(item.url)}</span></div>
      </div>
    </div>`;

  $('#modal-overlay').classList.remove('hidden');
  document.body.classList.add('no-scroll');

  $('.md-close', m).addEventListener('click', closeModal);
  $('[data-play]', m).addEventListener('click', (ev) => {
    const dataUrl = ev.currentTarget.dataset.playdata;
    if (dataUrl) { closeModal(); playEpisode(item, dataUrl); return; }
    // Anime vb.: bölümler varsa ilk bölümden oynat
    const firstEp = document.querySelector('#modal .md-ep[data-epdata]');
    if (firstEp?.dataset.epdata) { closeModal(); playEpisode(item, firstEp.dataset.epdata); return; }
    closeModal(); playItem(item);
  });
  $('[data-bm]', m).addEventListener('click', (e) => {
    const added = CS.toggleBookmark(item);
    e.currentTarget.classList.toggle('pv-added', added);
    e.currentTarget.innerHTML = `<svg viewBox="0 0 24 24"><path d="${added ? 'M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z' : 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'}"/></svg>`;
    toast(added ? 'Yer imine eklendi ✓' : 'Yer iminden çıkarıldı');
  });

  // Gerçek detaylar
  const repoUrl = state.homeCache.repo?.url || CS.getActiveRepo()?.url;
  const det = await CS.getDetails(repoUrl, item).catch(() => null);
  const st = $('#md-det-state'), desc = $('#md-desc');
  if (det) {
    st.textContent = 'detaylar alındı ✓';
    desc.textContent = det.desc || 'Bu içerik için açıklama sağlanmadı.';
    if (det.creator) { const f = $('.md-facts', m); f.insertAdjacentHTML('afterbegin', `<div><span class="fl">Yapımcı:</span> <span class="fv">${esc(det.creator)}</span></div>`); }
    // Gerçek bölümler (JVM köprüsünden) — Netflix tarzı kapaklı liste
    if (det.episodes?.length) {
      const epsHtml = det.episodes.slice(0, 60).map((e) => {
        const label = `${e.season ? 'S' + e.season + ':' : ''}B${e.episode ?? '?'} ${e.name || ''}`.trim();
        const thumb = e.poster || item.poster || '';
        return `
        <div class="md-ep" data-epdata="${esc(e.data || '')}" data-eplabel="${esc(label)}">
          <div class="md-ep-thumb">
            ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<div class="ep-noimg"></div>'}
            <span class="ep-num">${e.episode ?? '•'}</span>
            <div class="ep-play"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></div>
          </div>
          <div class="md-ep-info">
            <div class="md-ep-row"><b>${esc(e.name || `Bölüm ${e.episode ?? ''}`)}${e.season ? ` · S${e.season}` : ''}</b></div>
            ${e.description ? `<p class="md-ep-desc">${esc(e.description).slice(0, 160)}</p>` : ''}
          </div>
        </div>`;
      }).join('');
      const bodyEl = $('.md-body', m);
      bodyEl.insertAdjacentHTML('afterend', `
        <div class="md-eps-wrap">
          <h3 class="md-sub">Bölümler <span class="cs-pill">${det.episodes.length} bölüm</span></h3>
          <div class="md-eps md-eps-thumbs">${epsHtml}</div>
        </div>`);
      $$('[data-epdata]', m).forEach((el) => el.addEventListener('click', () => {
        if (el.dataset.epdata) playEpisode(item, el.dataset.epdata, el.dataset.eplabel);
      }));
    }
    // Filmse: Oynat gerçek akışı çözsün
    if (det.dataUrl) {
      $('[data-play]', m).dataset.playdata = det.dataUrl;
    }
  } else if (item.embed) {
    st.textContent = 'temel bilgi';
    desc.textContent = 'Bu içerik tarayıcıdan doğrudan oynatılabilir.';
  } else {
    st.textContent = 'masaüstü altyapısı gerekli';
    desc.textContent = 'Bu sağlayıcının içeriği şu an erişilemiyor.';
  }
}

function closeModal() {
  $('#modal-overlay').classList.add('hidden');
  document.body.classList.remove('no-scroll');
}
$('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

/* ============================================================
   OYNATICI — Netflix tarzı, canlı + dizi/film desteği
   ============================================================ */
const player = { idleTimer: null, item: null, links: [], linkIndex: 0, live: false, embed: false, subtitles: [], audioTracks: [], resumeT: 0, lastProgSave: 0, currentData: null };

const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/* Oynatıcı tercihleri (Ayarlar'dan) */
const playerPrefs = {
  get: () => { try { return JSON.parse(localStorage.getItem('nf-player') || '{}'); } catch { return {}; } },
  set: (k, v) => { const s = JSON.parse(localStorage.getItem('nf-player') || '{}'); s[k] = v; localStorage.setItem('nf-player', JSON.stringify(s)); },
};

/* Bağlantı etiketi: kaynak adından Dublaj / Altyazı / dil ayır */
function linkTag(l) {
  const s = `${l.source || ''} ${l.name || ''} ${l.lang || ''}`;
  if (/dublaj|dublajl|t[üu]rk[çc]e\s*ses|dubbed|tr\s*audio/i.test(s)) return 'Dublaj';
  if (/altyaz|alt\s*yaz|altiaz|subtitle|subbed|\bsub\b|vostfr|vf\b/i.test(s)) return 'Altyazı';
  if (/\bEN\b|english|ingilizce|original/i.test(s)) return 'İngilizce';
  if (/\bTR\b|turkce|t[üu]rk[çc]e/i.test(s)) return 'Türkçe';
  return 'Diğer';
}
function poolLinks() {
  const all = player.allLinks || [];
  if (!player.tag || player.tag === 'Tümü') return all;
  return all.filter((l) => linkTag(l) === player.tag);
}

/* Sağlayıcıdan gerçek oynatma bağlantılarını çözüp oynat */
async function playEpisode(item, data, label = '') {
  player.currentData = data;
  const repoUrl = state.homeCache.repo?.url || CS.getActiveRepo()?.url;
  toast('Oynatma bağlantıları çözülüyor…');
  try {
    const res = await CS.links(repoUrl, data);
    let links = Array.isArray(res) ? res : (res.links || []);
    player.subtitles = Array.isArray(res) ? [] : (res.subtitles || []);
    links = links.sort((a, b) => (b.quality || 0) - (a.quality || 0));
    // Canlı yayınlar: akış doğrudan data'da taşınıyor olabilir
    if (!links.length && /\.m3u8|\.mp4|\.ts(\?|$)/i.test(data)) {
      links = [{ url: data, isM3u8: /\.m3u8/i.test(data), source: item.apiName || '', quality: 0 }];
    }
    if (!links.length) { toast('Oynatılabilir bağlantı bulunamadı'); return; }

    player.allLinks = links;
    // Kullanıcının dublaj/altyazı tercihi (Ayarlar) varsa o varyantı başa al
    const pref = playerPrefs.get().prefAudio;
    let pool = links;
    if (pref && pref !== 'Tümü') {
      const tagged = links.filter((l) => linkTag(l) === pref);
      if (tagged.length) pool = tagged.concat(links.filter((l) => linkTag(l) !== pref));
    }

    const live = item.type === 'Live';
    player.links = pool;
    closeModal();
    openPlayerShell(item, { live, label });
    populateQualityMenu(0);
    populateSrcMenu(pool[0]?.url || null);
    populateAudioMenu();

    const session0 = player.session || 0;
    for (let i = 0; i < Math.min(4, pool.length); i++) {
      const ok = await tryPlay(pool[i], i, 0);
      if ((player.session || 0) !== session0) return; // kullanıcı oynatıcıyı kapattı
      if (ok) { populateSrcMenu(pool[i].url); populateAudioMenu(); return; }
      toast(`Sunucu yanıt vermedi, yedek deneniyor…`);
    }
    toast('Hiçbir bağlantı oynatılamadı');
    closePlayer();
  } catch { toast('Bağlantılar çözülemedi'); }
}

/* Ses menüsü — dublaj / orijinal seçenekleri */
function populateAudioMenu() {
  const wrap = $('#p-audio-wrap'), menu = $('#p-audio-menu');
  const links = player.allLinks || [];
  const hlsTracks = (window.__hls && window.__hls.audioTracks) || [];
  const nativeTracks = $('#video').audioTracks ? [...$('#video').audioTracks] : [];
  const tracks = hlsTracks.length ? hlsTracks : nativeTracks;
  const opts = [];
  if (tracks.length > 1) {
    tracks.forEach((t, i) => opts.push({ key: 'hls:' + i, label: t.name || t.label || ('Ses ' + (i + 1)) }));
  } else {
    const seen = new Set();
    links.forEach((l, i) => {
      const tag = linkTag(l);
      const label = tag === 'Diğer' ? 'Orijinal' : tag;
      if (seen.has(label)) return;
      seen.add(label);
      opts.push({ key: 'link:' + i, label });
    });
  }
  if (opts.length < 2) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const cur = player.audioKey || opts[0].key;
  menu.innerHTML = opts.map((o) => `<button class="p-opt ${o.key === cur ? 'active' : ''}" data-audio="${esc(o.key)}">${esc(o.label)}</button>`).join('');
  $$('.p-opt[data-audio]', menu).forEach((b) => b.addEventListener('click', () => { menu.classList.add('hidden'); switchAudio(b.dataset.audio); }));
}

/* Kaynak menüsü — CloudStream'teki gibi tüm bağlantılar (dublaj/altyazı etiketleriyle) */
function populateSrcMenu(currentUrl) {
  const wrap = $('#p-tag-wrap'), menu = $('#p-tag-menu');
  const links = player.allLinks || [];
  const subs = player.subtitles || [];
  if (!links.length && !subs.length) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');

  // Aynı etiket + kaynak adı = aynı sunucunun farklı kaliteleri → tek satıra indir
  const groups = [];
  links.forEach((l, i) => {
    const key = linkTag(l) + '||' + (l.source || '');
    const g = groups.find((x) => x.key === key);
    if (g) { if ((l.quality || 0) > (g.best.quality || 0)) { g.best = l; g.bestIdx = i; } }
    else groups.push({ key, tag: linkTag(l), source: l.source || 'Kaynak', best: l, bestIdx: i });
  });

  const activeIdx = (() => {
    if (currentUrl) { const i = links.findIndex((l) => l.url === currentUrl); if (i >= 0) return i; }
    return player.linkIndex ?? 0;
  })();
  const activeTag = links.length ? linkTag(links[activeIdx] || links[0]) : null;

  let menuHtml = links.length ? groups.map((g) => {
    const active = g.bestIdx === activeIdx || linkTag(links[activeIdx]) === g.tag;
    const q = g.best.quality ? ` · ${g.best.quality}p` : '';
    return `<button class="p-opt ${active ? 'active' : ''}" data-src="${g.bestIdx}">${esc(g.tag)} · ${esc(g.source)}${q}</button>`;
  }).join('') : '';

  // Altyazı dosyaları (CloudStream subtitle callback'leri)
  if (subs.length) {
    menuHtml += `<div class="p-menu-title p-sub-title">Altyazı</div>`;
    menuHtml += subs.map((s, i) =>
      `<button class="p-opt p-sub" data-sub="${i}">${esc(s.source || ('Altyazı ' + (i + 1)))}</button>`).join('');
  }

  menu.innerHTML = menuHtml;
  const subNote = subs.length ? ` · ${subs.length} altyazı` : '';
  const label = activeTag ? `Kaynak: ${esc(activeTag)}${subNote}` : `Altyazı: ${subs.length}`;
  $('#p-tag').innerHTML = `<span class="p-tag-label">${label}</span>`;
  $$('.p-opt[data-src]', menu).forEach((b) => b.addEventListener('click', () => {
    menu.classList.add('hidden');
    playSource(+b.dataset.src);
  }));
  $$('.p-opt[data-sub]', menu).forEach((b) => b.addEventListener('click', () => {
    menu.classList.add('hidden');
    applySubtitle(+b.dataset.sub);
  }));
}

/* Altyazı tracklerini ve overlay'i temizle */
function clearSubtitles() {
  const v = $('#video');
  [...v.textTracks].forEach((t) => t.removeEventListener('cuechange', renderSubCues));
  [...v.querySelectorAll('track')].forEach((t) => t.remove());
  const o = $('#p-sub-overlay');
  o.classList.add('hidden');
  o.innerHTML = '';
}

/* Aktif altyazı cue'larını kendi katmanımızda çiz (kontrol çubuğunun üstünde) */
function renderSubCues(e) {
  const track = e.target;
  const o = $('#p-sub-overlay');
  const cues = track.activeCues ? [...track.activeCues] : [];
  if (!cues.length) { o.classList.add('hidden'); o.innerHTML = ''; return; }
  o.innerHTML = cues.map((c) => {
    const txt = String(c.text || '').replace(/<[^>]+>/g, '').trim();
    return `<span>${esc(txt)}</span>`;
  }).join('');
  o.classList.remove('hidden');
}

/* Altyazı seç → videoya <track> olarak bağla (köprü proxy'si üzerinden) */
async function applySubtitle(idx) {
  const sub = (player.subtitles || [])[idx];
  if (!sub) return;
  const v = $('#video');
  // Eski trackleri temizle
  clearSubtitles();
  const track = document.createElement('track');
  track.kind = 'subtitles';
  track.label = sub.source || sub.lang || 'Altyazı';
  track.srclang = sub.lang || 'tr';
  track.src = '/csproxy?url=' + encodeURIComponent(sub.url);
  track.default = true;
  v.appendChild(track);
  const tt = v.textTracks[v.textTracks.length - 1];
  if (tt) {
    tt.mode = 'hidden'; // native gösterim kapalı; cue'ları kendi katmanımızda çiziyoruz
    tt.addEventListener('cuechange', renderSubCues);
  }
  toast('Altyazı: ' + (sub.source || sub.lang));
}
/* Ses parçası değiştir (HLS track veya farklı video kaynağı) */
async function switchAudio(key) {
  player.audioKey = key;
  if (key.startsWith('hls:')) {
    const idx = +key.slice(4);
    const hls = window.__hls;
    if (hls && hls.audioTracks && hls.audioTracks[idx]) {
      hls.audioTrack = idx;
      populateAudioMenu();
      toast('Ses: ' + (hls.audioTracks[idx].name || hls.audioTracks[idx].label || idx));
      return;
    }
    const v = $('#video');
    if (v.audioTracks && v.audioTracks[idx]) {
      [...v.audioTracks].forEach((t, i) => { t.enabled = i === idx; });
      populateAudioMenu();
      toast('Ses: ' + (v.audioTracks[idx].label || idx));
      return;
    }
  }
  if (key.startsWith('link:')) {
    await playSource(+key.slice(5));
  }
}

async function playSource(idx) {
  const link = player.allLinks[idx];
  if (!link) return;
  const v = $('#video');
  const savedT = player.live ? 0 : v.currentTime;
  window.__hls?.destroy?.();
  window.__hls = null;
  v.removeAttribute('src'); v.load();
  populateSrcMenu(link.url);
  toast(`Kaynak: ${linkTag(link)} · ${link.source || ''}`.trim());
  const ok = await tryPlay(link, idx, savedT);
  if (!ok) { toast('Bu kaynak çalışmıyor'); populateSrcMenu(link.url); }
}

/* Oynatıcı kabuğunu aç */
function openPlayerShell(item, opts = {}) {
  const p = $('#player');
  player.item = item;
  player.embed = !!opts.embed;
  player.live = !!opts.live;
  p.classList.remove('hidden');
  p.classList.toggle('live', player.live);
  p.classList.toggle('embed', player.embed);
  document.body.classList.add('no-scroll');
  $('#p-iframe-wrap').classList.add('hidden');
  $('#p-iframe-wrap').innerHTML = '';
  const v = $('#video');
  v.classList.toggle('hidden', player.embed);
  v.controls = false;
  $('#p-show').textContent = item.name;
  player.label = opts.label || '';
  $('#p-ep').textContent = player.label || item.apiName || '';
  $('#p-live').classList.toggle('hidden', !player.live);
  $('#p-quality-wrap').classList.toggle('hidden', player.embed || !(player.links || []).length);
  $('#player-ui').classList.toggle('hidden', player.embed); // iframe kendi kontrollerine sahip
  /* İzlemeye devam et: bu içerik için kayıtlı konum varsa oynatma başında atla */
  const h = CS.getHistory().find((x) => x.url === item.url);
  player.resumeT = h && h.posPct > 0 && h.posPct < 95 ? (h.atSec || 0) : 0;
  setPlayIcon(!v.paused);
  updateSeekUI();
  wakeControls();
}

/* Tek bağlantıyı dene; oynarsa true döner */
function tryPlay(link, idx = 0, restoreT = 0) {
  player.linkIndex = idx;
  const session = player.session || 0;
  return new Promise((resolve) => {
    const v = $('#video');
    v.muted = !!playerPrefs.get().muteStart;
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(session === (player.session || 0) ? ok : false); // oynatıcı kapandıysa başarısız say
    };
    const resumeAt = restoreT > 0 ? restoreT : (player.resumeT || 0);
    const onPlaying = () => {
      if (resumeAt > 0) {
        try { v.currentTime = resumeAt; } catch {}
        toast(fmtTime(resumeAt) + ' konumundan devam ediliyor');
        player.resumeT = 0;
      }
      setPlayIcon(true);
      done(true);
    };
    const onFatal = () => done(false);
    const cleanup = () => {
      v.removeEventListener('playing', onPlaying);
      window.__hls?.off?.(window.Hls.Events.ERROR, onHlsErr);
      clearTimeout(timer);
    };
    const onHlsErr = (_ev, data) => { if (data.fatal) onFatal(); };
    const timer = setTimeout(() => done(false), 16000);
    v.addEventListener('playing', onPlaying, { once: true });

    const src = '/csproxy?url=' + encodeURIComponent(link.url) +
      (link.referer ? '&referer=' + encodeURIComponent(link.referer) : '');
    try {
      if (link.isM3u8 && window.Hls && window.Hls.isSupported()) {
        window.__hls?.destroy?.();
        const hls = new window.Hls({ manifestLoadingTimeOut: 12000, manifestLoadingMaxRetry: 1, levelLoadingTimeOut: 12000, fragLoadingTimeOut: 20000 });
        // Ayarlar → Veri Kullanımı: akış kalitesi sınırı
        const cap = +(playerPrefs.get().qualityCap || 0);
        if (cap > 0 && hls.levels?.length) {
          const ok = hls.levels.map((l, i) => ({ h: l.height || 0, i })).filter((x) => x.h > 0 && x.h <= cap);
          if (ok.length) hls.autoLevelCapping = Math.max(...ok.map((x) => x.i));
        }
        window.__hls = hls;
        hls.on(window.Hls.Events.ERROR, onHlsErr);
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); setTimeout(() => populateAudioMenu(), 400); });
        if (!player.label) $('#p-ep').textContent = link.source
          ? `Kaynak: ${link.source}${link.quality ? ' · ' + link.quality + 'p' : ''}`
          : (player.item?.apiName || '');
        hls.loadSource(src);
        hls.attachMedia(v);
      } else {
        if (!player.label) $('#p-ep').textContent = link.source ? `Kaynak: ${link.source}` : (player.item?.apiName || '');
        v.src = src;
        v.play().catch(() => {});
        v.onerror = () => done(false);
      }
    } catch { done(false); }
  });
}

/* Kalite menüsü — benzersiz kaliteler */
function populateQualityMenu(activeIdx = 0) {
  const menu = $('#p-quality-menu');
  const uniq = [];
  player.links.forEach((l, i) => {
    const q = l.quality || 0;
    if (!uniq.some((u) => u.q === q)) uniq.push({ q, i });
  });
  uniq.sort((a, b) => b.q - a.q);
  menu.innerHTML = uniq.map((u) => {
    const active = player.links[activeIdx]?.quality === u.q;
    return `<button class="p-opt ${active ? 'active' : ''}" data-i="${u.i}">${u.q > 0 ? u.q + 'p' : 'Oto'}</button>`;
  }).join('');
  $$('.p-opt', menu).forEach((b) => b.addEventListener('click', () => {
    menu.classList.add('hidden');
    switchQuality(+b.dataset.i);
  }));
}

async function switchQuality(idx) {
  if (!player.links[idx]) return;
  const v = $('#video');
  const savedT = player.live ? 0 : v.currentTime;
  window.__hls?.destroy?.();
  window.__hls = null;
  v.removeAttribute('src'); v.load();
  toast(`Kalite: ${player.links[idx].quality ? player.links[idx].quality + 'p' : 'Oto'}`);
  await tryPlay(player.links[idx], idx, savedT);
}

/* Embed akışları (archive.org vb.) — iframe kendi oynatıcısı */
function playItem(item) {
  if (!item.embed) {
    toast('Bu içerik için oynatılabilir bir bağlantı bulunamadı');
    return;
  }
  openPlayerShell(item, { embed: true });
  const w = $('#p-iframe-wrap');
  w.classList.remove('hidden');
  w.innerHTML = `<iframe src="${esc(item.embed)}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen frameborder="0"></iframe>`;
  $('#p-ep').textContent = item.apiName || '';
}

function closePlayer() {
  const v = $('#video');
  saveProgress(true); // kapanmadan önce izleme konumunu kaydet
  player.session = (player.session || 0) + 1; // bekleyen oynatma denemelerini iptal et
  v.pause();
  // WebView2/Chrome'da MSE kaynaklı takılmayı önler: önce medyayı ayır, sonra yok et
  try { window.__hls?.detachMedia?.(); } catch {}
  try { window.__hls?.stopLoad?.(); } catch {}
  try { window.__hls?.destroy?.(); } catch {}
  window.__hls = null;
  try { v.removeAttribute('src'); v.load(); } catch {}
  v.controls = false;
  clearSubtitles();
  $('#p-iframe-wrap').classList.remove('hidden');
  $('#p-iframe-wrap').innerHTML = '';
  $('#player').classList.add('hidden', 'idle');
  document.body.classList.remove('no-scroll');
  player.item = null;
  player.resumeT = 0;
  player.currentData = null;
  player.links = [];
  player.allLinks = [];
  player.subtitles = [];
  if (state.view === 'home') renderHome();
}

function wakeControls() {
  const p = $('#player');
  p.classList.remove('idle');
  clearTimeout(player.idleTimer);
  player.idleTimer = setTimeout(() => p.classList.add('idle'), 3000);
}

/* ---------- Oynatıcı kontrolleri ---------- */
function setPlayIcon(playing) {
  $('#p-play').innerHTML = playing
    ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>';
}

function updateSeekUI() {
  const v = $('#video');
  if (player.live) { $('#p-time').textContent = ''; return; }
  const dur = v.duration || 0;
  const cur = v.currentTime || 0;
  $('#p-played').style.width = dur ? (cur / dur * 100) + '%' : '0%';
  if (v.buffered.length && dur) {
    $('#p-buffer').style.width = (v.buffered.end(v.buffered.length - 1) / dur * 100) + '%';
  }
  $('#p-time').textContent = dur ? `-${fmtTime(dur - cur)}` : '';
}

/* İzleme konumunu geçmişe kaydet (5 saniyede bir; force ile anında) */
function saveProgress(force = false) {
  const v = $('#video');
  if (!player.item || player.live || !v.duration) return;
  const pct = v.currentTime / v.duration * 100;
  if (v.currentTime < 20) return; // çok az izlendi — geçmişe girmesin
  if (!force && pct >= 95) return; // bitmiş içerik devam listesine girmez
  const now = Date.now();
  if (!force && now - (player.lastProgSave || 0) < 5000) return;
  player.lastProgSave = now;
  CS.pushHistory(player.item, pct, Math.floor(v.currentTime), player.currentData);
}

function bindPlayer() {
  const v = $('#video');
  const p = $('#player');

  $('#p-back').addEventListener('click', closePlayer);
  p.addEventListener('mousemove', wakeControls);

  /* Oynat/duraklat */
  const toggle = () => {
    if (!v.src && !window.__hls) return;
    if (v.paused) { v.play().then(() => setPlayIcon(true)).catch(() => {}); }
    else { v.pause(); setPlayIcon(false); }
    wakeControls();
  };
  $('#p-play').addEventListener('click', toggle);
  v.addEventListener('click', toggle);
  v.addEventListener('pause', () => setPlayIcon(false));
  v.addEventListener('play', () => setPlayIcon(true));

  /* İlerleme (yalnız VOD) */
  v.addEventListener('timeupdate', updateSeekUI);
  v.addEventListener('timeupdate', () => saveProgress());
  v.addEventListener('pause', () => saveProgress(true));
  v.addEventListener('progress', updateSeekUI);
  const prog = $('#p-progress');
  const seekTo = (e) => {
    if (player.live || !v.duration) return;
    const r = prog.getBoundingClientRect();
    v.currentTime = Math.min(0.999, Math.max(0, (e.clientX - r.left) / r.width)) * v.duration;
    updateSeekUI();
  };
  let scrubbing = false;
  prog.addEventListener('mousedown', (e) => { scrubbing = true; seekTo(e); });
  window.addEventListener('mousemove', (e) => { if (scrubbing) seekTo(e); });
  window.addEventListener('mouseup', () => { scrubbing = false; });
  prog.addEventListener('mousemove', (e) => {
    if (player.live || !v.duration) return;
    const r = prog.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const tip = $('#p-tip');
    tip.style.left = pct * 100 + '%';
    tip.textContent = fmtTime(pct * v.duration);
  });

  /* 10 sn atla */
  $('#p-back10').addEventListener('click', () => { v.currentTime = Math.max(0, v.currentTime - 10); });
  $('#p-fwd10').addEventListener('click', () => { if (v.duration) v.currentTime = Math.min(v.duration - 0.5, v.currentTime + 10); });

  /* Ses — sessizde çubuk da sıfırlanır, açınca eski seviyeye döner (Netflix tarzı) */
  let lastVol = 1;
  const volIcon = () => {
    const slider = $('#p-vol');
    slider.value = v.muted || v.volume === 0 ? 0 : Math.round(v.volume * 100);
    $('#p-mute').innerHTML = v.muted || v.volume === 0
      ? '<svg viewBox="0 0 24 24"><path d="M16.5 12A4.5 4.5 0 0 0 14 8v2.2l2.5 2.5zM19 12a7.5 7.5 0 0 1-1.2 4.1l1.5 1.5A9.4 9.4 0 0 0 21 12c0-4.1-2.9-7.6-6.7-8.6v2.1A7.5 7.5 0 0 1 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3a7.5 7.5 0 0 1-2.3 1.4v2.1a9.3 9.3 0 0 0 3.9-2l2 2L21 19zM12 4 9.9 6.1 12 8.2z"/></svg>'
      : v.volume < 0.5
        ? '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm11.5 3A3.5 3.5 0 0 0 12 8.9v6.2a3.5 3.5 0 0 0 2.5-3.1z"/></svg>'
        : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9zm11.5 3A3.5 3.5 0 0 0 12 8.9v6.2a3.5 3.5 0 0 0 2.5-3.1zM14 2.3v2.1A7.5 7.5 0 0 1 14 19.6v2.1a9.4 9.4 0 0 0 0-19.4z"/></svg>';
  };
  const toggleMute = () => {
    if (v.muted || v.volume === 0) {
      v.muted = false;
      if (v.volume === 0) v.volume = lastVol || 0.5;
    } else {
      if (v.volume > 0) lastVol = v.volume;
      v.muted = true;
    }
    volIcon();
  };
  v.volume = 1;
  volIcon();
  $('#p-mute').addEventListener('click', toggleMute);
  $('#p-vol').addEventListener('input', (e) => { v.volume = e.target.value / 100; v.muted = false; volIcon(); });

  /* Kalite menüsü */
  $('#p-quality').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#p-quality-menu').classList.toggle('hidden');
  });
  /* Ses menüsü */
  $('#p-audio').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#p-audio-menu').classList.toggle('hidden');
  });
  /* Dublaj / Altyazı menüsü */
  $('#p-tag').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#p-tag-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#p-quality-wrap')) $('#p-quality-menu').classList.add('hidden');
    if (!e.target.closest('#p-tag-wrap')) $('#p-tag-menu').classList.add('hidden');
    if (!e.target.closest('#p-audio-wrap')) $('#p-audio-menu').classList.add('hidden');
  });

  /* Tam ekran — masaüstü kabuğunda HTML fullscreen çalışmaz, pencereyi büyütür */
  const toggleFullscreen = () => {
    if (document.body.classList.contains('desktop-shell')) {
      window.pywebview?.api?.toggle_maximize();
      return;
    }
    if (document.fullscreenElement) document.exitFullscreen();
    else p.requestFullscreen?.();
  };
  $('#p-full').addEventListener('click', toggleFullscreen);

  /* Klavye */
  document.addEventListener('keydown', (e) => {
    if (!p.classList.contains('hidden')) {
      switch (e.key) {
        case ' ': e.preventDefault(); toggle(); break;
        case 'ArrowLeft': if (!player.live) v.currentTime = Math.max(0, v.currentTime - 10); wakeControls(); break;
        case 'ArrowRight': if (!player.live && v.duration) v.currentTime = Math.min(v.duration - 0.5, v.currentTime + 10); wakeControls(); break;
        case 'ArrowUp': e.preventDefault(); v.volume = Math.min(1, v.volume + 0.1); volIcon(); break;
        case 'ArrowDown': e.preventDefault(); v.volume = Math.max(0, v.volume - 0.1); volIcon(); break;
        case 'm': toggleMute(); break;
        case 'f': toggleFullscreen(); break;
        case 'Escape': if (!document.fullscreenElement) closePlayer(); break;
      }
      return;
    }
    if (e.key === 'Escape' && !$('#modal-overlay').classList.contains('hidden')) closeModal();
  });
}

/* ============================================================
   CLOUDSTREAM KÖPRÜSÜ — eksik altyapıyı başlatma rehberi
   ============================================================ */
function bridgeNoteHtml() {
  if (CS.bridgeOk) return '';
  return `<div class="bridge-help">
    <button class="btn-play" id="bridge-start">CloudStream altyapısını başlat</button>
    <span class="bridge-hint">Kurulu değilse github.com/merb1y/elderbox → Releases altındaki
    <b>CloudStream-4.8.0.exe</b> uygulamasını indir ve kur. Elderbox, CloudStream açıkken
    kanalları otomatik olarak ona bağlar.</span>
  </div>`;
}

function bindBridgeStart(root) {
  const btn = $('#bridge-start', root) || document.getElementById('bridge-start');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', async () => {
    if (!window.pywebview) {
      toast("Masaüstü uygulamasında kullanılabilir — tarayıcıda CloudStream uygulamasını elle başlat");
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Başlatılıyor… (ilk kurulum birkaç dakika sürebilir)';
    toast('CloudStream altyapısı başlatılıyor…');
    try { await window.pywebview.api.start_bridge(); } catch {}
    let ok = await CS.ensureBridge(true);
    let tries = 0;
    while (!ok && tries < 60) { // MSI kurulumu 1-2 dk sürebilir
      await new Promise((r) => setTimeout(r, 3000));
      ok = await CS.ensureBridge(true);
      tries++;
      if (tries % 5 === 0) btn.textContent = `Kuruluyor… (${tries * 3} sn)`;
    }
    if (ok) {
      toast('CloudStream altyapısı bağlandı ✓');
      renderHome();
    } else {
      toast('Bağlanılamadı — CloudStream uygulamasını elle başlatıp tekrar dene');
      btn.disabled = false;
      btn.textContent = 'Tekrar dene';
    }
  });
}

/* ============================================================
   NAVBAR / ARAMA / GÖRÜNÜMLER
   ============================================================ */
function bindNavbar() {
  window.addEventListener('scroll', () => {
    $('#navbar').classList.toggle('scrolled', scrollY > 28);
  }, { passive: true });

  // Bildirimler — depo durumu
  const n = CS.repos.length;
  $('#notif-menu').innerHTML = n
    ? `<div class="notif-item"><div class="ni-body">
        <span class="ni-t">${n} depo kurulu</span>
        <span class="ni-s">Aktif depo: ${esc(CS.getActiveRepo()?.name || '—')}</span>
        <span class="ni-b">CloudStream sekmesinden yönet</span>
      </div></div>`
    : `<div class="notif-item"><div class="ni-body"><span class="ni-t">Depo yok</span><span class="ni-s">İçerik için depo ekle</span></div></div>`;

  // Arama
  const sbox = $('#search-box'), sinput = $('#search-input');
  $('#search-toggle').addEventListener('click', () => {
    sbox.classList.toggle('open');
    if (sbox.classList.contains('open')) sinput.focus();
    else { sinput.value = ''; sinput.dispatchEvent(new Event('input')); }
  });
  let searchSeq = 0;
  sinput.addEventListener('input', async () => {
    const q = sinput.value.trim();
    if (!q) { restoreHome(); return; }
    const seq = ++searchSeq;
    const res = await CS.getSearch(CS.getActiveRepo()?.url, q).catch(() => []);
    if (seq !== searchSeq) return; // eski sonuç
    const reg = res.map((it) => registerItem(it, it.apiName));
    showGridView(`"${q}" — ${res.length} sonuç`, res, reg);
  });

  // Görünümler
  $$('.nav-link[data-view]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    $$('.nav-link').forEach((x) => x.classList.remove('active'));
    a.classList.add('active');
    const v = a.dataset.view;
    state.view = v;
    state.typeFilter = null;
    window.scrollTo(0, 0);
    $('#search-box').classList.remove('open'); sinput.value = '';
    if (v === 'home') { renderHome(); return; }
    if (v === 'cs') { showSettingsView(); return; }

    const { rows, backendOnly, repo } = state.homeCache;
    const all = rows.flatMap((r) => r.items);
    const uniq = [...new Map(all.map((i) => [i.url, i])).values()];

    if (v === 'series') {
      const list = uniq.filter((i) => i.type === 'TvSeries' || i.type === 'Anime');
      showGridView('Diziler — ' + (repo?.name || ''), list, null, list.length ? null : 'Bu depoda dizi türü içerik bulunamadı.');
    } else if (v === 'movies') {
      const list = uniq.filter((i) => i.type === 'Movie');
      showGridView('Filmler — ' + (repo?.name || ''), list, null, list.length ? null : 'Bu depoda film türü içerik bulunamadı.');
    } else if (v === 'new') {
      const list = [...uniq].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 40);
      showGridView('Yeniler — ' + (repo?.name || ''), list, null, list.length ? null : 'İçerik yüklenemedi.');
    } else if (v === 'list') {
      showBookmarksView();
    }
  }));

  $('#settings-btn').addEventListener('click', () => showSettingsView());
}

function showBookmarksView() {
  const bms = CS.bookmarks ? [] : [];
  // CS.bookmarks getter'ı yok; localStorage'dan al
  let items = [];
  try { items = JSON.parse(localStorage.getItem('cs-bookmarks-v1') || '[]'); } catch {}
  const reg = items.map((it) => registerItem(it, it.apiName));
  showGridView('Listem', items, reg, items.length ? null : 'İçerik kartlarındaki + düğmesiyle yer imi ekleyebilirsin.');
}

function showGridView(title, items, regIds = null, emptyMsg = null) {
  window.scrollTo(0, 0);
  $('#hero').classList.add('hidden');
  $('#rows').classList.add('hidden');
  $('#cs-view').classList.add('hidden');
  $('#grid-view').classList.remove('hidden');
  $('#grid-title').textContent = title;
  if (!items || !items.length) {
    $('#grid-cards').innerHTML = `<div class="no-results"><b>${esc(emptyMsg || 'Sonuç bulunamadı')}</b>Aktif depoyu değiştirebilir veya başka depo ekleyebilirsin.</div>`;
    return;
  }
  $('#grid-cards').innerHTML = items.map((it) => realCard(it, it.apiName)).join('');
  bindCardEvents($('#grid-cards'));
}

function restoreHome() {
  renderHome();
}

/* ============================================================
   CLOUDSTREAM GÖRÜNÜMÜ (depo/eklenti yönetimi)
   ============================================================ */
let csFilterTV = 'all';
let settingsPanel = 'engine';

function showSettingsView(panel) {
  window.scrollTo(0, 0);
  $('#hero').classList.add('hidden');
  $('#rows').classList.add('hidden');
  $('#grid-view').classList.add('hidden');
  $('#cs-view').classList.remove('hidden');
  $$('.nav-link').forEach((x) => x.classList.remove('active'));
  $('#cs-engine-badge').textContent = CS.bridgeOk
    ? 'JVM köprüsü bağlı — 127.0.0.1:8765'
    : (CS.desktop() ? 'Masaüstü altyapısı bağlı' : 'Web köprüsü (kısıtlı)');
  $('#cs-jsdelivr').checked = CS.settings.jsdelivrProxy;
  renderCSOfficial();
  renderCSRepos();
  renderCSPlugins();
  showSettingsPanel(panel || settingsPanel || 'engine');
}

function showSettingsPanel(name) {
  settingsPanel = name;
  $$('.set-tab').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  $$('.set-panel').forEach((s) => { s.hidden = s.dataset.panel !== name; });
}

function csStatus(msg, cls = '') {
  for (const id of ['#cs-status', '#cs-status-official']) {
    const el = $(id);
    if (el) { el.textContent = msg; el.className = 'cs-hint ' + cls; }
  }
}

function repoDisplayName(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'raw.githubusercontent.com') {
      const p = u.pathname.split('/').filter(Boolean);
      return `${p[0]} / ${p[1]}`;
    }
    return u.hostname;
  } catch { return url; }
}

async function renderCSOfficial() {
  const wrap = $('#cs-official-list');
  wrap.innerHTML = '<p class="cs-empty">Resmî veritabanı yükleniyor…</p>';
  const list = await CS.officialRepos();
  if (!list.length) {
    wrap.innerHTML = '<p class="cs-empty">Resmî depo listesine ulaşılamadı — depo adresini yukarıdan ekleyebilirsin.</p>';
    return;
  }
  $('#cs-official-note').textContent = `resmî veritabanı · ${list.length} depo`;
  wrap.innerHTML = list.slice(0, 12).map((r) => `
    <div class="cs-official-item" data-url="${esc(r.url)}">
      <div>
        <div class="coi-name">${esc(r.name || repoDisplayName(r.url))} ${r.verified ? '<span class="cs-verified">DOĞRULANMIŞ</span>' : ''}</div>
        <div class="coi-url">${esc(r.url)}</div>
      </div>
      <button class="cs-official-add">${CS.repos.some((x) => x.url === r.url) ? 'Eklendi ✓' : '+ Ekle'}</button>
    </div>`).join('');
  $$('.cs-official-item', wrap).forEach((item) => item.addEventListener('click', () => csAddRepoFlow(item.dataset.url)));
}

function renderCSRepos() {
  const wrap = $('#cs-repo-list');
  $('#cs-repo-count').textContent = CS.repos.length ? `${CS.repos.length} depo` : '';
  const activeUrl = CS.getActiveRepoUrl();
  renderRepoPicker(); // navbar seçicisini de tazele
  if (!CS.repos.length) {
    wrap.innerHTML = '<p class="cs-empty">Henüz depo eklenmedi.</p>';
    return;
  }
  wrap.innerHTML = CS.repos.map((r) => {
    const cnt = CS.plugins.filter((p) => p.repoUrl === r.url).length;
    const isActive = activeUrl === r.url || (!activeUrl && CS.repos[0].url === r.url);
    return `<div class="cs-repo-item">
      <div class="cri-head">
        ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" style="width:22px;height:22px;border-radius:4px;object-fit:contain" alt="">` : ''}
        <span class="cri-name">${esc(r.name)}</span>
        ${isActive ? '<span class="cs-verified">AKTİF</span>' : ''}
        <span class="cs-pill">${cnt} eklenti</span>
      </div>
      <div class="cri-desc">${esc(r.description || '')}</div>
      <div class="cri-url">${esc(r.url)}</div>
      <div class="cri-foot">
        <button class="cs-mini" data-refresh="${esc(r.url)}">Yenile</button>
        <button class="cs-mini" data-activate="${esc(r.url)}">${isActive ? 'Aktif ✓' : 'Aktifleştir'}</button>
        <button class="cs-mini danger" data-remove="${esc(r.url)}">Kaldır</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-refresh]', wrap).forEach((b) => b.addEventListener('click', () => csAddRepoFlow(null, b.dataset.refresh)));
  $$('[data-activate]', wrap).forEach((b) => b.addEventListener('click', () => {
    CS.setActiveRepo(b.dataset.activate);
    csStatus('Aktif depo güncellendi — ana sayfa bu depodan içerik gösterecek', 'ok');
    renderCSRepos();
  }));
  $$('[data-remove]', wrap).forEach((b) => b.addEventListener('click', () => {
    CS.removeRepo(b.dataset.remove);
    csStatus('Depo kaldırıldı');
    renderCSRepos(); renderCSPlugins(); renderCSOfficial();
  }));
}

function renderCSPlugins() {
  const wrap = $('#cs-plugin-list');
  const all = CS.plugins;
  $('#cs-plugin-count').textContent = all.length ? `${all.length} eklenti` : '';
  if (!all.length) {
    wrap.innerHTML = '<p class="cs-empty">Kurulu eklenti yok — depo eklediğinde eklentiler otomatik yüklenir.</p>';
    return;
  }
  const filtered = csFilterTV === 'all'
    ? all
    : all.filter((p) => (p.tvTypes || []).includes(csFilterTV) || (csFilterTV === 'Movie' && !(p.tvTypes || []).length));
  if (!filtered.length) {
    wrap.innerHTML = '<p class="cs-empty">Bu türde eklenti yok.</p>';
    return;
  }
  wrap.innerHTML = filtered.map((p) => {
    const s = p.status ?? 1;
    const scls = { 0: 's-down', 1: 's-ok', 2: 's-slow', 3: 's-beta' }[s] || 's-ok';
    const installed = p.installed !== false;
    const ad = installed ? (CS.bridgeOk ? 'canlı' : (IA_MATCH(p) ? 'canlı' : null)) : null;
    const icon = p.iconUrl
      ? `<img src="${esc(p.iconUrl.replace('%size%', '64'))}" alt="" loading="lazy" onerror="this.style.display='none'">`
      : `<span class="pi-fallback">${esc((p.name || 'P')[0])}</span>`;
    const actions = installed
      ? `<div class="cs-plugin-actions"><button class="cs-mini danger" data-remove-p="${esc(p.__key)}">Kaldır</button></div>`
      : `<div class="cs-plugin-actions"><button class="cs-install-btn" data-install="${esc(p.__key)}">Yükle</button></div>`;
    return `<div class="cs-plugin-item ${installed ? '' : 'disabled'}">
      <div class="cs-plugin-icon">${icon}</div>
      <div class="cs-plugin-body">
        <div class="cs-plugin-name">${esc(p.name)} <span class="cs-badge ${scls}">${CS.STATUS_LABEL[s] || 'Bilinmiyor'}</span>${ad ? `<span class="cs-badge s-ok">ana sayfada canlı</span>` : (installed ? '' : '<span class="cs-badge tv">yüklü değil</span>')}</div>
        <div class="cs-plugin-meta">
          ${p.language ? `<span class="cs-badge lang">${esc(p.language)}</span>` : ''}
          ${(p.tvTypes || []).map((tv) => `<span class="cs-badge tv">${esc(tv)}</span>`).join('')}
          ${p.version ? `<span class="cs-badge tv">v${p.version}</span>` : ''}
        </div>
        <p class="cs-plugin-desc">${esc(p.description || 'Açıklama yok.')}</p>
        <div class="cs-plugin-repo">${esc(p.repoName || '')}${p.__source ? ` · kaynak: <b>${esc(p.__source)}</b>` : ''}</div>
      </div>
      ${actions}
    </div>`;
  }).join('');

  $$('[data-install]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const p = CS.plugins.find((x) => x.__key === b.dataset.install);
    if (!p) return;
    b.disabled = true; b.textContent = 'Yükleniyor…';
    try {
      await CS.installPlugin(b.dataset.install);
      toast(`${p.name} yüklendi ✓`);
    } catch (e) {
      toast('Yükleme başarısız: ' + e.message);
    }
    // Depo görünümündeyken ana menüye atlamayı önle; yalnızca ana sayfa görünürse yenile
    renderCSPlugins();
    renderCSRepos();
    if ($('#cs-view').classList.contains('hidden')) renderHome();
  }));
  $$('[data-remove-p]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const p = CS.plugins.find((x) => x.__key === b.dataset.removeP);
    await CS.uninstallPlugin(b.dataset.removeP);
    toast(`${p?.name || 'Eklenti'} kaldırıldı`);
    // Depo görünümündeyken ana menüye atlamayı önle; yalnızca ana sayfa görünürse yenile
    renderCSPlugins();
    renderCSRepos();
    if ($('#cs-view').classList.contains('hidden')) renderHome();
  }));

  // Kaynak siteleri dex'ten çöz (arka planda, kartları zenginleştir)
  (async () => {
    for (const p of filtered.slice(0, 40)) {
      const src = await CS.probeSource(p);
      const card = [...wrap.querySelectorAll('.cs-plugin-item')].find((el) =>
        el.querySelector('.cs-plugin-name')?.textContent.startsWith(p.name));
      const line = card?.querySelector('.cs-plugin-repo');
      if (line && src) line.innerHTML = `${esc(p.repoName || '')} · kaynak: <b>${esc(src)}</b>`;
      else if (line) line.innerHTML = esc(p.repoName || '');
    }
  })();
}

const IA_MATCH = (p) => /internetarchive|dailymotion|invidious/i.test(p.internalName + ' ' + p.name);

async function csAddRepoFlow(input, presetUrl = null) {
  const value = presetUrl || input || $('#cs-repo-input').value;
  if (!value) return;
  csStatus('Depo yükleniyor…');
  const addBtn = $('#cs-repo-add');
  addBtn.disabled = true;
  try {
    const { repository, added, total, errors } = await CS.addRepo(value);
    csStatus(`"${repository.name}" eklendi — ${added} yeni eklenti kuruldu (toplam ${total}).${errors.length ? ' Hatalar: ' + errors.join(' | ') : ''}`, 'ok');
    $('#cs-repo-input').value = '';
    renderCSRepos(); renderCSPlugins(); renderCSOfficial();
  } catch (e) {
    csStatus('Depo eklenemedi: ' + e.message, 'err');
  } finally {
    addBtn.disabled = false;
  }
}

function bindCSView() {
  $('#cs-repo-add').addEventListener('click', () => csAddRepoFlow());
  $('#cs-repo-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') csAddRepoFlow(); });
  $('#cs-jsdelivr').addEventListener('change', (e) => {
    CS.setSetting('jsdelivrProxy', e.target.checked);
    csStatus(e.target.checked ? 'jsdelivr proxy açık' : 'jsdelivr proxy kapalı', 'ok');
  });
  $$('.cs-filter').forEach((b) => b.addEventListener('click', () => {
    $$('.cs-filter').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    csFilterTV = b.dataset.tv;
    renderCSPlugins();
  }));
  $$('.set-tab').forEach((b) => b.addEventListener('click', () => showSettingsPanel(b.dataset.panel)));

  /* Netflix ayarları — kalıcı tercihler */
  const prefs = playerPrefs.get();
  $('#nf-pin').checked = !!prefs.pin;
  $('#nf-autonext').checked = prefs.autoNext !== false;
  $('#nf-mutestart').checked = !!prefs.muteStart;
  $('#nf-pref-audio').value = prefs.prefAudio || 'Tümü';
  $('#nf-quality-cap').value = String(prefs.qualityCap || 0);
  $('#nf-pin').addEventListener('change', (e) => { playerPrefs.set('pin', e.target.checked); toast(e.target.checked ? 'PIN koruması açıldı' : 'PIN koruması kapandı'); });
  $('#nf-autonext').addEventListener('change', (e) => playerPrefs.set('autoNext', e.target.checked));
  $('#nf-mutestart').addEventListener('change', (e) => playerPrefs.set('muteStart', e.target.checked));
  $('#nf-pref-audio').addEventListener('change', (e) => playerPrefs.set('prefAudio', e.target.value));
  $('#nf-quality-cap').addEventListener('change', (e) => { playerPrefs.set('qualityCap', +e.target.value); toast(e.target.value === '0' ? 'Kalite sınırı: Otomatik' : 'Kalite sınırı: ' + e.target.value + 'p'); });
}

/* İlk açılış: KULLANICIYA DEPO DAYATILMAZ.
   CloudStream gibi boş arayüz gelir; kullanıcı kendi deposunu
   Ayarlar → Depo Ekle'den kurar. Önerilen depolar listesi
   (resmî veritabanı) her zaman orada hazır bekler. */
function csAutoInit() {
  // Bilinçli olarak boş: otomatik depo kurulumu yok.
}

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ============================================================
   BAŞLAT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  bindNavbar();
  bindPlayer();
  bindCSView();
  enterApp();
  csAutoInit();
});

/* ============================================================
   MASAÜSTÜ KABUĞU — çerçevesiz pencere (NetflixUI.exe)
   Düğmeler + kenardan boyutlandırma. Tarayıcıda pywebview
   olmadığından düğmeler görünmez kalır; özel scrollbar her yerde.
   ============================================================ */
function bindWindowControls() {
  document.body.classList.add('desktop-shell');
  const api = window.pywebview.api;
  const maxBtn = $('#win-max');
  $('#win-min').addEventListener('click', () => api.minimize());
  $('#win-max').addEventListener('click', () => api.toggle_maximize());
  $('#win-close').addEventListener('click', () => api.close());
  window.addEventListener('win-maximize', (e) => {
    maxBtn.innerHTML = e.detail
      ? '<svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/><path d="M3.5 1.5V0.5h8v8h-1" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
      : '<svg viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
  });
  bindWindowResize(api);
}

/* Kenarlardan sürükleyerek boyutlandırma (sağ / alt / köşe) */
function bindWindowResize(api) {
  ['win-resize-e', 'win-resize-s', 'win-resize-se'].forEach((id) => {
    const h = document.getElementById(id);
    if (!h) return;
    h.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      h.setPointerCapture(e.pointerId);
      const dir = id === 'win-resize-e' ? 'e' : id === 'win-resize-s' ? 's' : 'se';
      const sx = e.screenX, sy = e.screenY;
      const sw = window.innerWidth, sh = window.innerHeight;
      let w = sw, ht = sh, raf = 0;
      const apply = () => {
        raf = 0;
        api.resize_to(Math.round(w), Math.round(ht));
      };
      const onMove = (ev) => {
        if (dir !== 's') w = Math.max(960, sw + ev.screenX - sx);
        if (dir !== 'e') ht = Math.max(600, sh + ev.screenY - sy);
        if (!raf) raf = requestAnimationFrame(apply);
      };
      const onUp = () => {
        h.removeEventListener('pointermove', onMove);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
        api.resize_to(Math.round(w), Math.round(ht));
      };
      h.addEventListener('pointermove', onMove);
      h.addEventListener('pointerup', onUp, { once: true });
      h.addEventListener('pointercancel', onUp, { once: true });
    });
  });
}

/* ============================================================
   NETFLIX TARZI ÖZEL KAYDIRMA ÇUBUĞU — imleç sağ kenara gelince
   yumuşak animasyonla belirir, kullanılmayınca kaybolur.
   ============================================================ */
function bindCustomScrollbar() {
  if (document.getElementById('win-scrollbar')) return;
  const bar = document.createElement('div');
  bar.id = 'win-scrollbar';
  bar.innerHTML = '<div class="wsb-track"><div class="wsb-thumb"></div></div>';
  document.body.appendChild(bar);
  const thumb = bar.querySelector('.wsb-thumb');
  let hideTimer = 0, dragging = false;

  const metrics = () => {
    const doc = document.documentElement;
    return {
      max: doc.scrollHeight - window.innerHeight,
      trackH: bar.clientHeight - 4,
    };
  };
  const update = () => {
    const { max, trackH } = metrics();
    if (max <= 4) { thumb.style.height = '0px'; thumb.style.top = '0px'; bar.classList.remove('visible'); return; }
    const th = Math.max(34, (window.innerHeight / docScrollHeight()) * trackH);
    const ty = (window.scrollY / max) * (trackH - th);
    thumb.style.height = th + 'px';
    thumb.style.top = ty + 'px';
  };
  const docScrollHeight = () => document.documentElement.scrollHeight;
  const playerOpen = () => !document.getElementById('player').classList.contains('hidden');
  const show = () => {
    if (playerOpen()) { bar.classList.remove('visible'); return; } // oynatıcıda çubuk yok
    clearTimeout(hideTimer);
    bar.classList.add('visible');
    hideTimer = setTimeout(() => { if (!dragging) bar.classList.remove('visible'); }, 900);
  };
  window.addEventListener('scroll', () => { update(); show(); }, { passive: true });
  window.addEventListener('resize', update);
  document.addEventListener('mousemove', (e) => {
    if (playerOpen()) { clearTimeout(hideTimer); bar.classList.remove('visible'); return; }
    if (e.clientX > window.innerWidth - 48) show();
    else if (!dragging) { clearTimeout(hideTimer); bar.classList.remove('visible'); }
  });

  /* Başparmağı sürükleyerek kaydır */
  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragging = true;
    bar.classList.add('dragging');
    thumb.setPointerCapture(e.pointerId);
    const sy = e.clientY, startTop = parseFloat(thumb.style.top) || 0;
    const { max, trackH } = metrics();
    const th = parseFloat(thumb.style.height) || 34;
    const onMove = (ev) => {
      if (max <= 0) return;
      const ty = Math.min(trackH - th, Math.max(0, startTop + ev.clientY - sy));
      thumb.style.top = ty + 'px';
      window.scrollTo(0, (ty / (trackH - th)) * max);
    };
    const onUp = () => {
      dragging = false;
      bar.classList.remove('dragging');
      thumb.removeEventListener('pointermove', onMove);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => bar.classList.remove('visible'), 600);
    };
    thumb.addEventListener('pointermove', onMove);
    thumb.addEventListener('pointerup', onUp, { once: true });
    thumb.addEventListener('pointercancel', onUp, { once: true });
  });

  /* Boş track'e tıklayınca o konuma git */
  bar.querySelector('.wsb-track').addEventListener('pointerdown', (e) => {
    if (e.target !== e.currentTarget) return;
    const { max } = metrics();
    if (max <= 0) return;
    const r = e.currentTarget.getBoundingClientRect();
    window.scrollTo({ top: ((e.clientY - r.top) / r.height) * max, behavior: 'smooth' });
  });

  update();
}
bindCustomScrollbar();

if (window.pywebview !== undefined) bindWindowControls();
else window.addEventListener('pywebviewready', bindWindowControls);
