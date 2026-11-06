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
  const mobChan = $('#mob-pill-chan');
  if (!repos.length) {
    wrap.innerHTML = '';
    wrap.classList.add('hidden');
    wrap.classList.remove('open');
    if (mobChan) mobChan.style.display = 'none';
    return;
  }
  wrap.classList.remove('hidden');
  const active = CS.getActiveRepo();
  const prov = CS.getActiveProvider(active?.url);
  if (mobChan) {
    mobChan.style.display = '';
    mobChan.textContent = (prov ? prov.name : (active?.name || 'Kanallar')) + ' ▾';
  }
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
          <span class="cs-badge s-ok">canlı</span>
          ${prov && prov.__key === p.__key ? '<span class="rp-check">✓</span>' : ''}
        </button>`).join('')}
      <button class="rp-item rp-add" data-add>
        <span class="rp-mini">+</span>
        <span class="rp-item-name">Depo ekle / yönet</span>
      </button>
    </div>`;

  $('#rp-btn', wrap)?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (document.body.classList.contains('mobile-ui')) {
      wrap.classList.remove('open');
      openMobileRepoSheet();
      return;
    }
    wrap.classList.toggle('open');
  });
  $$('.rp-item[data-url]', wrap).forEach((b) => b.addEventListener('click', () => {
    wrap.classList.remove('open');
    CS.setActiveRepo(b.dataset.url);
    CS.setActiveProviderKey(null); // yeni depoda kanal yeniden seçilir
    renderHome();
  }));
  $$('.rp-item[data-prov]', wrap).forEach((b) => b.addEventListener('click', () => {
    wrap.classList.remove('open');
    CS.setActiveProviderKey(b.dataset.prov || null);
    renderHome();
  }));
  $('[data-add]', wrap).addEventListener('click', () => {
    wrap.classList.remove('open');
    showSettingsView('deps');
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

function closeMobileRepoSheet() {
  const ov = $('#mobile-sheet-overlay');
  if (ov) ov.classList.add('hidden');
}

function openMobileRepoSheet() {
  const ov = $('#mobile-sheet-overlay');
  const body = $('#ms-body');
  if (!ov || !body) return;
  const repos = CS.repos;
  if (!repos.length) {
    showSettingsView('deps');
    return;
  }
  const active = CS.getActiveRepo();
  const prov = CS.getActiveProvider(active?.url);
  const counts = Object.fromEntries(repos.map((r) => [r.url, CS.repoProviders(r.url).length]));
  const chans = active ? CS.repoProviders(active.url) : [];

  body.innerHTML = `
    <div class="ms-sec-label">Kurulu Depolar (${repos.length})</div>
    ${repos.map((r) => {
      const isAct = active && active.url === r.url;
      return `<button class="ms-item ${isAct ? 'active' : ''}" type="button" data-ms-repo="${esc(r.url)}">
        ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" alt="" onerror="this.style.display='none'">` : `<span class="rp-mini">${esc((r.name || 'C')[0])}</span>`}
        <span class="ms-item-info">
          <span class="ms-item-name">${esc(r.name)}</span>
          <span class="ms-item-meta">${counts[r.url]} yüklü kanal</span>
        </span>
        ${isAct ? '<span class="ms-check">✓</span>' : ''}
      </button>`;
    }).join('')}
    <div class="ms-sec-label" style="margin-top:6px">Kanallar · ${esc(active?.name || '')} (${chans.length})</div>
    ${chans.length ? chans.map((p) => {
      const isAct = prov && prov.__key === p.__key;
      return `<button class="ms-item ${isAct ? 'active' : ''}" type="button" data-ms-prov="${esc(p.__key)}">
        ${p.iconUrl ? `<img src="${esc(p.iconUrl.replace('%size%', '64'))}" alt="" onerror="this.outerHTML='<span class=&quot;rp-mini&quot;>${esc((p.name || 'K')[0])}</span>'">` : `<span class="rp-mini">${esc((p.name || 'K')[0])}</span>`}
        <span class="ms-item-info">
          <span class="ms-item-name">${esc(p.name)}</span>
          <span class="ms-item-meta">${esc((p.tvTypes || []).map(typeLabel).slice(0, 3).join(' · ') || 'Canlı sağlayıcı')}</span>
        </span>
        ${isAct ? '<span class="ms-check">✓</span>' : ''}
      </button>`;
    }).join('') : '<p class="cs-empty" style="padding:8px 10px">Bu depoda henüz yüklü kanal yok.</p>'}
    <button class="ms-manage-btn" type="button" data-ms-manage>+ Depo ve Kanalları Yönet</button>
  `;

  $$('[data-ms-repo]', body).forEach((b) => b.addEventListener('click', () => {
    CS.setActiveRepo(b.dataset.msRepo);
    const nextProvs = CS.repoProviders(b.dataset.msRepo);
    CS.setActiveProviderKey(nextProvs[0]?.__key || null);
    openMobileRepoSheet(); // seçilen deponun kanallarını anında aynı çekmecede göster
    renderHome();
  }));
  $$('[data-ms-prov]', body).forEach((b) => b.addEventListener('click', () => {
    closeMobileRepoSheet();
    CS.setActiveProviderKey(b.dataset.msProv || null);
    renderHome();
  }));
  $('[data-ms-manage]', body)?.addEventListener('click', () => {
    closeMobileRepoSheet();
    showSettingsView('deps');
  });

  ov.classList.remove('hidden');
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
  window.__syncMobileNav?.('home');

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
    ? '<span class="cs-chip live">● canlı — gömülü altyapı aktif</span>'
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
    if (document.body.classList.contains('mobile-ui')) {
      openMobileRepoSheet();
      return;
    }
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
    ? rows.map((r) => ({
        ...r,
        items: r.items.filter((i) => state.typeFilter === 'TvSeries' ? (i.type === 'TvSeries' || i.type === 'Anime') : i.type === state.typeFilter),
      })).filter((r) => r.items.length)
    : rows;

  /* İzlemeye devam et — yarım bırakılan içerikler en üstte */
  const cont = CS.getHistory().filter((h) => h.poster && h.posPct > 0.5 && h.posPct < 95);
  const contHtml = cont.length ? rowHTML({ name: 'İzlemeye Devam Et', items: cont, removableHistory: true }) : '';

  /* Bugünün Top 10 Listesi — posterli benzersiz ilk 10 içerik */
  const uniqTop = [...new Map(visible.flatMap((r) => r.items).filter((i) => i.poster).map((i) => [i.url, i])).values()].slice(0, 10);
  const top10Html = (!state.typeFilter && uniqTop.length >= 4) ? top10RowHTML(uniqTop, prov?.name || repo.name) : '';

  let html = contHtml;
  visible.forEach((r, idx) => {
    html += rowHTML(r);
    if (idx === 0 && top10Html) html += top10Html;
  });
  // Yer imleri
  let bms = [];
  try { bms = JSON.parse(localStorage.getItem('cs-bookmarks-v1') || '[]'); } catch {}
  const bmHtml = bms.length ? rowHTML({ name: 'Yer İmleri', items: bms }) : '';

  if (!visible.length) {
    // Not devam-et / yer imleri satırlarını ezmesin
    const note = `<div class="backend-note"><b>Bu kanaldan şu an içerik alınamadı.</b><span>Kanalın kaynak sitesi geçici olarak yanıt vermiyor olabilir. Seçiciden başka bir kanal deneyebilir veya depoyu yenileyebilirsin.</span></div>`;
    html = contHtml + bmHtml + note;
  } else {
    html += bmHtml;
  }
  rowsEl.innerHTML = html;
  bindCardEvents(rowsEl);
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
        <button class="btn-info" id="hero-surprise" title="Rastgele bir içerik seç ve aç">
          <svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:#e50914"><path d="M10.59 9.17 5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
          Bana Sürpriz Yap
        </button>
      </div>
    </div>`;
  $('#hero-play').addEventListener('click', () => heroPlay(item));
  $('#hero-info').addEventListener('click', () => openItemModal(item, item.apiName || prov?.name));
  $('#hero-surprise').addEventListener('click', () => surprisePlay());
}

/* Bana Sürpriz Yap — mevcut içerik havuzundan rastgele bir içerik seçip açar */
function surprisePlay() {
  const pool = [...new Map((state.homeCache.rows || []).flatMap((r) => r.items).map((i) => [i.url, i])).values()];
  if (!pool.length) {
    toast('Önce bir kanaldan içeriklerin yüklenmesini bekle');
    return;
  }
  const pick = pool[Math.floor(Math.random() * pool.length)];
  toast(`🎲 Sürpriz seçim: ${pick.name}`);
  openItemModal(pick, pick.apiName || state.homeCache.prov?.name);
}

/* Hero / Önizleme Oynat: film/canlıysa doğrudan, diziyse kayıtlı veya ilk bölümden */
async function heroPlay(item) {
  if (item.embed) { playItem(item); return; }
  const session0 = (player.session = (player.session || 0) + 1);
  const repoUrl = state.homeCache.repo?.url || CS.getActiveRepo()?.url;
  toast('İçerik çözülüyor…');
  const det = await CS.getDetails(repoUrl, item).catch(() => null);
  if ((player.session || 0) !== session0) return;
  if (det?.dataUrl) { playEpisode(item, det.dataUrl, ''); return; }
  if (det?.episodes?.length) {
    item.__episodes = det.episodes;
    const hist = CS.getHistory().find((x) => x.url === item.url);
    let idx = 0;
    const targetData = item.episodeData || hist?.episodeData;
    if (targetData) {
      const found = det.episodes.findIndex((e) => e.data === targetData);
      if (found >= 0) idx = found;
    }
    const ep = det.episodes[idx];
    const label = `${ep.season ? 'S' + ep.season + ':' : ''}B${ep.episode ?? (idx + 1)} ${ep.name || ''}`.trim();
    playEpisode(item, ep.data, label, det.episodes, idx);
    return;
  }
  openItemModal(item, item.apiName);
}

/* HomePageList → HTML satırı */
function rowHTML(r) {
  const cards = r.items.slice(0, 14).map((it) => realCard(it, it.apiName, { removableHistory: !!r.removableHistory })).join('');
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

/* Netflix Top 10 satırı — dev sıra numaralı poster kartları */
function top10RowHTML(items, chanName = '') {
  const cards = items.slice(0, 10).map((item, idx) => {
    const uid = registerItem(item, item.apiName || chanName);
    return `<div class="card top10" data-uid="${uid}">
      <span class="big-rank">${idx + 1}</span>
      <div class="card-thumb">
        <span class="top10-toplabel">TOP 10</span>
        <img class="card-img" src="${esc(item.poster)}" alt="${esc(item.name)}" loading="lazy" onerror="this.classList.add('img-broken')">
        <div class="card-shade"></div>
        <div class="card-title-strip"><div class="card-item-name">${esc(item.name)}</div></div>
      </div>
    </div>`;
  }).join('');
  return `
    <section class="row">
      <div class="row-head">
        <h2 class="row-title">Bugünün Top 10 Listesi</h2>
        <span class="row-explore">${esc(chanName)}</span>
      </div>
      <div class="row-body">
        <button class="row-arrow left"><svg viewBox="0 0 24 24"><path d="M15.4 4.6 8 12l7.4 7.4 1.4-1.4-6-6 6-6z"/></svg></button>
        <div class="row-track">${cards}</div>
        <button class="row-arrow right"><svg viewBox="0 0 24 24"><path d="M8.6 4.6 7.2 6l6 6-6 6 1.4 1.4L16 12z"/></svg></button>
      </div>
    </section>`;
}

/* Gerçek SearchResponse kartı */
function realCard(item, providerName, opts = {}) {
  const uid = registerItem(item, providerName);
  const poster = item.poster || '';
  const rmBtn = opts.removableHistory
    ? `<button class="card-rm-hist" data-rmhist="${esc(item.url)}" title="İzlemeye Devam Et listesinden kaldır"><svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>`
    : '';
  return `<div class="card" data-uid="${uid}">
    <div class="card-thumb">
      ${rmBtn}
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
  $$('[data-rmhist]', root).forEach((btn) => btn.addEventListener('click', (ev) => {
    ev.stopPropagation();
    hidePreview();
    CS.removeHistory(btn.dataset.rmhist);
    toast('İzlemeye Devam Et listesinden kaldırıldı');
    if (state.view === 'home') renderHome();
  }));
  $$('.card', root).forEach((card) => card.addEventListener('click', () => {
    const reg = getReg(card.dataset.uid);
    if (reg) openItemModal(reg.item, reg.providerName);
  }));
}

/* Hover önizleme — gerçek içerikle */
let pvTimer = null, pvHideTimer = null;
document.addEventListener('mouseover', (e) => {
  if (document.body.classList.contains('mobile-ui') || document.body.classList.contains('tv-mode')) return;
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
function hidePreview() {
  clearTimeout(pvTimer);
  const pv = $('#preview');
  if (pv.classList.contains('hidden')) return;
  pv.classList.add('closing');
  setTimeout(() => {
    if (pv.classList.contains('closing')) {
      pv.classList.add('hidden');
      pv.classList.remove('closing');
      pv.innerHTML = '';
    }
  }, 150);
}
function showPreview(card) {
  const reg = getReg(card.dataset.uid);
  if (!reg) return;
  const { item } = reg;
  const pv = $('#preview');
  pv.classList.remove('closing');
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
        ${item.posPct ? `<button class="pv-like" data-act="rmhist" title="İzlemeye Devam Et listesinden kaldır"><svg viewBox="0 0 24 24"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>` : ''}
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
    if (act === 'play') { hidePreview(); heroPlay(item); }
    if (act === 'more') { hidePreview(); openItemModal(item, reg.providerName); }
    if (act === 'rmhist') {
      hidePreview();
      CS.removeHistory(item.url);
      toast('İzlemeye Devam Et listesinden kaldırıldı');
      if (state.view === 'home') renderHome();
    }
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
      <button class="md-close" title="Kapat (Esc)">
        <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
      </button>
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

  const ov = $('#modal-overlay');
  ov.classList.remove('hidden', 'closing');
  document.body.classList.add('no-scroll');

  $('.md-close', m).addEventListener('click', closeModal);
  $('[data-play]', m).addEventListener('click', (ev) => {
    const dataUrl = ev.currentTarget.dataset.playdata;
    if (dataUrl) { closeModal(); playEpisode(item, dataUrl); return; }
    // Dizi/Anime: bölümler varsa ilk (veya kayıtlı) bölümden oynat
    if (item.__episodes?.length) {
      const hist = CS.getHistory().find((x) => x.url === item.url);
      let idx = 0;
      if (hist?.episodeData) {
        const found = item.__episodes.findIndex((e) => e.data === hist.episodeData);
        if (found >= 0) idx = found;
      }
      const ep = item.__episodes[idx];
      const label = `${ep.season ? 'S' + ep.season + ':' : ''}B${ep.episode ?? (idx + 1)} ${ep.name || ''}`.trim();
      closeModal();
      playEpisode(item, ep.data, label, item.__episodes, idx);
      return;
    }
    const firstEp = document.querySelector('#modal .md-ep[data-epdata]');
    if (firstEp?.dataset.epdata) { closeModal(); playEpisode(item, firstEp.dataset.epdata, firstEp.dataset.eplabel); return; }
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
    // Gerçek bölümler (JVM köprüsünden) — Sezon seçicili Netflix tarzı kapaklı liste
    if (det.episodes?.length) {
      item.__episodes = det.episodes;
      const seasonsMap = new Map();
      det.episodes.forEach((e, globalIdx) => {
        const sNum = e.season || 1;
        if (!seasonsMap.has(sNum)) seasonsMap.set(sNum, []);
        seasonsMap.get(sNum).push({ e, globalIdx });
      });
      const seasonNums = [...seasonsMap.keys()].sort((a, b) => a - b);
      const seasonSelectHtml = seasonNums.length > 1
        ? `<select class="md-season-select" id="md-season-select">
            ${seasonNums.map((s) => `<option value="${s}">${s}. Sezon (${seasonsMap.get(s).length} bölüm)</option>`).join('')}
           </select>`
        : '';

      const bodyEl = $('.md-body', m);
      bodyEl.insertAdjacentHTML('afterend', `
        <div class="md-eps-wrap">
          <div class="md-eps-header">
            <h3 class="md-sub">Bölümler <span class="cs-pill">${det.episodes.length} bölüm</span></h3>
            ${seasonSelectHtml}
          </div>
          <div class="md-eps md-eps-thumbs" id="md-eps-list"></div>
        </div>`);

      const renderSeasonEps = (sNum) => {
        const list = seasonsMap.get(+sNum) || [];
        const epsContainer = $('#md-eps-list', m);
        epsContainer.innerHTML = list.map(({ e, globalIdx }) => {
          const epNum = e.episode ?? (globalIdx + 1);
          const label = `${e.season ? 'S' + e.season + ':' : ''}B${epNum} ${e.name || ''}`.trim();
          const thumb = e.poster || item.poster || '';
          return `
          <div class="md-ep" data-epdata="${esc(e.data || '')}" data-eplabel="${esc(label)}" data-epidx="${globalIdx}">
            <div class="md-ep-thumb">
              ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : '<div class="ep-noimg"></div>'}
              <span class="ep-num">${epNum}</span>
              <div class="ep-play"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></div>
            </div>
            <div class="md-ep-info">
              <div class="md-ep-row"><b>${esc(e.name || `Bölüm ${epNum}`)}${e.season ? ` · S${e.season}` : ''}</b></div>
              ${e.description ? `<p class="md-ep-desc">${esc(e.description).slice(0, 160)}</p>` : ''}
            </div>
          </div>`;
        }).join('');
        $$('[data-epdata]', epsContainer).forEach((el) => el.addEventListener('click', () => {
          if (el.dataset.epdata) playEpisode(item, el.dataset.epdata, el.dataset.eplabel, det.episodes, +el.dataset.epidx);
        }));
      };

      renderSeasonEps(seasonNums[0]);
      const selEl = $('#md-season-select', m);
      if (selEl) selEl.addEventListener('change', (ev) => renderSeasonEps(ev.target.value));
    }
    // Filmse: Oynat gerçek akışı çözsün
    if (det.dataUrl) {
      $('[data-play]', m).dataset.playdata = det.dataUrl;
    }
  } else if (item.embed) {
    st.textContent = 'temel bilgi';
    desc.textContent = 'Bu içerik doğrudan oynatılabilir.';
  } else {
    st.textContent = 'detay alınamadı';
    desc.textContent = 'Bu sağlayıcının içeriği şu an erişilemiyor.';
  }

  /* Benzer İçerikler — aynı türden veya aktif kanaldan 6 öneri */
  const allItems = [...new Map((state.homeCache.rows || []).flatMap((r) => r.items).filter((i) => i.url !== item.url && i.poster).map((i) => [i.url, i])).values()];
  const sameType = allItems.filter((i) => i.type === item.type);
  const simPool = (sameType.length >= 3 ? sameType : allItems).slice(0, 6);
  if (simPool.length) {
    const simHtml = simPool.map((s) => {
      const uid = registerItem(s, s.apiName || providerName);
      return `<div class="sim-card" data-simuid="${uid}">
        <div class="sim-thumb">
          <img src="${esc(s.poster)}" alt="${esc(s.name)}" loading="lazy" onerror="this.style.display='none'">
        </div>
        <div class="sim-body">
          <div class="sim-title">${esc(s.name)}</div>
          <div class="sim-meta">
            <span class="match">${esc(s.apiName || providerName || '')}</span>
            <span>${esc(typeLabel(s.type))}</span>
            ${s.year ? `<span>${esc(s.year)}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    m.insertAdjacentHTML('beforeend', `
      <div class="md-sim-wrap">
        <h3 class="md-sub">Benzer İçerikler</h3>
        <div class="md-similar">${simHtml}</div>
      </div>`);
    $$('[data-simuid]', m).forEach((el) => el.addEventListener('click', () => {
      const reg = getReg(el.dataset.simuid);
      if (reg) openItemModal(reg.item, reg.providerName);
    }));
  }
}

function closeModal() {
  const ov = $('#modal-overlay');
  if (ov.classList.contains('hidden')) return;
  ov.classList.add('closing');
  setTimeout(() => {
    if (ov.classList.contains('closing')) {
      ov.classList.add('hidden');
      ov.classList.remove('closing');
      document.body.classList.remove('no-scroll');
    }
  }, 190);
}
$('#modal-overlay').addEventListener('click', (e) => { if (e.target.id === 'modal-overlay') closeModal(); });

/* ============================================================
   OYNATICI — Netflix tarzı, canlı + dizi/film desteği
   ============================================================ */
const player = {
  idleTimer: null, item: null, links: [], linkIndex: 0, live: false, embed: false,
  subtitles: [], audioTracks: [], resumeT: 0, lastProgSave: 0, currentData: null,
  episodes: [], epIndex: -1, introSkipped: false, nextDismissed: false, subOffset: 0,
};

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
async function playEpisode(item, data, label = '', episodes = null, epIndex = -1) {
  const session0 = (player.session = (player.session || 0) + 1);
  player.currentData = data;
  player.episodes = episodes || item?.__episodes || [];
  player.epIndex = epIndex >= 0 ? epIndex : player.episodes.findIndex((e) => e.data === data);
  player.introSkipped = false;
  player.nextDismissed = false;
  player.subOffset = 0;
  player.links = [];
  player.allLinks = [];
  $('#p-skip-intro')?.classList.add('hidden');
  $('#p-next-card')?.classList.add('hidden');
  $('#eps-drawer')?.classList.add('hidden');

  const live = item.type === 'Live';
  closeModal();
  openPlayerShell(item, { live, label: label || 'Bağlantılar çözülüyor…' });
  populateEpisodesDrawer();

  const repoUrl = state.homeCache.repo?.url || CS.getActiveRepo()?.url;
  toast('Oynatma bağlantıları çözülüyor…');
  try {
    const res = await CS.links(repoUrl, data);
    if ((player.session || 0) !== session0) return;
    let links = Array.isArray(res) ? res : (res.links || []);
    player.subtitles = Array.isArray(res) ? [] : (res.subtitles || []);
    links = links.sort((a, b) => (b.quality || 0) - (a.quality || 0));
    // Canlı yayınlar: akış doğrudan data'da taşınıyor olabilir
    if (!links.length && /\.m3u8|\.mp4|\.ts(\?|$)/i.test(data)) {
      links = [{ url: data, isM3u8: /\.m3u8/i.test(data), source: item.apiName || '', quality: 0 }];
    }
    if (!links.length) {
      toast('Oynatılabilir bağlantı bulunamadı');
      closePlayer();
      return;
    }

    player.allLinks = links;
    // Kullanıcının dublaj/altyazı tercihi (Ayarlar) varsa o varyantı başa al
    const pref = playerPrefs.get().prefAudio;
    let pool = links;
    if (pref && pref !== 'Tümü') {
      const tagged = links.filter((l) => linkTag(l) === pref);
      if (tagged.length) pool = tagged.concat(links.filter((l) => linkTag(l) !== pref));
    }

    player.links = pool;
    player.label = label || '';
    $('#p-ep').textContent = player.label || item.apiName || '';
    $('#p-quality-wrap').classList.toggle('hidden', player.embed || !pool.length);
    populateSpeedMenu();
    populateQualityMenu(0);
    populateSrcMenu(pool[0]?.url || null);
    populateAudioMenu();

    for (let i = 0; i < Math.min(4, pool.length); i++) {
      const ok = await tryPlay(pool[i], i, 0);
      if ((player.session || 0) !== session0) return; // kullanıcı oynatıcıyı kapattı veya başka bölüm açtı
      if (ok) { populateSrcMenu(pool[i].url); populateAudioMenu(); autoPickSubtitle(); return; }
      toast(`Sunucu yanıt vermedi, yedek deneniyor…`);
    }
    toast('Hiçbir bağlantı oynatılamadı');
    closePlayer();
  } catch {
    if ((player.session || 0) === session0) {
      toast('Bağlantılar çözülemedi');
      closePlayer();
    }
  }
}

/* Oynatıcı içi Bölüm Çekmecesi ve Sonraki Bölüm kontrolü */
function populateEpisodesDrawer() {
  const eps = player.episodes || [];
  const hasEps = eps.length > 1;
  const hasNext = hasEps && player.epIndex >= 0 && player.epIndex + 1 < eps.length;
  $('#p-eps-btn')?.classList.toggle('hidden', !hasEps);
  $('#p-next')?.classList.toggle('hidden', !hasNext);
  const listEl = $('#eps-drawer-list');
  if (!listEl || !hasEps) return;
  $('#eps-drawer-title').textContent = `${player.item?.name || 'Bölümler'} (${eps.length})`;
  listEl.innerHTML = eps.map((e, i) => {
    const epNum = e.episode ?? (i + 1);
    const title = `${e.season ? 'S' + e.season + ':' : ''}B${epNum} · ${e.name || ('Bölüm ' + epNum)}`;
    const thumb = e.poster || player.item?.poster || '';
    return `<div class="eps-item ${i === player.epIndex ? 'current' : ''}" data-epidx="${i}">
      ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : ''}
      <div class="ei-body">
        <div class="ei-t">${esc(title)}</div>
        ${e.description ? `<div class="ei-d">${esc(e.description)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  $$('.eps-item[data-epidx]', listEl).forEach((el) => el.addEventListener('click', () => {
    const idx = +el.dataset.epidx;
    const ep = eps[idx];
    if (!ep?.data) return;
    const epNum = ep.episode ?? (idx + 1);
    const lbl = `${ep.season ? 'S' + ep.season + ':' : ''}B${epNum} ${ep.name || ''}`.trim();
    $('#eps-drawer').classList.add('hidden');
    playEpisode(player.item, ep.data, lbl, eps, idx);
  }));
}

function playNextEpisode() {
  const eps = player.episodes || [];
  if (player.epIndex < 0 || player.epIndex + 1 >= eps.length) return;
  const nextIdx = player.epIndex + 1;
  const nextEp = eps[nextIdx];
  if (!nextEp?.data) return;
  const epNum = nextEp.episode ?? (nextIdx + 1);
  const lbl = `${nextEp.season ? 'S' + nextEp.season + ':' : ''}B${epNum} ${nextEp.name || ''}`.trim();
  playEpisode(player.item, nextEp.data, lbl, eps, nextIdx);
}

/* Oynatma hızı menüsü (0.5x – 1.5x) */
function populateSpeedMenu() {
  const v = $('#video');
  const menu = $('#p-speed-menu');
  const btn = $('#p-speed');
  if (!menu || !btn) return;
  const rates = [0.5, 0.75, 1, 1.25, 1.5];
  const cur = v.playbackRate || 1;
  btn.textContent = cur + 'x';
  menu.innerHTML = `<div class="p-menu-title">Oynatma Hızı</div>` + rates.map((r) =>
    `<button class="p-opt ${r === cur ? 'active' : ''}" data-rate="${r}">${r === 1 ? '1x (Normal)' : r + 'x'}</button>`
  ).join('');
  $$('[data-rate]', menu).forEach((b) => b.addEventListener('click', () => {
    const rate = +b.dataset.rate;
    v.playbackRate = rate;
    btn.textContent = rate + 'x';
    menu.classList.add('hidden');
    populateSpeedMenu();
    toast(`Oynatma hızı: ${rate}x`);
  }));
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

  // Altyazı dosyaları (CloudStream subtitle callback'leri) + Boyut ve Senkron ayarı
  if (subs.length) {
    const curSubSize = playerPrefs.get().subSize || 'md';
    menuHtml += `<div class="p-menu-title p-sub-title">Altyazı</div>`;
    menuHtml += subs.map((s, i) =>
      `<button class="p-opt p-sub" data-sub="${i}">${esc(s.source || ('Altyazı ' + (i + 1)))}</button>`).join('');
    menuHtml += `
      <div class="p-sub-controls">
        <div class="p-sub-ctrl-row">
          <span>Boyut</span>
          <div class="p-sub-btns">
            <button class="p-sub-mini ${curSubSize === 'sm' ? 'active' : ''}" data-subsize="sm">Küçük</button>
            <button class="p-sub-mini ${curSubSize === 'md' ? 'active' : ''}" data-subsize="md">Orta</button>
            <button class="p-sub-mini ${curSubSize === 'lg' ? 'active' : ''}" data-subsize="lg">Büyük</button>
          </div>
        </div>
        <div class="p-sub-ctrl-row">
          <span>Senkron (${player.subOffset >= 0 ? '+' : ''}${player.subOffset.toFixed(1)}sn)</span>
          <div class="p-sub-btns">
            <button class="p-sub-mini" data-subshift="-0.5">-0.5s</button>
            <button class="p-sub-mini" data-subshift="0">Sıfırla</button>
            <button class="p-sub-mini" data-subshift="0.5">+0.5s</button>
          </div>
        </div>
      </div>`;
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
  $$('[data-subsize]', menu).forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const sz = b.dataset.subsize;
    playerPrefs.set('subSize', sz);
    applySubSizeClass();
    populateSrcMenu(currentUrl);
  }));
  $$('[data-subshift]', menu).forEach((b) => b.addEventListener('click', (ev) => {
    ev.stopPropagation();
    const val = +b.dataset.subshift;
    shiftSubtitleTiming(val === 0 ? -player.subOffset : val);
    populateSrcMenu(currentUrl);
  }));
}

function applySubSizeClass() {
  const o = $('#p-sub-overlay');
  if (!o) return;
  const sz = playerPrefs.get().subSize || 'md';
  o.classList.toggle('sub-sm', sz === 'sm');
  o.classList.toggle('sub-lg', sz === 'lg');
}

function shiftSubtitleTiming(deltaSec) {
  if (!deltaSec) return;
  const v = $('#video');
  const tt = v.textTracks?.[v.textTracks.length - 1];
  if (!tt || !tt.cues) { toast('Önce bir altyazı seçin'); return; }
  [...tt.cues].forEach((c) => {
    c.startTime = Math.max(0, c.startTime + deltaSec);
    c.endTime = Math.max(0.1, c.endTime + deltaSec);
  });
  player.subOffset = +(player.subOffset + deltaSec).toFixed(1);
  toast(`Altyazı senkronu: ${player.subOffset >= 0 ? '+' : ''}${player.subOffset} sn`);
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
/* Altyazı dili tespiti: 'tr'/'Türkçe'/'turkish' vb. → 'tr', İngilizce → 'en' */
function subLangOf(sub) {
  const raw = String(sub.lang || sub.source || '').toLowerCase();
  if (/tr|turk|t.rk|turkish/.test(raw)) return 'tr';
  if (/en|ingiliz|english/.test(raw)) return 'en';
  return '';
}

/* Ayarlardaki altyazı tercihine göre otomatik aç (oynatma başlarken çağrılır) */
function autoPickSubtitle() {
  const pref = String(playerPrefs.get().subLang || 'yok');
  if (pref === 'yok' || !(player.subtitles || []).length) return;
  const wanted = pref.split(',').map((x) => x.trim()).filter(Boolean);
  for (const w of wanted) {
    const idx = player.subtitles.findIndex((s) => subLangOf(s) === w);
    if (idx >= 0) {
      applySubtitle(idx);
      toast('Altyazı otomatik açıldı (tercihin): ' + (player.subtitles[idx].source || w));
      return;
    }
  }
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
  try { window.ElderboxAndroid?.setPlayerFullscreen?.(true); } catch {}
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
        if (resumeAt >= 30) player.introSkipped = true;
        try { v.currentTime = resumeAt; } catch {}
        toast(fmtTime(resumeAt) + ' konumundan devam ediliyor');
        player.resumeT = 0;
      }
      setPlayIcon(true);
      wakeControls();
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
  if (document.pictureInPictureElement) {
    try { document.exitPictureInPicture(); } catch {}
  }
  v.pause();
  // WebView2/Chrome'da MSE kaynaklı takılmayı önler: önce medyayı ayır, sonra yok et
  try { window.__hls?.detachMedia?.(); } catch {}
  try { window.__hls?.stopLoad?.(); } catch {}
  try { window.__hls?.destroy?.(); } catch {}
  window.__hls = null;
  try { v.removeAttribute('src'); v.load(); } catch {}
  v.controls = false;
  clearSubtitles();
  $('#p-skip-intro')?.classList.add('hidden');
  $('#p-next-card')?.classList.add('hidden');
  $('#eps-drawer')?.classList.add('hidden');
  $('#p-iframe-wrap').classList.add('hidden');
  $('#p-iframe-wrap').innerHTML = '';
  $('#player').classList.add('hidden', 'idle');
  document.body.classList.remove('no-scroll');
  try { window.ElderboxAndroid?.setPlayerFullscreen?.(false); } catch {}
  player.item = null;
  player.resumeT = 0;
  player.currentData = null;
  player.links = [];
  player.allLinks = [];
  player.subtitles = [];
  player.episodes = [];
  player.epIndex = -1;
  if (state.view === 'home') renderHome();
}

function isAnyPlayerMenuOpen() {
  return ['#p-speed-menu', '#p-quality-menu', '#p-audio-menu', '#p-tag-menu', '#eps-drawer']
    .some((sel) => {
      const el = $(sel);
      return el && !el.classList.contains('hidden');
    });
}

function wakeControls() {
  const p = $('#player');
  if (!p) return;
  p.classList.remove('idle');
  clearTimeout(player.idleTimer);
  player.idleTimer = setTimeout(() => {
    const v = $('#video');
    if ((v && v.paused && (v.src || window.__hls)) || isAnyPlayerMenuOpen()) {
      wakeControls();
      return;
    }
    p.classList.add('idle');
  }, 4000);
}

/* ---------- Oynatıcı kontrolleri ---------- */
function setPlayIcon(playing) {
  const svg = playing
    ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>';
  $('#p-play').innerHTML = svg;
  const pmPlay = $('#pm-play');
  if (pmPlay) pmPlay.innerHTML = svg;
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

  /* İntroyu Atla (5 sn – 90 sn arası, bölüm başına yalnızca 1 kez) */
  const skipBtn = $('#p-skip-intro');
  if (skipBtn) {
    if (cur > 90 && isFinite(dur) && dur > 180) {
      player.introSkipped = true;
    }
    const showSkip = !player.live && !player.embed && isFinite(dur) && dur > 180 && cur >= 5 && cur <= 90 && !player.introSkipped;
    skipBtn.classList.toggle('hidden', !showSkip);
  }

  /* Sıradaki Bölüm Geri Sayım Kartı (son 15 sn) */
  const nextCard = $('#p-next-card');
  const eps = player.episodes || [];
  const hasNext = !player.live && !player.embed && !player.nextDismissed && eps.length > 1 && player.epIndex >= 0 && player.epIndex + 1 < eps.length;
  if (nextCard) {
    const rem = Math.ceil(dur - cur);
    if (hasNext && dur > 60 && rem <= 15 && rem > 0) {
      const nextEp = eps[player.epIndex + 1];
      const epNum = nextEp.episode ?? (player.epIndex + 2);
      const thumb = nextEp.poster || player.item?.poster || '';
      const autoOn = playerPrefs.get().autoNext !== false;
      nextCard.classList.remove('hidden');
      nextCard.innerHTML = `
        ${thumb ? `<div class="ne-thumb"><img src="${esc(thumb)}" alt=""></div>` : ''}
        <div class="ne-info">
          <div class="ne-label">${autoOn ? `Sıradaki bölüm · ${rem} sn` : 'Sıradaki bölüm'}</div>
          <div class="ne-title">${esc(nextEp.name || ('Bölüm ' + epNum))}</div>
          <div style="display:flex;gap:8px;margin-top:auto;align-items:center">
            <button class="ne-play" data-ne-play>▶ Şimdi Oynat</button>
            <button class="ne-close" data-ne-close title="Gizle">
              <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
            </button>
          </div>
        </div>`;
      $('[data-ne-play]', nextCard)?.addEventListener('click', () => playNextEpisode());
      $('[data-ne-close]', nextCard)?.addEventListener('click', () => {
        player.nextDismissed = true;
        nextCard.classList.add('hidden');
      });
    } else {
      nextCard.classList.add('hidden');
    }
  }
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

  applySubSizeClass();
  $('#p-back').addEventListener('click', closePlayer);

  /* Dokunmatik ekranlarda sentetik mousemove olayının idle durumunu bozmasını önle */
  let lastTouchTime = 0;
  const markTouch = (e) => {
    lastTouchTime = Date.now();
    if (!p.classList.contains('idle') && e.target.closest('.player-ui, .player-top, .p-mobile-center, .eps-drawer')) {
      wakeControls();
    }
  };
  p.addEventListener('touchstart', markTouch, { passive: true });
  p.addEventListener('touchend', () => { lastTouchTime = Date.now(); }, { passive: true });
  p.addEventListener('mousemove', () => {
    if (Date.now() - lastTouchTime < 900) return;
    wakeControls();
  });

  /* Oynat/duraklat + merkez animasyonlu ikon */
  let tapTimer = null;
  const showTapFeedback = (playing) => {
    const fb = $('#p-tap-feedback');
    if (!fb) return;
    fb.innerHTML = playing
      ? '<svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zm8 0h4v16h-4z"/></svg>';
    fb.classList.remove('hidden', 'pop-anim');
    void fb.offsetWidth;
    fb.classList.add('pop-anim');
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => fb.classList.add('hidden'), 520);
  };
  const toggle = () => {
    if (!v.src && !window.__hls) return;
    if (v.paused) {
      v.play().then(() => setPlayIcon(true)).catch(() => {});
      showTapFeedback(true);
    } else {
      v.pause();
      setPlayIcon(false);
      showTapFeedback(false);
    }
    wakeControls();
  };
  $('#p-play').addEventListener('click', toggle);
  $('#pm-play')?.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
  $('#pm-back10')?.addEventListener('click', (e) => {
    e.stopPropagation();
    v.currentTime = Math.max(0, v.currentTime - 10);
    wakeControls();
  });
  $('#pm-fwd10')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (v.duration) v.currentTime = Math.min(v.duration - 0.5, v.currentTime + 10);
    wakeControls();
  });
  v.addEventListener('click', () => {
    const isTouchTap = (Date.now() - lastTouchTime < 900) || document.body.classList.contains('mobile-ui');
    if (isTouchTap) {
      if (p.classList.contains('idle')) {
        wakeControls();
      } else {
        clearTimeout(player.idleTimer);
        p.classList.add('idle');
      }
      return;
    }
    toggle();
  });
  v.addEventListener('dblclick', () => {
    if (Date.now() - lastTouchTime < 900) return;
    $('#p-full')?.click();
  });
  v.addEventListener('pause', () => { setPlayIcon(false); wakeControls(); });
  v.addEventListener('play', () => { setPlayIcon(true); wakeControls(); });

  /* Bölüm bittiğinde otomatik sıradaki bölüme geç */
  v.addEventListener('ended', () => {
    const eps = player.episodes || [];
    if (playerPrefs.get().autoNext !== false && eps.length > 1 && player.epIndex >= 0 && player.epIndex + 1 < eps.length) {
      toast('Sıradaki bölüm başlatılıyor…');
      playNextEpisode();
    }
  });

  /* İntroyu Atla */
  $('#p-skip-intro')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (player.introSkipped) return;
    player.introSkipped = true;
    $('#p-skip-intro').classList.add('hidden');
    if (v.duration && isFinite(v.duration)) {
      v.currentTime = Math.min(v.duration - 5, v.currentTime + 85);
      toast('İntro atlandı (+85 sn)');
    }
    wakeControls();
  });

  /* Sonraki Bölüm & Bölüm Çekmecesi */
  $('#p-next')?.addEventListener('click', () => playNextEpisode());
  $('#p-eps-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#eps-drawer')?.classList.toggle('hidden');
  });
  $('#eps-close')?.addEventListener('click', () => $('#eps-drawer')?.classList.add('hidden'));

  /* Resim İçinde Resim (PiP) */
  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch { toast('Resim içinde resim bu akışta kullanılamıyor'); }
  };
  $('#p-pip')?.addEventListener('click', togglePiP);

  /* İlerleme (yalnız VOD) */
  v.addEventListener('timeupdate', updateSeekUI);
  v.addEventListener('timeupdate', () => saveProgress());
  v.addEventListener('pause', () => saveProgress(true));
  v.addEventListener('progress', updateSeekUI);
  const prog = $('#p-progress');
  const seekAtClientX = (clientX) => {
    if (player.live || !v.duration) return;
    const r = prog.getBoundingClientRect();
    v.currentTime = Math.min(0.999, Math.max(0, (clientX - r.left) / r.width)) * v.duration;
    updateSeekUI();
  };
  const seekTo = (e) => seekAtClientX(e.clientX);
  let scrubbing = false;
  prog.addEventListener('mousedown', (e) => { scrubbing = true; seekTo(e); });
  window.addEventListener('mousemove', (e) => { if (scrubbing) seekTo(e); });
  window.addEventListener('mouseup', () => { scrubbing = false; });
  prog.addEventListener('touchstart', (e) => {
    if (!e.touches.length) return;
    scrubbing = true;
    seekAtClientX(e.touches[0].clientX);
    wakeControls();
  }, { passive: true });
  prog.addEventListener('touchmove', (e) => {
    if (!scrubbing || !e.touches.length) return;
    seekAtClientX(e.touches[0].clientX);
    wakeControls();
  }, { passive: true });
  prog.addEventListener('touchend', () => { scrubbing = false; }, { passive: true });
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

  /* Hız menüsü */
  $('#p-speed')?.addEventListener('click', (e) => {
    e.stopPropagation();
    populateSpeedMenu();
    $('#p-speed-menu').classList.toggle('hidden');
  });
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
    if (!e.target.closest('#p-speed-wrap')) $('#p-speed-menu')?.classList.add('hidden');
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
        case 'm': case 'M': toggleMute(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'n': case 'N': playNextEpisode(); break;
        case 'p': case 'P': togglePiP(); break;
        case 's': case 'S':
          if (!$('#p-skip-intro')?.classList.contains('hidden')) $('#p-skip-intro').click();
          break;
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
  return '';
}

function bindBridgeStart() {}

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

  // Logo tıklaması: Ana Sayfaya temiz dönüş
  $('#logo')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeMobileRepoSheet();
    document.body.classList.remove('mobile-search-open');
    $('#search-box')?.classList.remove('open');
    if ($('#search-input')) $('#search-input').value = '';
    state.typeFilter = null;
    $$('.nav-link').forEach((x) => x.classList.toggle('active', x.dataset.view === 'home'));
    $$('#mobile-pills .mob-pill[data-mob-filter]').forEach((p) => p.classList.toggle('active', p.dataset.mobFilter === 'all'));
    window.scrollTo(0, 0);
    renderHome();
  });

  // Bana Sürpriz Yap (Navbar)
  $('#surprise-btn')?.addEventListener('click', () => surprisePlay());

  // Arama + Tüm Kanallar kapsam seçici
  const sbox = $('#search-box'), sinput = $('#search-input'), sallBtn = $('#search-all-toggle');
  $('#search-clear')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sinput.value) {
      sinput.value = '';
      sinput.focus();
      const { rows } = state.homeCache;
      const sample = [...new Map((rows || []).flatMap((r) => r.items).map((i) => [i.url, i])).values()].slice(0, 24);
      showGridView('Arama — Önerilen İçerikler', sample, null, 'Aramak istediğin film, dizi veya anime adını yukarıya yaz.');
      return;
    }
    sbox.classList.remove('open');
    document.body.classList.remove('mobile-search-open');
    renderHome();
  });
  $('#search-toggle').addEventListener('click', () => {
    const opening = !sbox.classList.contains('open');
    sbox.classList.toggle('open', opening);
    document.body.classList.toggle('mobile-search-open', opening && document.body.classList.contains('mobile-ui'));
    if (opening) {
      window.__syncMobileNav?.('search');
      sinput.focus();
    } else {
      sinput.value = '';
      sinput.dispatchEvent(new Event('input'));
    }
  });
  let searchSeq = 0;
  const runSearch = async () => {
    const q = sinput.value.trim();
    if (!q) { restoreHome(); return; }
    const seq = ++searchSeq;
    const allChans = !!sallBtn?.classList.contains('active');
    const res = await CS.getSearch(CS.getActiveRepo()?.url, q, allChans).catch(() => []);
    if (seq !== searchSeq) return; // eski sonuç
    const reg = res.map((it) => registerItem(it, it.apiName));
    const scopeLabel = allChans ? 'tüm kanallar' : (CS.getActiveProvider(CS.getActiveRepo()?.url)?.name || 'aktif kanal');
    showGridView(`"${q}" (${scopeLabel}) — ${res.length} sonuç`, res, reg);
  };
  sinput.addEventListener('input', runSearch);
  sallBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    sallBtn.classList.toggle('active');
    if (sinput.value.trim()) runSearch();
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
  if ($('#search-box')?.classList.contains('open')) window.__syncMobileNav?.('search');
  else if (state.view === 'list') window.__syncMobileNav?.('list');
  else if (state.view === 'new') window.__syncMobileNav?.('new');
  else window.__syncMobileNav?.('grid');
  $('#grid-title').textContent = title;
  if (!items || !items.length) {
    $('#grid-cards').innerHTML = `<div class="no-results"><b>${esc(emptyMsg || 'Sonuç bulunamadı')}</b>Aktif depoyu değiştirebilir veya başka depo ekleyebilirsin.</div>`;
    return;
  }
  $('#grid-cards').innerHTML = items.map((it) => realCard(it, it.apiName)).join('');
  bindCardEvents($('#grid-cards'));
}

function restoreHome() {
  document.body.classList.remove('mobile-search-open');
  renderHome();
}

/* ============================================================
   CLOUDSTREAM GÖRÜNÜMÜ (depo/eklenti yönetimi)
   ============================================================ */
let csFilterTV = 'all';
let csFilterRepo = 'all';
let settingsPanel = 'layout';

function showSettingsView(panel) {
  window.scrollTo(0, 0);
  state.view = 'cs';
  document.body.classList.remove('mobile-search-open');
  $('#search-box')?.classList.remove('open');
  $('#hero').classList.add('hidden');
  $('#rows').classList.add('hidden');
  $('#grid-view').classList.add('hidden');
  $('#cs-view').classList.remove('hidden');
  $$('.nav-link').forEach((x) => x.classList.remove('active'));
  window.__syncMobileNav?.('deps');
  $('#cs-engine-badge').textContent = 'Gömülü CloudStream altyapısı bağlı — 127.0.0.1:8765';
  CS.ensureBridge().then((ok) => {
    const el = $('#cs-engine-badge');
    if (el) el.textContent = ok ? 'Gömülü CloudStream altyapısı bağlı — 127.0.0.1:8765' : 'Gömülü CloudStream altyapısı başlatılıyor…';
  });
  $('#cs-jsdelivr').checked = CS.settings.jsdelivrProxy;
  renderCSOfficial();
  renderCSRepos();
  renderCSPlugins();
  window.__renderLayoutModeCards?.();
  const initialPanel = panel || (!CS.repos.length ? 'deps' : (settingsPanel || 'layout'));
  showSettingsPanel(initialPanel);
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
    const repoPlugs = CS.plugins.filter((p) => p.repoUrl === r.url);
    const cnt = repoPlugs.length;
    const instCnt = repoPlugs.filter((p) => p.installed !== false).length;
    const isActive = activeUrl === r.url || (!activeUrl && CS.repos[0].url === r.url);
    return `<div class="cs-repo-item">
      <div class="cri-head">
        ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" style="width:22px;height:22px;border-radius:4px;object-fit:contain" alt="">` : ''}
        <span class="cri-name">${esc(r.name)}</span>
        ${isActive ? '<span class="cs-verified">AKTİF</span>' : ''}
        <span class="cs-pill">${instCnt} yüklü / ${cnt} kanal</span>
      </div>
      <div class="cri-desc">${esc(r.description || '')}</div>
      <div class="cri-url">${esc(r.url)}</div>
      <div class="cri-foot">
        <button class="cs-mini" data-focus-repo="${esc(r.url)}">Kanalları Yönet</button>
        <button class="cs-mini" data-refresh="${esc(r.url)}">Yenile</button>
        <button class="cs-mini" data-activate="${esc(r.url)}">${isActive ? 'Aktif ✓' : 'Aktifleştir'}</button>
        <button class="cs-mini danger" data-remove="${esc(r.url)}">Kaldır</button>
      </div>
    </div>`;
  }).join('');
  $$('[data-focus-repo]', wrap).forEach((b) => b.addEventListener('click', () => {
    csFilterRepo = b.dataset.focusRepo;
    renderCSPlugins();
    $('#cs-repo-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  $$('[data-refresh]', wrap).forEach((b) => b.addEventListener('click', () => csAddRepoFlow(null, b.dataset.refresh)));
  $$('[data-activate]', wrap).forEach((b) => b.addEventListener('click', () => {
    CS.setActiveRepo(b.dataset.activate);
    csStatus('Aktif depo güncellendi — ana sayfa bu depodan içerik gösterecek', 'ok');
    renderCSRepos();
    renderCSPlugins();
  }));
  $$('[data-remove]', wrap).forEach((b) => b.addEventListener('click', () => {
    if (csFilterRepo === b.dataset.remove) csFilterRepo = 'all';
    CS.removeRepo(b.dataset.remove);
    csStatus('Depo kaldırıldı');
    renderCSRepos(); renderCSPlugins(); renderCSOfficial();
  }));
}

function renderCSPlugins() {
  const wrap = $('#cs-plugin-list');
  const tabsWrap = $('#cs-repo-tabs');
  const all = CS.plugins;
  $('#cs-plugin-count').textContent = all.length ? `${CS.repos.length} depo · ${all.length} kanal` : '';
  if (!all.length || !CS.repos.length) {
    if (tabsWrap) tabsWrap.innerHTML = '';
    wrap.innerHTML = '<p class="cs-empty">Kurulu eklenti yok — depo eklediğinde her deponun kanalları burada ayrı olarak listelenir.</p>';
    return;
  }

  // Seçili depo kaldırıldıysa 'all' moduna dön
  if (csFilterRepo !== 'all' && !CS.repos.some((r) => r.url === csFilterRepo)) {
    csFilterRepo = 'all';
  }

  // Depo sekmeleri (Her depo ayrı sekme + Tüm Depolar Ayrı Gruplu görünüm)
  if (tabsWrap) {
    tabsWrap.innerHTML = `
      <button class="cs-repo-tab ${csFilterRepo === 'all' ? 'active' : ''}" data-repotab="all">
        <span class="crt-dot"></span>
        <span>Tüm Depolar (Ayrı Gruplu)</span>
        <span class="crt-count">${CS.repos.length} depo</span>
      </button>
      ${CS.repos.map((r) => {
        const rp = all.filter((p) => p.repoUrl === r.url);
        const inst = rp.filter((p) => p.installed !== false).length;
        return `<button class="cs-repo-tab ${csFilterRepo === r.url ? 'active' : ''}" data-repotab="${esc(r.url)}">
          ${r.iconUrl ? `<img src="${esc(r.iconUrl)}" alt="" onerror="this.style.display='none'">` : `<span class="crt-mini">${esc((r.name || 'D')[0])}</span>`}
          <span>${esc(r.name)}</span>
          <span class="crt-count">${inst}/${rp.length}</span>
        </button>`;
      }).join('')}`;
    $$('[data-repotab]', tabsWrap).forEach((b) => b.addEventListener('click', () => {
      csFilterRepo = b.dataset.repotab;
      renderCSPlugins();
    }));
  }

  const activeRepoUrl = CS.getActiveRepoUrl();
  const targetRepos = csFilterRepo === 'all'
    ? CS.repos
    : CS.repos.filter((r) => r.url === csFilterRepo);

  const matchTV = (p) => csFilterTV === 'all'
    || (p.tvTypes || []).includes(csFilterTV)
    || (csFilterTV === 'Movie' && !(p.tvTypes || []).length);

  const renderPluginCard = (p) => {
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
    return `<div class="cs-plugin-item ${installed ? '' : 'disabled'}" data-pkey="${esc(p.__key)}">
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
  };

  const groupsHtml = targetRepos.map((r) => {
    const repoAll = all.filter((p) => p.repoUrl === r.url);
    const repoFiltered = repoAll.filter(matchTV);
    const installedCount = repoAll.filter((p) => p.installed !== false).length;
    const isActive = activeRepoUrl === r.url || (!activeRepoUrl && CS.repos[0]?.url === r.url);

    return `<section class="cs-repo-group" data-repogroup="${esc(r.url)}">
      <header class="cs-rg-head">
        <div class="cs-rg-title">
          ${r.iconUrl ? `<img class="cs-rg-icon" src="${esc(r.iconUrl)}" alt="" onerror="this.style.display='none'">` : `<span class="cs-rg-fallback">${esc((r.name || 'D')[0])}</span>`}
          <div>
            <div class="cs-rg-name">
              <span>${esc(r.name)}</span>
              ${isActive ? '<span class="cs-verified">AKTİF DEPO</span>' : ''}
              <span class="cs-pill">${installedCount} yüklü / ${repoAll.length} kanal</span>
            </div>
            <div class="cs-rg-url">${esc(r.url)}</div>
          </div>
        </div>
        <div class="cs-rg-actions">
          <button class="cs-mini" data-install-repo="${esc(r.url)}" title="Bu depodaki tüm kanalları yükle">Tümünü Yükle</button>
          <button class="cs-mini danger" data-uninstall-repo="${esc(r.url)}" title="Bu depodaki tüm kurulu kanalları kaldır">Tümünü Kaldır</button>
        </div>
      </header>
      ${repoFiltered.length
        ? `<div class="cs-plugin-list">${repoFiltered.map(renderPluginCard).join('')}</div>`
        : `<p class="cs-empty" style="padding:10px 4px">Bu depoda seçili türde (${esc(csFilterTV)}) kanal bulunamadı.</p>`}
    </section>`;
  }).join('');

  wrap.innerHTML = groupsHtml || '<p class="cs-empty">Bu filtreye uygun kanal bulunamadı.</p>';

  $$('[data-install]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const p = CS.plugins.find((x) => x.__key === b.dataset.install);
    if (!p) return;
    b.disabled = true; b.textContent = 'Yükleniyor…';
    try {
      await CS.installPlugin(b.dataset.install);
      toast(`${p.name} (${p.repoName}) yüklendi ✓`);
    } catch (e) {
      toast('Yükleme başarısız: ' + e.message);
    }
    renderCSPlugins();
    renderCSRepos();
    if ($('#cs-view').classList.contains('hidden')) renderHome();
  }));

  $$('[data-remove-p]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const p = CS.plugins.find((x) => x.__key === b.dataset.removeP);
    await CS.uninstallPlugin(b.dataset.removeP);
    toast(`${p?.name || 'Eklenti'} kaldırıldı`);
    renderCSPlugins();
    renderCSRepos();
    if ($('#cs-view').classList.contains('hidden')) renderHome();
  }));

  $$('[data-install-repo]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const rUrl = b.dataset.installRepo;
    const toInstall = CS.plugins.filter((p) => p.repoUrl === rUrl && p.installed === false);
    if (!toInstall.length) { toast('Bu depodaki tüm kanallar zaten yüklü'); return; }
    b.disabled = true; b.textContent = `Yükleniyor (0/${toInstall.length})…`;
    let done = 0;
    for (const p of toInstall) {
      try { await CS.installPlugin(p.__key); done++; } catch {}
      b.textContent = `Yükleniyor (${done}/${toInstall.length})…`;
    }
    toast(`${done} kanal yüklendi ✓`);
    renderCSPlugins();
    renderCSRepos();
  }));

  $$('[data-uninstall-repo]', wrap).forEach((b) => b.addEventListener('click', async () => {
    const rUrl = b.dataset.uninstallRepo;
    const installed = CS.plugins.filter((p) => p.repoUrl === rUrl && p.installed !== false);
    if (!installed.length) { toast('Bu depoda kurulu kanal yok'); return; }
    for (const p of installed) {
      try { await CS.uninstallPlugin(p.__key); } catch {}
    }
    toast(`Depodaki ${installed.length} kanal kaldırıldı`);
    renderCSPlugins();
    renderCSRepos();
  }));

  // Kaynak siteleri dex'ten çöz (arka planda, her deponun kendi kartını zenginleştir)
  const visiblePlugins = targetRepos.flatMap((r) => all.filter((p) => p.repoUrl === r.url && matchTV(p)));
  (async () => {
    for (const p of visiblePlugins.slice(0, 50)) {
      const src = await CS.probeSource(p);
      const card = wrap.querySelector(`.cs-plugin-item[data-pkey="${CSS.escape(p.__key)}"]`);
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
    csFilterRepo = repository.url; // yeni eklenen depoyu otomatik seç
    csStatus(`"${repository.name}" eklendi — ${added} yeni eklenti bulundu (toplam ${total}).${errors.length ? ' Hatalar: ' + errors.join(' | ') : ''}`, 'ok');
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
  $('#nf-pref-sub').value = prefs.subLang || 'yok';
  $('#nf-quality-cap').value = String(prefs.qualityCap || 0);
  $('#nf-pin').addEventListener('change', (e) => { playerPrefs.set('pin', e.target.checked); toast(e.target.checked ? 'PIN koruması açıldı' : 'PIN koruması kapandı'); });
  $('#nf-autonext').addEventListener('change', (e) => playerPrefs.set('autoNext', e.target.checked));
  $('#nf-mutestart').addEventListener('change', (e) => playerPrefs.set('muteStart', e.target.checked));
  $('#nf-pref-audio').addEventListener('change', (e) => playerPrefs.set('prefAudio', e.target.value));
  $('#nf-pref-sub').addEventListener('change', (e) => {
    playerPrefs.set('subLang', e.target.value);
    toast(e.target.value === 'yok' ? 'Altyazı tercihi: otomatik seçme kapalı' : 'Altyazı tercihi kaydedildi');
  });
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
      ? '<svg viewBox="0 0 16 16"><rect x="2.8" y="4.8" width="8.2" height="8.2" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.2 4.8V3.4c0-.6.5-1.1 1.1-1.1h6.2c.6 0 1.1.5 1.1 1.1v6.2c0 .6-.5 1.1-1.1 1.1h-1.4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>'
      : '<svg viewBox="0 0 16 16"><rect x="3.2" y="3.2" width="9.6" height="9.6" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
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

/* ============================================================
   CLOUDSTREAM GÖRÜNÜM DÜZENİ + MOBİL UYGULAMA + TV D-PAD MOTORU
   Modlar: auto | phone (body.mobile-ui) | tv (body.tv-mode) | emulator
   ============================================================ */
function initPlatformAndDpad() {
  const LAYOUT_KEY = 'cs-layout-mode-v1';
  const ua = navigator.userAgent || '';
  const isAndroid = Boolean(window.ElderboxAndroid) || /Android/i.test(ua);
  if (isAndroid) document.body.classList.add('android-mode');

  function detectAutoLayout() {
    try {
      if (window.ElderboxAndroid?.isTv?.()) return 'tv';
      if (window.ElderboxAndroid?.isEmulator?.()) return 'emulator';
      if (window.ElderboxAndroid?.isMobile?.()) return 'phone';
    } catch {}
    if (location.search.includes('tv=1') || /\b(TV|AFT|BRAVIA|MiBOX|Shield|Leanback|GoogleTV|Chromecast|SmartTV)\b/i.test(ua)) {
      return 'tv';
    }
    if (location.search.includes('emulator=1')) return 'emulator';
    if (location.search.includes('mobile=1')) return 'phone';
    if (!window.pywebview && window.innerWidth <= 820) return 'phone';
    return 'emulator';
  }

  const MODE_LABELS = {
    phone: 'Telefon Görünümü',
    tv: 'TV Görünümü',
    emulator: 'Emülatör / Masaüstü',
  };

  function getSavedLayoutMode() {
    const raw = localStorage.getItem(LAYOUT_KEY) || 'auto';
    return ['auto', 'phone', 'tv', 'emulator'].includes(raw) ? raw : 'auto';
  }

  let effectiveMode = 'emulator';

  function renderLayoutModeCards() {
    const saved = getSavedLayoutMode();
    const autoDetected = detectAutoLayout();
    $$('#layout-mode-grid .layout-mode-card').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.layoutMode === saved);
    });
    const badge = $('#lm-auto-detected');
    if (badge) {
      badge.textContent = `Otomatik algılama · Algılanan: ${MODE_LABELS[autoDetected] || 'Telefon'}`;
    }
  }
  window.__renderLayoutModeCards = renderLayoutModeCards;

  function applyLayoutMode(mode, notify = false) {
    const clean = ['auto', 'phone', 'tv', 'emulator'].includes(mode) ? mode : 'auto';
    localStorage.setItem(LAYOUT_KEY, clean);
    effectiveMode = clean === 'auto' ? detectAutoLayout() : clean;

    document.body.classList.toggle('mobile-ui', effectiveMode === 'phone');
    document.body.classList.toggle('tv-mode', effectiveMode === 'tv');
    document.body.classList.toggle('emulator-mode', effectiveMode === 'emulator');
    if (effectiveMode !== 'phone') {
      document.body.classList.remove('mobile-search-open');
    }

    try { window.ElderboxAndroid?.setLayoutMode?.(clean); } catch {}
    renderLayoutModeCards();

    if (notify) {
      const label = clean === 'auto'
        ? `Otomatik (${MODE_LABELS[effectiveMode]})`
        : MODE_LABELS[effectiveMode];
      toast(`Görünüm düzeni: ${label}`);
    }
  }

  applyLayoutMode(getSavedLayoutMode(), false);

  window.addEventListener('resize', () => {
    if (getSavedLayoutMode() === 'auto' && !window.ElderboxAndroid) {
      const next = detectAutoLayout();
      if (next !== effectiveMode) applyLayoutMode('auto', false);
    }
  }, { passive: true });

  /* Mobil Alt Sekme Çubuğu & Kategori Hapları Senkronizasyonu */
  window.__syncMobileNav = function(activeTab) {
    $$('#mobile-tabbar .mob-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.mobTab === activeTab);
    });
    const pills = $('#mobile-pills');
    if (pills) {
      pills.classList.toggle('hidden-pills', activeTab !== 'home');
    }
  };

  function bindMobileShell() {
    renderLayoutModeCards();
    $$('#layout-mode-grid .layout-mode-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyLayoutMode(btn.dataset.layoutMode || 'auto', true);
      });
    });

    /* Alt Navigasyon Çubuğu (Ana Sayfa / Yeni ve Popüler / Ara / Listem / Depolar) */
    $$('#mobile-tabbar .mob-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.mobTab;
        $('#repo-picker')?.classList.remove('open');

        if (tab === 'home') {
          document.body.classList.remove('mobile-search-open');
          $('#search-box')?.classList.remove('open');
          if ($('#search-input')) $('#search-input').value = '';
          state.typeFilter = null;
          $$('#mobile-pills .mob-pill[data-mob-filter]').forEach((p) => {
            p.classList.toggle('active', p.dataset.mobFilter === 'all');
          });
          $$('.nav-link').forEach((x) => x.classList.toggle('active', x.dataset.view === 'home'));
          window.scrollTo(0, 0);
          renderHome();
          return;
        }

        if (tab === 'new') {
          document.body.classList.remove('mobile-search-open');
          $('#search-box')?.classList.remove('open');
          state.view = 'new';
          const { rows, repo } = state.homeCache;
          const uniq = [...new Map((rows || []).flatMap((r) => r.items).map((i) => [i.url, i])).values()];
          const list = [...uniq].sort((a, b) => (b.year || 0) - (a.year || 0)).slice(0, 42);
          showGridView('Yeni ve Popüler' + (repo?.name ? ' · ' + repo.name : ''), list, null, list.length ? null : 'Önce bir depo ve kanal seçerek içeriklerin yüklenmesini bekleyin.');
          window.__syncMobileNav('new');
          return;
        }

        if (tab === 'search') {
          const sbox = $('#search-box');
          const sinput = $('#search-input');
          if (sbox && sinput) {
            sbox.classList.add('open');
            document.body.classList.add('mobile-search-open');
            window.__syncMobileNav('search');
            const q = sinput.value.trim();
            if (!q) {
              const { rows } = state.homeCache;
              const sample = [...new Map((rows || []).flatMap((r) => r.items).map((i) => [i.url, i])).values()].slice(0, 24);
              showGridView('Arama — Önerilen İçerikler', sample, null, 'Aramak istediğin film, dizi veya anime adını yukarıya yaz.');
            }
            setTimeout(() => sinput.focus(), 40);
          }
          return;
        }

        if (tab === 'list') {
          document.body.classList.remove('mobile-search-open');
          $('#search-box')?.classList.remove('open');
          state.view = 'list';
          showBookmarksView();
          window.__syncMobileNav('list');
          return;
        }

        if (tab === 'deps') {
          document.body.classList.remove('mobile-search-open');
          $('#search-box')?.classList.remove('open');
          showSettingsView('deps');
          window.__syncMobileNav('deps');
        }
      });
    });

    /* Üst Kategori Hapları (Tümü / Diziler / Filmler / Kanallar ▾) */
    $$('#mobile-pills .mob-pill[data-mob-filter]').forEach((pill) => {
      pill.addEventListener('click', () => {
        $$('#mobile-pills .mob-pill[data-mob-filter]').forEach((x) => x.classList.remove('active'));
        pill.classList.add('active');
        const f = pill.dataset.mobFilter;
        state.typeFilter = f === 'series' ? 'TvSeries' : (f === 'movies' ? 'Movie' : null);
        window.scrollTo(0, 0);
        renderHome();
      });
    });

    $('#mob-pill-chan')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!CS.repos.length) {
        showSettingsView('deps');
        return;
      }
      openMobileRepoSheet();
    });

    $('#ms-close')?.addEventListener('click', () => closeMobileRepoSheet());
    $('#mobile-sheet-overlay')?.addEventListener('click', (e) => {
      if (e.target === $('#mobile-sheet-overlay')) closeMobileRepoSheet();
    });

    document.addEventListener('click', (e) => {
      const rp = $('#repo-picker');
      if (rp && rp.classList.contains('open') && !rp.contains(e.target) && e.target !== $('#mob-pill-chan')) {
        rp.classList.remove('open');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindMobileShell);
  } else {
    bindMobileShell();
  }

  /* Android Geri Tuşu & Kumanda Back Yöneticisi */
  window.__elderboxBack = function() {
    const confirmOv = $('#confirm-overlay');
    if (confirmOv && !confirmOv.classList.contains('hidden')) {
      $('#confirm-cancel')?.click();
      return true;
    }
    const msOv = $('#mobile-sheet-overlay');
    if (msOv && !msOv.classList.contains('hidden')) {
      closeMobileRepoSheet();
      return true;
    }
    const p = $('#player');
    if (p && !p.classList.contains('hidden')) {
      const drawer = $('#eps-drawer');
      if (drawer && !drawer.classList.contains('hidden')) {
        drawer.classList.add('hidden');
        return true;
      }
      closePlayer();
      return true;
    }
    const modalOv = $('#modal-overlay');
    if (modalOv && !modalOv.classList.contains('hidden')) {
      closeModal();
      return true;
    }
    const rp = $('#repo-picker');
    if (rp && rp.classList.contains('open')) {
      rp.classList.remove('open');
      return true;
    }
    const sb = $('#search-box');
    if (sb && sb.classList.contains('open')) {
      $('#search-input').value = '';
      sb.classList.remove('open');
      document.body.classList.remove('mobile-search-open');
      renderHome();
      return true;
    }
    if (state.view && state.view !== 'home') {
      state.typeFilter = null;
      $$('.nav-link').forEach((x) => x.classList.toggle('active', x.dataset.view === 'home'));
      renderHome();
      return true;
    }
    return false;
  };

  /* Uzaktan Kumanda (D-Pad) Odaklama Motoru */
  const FOCUS_SEL = [
    '.card',
    '.nav-link',
    '.btn-play',
    '.btn-info',
    '.icon-btn',
    '.rp-btn',
    '.rp-item',
    '.md-close',
    '.md-ep',
    '.set-tab',
    '.layout-mode-card',
    '.cs-repo-tab',
    '.cs-addbtn',
    '.cs-official-item',
    '.cs-install-btn',
    '.cs-mini',
    '.cs-filter',
    '.cs-input',
    '.nf-select',
    '.mob-tab',
    '.mob-pill',
    '.p-btn',
    '.pm-btn',
    '.ep-item',
    '.ne-play',
    '.ne-close',
    '#confirm-ok',
    '#confirm-cancel'
  ].join(',');

  let currentFocus = null;

  function isVisible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest('.hidden') || el.closest('[hidden]')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 4 && r.height > 4;
  }

  function activeScope() {
    const confirmOv = $('#confirm-overlay');
    if (confirmOv && !confirmOv.classList.contains('hidden')) return $('#confirm-box') || confirmOv;
    const p = $('#player');
    if (p && !p.classList.contains('hidden')) {
      const drawer = $('#eps-drawer');
      if (drawer && !drawer.classList.contains('hidden')) return drawer;
      return p;
    }
    const modalOv = $('#modal-overlay');
    if (modalOv && !modalOv.classList.contains('hidden')) return $('#modal') || modalOv;
    const rp = $('#repo-picker');
    if (rp && rp.classList.contains('open')) return $('.rp-menu', rp) || rp;
    return document.body;
  }

  function setTvFocus(el) {
    if (!el) return;
    document.querySelectorAll('.tv-focus').forEach((n) => n.classList.remove('tv-focus'));
    currentFocus = el;
    el.classList.add('tv-focus');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    try { el.focus({ preventScroll: true }); } catch {}
    try {
      el.scrollIntoView({ behavior: effectiveMode === 'tv' ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
    } catch {}
  }

  function findNextFocus(dir) {
    const scope = activeScope();
    const candidates = [...scope.querySelectorAll(FOCUS_SEL)].filter(isVisible);
    if (!candidates.length) return null;
    if (!currentFocus || !isVisible(currentFocus) || !scope.contains(currentFocus)) {
      return candidates[0];
    }
    const curRect = currentFocus.getBoundingClientRect();
    const cx = curRect.left + curRect.width / 2;
    const cy = curRect.top + curRect.height / 2;
    const curRow = currentFocus.closest('.row-track, .cs-repo-tabs, .hero-btns, .set-side, .p-row, #mobile-tabbar, #mobile-pills');

    let best = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      if (el === currentFocus) continue;
      const r = el.getBoundingClientRect();
      const ex = r.left + r.width / 2;
      const ey = r.top + r.height / 2;
      const dx = ex - cx;
      const dy = ey - cy;

      if (dir === 'right' && dx <= 6) continue;
      if (dir === 'left' && dx >= -6) continue;
      if (dir === 'down' && dy <= 6) continue;
      if (dir === 'up' && dy >= -6) continue;

      const primary = (dir === 'left' || dir === 'right') ? Math.abs(dx) : Math.abs(dy);
      const ortho = (dir === 'left' || dir === 'right') ? Math.abs(dy) : Math.abs(dx);

      const sameRow = curRow && curRow === el.closest('.row-track, .cs-repo-tabs, .hero-btns, .set-side, .p-row, #mobile-tabbar, #mobile-pills');
      if ((dir === 'left' || dir === 'right') && curRow && !sameRow && ortho > curRect.height * 0.85) {
        continue;
      }

      const weight = (dir === 'left' || dir === 'right') ? 3.5 : 2.0;
      const score = primary + ortho * weight - (sameRow ? 40 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  document.addEventListener('keydown', (e) => {
    const tag = (e.target?.tagName || '').toUpperCase();
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
      if (inInput) {
        e.target.blur();
        return;
      }
      if (window.__elderboxBack()) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    const p = $('#player');
    const drawer = $('#eps-drawer');
    if (p && !p.classList.contains('hidden') && (!drawer || drawer.classList.contains('hidden'))) {
      if (e.key === 'Enter' && (!currentFocus || !p.contains(currentFocus))) {
        e.preventDefault();
        $('#p-play')?.click();
      }
      return;
    }

    if (inInput && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;

    const dirMap = { ArrowRight: 'right', ArrowLeft: 'left', ArrowDown: 'down', ArrowUp: 'up' };
    const dir = dirMap[e.key];
    if (dir) {
      e.preventDefault();
      const next = findNextFocus(dir);
      if (next) setTvFocus(next);
      return;
    }

    if (e.key === 'Enter' && currentFocus && isVisible(currentFocus) && !inInput) {
      e.preventDefault();
      currentFocus.click();
    }
  });

  document.addEventListener('pointermove', () => {
    if (effectiveMode !== 'tv' && currentFocus) {
      currentFocus.classList.remove('tv-focus');
      currentFocus = null;
    }
  }, { passive: true });
}
initPlatformAndDpad();
