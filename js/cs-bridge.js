/* ============================================================
   CloudStream köprü katmanı — v2
   ------------------------------------------------------------
   Gerçek CloudStream veri akışının tarayıcı tarafı aynası:

     PluginManager  → APIHolder.allProviders        (kurulu sağlayıcılar)
     MainAPI        → getMainPage(page, request)    (sağlayıcı ana sayfası)
                    → HomePageResponse              (satır listesi)
                    → HomePageList(name, items)     (tek satır)
                    → SearchResponse                (tek içerik: name,url,apiName,type,poster)
     load(url)      → LoadResponse → loadLinks      (oynatma)

   Sağlayıcı kodu (jar/dex) yalnızca masaüstü altyapısında çalışır.
   window.CloudStreamDesktop varsa gerçek backend kullanılır; yoksa
   sağlayıcının KENDİ KAYNAK SİTESİNİN açık API'sinden canlı içerik
   çekilir (Internet Archive, Dailymotion vb.). Kaynağı tarayıcıdan
   erişilemeyen sağlayıcılar için sahte veri ÜRETİLMEZ — "masaüstü
   altyapısı gerekli" durumu gösterilir.
   ============================================================ */
'use strict';

const CS = (() => {
  const LS_REPOS = 'cs-repos-v1';
  const LS_PLUGINS = 'cs-plugins-v1';
  const LS_SETTINGS = 'cs-settings-v1';
  const LS_ACTIVE = 'cs-active-repo';
  const LS_ACTIVE_PROV = 'cs-active-provider';
  const LS_BOOKMARKS = 'cs-bookmarks-v1';
  const LS_HISTORY = 'cs-history-v1';

  const REPO_SCHEME = /^(cloudstreamrepo:\/\/)|(https:\/\/cs\.repo\/\??)/;
  const GH_REGEX = /^https:\/\/raw\.githubusercontent\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)\/(.*)$/;
  const OFFICIAL_DB = 'https://raw.githubusercontent.com/recloudstream/cs-repos/master/repos-db.json';

  const DEFAULT_SETTINGS = { jsdelivrProxy: false };

  /* ---------- durum ---------- */
  let repos = [];
  let plugins = [];
  let settings = { ...DEFAULT_SETTINGS };
  let bookmarks = [];
  let history = [];

  function load() {
    try { repos = JSON.parse(localStorage.getItem(LS_REPOS) || '[]'); } catch { repos = []; }
    try { plugins = JSON.parse(localStorage.getItem(LS_PLUGINS) || '[]'); } catch { plugins = []; }
    try { settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; } catch {}
    try { bookmarks = JSON.parse(localStorage.getItem(LS_BOOKMARKS) || '[]'); } catch { bookmarks = []; }
    try { history = JSON.parse(localStorage.getItem(LS_HISTORY) || '[]'); } catch { history = []; }
    // Eski veri: installed alanı olmayanlar kurulu sayılır
    let migrated = false;
    for (const p of plugins) if (p.installed === undefined) { p.installed = true; migrated = true; }
    if (migrated) savePlugins();
  }
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const saveRepos = () => save(LS_REPOS, repos);
  const savePlugins = () => save(LS_PLUGINS, plugins);
  const saveSettings = () => save(LS_SETTINGS, settings);
  const saveBookmarks = () => save(LS_BOOKMARKS, bookmarks);
  const saveHistory = () => save(LS_HISTORY, history);

  const desktop = () => (typeof window !== 'undefined' && window.CloudStreamDesktop) || null;

  /* ============================================================
     JVM REST KÖPRÜSÜ — CloudStream masaüstü altyapısı
     BridgeServer (127.0.0.1:8765) gerçek PluginManager + DexConverter
     zincirini çalıştırır: .cs3 → dex→jar → sağlayıcı → içerik.
     ============================================================ */
  const BRIDGE_URL = 'http://127.0.0.1:8765';
  let bridgeOk = true;
  let bridgeVerified = false;
  let bridgePromise = null;

  async function pingBridge(timeoutMs = 1500) {
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(`${BRIDGE_URL}/api/health`, { signal: ctl.signal });
      clearTimeout(t);
      return res.ok;
    } catch {
      return false;
    }
  }

  async function ensureBridge(force = false) {
    if (bridgeVerified && bridgeOk && !force) return true;
    if (bridgePromise && !force) return bridgePromise;

    bridgePromise = (async () => {
      if (await pingBridge(1500)) {
        bridgeOk = true;
        bridgeVerified = true;
        return true;
      }
      // Gömülü köprü henüz ısınmamışsa arka planda tetikle ve hazır olana dek bekle
      try { window.pywebview?.api?.start_bridge?.(); } catch {}
      fetch('/bridge-start').catch(() => {});

      for (let i = 0; i < 35; i++) {
        await new Promise((r) => setTimeout(r, 400));
        if (await pingBridge(1500)) {
          bridgeOk = true;
          bridgeVerified = true;
          return true;
        }
      }
      bridgeOk = false;
      bridgeVerified = false;
      return false;
    })();

    try {
      return await bridgePromise;
    } finally {
      bridgePromise = null;
    }
  }

  const tvTypeToUi = (t) => t || 'Others';

  /* Altyazı dil kodunu okunabilir etikete çevir */
  const SUB_LANGS = { tr: 'Türkçe', tur: 'Türkçe', turkish: 'Türkçe', en: 'İngilizce', eng: 'İngilizce', english: 'İngilizce', de: 'Almanca', ger: 'Almanca', fr: 'Fransızca', fre: 'Fransızca', es: 'İspanyolca', spa: 'İspanyolca', it: 'İtalyanca', ita: 'İtalyanca', ru: 'Rusça', rus: 'Rusça', ar: 'Arapça', ara: 'Arapça', fa: 'Farsça', per: 'Farsça', pl: 'Lehçe', por: 'Portekizce', nl: 'Felemenkçe' };
  function subtitleLabel(lang) {
    const raw = String(lang || '').trim();
    const key = raw.toLowerCase().split(/[-_]/)[0];
    const name = SUB_LANGS[key] || SUB_LANGS[raw.toLowerCase()] || raw || 'Altyazı';
    return `${name} Altyazı`;
  }

  function resolvePluginMeta(repoUrl, nameHint) {
    const active = getActiveProvider(repoUrl);
    if (active && (!nameHint || active.name === nameHint || active.internalName === nameHint)) return active;
    if (nameHint) {
      const m = plugins.find((p) =>
        (!repoUrl || p.repoUrl === repoUrl) &&
        (p.name === nameHint || p.internalName === nameHint)
      );
      if (m) return m;
    }
    return active || null;
  }

  function appendProvParams(params, pMeta, fallbackName = '') {
    const name = pMeta?.name || fallbackName || '';
    if (name) params.set('provider', name);
    if (pMeta?.repoUrl) params.set('repo', pMeta.repoUrl);
    if (pMeta?.internalName || pMeta?.name) params.set('internal', pMeta.internalName || pMeta.name);
  }

  const restClient = {
    async getHome(repoUrl) {
      const prov = getActiveProvider(repoUrl);
      const params = new URLSearchParams();
      if (prov) appendProvParams(params, prov);
      const qs = params.toString() ? `?${params.toString()}` : '';
      const res = await fetch(`${BRIDGE_URL}/api/home${qs}`);
      if (!res.ok) throw new Error('köprü: HTTP ' + res.status);
      const data = await res.json();
      const rows = (data.rows || []).map((r) => ({
        name: r.name,
        provider: r.provider,
        items: (r.items || []).map((i) => ({
          name: i.name, url: i.url, poster: i.poster || '',
          apiName: i.apiName || r.provider, type: tvTypeToUi(i.type),
          year: i.year || null,
        })),
      }));
      return { repo: getActiveRepo(), rows, backendOnly: [] };
    },
    async search(repoUrl, q) {
      const prov = getActiveProvider(repoUrl);
      const params = new URLSearchParams({ q });
      if (prov) appendProvParams(params, prov);
      const res = await fetch(`${BRIDGE_URL}/api/search?${params.toString()}`);
      if (!res.ok) throw new Error('köprü: HTTP ' + res.status);
      const data = await res.json();
      return (data.results || []).map((i) => ({
        name: i.name, url: i.url, poster: i.poster || '',
        apiName: i.apiName, type: tvTypeToUi(i.type), year: i.year || null,
      }));
    },
    async load(repoUrl, item) {
      const pMeta = resolvePluginMeta(repoUrl, item.apiName);
      const params = new URLSearchParams({ url: item.url });
      appendProvParams(params, pMeta, item.apiName);
      const res = await fetch(`${BRIDGE_URL}/api/load?${params.toString()}`);
      if (!res.ok) throw new Error('köprü: HTTP ' + res.status);
      const d = await res.json();
      return {
        name: d.name, poster: d.poster || '', desc: d.plot || null,
        year: null, creator: null, apiName: d.apiName,
        dataUrl: d.dataUrl || null,
        episodes: (d.episodes || []).map((e) => ({
          name: e.name, season: e.season, episode: e.episode,
          data: e.data, poster: e.poster, description: e.description,
        })),
      };
    },
    async links(repoUrl, data) {
      const pMeta = resolvePluginMeta(repoUrl);
      const params = new URLSearchParams({ data });
      appendProvParams(params, pMeta);
      const res = await fetch(`${BRIDGE_URL}/api/links?${params.toString()}`);
      if (!res.ok) throw new Error('köprü: HTTP ' + res.status);
      const j = await res.json();
      // Altyazıları da link listesine kat (CloudStream subtitle mantığı)
      const subs = (j.subtitles || []).map((s) => ({
        url: s.url, source: subtitleLabel(s.lang), subtitle: true, lang: s.lang, quality: 0, isM3u8: false,
      }));
      return { links: j.links || [], subtitles: subs };
    },
    ok: () => bridgeOk,
    url: BRIDGE_URL,
  };

  /* ============================================================
     DEPO / EKLENTİ YÖNETİMİ (masaüstü port birebir)
     ============================================================ */
  function parseRepoUrl(input) {
    let fixed = String(input || '').trim();
    if (!fixed) return null;
    if (REPO_SCHEME.test(fixed)) fixed = fixed.replace(REPO_SCHEME, '');
    if (!/^https?:\/\//.test(fixed)) fixed = 'https://' + fixed;
    return fixed;
  }

  function convertRawGitUrl(url) {
    if (!settings.jsdelivrProxy) return url;
    const m = GH_REGEX.exec(url);
    if (!m) return url;
    return `https://cdn.jsdelivr.net/gh/${m[1]}/${m[2]}@${m[3]}`;
  }

  async function fetchJSON(url) {
    const res = await fetch(convertRawGitUrl(url), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
    return res.json();
  }

  async function loadRepo(repoUrl) {
    const data = await fetchJSON(repoUrl);
    const lists = Array.isArray(data.pluginLists) && data.pluginLists.length
      ? data.pluginLists
      : [repoUrl.replace(/repo\.json.*$/, 'plugins.json')];
    const resolved = lists.map((l) => /^https?:\/\//.test(l) ? l : new URL(l, repoUrl).href);

    const remote = [];
    const errors = [];
    await Promise.all(resolved.map(async (listUrl) => {
      try {
        const list = await fetchJSON(listUrl);
        (Array.isArray(list) ? list : (list.plugins || [])).forEach((p) => remote.push(p));
      } catch (e) { errors.push(`${listUrl}: ${e.message}`); }
    }));

    const repository = {
      url: repoUrl,
      name: data.name || repoUrlHostname(repoUrl),
      iconUrl: data.iconUrl || null,
      description: data.description || null,
      manifestVersion: data.manifestVersion || 1,
      pluginLists: resolved,
    };
    return { repository, plugins: remote, errors };
  }

  function repoUrlHostname(url) { try { return new URL(url).hostname; } catch { return 'Depo'; } }

  const pluginKey = (repoUrl, internalName) => repoUrl + '::' + internalName;

  /* Bazı depolar metinleri çift kodlu (UTF-8 → cp1252) kaydeder — onar */
  const CP1252_REV = { '\u20AC': 0x80, '\u201A': 0x82, '\u0192': 0x83, '\u201E': 0x84, '\u2026': 0x85, '\u2020': 0x86, '\u2021': 0x87, '\u02C6': 0x88, '\u2030': 0x89, '\u0160': 0x8A, '\u2039': 0x8B, '\u0152': 0x8C, '\u017D': 0x8E, '\u2018': 0x91, '\u2019': 0x92, '\u201C': 0x93, '\u201D': 0x94, '\u2022': 0x95, '\u2013': 0x96, '\u2014': 0x97, '\u02DC': 0x98, '\u2122': 0x99, '\u0161': 0x9A, '\u203A': 0x9B, '\u0153': 0x9C, '\u017E': 0x9E, '\u0178': 0x9F };
  function fixTxt(s) {
    if (typeof s !== 'string' || !/[ÃÄÅÅ]/.test(s)) return s;
    try {
      const bytes = [];
      for (const ch of s) {
        const c = ch.codePointAt(0);
        if (CP1252_REV[ch] !== undefined) bytes.push(CP1252_REV[ch]);
        else if (c < 0x100) bytes.push(c);
        else return s; // tablo dışı karakter — dokunma
      }
      const out = new TextDecoder('utf-8').decode(new Uint8Array(bytes));
      return out.includes('\uFFFD') ? s : out;
    } catch { return s; }
  }

  /* Kısa kod çözümü (masaüstüyle aynı biçimler):
     "kullanıcı!depo" → raw.githubusercontent.com/kullanıcı/depo (master → main dalı denenir)
     "!kod"           → py.md kısaltması
     "kod"            → py.md, olmazsa cutt.ly kısaltması
     Düz adreslerde null döner. */
  async function resolveRepoShortCode(code) {
    const compact = String(code || '').trim().replace(/\s+/g, '');
    if (!compact) return null;
    const gh = /^([A-Za-z0-9_.-]+)!([A-Za-z0-9_.-]+)$/.exec(compact);
    if (gh) return `https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/master/repo.json`;
    // Nokta içermeyen düz sözcükler kısaltma kodudur
    if (!/^[a-zA-Z0-9!_-]+$/.test(compact)) return null;
    const targets = compact.startsWith('!')
      ? ['https://py.md/' + compact.slice(1)]
      : ['https://py.md/' + compact, 'https://cutt.ly/' + compact];
    for (const t of targets) {
      try {
        const res = await fetch('/csproxy?resolve=1&url=' + encodeURIComponent(t));
        const j = await res.json().catch(() => ({}));
        if (res.ok && j.url) return j.url;
      } catch { /* sıradakini dene */ }
    }
    throw new Error('Kısa kod çözülemedi: ' + compact);
  }

  async function addRepo(input) {
    const raw = String(input || '').trim();
    // "turksinema !mrc-cs" gibi boşlukla ayrılmış çoklu kısa kod
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length > 1 && parts.every((p) => /^[a-zA-Z0-9!_-]+$/.test(p))) {
      const names = [], errors = [];
      let added = 0, total = 0;
      for (const p of parts) {
        try {
          const r = await addRepoSingle(p);
          names.push(r.repository.name); added += r.added; total += r.total;
        } catch (e) { errors.push(`${p}: ${e.message}`); }
      }
      if (!names.length) throw new Error(errors.join(' | ') || 'Kısa kod çözülemedi');
      return { repository: { name: names.join(', ') }, added, total, errors };
    }
    return addRepoSingle(input);
  }

  async function addRepoSingle(input) {
    const shortUrl = await resolveRepoShortCode(input).catch((e) => { throw new Error(e.message); });
    let url = shortUrl || parseRepoUrl(input);
    if (!url) throw new Error('Geçersiz depo adresi');
    if (repos.some((r) => r.url === url)) throw new Error('Bu depo zaten ekli');
    let loaded;
    try {
      loaded = await loadRepo(url);
    } catch (e) {
      // kısa kodda master dalı yoksa main dalını dene
      const alt = url.replace('/master/repo.json', '/main/repo.json');
      if (shortUrl && alt !== url) { url = alt; loaded = await loadRepo(url); }
      else throw e;
    }
    const { repository, plugins: remote, errors } = loaded;
    repos.unshift({ ...repository, addedAt: Date.now() });
    saveRepos();
    // Katalog: yalnızca listeye eklenir, otomatik YÜKLENMEZ — kullanıcı Ayarlar'dan seçer
    let added = 0;
    for (const p of remote) {
      const key = pluginKey(repository.url, p.internalName || p.name);
      if (plugins.some((x) => x.__key === key)) continue;
      plugins.push({ ...p, name: fixTxt(p.name), description: fixTxt(p.description), __key: key, repoUrl: repository.url, repoName: repository.name, enabled: true, installed: false, installedAt: Date.now() });
      added++;
    }
    savePlugins();
    // Köprü bağlıysa depoyu JVM tarafına da kur (gerçek PluginManager)
    if (await ensureBridge()) {
      try {
        await fetch(`${BRIDGE_URL}/api/addrepo?repo=${encodeURIComponent(url)}`);
      } catch { /* köprü hatası kritik değil */ }
    }
    return { repository, added, total: remote.length, errors };
  }

  /* Tek eklenti kurulumu — JVM köprüsünde gerçek PluginManager.install çalışır */
  async function installPlugin(key) {
    const p = plugins.find((x) => x.__key === key);
    if (!p) throw new Error('eklenti bulunamadı');
    if (await ensureBridge()) {
      const res = await fetch(`${BRIDGE_URL}/api/install?repo=${encodeURIComponent(p.repoUrl)}&internal=${encodeURIComponent(p.internalName || p.name)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || 'kurulum başarısız');
      }
    }
    p.installed = true;
    savePlugins();
    return p;
  }

  async function uninstallPlugin(key) {
    const p = plugins.find((x) => x.__key === key);
    if (!p) return;
    if (await ensureBridge()) {
      await fetch(`${BRIDGE_URL}/api/uninstall?internal=${encodeURIComponent(p.internalName || p.name)}`).catch(() => {});
    }
    p.installed = false;
    savePlugins();
  }

  function removeRepo(url) {
    repos = repos.filter((r) => r.url !== url);
    plugins = plugins.filter((p) => p.repoUrl !== url);
    if (getActiveRepoUrl() === url) localStorage.removeItem(LS_ACTIVE);
    saveRepos(); savePlugins();
  }

  async function refreshRepo(url) {
    const { repository, plugins: remote, errors } = await loadRepo(url);
    const i = repos.findIndex((r) => r.url === url);
    if (i >= 0) repos[i] = { ...repos[i], ...repository, addedAt: repos[i].addedAt };
    for (const p of remote) {
      const key = pluginKey(url, p.internalName || p.name);
      const ex = plugins.find((x) => x.__key === key);
      if (ex) Object.assign(ex, p, { repoName: repository.name });
      else plugins.push({ ...p, __key: key, repoUrl: url, repoName: repository.name, enabled: true, installedAt: Date.now() });
    }
    saveRepos(); savePlugins();
    return { repository, errors };
  }

  function setEnabled(key, on) {
    const p = plugins.find((x) => x.__key === key);
    if (p) { p.enabled = on; savePlugins(); }
  }
  function uninstall(key) { plugins = plugins.filter((x) => x.__key !== key); savePlugins(); }

  const STATUS_LABEL = { 0: 'Kapalı', 1: 'Çalışıyor', 2: 'Yavaş', 3: 'Beta' };

  async function officialRepos() {
    try {
      const db = await fetchJSON(OFFICIAL_DB);
      const items = Array.isArray(db) ? db : (db.repositories || []);
      return items.filter((r) => r && r.url);
    } catch { return []; }
  }

  /* ============================================================
     AKTİF DEPO — ana sayfa tekil depo seçimi
     ============================================================ */
  function getActiveRepoUrl() { return localStorage.getItem(LS_ACTIVE); }
  function setActiveRepo(url) { url ? localStorage.setItem(LS_ACTIVE, url) : localStorage.removeItem(LS_ACTIVE); }
  function getActiveRepo() {
    const url = getActiveRepoUrl();
    if (url) { const r = repos.find((x) => x.url === url); if (r) return r; }
    return repos[0] || null; // hiçbiri seçili değilse ilk kurulu depo
  }

  /* Aktif kanal — depo içindeki tekil sağlayıcı seçimi */
  function getActiveProviderKey() { return localStorage.getItem(LS_ACTIVE_PROV); }
  function setActiveProviderKey(key) {
    key ? localStorage.setItem(LS_ACTIVE_PROV, key) : localStorage.removeItem(LS_ACTIVE_PROV);
  }
  function getActiveProvider(repoUrl) {
    const key = getActiveProviderKey();
    if (!key) return null;
    const p = plugins.find((x) => x.__key === key && x.installed !== false && x.enabled && x.status !== 0);
    if (!p) return null;
    if (repoUrl && p.repoUrl !== repoUrl) return null; // başka depodan kalma seçim
    return p;
  }

  /* Bir depodaki etkin sağlayıcılar — yalnızca KULLANICININ YÜKLEDİĞİ eklentiler */
  function repoProviders(repoUrl) {
    return plugins.filter((p) => p.repoUrl === repoUrl && p.installed !== false && p.enabled && p.status !== 0);
  }
  function providers() {
    const a = getActiveRepo();
    return a ? repoProviders(a.url) : [];
  }

  /* ============================================================
     İÇERİK ADAPTÖRLERİ — MainAPI.getMainPage karşılığı
     Her adaptör gerçek SearchResponse'lar döndürür:
     { name, url, poster, apiName, type, year, embed?, meta? }
     ============================================================ */
  const TIMEOUT = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), ms));
  async function jget(url) {
    const res = await Promise.race([fetch(url, { headers: { Accept: 'application/json' } }), TIMEOUT(9000)]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }
  /* Sunucu-taraflı köprü (geliştirme karşılığı): masaüstü backend'i bağlandığında
     bu çağrılar window.CloudStreamDesktop.load'a dönüşür. */
  function proxied(url) { return '/csproxy?url=' + encodeURIComponent(url); }
  async function pget(url) {
    const res = await Promise.race([fetch(proxied(url), { headers: { Accept: 'application/json' } }), TIMEOUT(15000)]);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* --- Internet Archive (InternetArchiveProvider'ın kaynağı) --- */
  const IA = {
    match: (p) => /internetarchive|archive\.org/i.test(p.internalName + ' ' + p.name),
    async home() {
      const rows = [];
      const mk = async (title, q, type) => {
        const u = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q)}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&fl%5B%5D=description&rows=16&page=1&output=json&sort%5B%5D=downloads+desc`;
        const d = await jget(u);
        const items = (d.response?.docs || []).map((x) => ({
          name: x.title || x.identifier,
          url: 'ia:' + x.identifier,
          poster: `https://archive.org/services/img/${x.identifier}`,
          apiName: 'Internet Archive',
          type: type || 'Movie',
          year: x.year || null,
          embed: `https://archive.org/embed/${x.identifier}`,
          id: x.identifier,
        })).filter((x) => x.name);
        if (items.length) rows.push({ name: title, items, isHorizontalImages: false });
      };
      await mk('Klasik Filmler', 'collection:feature_films AND mediatype:movies', 'Movie');
      await mk('Sessiz Film Klasikleri', 'collection:silent_films AND mediatype:movies', 'Movie');
      await mk('Belgeseller', 'collection:documentaries AND mediatype:movies', 'Documentary');
      await mk('Sci-Fi Klasikleri', 'collection:scifi_horror AND mediatype:movies', 'Movie');
      return rows;
    },
    async search(q) {
      const u = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(q + ' AND mediatype:movies')}&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=year&rows=24&page=1&output=json`;
      const d = await jget(u);
      return (d.response?.docs || []).map((x) => ({
        name: x.title || x.identifier,
        url: 'ia:' + x.identifier,
        poster: `https://archive.org/services/img/${x.identifier}`,
        apiName: 'Internet Archive',
        type: 'Movie',
        year: x.year || null,
        embed: `https://archive.org/embed/${x.identifier}`,
        id: x.identifier,
      }));
    },
    async details(url) {
      const id = url.replace(/^ia:/, '');
      const d = await jget(`https://archive.org/metadata/${id}`);
      const md = d.metadata || {};
      return {
        name: md.title || id,
        poster: `https://archive.org/services/img/${id}`,
        desc: (md.description || '').replace(/<[^>]*>/g, '').slice(0, 600) || null,
        year: md.year || null,
        creator: md.creator || null,
        embed: `https://archive.org/embed/${id}`,
        apiName: 'Internet Archive',
      };
    },
  };

  /* --- Dailymotion (DailymotionProvider'ın kaynağı) --- */
  const DM = {
    match: (p) => /dailymotion/i.test(p.internalName + ' ' + p.name),
    async home() {
      const rows = [];
      const mk = async (title, params, type) => {
        const u = `https://api.dailymotion.com/videos?fields=id,title,thumbnail_360_url,duration,owner.screenname&limit=16&${params}`;
        const d = await jget(u);
        const items = (d.list || []).map((x) => ({
          name: x.title,
          url: 'dm:' + x.id,
          poster: x.thumbnail_360_url,
          apiName: 'Dailymotion',
          type: type,
          year: null,
          embed: `https://geo.dailymotion.com/player.html?video=${x.id}`,
          id: x.id,
        }));
        if (items.length) rows.push({ name: title, items });
      };
      await mk('Trend Videolar', 'sort=trending', 'Others');
      await mk('Yeni Yüklenenler', 'sort=recent', 'Others');
      return rows;
    },
    async search(q) {
      const u = `https://api.dailymotion.com/videos?fields=id,title,thumbnail_360_url,duration&limit=24&search=${encodeURIComponent(q)}`;
      const d = await jget(u);
      return (d.list || []).map((x) => ({
        name: x.title, url: 'dm:' + x.id, poster: x.thumbnail_360_url,
        apiName: 'Dailymotion', type: 'Others', embed: `https://geo.dailymotion.com/player.html?video=${x.id}`, id: x.id,
      }));
    },
  };

  /* --- Invidious (InvidiousProvider'ın kaynağı — örnek listesi dinamik) --- */
  const INV = {
    match: (p) => /invidious/i.test(p.internalName + ' ' + p.name),
    _instances: ['yewtu.be', 'inv.tux.pizza', 'invidious.f5.si', 'inv.nadeko.net'],
    async _try(path) {
      for (const inst of this._instances) {
        try { return await jget(`https://${inst}${path}`); } catch { /* sıradaki */ }
      }
      throw new Error('Invidious örneklerine ulaşılamadı');
    },
    async home() {
      const d = await this._try('/api/v1/trending?region=TR');
      const items = (Array.isArray(d) ? d : []).slice(0, 16).map((v) => ({
        name: v.title, url: 'yt:' + v.videoId,
        poster: v.videoThumbnails?.find((t) => t.quality === 'medium')?.url || '',
        apiName: 'Invidious', type: 'Others',
        embed: `https://www.youtube-nocookie.com/embed/${v.videoId}`, id: v.videoId,
      }));
      return items.length ? [{ name: 'Trend Videolar (YouTube)', items }] : [];
    },
    async search(q) {
      const d = await this._try('/api/v1/search?q=' + encodeURIComponent(q) + '&type=video');
      return (Array.isArray(d) ? d : []).slice(0, 24).map((v) => ({
        name: v.title, url: 'yt:' + v.videoId, poster: v.videoThumbnails?.[0]?.url || '',
        apiName: 'Invidious', type: 'Others',
        embed: `https://www.youtube-nocookie.com/embed/${v.videoId}`, id: v.videoId,
      }));
    },
  };

  /* --- AnimeciX (kullanıcı depolarındaki TR anime sağlayıcısı) ---
     Uçlar sağlayıcının .cs3 dex havuzundan çıkarılmıştır:
     /secure/last-episodes, /secure/titles, /secure/search */
  const AX = {
    match: (p) => /animecix/i.test(p.internalName + ' ' + p.name),
    _title: (t) => ({
      name: t.name,
      url: 'ax:' + t.id,
      poster: t.poster || '',
      apiName: 'AnimeciX',
      type: 'Anime',
      year: t.year || null,
      desc: t.description || null,
      detailsUrl: `https://animecix.tv/secure/titles/${t.id}`,
    }),
    async home() {
      const rows = [];
      try {
        const d = await pget('https://animecix.tv/secure/last-episodes?page=1');
        const items = (d.data || []).map((e) => ({
          name: `${e.title_name} S${e.season_number}:B${e.episode_number}`,
          url: 'ax:' + e.title_id,
          poster: e.title_poster || '',
          apiName: 'AnimeciX',
          type: 'Anime',
          year: null,
          ep: true,
        }));
        if (items.length) rows.push({ name: 'Son Bölümler', items });
      } catch { /* satır atlanır */ }
      const seenIds = new Set(rows.flatMap((r) => r.items.map((i) => i.url)));
      for (const [t, label] of [['movie', 'Öne Çıkan Film'], ['series', 'Öne Çıkan Dizi']]) {
        try {
          const d = await pget(`https://animecix.tv/secure/titles?type=${t}&onlyStreamable=true`);
          if (d.title && !seenIds.has('ax:' + d.title.id)) {
            seenIds.add('ax:' + d.title.id);
            rows.push({ name: label, items: [AX._title(d.title)] });
          }
        } catch { /* atla */ }
      }
      return rows;
    },
    async search(q) {
      const d = await pget('https://animecix.tv/secure/search/' + encodeURIComponent(q));
      return (d.results || []).map(AX._title);
    },
    async details(url) {
      const id = url.replace(/^ax:/, '');
      const d = await pget(`https://animecix.tv/secure/titles/${id}`);
      const t = d.title || {};
      return {
        name: t.name,
        poster: t.poster || '',
        desc: t.description || null,
        year: t.year || null,
        creator: (t.genres || []).map((g) => g.name || g).join(', ') || null,
        apiName: 'AnimeciX',
        embed: null, // akış çözümleme masaüstü altyapısının işi (tau-video/m3u8)
      };
    },
  };

  const ADAPTERS = [IA, DM, INV, AX];

  function adapterFor(p) {
    if (bridgeOk) return null; // JVM köprüsü tüm sağlayıcıları karşılar
    return ADAPTERS.find((a) => a.match(p)) || null;
  }

  /* ============================================================
     DEX MADENCİLİĞİ — sağlayıcının .cs3 dosyasından gerçek kaynak
     sitesini çıkarır (zip + dex string havuzu). Sonuç plugin
     nesnesinde önbelleklenir. Masaüstü backend'e gerek kalmadan
     depodan türeyen gerçek bilgi.
     ============================================================ */
  async function readZipEntry(u8, nameFilter) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return null;
    const count = dv.getUint16(eocd + 10, true);
    let ptr = dv.getUint32(eocd + 16, true);
    const td = new TextDecoder();
    for (let i = 0; i < count; i++) {
      if (dv.getUint32(ptr, true) !== 0x02014b50) break;
      const method = dv.getUint16(ptr + 10, true);
      const compSize = dv.getUint32(ptr + 20, true);
      const nameLen = dv.getUint16(ptr + 28, true);
      const extraLen = dv.getUint16(ptr + 30, true);
      const commLen = dv.getUint16(ptr + 32, true);
      const lfhOff = dv.getUint32(ptr + 42, true);
      const name = td.decode(u8.subarray(ptr + 46, ptr + 46 + nameLen));
      const adv = 46 + nameLen + extraLen + commLen;
      if (nameFilter(name)) {
        const lNameLen = dv.getUint16(lfhOff + 26, true);
        const lExtraLen = dv.getUint16(lfhOff + 28, true);
        const dataOff = lfhOff + 30 + lNameLen + lExtraLen;
        const comp = u8.subarray(dataOff, dataOff + compSize);
        if (method === 0) return comp;
        const ds = new DecompressionStream('deflate-raw');
        const stream = new Blob([comp]).stream().pipeThrough(ds);
        return new Uint8Array(await new Response(stream).arrayBuffer());
      }
      ptr += adv;
    }
    return null;
  }

  function dexStrings(u8) {
    if (u8.length < 64 || u8[0] !== 0x64 || u8[1] !== 0x65 || u8[2] !== 0x78) return [];
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const size = dv.getUint32(56, true), offT = dv.getUint32(60, true);
    const td = new TextDecoder();
    const out = [];
    for (let i = 0; i < size && i < 120000; i++) {
      let off = dv.getUint32(offT + i * 4, true);
      if (off >= u8.length) continue;
      let result = 0, shift = 0, b;
      do { b = u8[off++]; result |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80 && off < u8.length);
      let end = off;
      while (end < u8.length && u8[end] !== 0) end++;
      out.push(td.decode(u8.subarray(off, end)));
    }
    return out;
  }

  const IGNORE_HOSTS = /(tmdb|image\.|ytimg|jwplatform|s3\.|cloudflare|imgur|github|googleapis|gravatar)/i;
  async function probeSource(p) {
    if (p.__source !== undefined) return p.__source;
    p.__source = null;
    try {
      const res = await fetch(p.url); // raw.githubusercontent CORS açık
      if (!res.ok) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      const dex = await readZipEntry(buf, (n) => n.endsWith('.dex'));
      if (!dex) return null;
      const hosts = {};
      for (const s of dexStrings(dex)) {
        const m = /^https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/i.exec(s);
        if (!m || IGNORE_HOSTS.test(m[1])) continue;
        const h = m[1].replace(/^www\./, '');
        hosts[h] = (hosts[h] || 0) + 1;
      }
      const best = Object.entries(hosts).sort((a, b) => b[1] - a[1])[0];
      p.__source = best ? best[0] : null;
    } catch { /* sessiz — ağ yoksa null */ }
    return p.__source;
  }

  /* ============================================================
     getHome(repoUrl) — HomePageResponse üretimi
     Dönen: { repo, rows: HomePageList[], backendOnly: [sağlayıcı adları] }
     ============================================================ */
  async function getHome(repoUrl, onProgress) {
    const repo = repos.find((r) => r.url === repoUrl) || getActiveRepo();
    if (!repo) return { repo: null, rows: [], backendOnly: [] };

    // Yüklü kanal yoksa içerik sorgulanmaz (köprü kendi tarafında kurulu
    // eklentilerle yanıt verebilse bile kullanıcıya yanlış görünmesin)
    if (!repoProviders(repo.url).length) return { repo, rows: [], backendOnly: [] };

    // JVM köprüsü bağlıysa gerçek sağlayıcı kodu çalışır
    await ensureBridge();
    if (bridgeOk) {
      try { return await restClient.getHome(repoUrl); } catch (e) {
        console.warn('[cs] köprü getHome hatası:', e.message);
      }
    }

    const provs = getActiveProvider(repoUrl) ? [getActiveProvider(repoUrl)] : repoProviders(repoUrl);
    const rows = [];
    const backendOnly = [];

    await Promise.all(provs.map(async (p, i) => {
      try {
        const ad = adapterFor(p);
        if (!ad) { backendOnly.push(p); return; }
        const list = await ad.home();
        list.forEach((r) => {
          r.items.forEach((it) => { it.apiName = it.apiName || p.name; });
          rows.push(r);
        });
        onProgress && onProgress(p.name, true);
      } catch (e) {
        backendOnly.push(p);
        onProgress && onProgress(p.name, false, e.message);
      }
    }));

    rows.forEach((r) => { r.__items = r.items; });
    return { repo, rows, backendOnly };
  }

  /* ============================================================
     Arama + detay + yer imleri + geçmiş
     ============================================================ */
  async function getSearch(repoUrl, query, allChannels = false) {
    if (!query.trim()) return [];
    await ensureBridge();
    if (bridgeOk) {
      if (allChannels) {
        const provs = repoProviders(repoUrl);
        if (provs.length > 1) {
          const lists = await Promise.all(provs.map(async (p) => {
            try {
              const params = new URLSearchParams({ q: query });
              appendProvParams(params, p);
              const res = await fetch(`${BRIDGE_URL}/api/search?${params.toString()}`);
              if (!res.ok) return [];
              const data = await res.json();
              return (data.results || []).map((i) => ({
                name: i.name, url: i.url, poster: i.poster || '',
                apiName: i.apiName || p.name, type: tvTypeToUi(i.type), year: i.year || null,
              }));
            } catch { return []; }
          }));
          return lists.flat();
        }
      }
      try { return await restClient.search(repoUrl, query); } catch { /* aşağı */ }
    }
    const provs = repoProviders(repoUrl);
    const out = [];
    await Promise.all(provs.map(async (p) => {
      const ad = adapterFor(p);
      if (!ad?.search) return;
      try { (await ad.search(query)).forEach((x) => { x.apiName = x.apiName || p.name; out.push(x); }); } catch { /* atla */ }
    }));
    return out;
  }

  async function getDetails(repoUrl, item) {
    await ensureBridge();
    if (bridgeOk && item.url) {
      try { return await restClient.load(repoUrl, item); } catch { /* aşağı */ }
    }
    const provs = repoProviders(repoUrl);
    for (const p of provs) {
      const ad = adapterFor(p);
      if (ad?.details && item.url.startsWith(ad._prefix || '')) {
        try { return await ad.details(item.url); } catch { /* atla */ }
      }
    }
    return null;
  }

  function toggleBookmark(item) {
    const i = bookmarks.findIndex((b) => b.url === item.url);
    if (i >= 0) bookmarks.splice(i, 1); else bookmarks.unshift({ ...item, savedAt: Date.now() });
    saveBookmarks();
    return i < 0; // true = eklendi
  }
  const isBookmarked = (url) => bookmarks.some((b) => b.url === url);

  function pushHistory(item, posPct, atSec, data) {
    history = history.filter((h) => h.url !== item.url);
    history.unshift({ ...item, posPct: posPct || 0, atSec: atSec || 0, data: data || null, at: Date.now() });
    history = history.slice(0, 20);
    saveHistory();
  }
  function removeHistory(url) {
    history = history.filter((h) => h.url !== url);
    saveHistory();
  }
  function getHistory() { return history; }

  load();

  return {
    /* depo/eklenti yönetimi */
    get repos() { return repos; },
    get plugins() { return plugins; },
    get settings() { return settings; },
    setSetting(k, v) { settings[k] = v; saveSettings(); },
    parseRepoUrl, convertRawGitUrl, loadRepo, addRepo, removeRepo, refreshRepo,
    setEnabled, uninstall, installPlugin, uninstallPlugin, officialRepos, STATUS_LABEL, desktop, probeSource,
    get bridgeOk() { return bridgeOk; },
    ensureBridge,
    links: (repoUrl, data) => restClient.links(repoUrl, data),
    hasAdapter: (p) => bridgeOk ? true : ADAPTERS.some((a) => a.match(p)),
    /* aktif depo + kanal + içerik */
    getActiveRepo, setActiveRepo, getActiveRepoUrl, repoProviders, providers,
    getActiveProvider, getActiveProviderKey, setActiveProviderKey,
    getHome, getSearch, getDetails,
    /* yer imi / geçmiş */
    toggleBookmark, isBookmarked, pushHistory, removeHistory, getHistory,
    storeKeys: { LS_REPOS, LS_PLUGINS, LS_SETTINGS, LS_ACTIVE },
  };
})();
