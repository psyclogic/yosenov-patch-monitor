import { escapeHtml, formatDate, getStatus } from './common.js';
import { createFirebaseClient } from './firebase-client.js';

let games = [];
const params = new URLSearchParams(window.location.search);
const requestedGame = (params.get('game') || params.get('appid') || '').trim();
const singleMode = Boolean(requestedGame);

const nodes = {
  list: document.querySelector('#games'),
  empty: document.querySelector('#empty'),
  search: document.querySelector('#search'),
  filter: document.querySelector('#filter'),
  total: document.querySelector('#m-total'),
  game: document.querySelector('#m-game'),
  translation: document.querySelector('#m-translation'),
  ready: document.querySelector('#m-ready'),
  lastSync: document.querySelector('#last-sync'),
  embedMetrics: document.querySelector('#embed-metrics'),
  embedFilterbar: document.querySelector('#embed-filterbar'),
  embedTitle: document.querySelector('#embed-title')
};

function slugify(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function gameMatchesRequest(game) {
  if (!requestedGame) return true;
  const needle = requestedGame.toLowerCase();
  return String(game.appId || '').toLowerCase() === needle
    || String(game.name || '').toLowerCase() === needle
    || slugify(game.name || '') === slugify(requestedGame);
}

function setMetricActive(filter) {
  document.querySelectorAll('[data-metric-filter]').forEach((button) => {
    const active = button.dataset.metricFilter === filter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function render() {
  const keyword = nodes.search?.value.trim().toLowerCase() || '';
  const filter = nodes.filter?.value || 'all';
  const statuses = games.map((game) => ({ game, status: getStatus(game) }));

  if (nodes.total) nodes.total.textContent = games.length;
  if (nodes.game) nodes.game.textContent = statuses.filter(({status}) => status.gameNeedsUpdate).length;
  if (nodes.translation) nodes.translation.textContent = statuses.filter(({status}) => status.translationNeedsUpdate).length;
  if (nodes.ready) nodes.ready.textContent = statuses.filter(({status}) => status.ready).length;

  let filtered = statuses.filter(({game, status}) => {
    if (!gameMatchesRequest(game)) return false;
    const matchesSearch = !keyword || `${game.name || ''} ${game.appId || ''}`.toLowerCase().includes(keyword);
    const matchesFilter = filter === 'all'
      || (filter === 'translation' && status.translationNeedsUpdate)
      || (filter === 'game' && status.gameNeedsUpdate)
      || (filter === 'ready' && status.ready);
    return matchesSearch && matchesFilter;
  });

  if (singleMode) {
    document.body.classList.add('single-embed');
    nodes.embedMetrics?.classList.add('hidden');
    nodes.embedFilterbar?.classList.add('hidden');
    nodes.list?.classList.add('single-game-list');
    const selected = filtered[0]?.game;
    if (nodes.embedTitle) nodes.embedTitle.textContent = selected ? selected.name : 'YOSENOV Game Status';
  }

  nodes.empty?.classList.toggle('hidden', filtered.length > 0);
  if (nodes.empty && singleMode && filtered.length === 0) {
    nodes.empty.textContent = `Game “${requestedGame}” tidak ditemukan di library YOSENOV.`;
  }
  if (nodes.list) nodes.list.innerHTML = filtered.map(({game, status}) => card(game, status)).join('');

  const newest = games.map(g => g.syncedAt || g.updatedAt || '').filter(Boolean).sort().at(-1);
  if (nodes.lastSync) nodes.lastSync.textContent = newest ? `Sinkron terakhir: ${formatDate(newest)}` : 'Belum pernah disinkronkan';
  setMetricActive(filter);
}

function gameStatusBlock(status) {
  if (status.remoteUnknown) {
    return `<div class="status-box neutral"><span>Status game</span><strong>Build publik belum terbaca</strong><small>Periksa data Steam terlebih dahulu.</small></div>`;
  }
  if (status.gameNeedsUpdate) {
    return `<div class="status-box warning"><span>Status game</span><strong>Perlu update</strong><small>Build lokal tertinggal dari patch terbaru.</small></div>`;
  }
  if (status.localUnknown) {
    return `<div class="status-box neutral"><span>Status game</span><strong>Build lokal belum dipindai</strong><small>Sync folder Steam untuk membandingkan build.</small></div>`;
  }
  return `<div class="status-box success"><span>Status game</span><strong>Game terbaru</strong><small>Build lokal sudah sama dengan build publik.</small></div>`;
}

function translationStatusBlock(game, status) {
  if (!game.remoteBuildId) {
    return `<div class="status-box neutral"><span>Status terjemahan</span><strong>Menunggu build publik</strong><small>Status belum dapat dibandingkan.</small></div>`;
  }
  if (!game.translationBuildId) {
    return `<div class="status-box danger"><span>Status terjemahan</span><strong>Belum ditandai</strong><small>Terjemahan untuk patch terbaru belum dikonfirmasi selesai.</small></div>`;
  }
  if (status.translationNeedsUpdate) {
    return `<div class="status-box danger"><span>Status terjemahan</span><strong>Perlu update</strong><small>Build terjemahan masih mengikuti patch sebelumnya.</small></div>`;
  }
  return `<div class="status-box success"><span>Status terjemahan</span><strong>Sudah sesuai</strong><small>Terjemahan sudah cocok dengan patch terbaru.</small></div>`;
}

function card(game, status) {
  const notes = String(game.notes || '').trim();
  const noteHtml = notes
    ? `<div class="game-note"><span>Catatan YOSENOV</span><p>${escapeHtml(notes)}</p></div>`
    : '';

  return `<article class="game-card" data-appid="${escapeHtml(game.appId || '')}">
    <img class="cover" loading="lazy" src="${escapeHtml(game.coverUrl || '/assets/logo.svg')}" alt="Sampul ${escapeHtml(game.name || 'game')}">
    <div class="game-body">
      <div class="game-head"><div><h2 class="game-title">${escapeHtml(game.name || `Steam App ${game.appId}`)}</h2><div class="game-id">App ID ${escapeHtml(game.appId || '')} · patch ${formatDate(game.latestPatchAt)}</div></div></div>
      <div class="status-grid">${gameStatusBlock(status)}${translationStatusBlock(game, status)}</div>
      <div class="build-row"><div class="build"><span>Build lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div><div class="build"><span>Build publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div><div class="build"><span>Build terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum ditandai')}</strong></div></div>
      ${noteHtml}
      <div class="card-actions"><a class="button small" target="_blank" rel="noopener" href="https://steamdb.info/app/${encodeURIComponent(game.appId)}/patchnotes/">SteamDB Patch Notes</a>${game.latestNewsUrl ? `<a class="button small ghost" target="_blank" rel="noopener" href="${escapeHtml(game.latestNewsUrl)}">Berita patch</a>` : ''}</div>
    </div>
  </article>`;
}

nodes.search?.addEventListener('input', render);
nodes.filter?.addEventListener('change', () => {
  setMetricActive(nodes.filter.value);
  render();
});

document.querySelectorAll('[data-metric-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    if (!nodes.filter) return;
    nodes.filter.value = button.dataset.metricFilter || 'all';
    setMetricActive(nodes.filter.value);
    render();
    document.querySelector('#games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

async function boot() {
  if (nodes.lastSync) nodes.lastSync.textContent = 'Memuat library…';
  try {
    const { db, firestoreModule } = await createFirebaseClient({ firestore: true });
    const { collection, onSnapshot } = firestoreModule;
    onSnapshot(collection(db, 'games'), (snapshot) => {
      games = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => String(a.name || a.appId || '').localeCompare(String(b.name || b.appId || ''), 'id'));
      render();
    }, (error) => showFirebaseError(error));
  } catch (error) {
    showFirebaseError(error);
  }
}

function showFirebaseError(error) {
  console.error('YOSENOV Firebase:', error);
  games = [];
  render();
  if (nodes.lastSync) nodes.lastSync.textContent = 'Library belum dapat dimuat';
  if (nodes.empty) {
    nodes.empty.textContent = 'Data game belum dapat dimuat. Silakan coba lagi beberapa saat.';
    nodes.empty.classList.remove('hidden');
  }
}

boot();
