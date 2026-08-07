import { escapeHtml, formatDate, getStatus } from './common.js';
import { createFirebaseClient } from './firebase-client.js';

let games = [];
const nodes = {
  list: document.querySelector('#games'),
  empty: document.querySelector('#empty'),
  search: document.querySelector('#search'),
  filter: document.querySelector('#filter'),
  total: document.querySelector('#m-total'),
  game: document.querySelector('#m-game'),
  translation: document.querySelector('#m-translation'),
  ready: document.querySelector('#m-ready'),
  lastSync: document.querySelector('#last-sync')
};

function render() {
  const keyword = nodes.search?.value.trim().toLowerCase() || '';
  const filter = nodes.filter?.value || 'all';
  const statuses = games.map((game) => ({ game, status: getStatus(game) }));
  nodes.total.textContent = games.length;
  nodes.game.textContent = statuses.filter(({status}) => status.gameNeedsUpdate).length;
  nodes.translation.textContent = statuses.filter(({status}) => status.translationNeedsUpdate).length;
  nodes.ready.textContent = statuses.filter(({status}) => status.ready).length;

  const filtered = statuses.filter(({game, status}) => {
    const matchesSearch = !keyword || `${game.name || ''} ${game.appId || ''}`.toLowerCase().includes(keyword);
    const matchesFilter = filter === 'all'
      || (filter === 'translation' && status.translationNeedsUpdate)
      || (filter === 'game' && status.gameNeedsUpdate)
      || (filter === 'ready' && status.ready);
    return matchesSearch && matchesFilter;
  });

  nodes.empty.classList.toggle('hidden', filtered.length > 0);
  nodes.list.innerHTML = filtered.map(({game, status}) => card(game, status)).join('');
  const newest = games.map(g => g.syncedAt || g.updatedAt || '').filter(Boolean).sort().at(-1);
  nodes.lastSync.textContent = newest ? `Sinkron terakhir: ${formatDate(newest)}` : 'Belum pernah disinkronkan';
}

function card(game, status) {
  const gameBadge = status.remoteUnknown
    ? '<span class="badge neutral">Build publik belum terbaca</span>'
    : status.gameNeedsUpdate
      ? '<span class="badge warning">Game perlu update</span>'
      : status.localUnknown
        ? '<span class="badge neutral">Build lokal belum dipindai</span>'
        : '<span class="badge success">Game terbaru</span>';
  const translationBadge = status.translationNeedsUpdate
    ? '<span class="badge danger">Terjemahan perlu update</span>'
    : '<span class="badge success">Terjemahan sesuai build</span>';

  return `<article class="game-card">
    <img class="cover" loading="lazy" src="${escapeHtml(game.coverUrl || '/assets/logo.svg')}" alt="Sampul ${escapeHtml(game.name || 'game')}">
    <div class="game-body"><div class="game-head"><div><h2 class="game-title">${escapeHtml(game.name || `Steam App ${game.appId}`)}</h2><div class="game-id">App ID ${escapeHtml(game.appId || '')} · patch ${formatDate(game.latestPatchAt)}</div></div></div>
    <div class="badges">${gameBadge}${translationBadge}</div>
    <div class="build-row"><div class="build"><span>Build lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div><div class="build"><span>Build publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div><div class="build"><span>Build terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum ditandai')}</strong></div></div>
    <div class="card-actions"><a class="button small" target="_blank" rel="noopener" href="https://steamdb.info/app/${encodeURIComponent(game.appId)}/patchnotes/">SteamDB Patch Notes</a>${game.latestNewsUrl ? `<a class="button small ghost" target="_blank" rel="noopener" href="${escapeHtml(game.latestNewsUrl)}">Berita patch</a>` : ''}</div></div>
  </article>`;
}

nodes.search?.addEventListener('input', render);
nodes.filter?.addEventListener('change', render);

async function boot() {
  nodes.lastSync.textContent = 'Menghubungkan Firebase…';
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
  nodes.lastSync.textContent = 'Firebase belum tersambung';
  nodes.empty.textContent = 'Library belum dapat dimuat. Admin perlu menyelesaikan konfigurasi Firebase di Vercel lalu melakukan Redeploy.';
  nodes.empty.classList.remove('hidden');
}

boot();
