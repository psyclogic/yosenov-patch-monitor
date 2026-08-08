import { escapeHtml, formatDate, getStatus } from './common.js';
import { createFirebaseClient } from './firebase-client.js';

const params = new URLSearchParams(window.location.search);
const requestedGame = (params.get('game') || params.get('appid') || '').trim();
const borderMode = params.get('border') !== '0';
const root = document.querySelector('#game-embed-root');

document.documentElement.classList.toggle('blog-embed-borderless', !borderMode);
document.body.classList.toggle('blog-embed-borderless', !borderMode);

function gameStatusData(status) {
  if (status.remoteUnknown) {
    return { cls: 'neutral', title: 'Build publik belum tersedia', detail: 'Data patch terbaru belum dapat dibaca.' };
  }
  if (status.gameNeedsUpdate) {
    return { cls: 'warning', title: 'Game perlu update', detail: 'Build lokal tertinggal dari build publik.' };
  }
  if (status.localUnknown) {
    return { cls: 'neutral', title: 'Build lokal belum dipindai', detail: 'Sync folder Steam untuk membaca build lokal.' };
  }
  return { cls: 'success', title: 'Game terbaru', detail: 'Build lokal sudah sama dengan build publik.' };
}

function translationStatusData(game, status) {
  if (!game.remoteBuildId) {
    return { cls: 'neutral', title: 'Belum dapat dibandingkan', detail: 'Menunggu informasi build publik.' };
  }
  if (!game.translationBuildId) {
    return { cls: 'danger', title: 'Belum ditandai', detail: 'Terjemahan patch terbaru belum dikonfirmasi.' };
  }
  if (status.translationNeedsUpdate) {
    return { cls: 'danger', title: 'Perlu update', detail: 'Terjemahan masih mengikuti build sebelumnya.' };
  }
  return { cls: 'success', title: 'Sudah sesuai', detail: 'Terjemahan sudah cocok dengan patch terbaru.' };
}

function statusBox(label, data) {
  return `<div class="blog-status-box ${data.cls}">
    <span>${label}</span>
    <strong>${escapeHtml(data.title)}</strong>
    <small>${escapeHtml(data.detail)}</small>
  </div>`;
}

function renderGame(game) {
  const status = getStatus(game);
  const gameState = gameStatusData(status);
  const translationState = translationStatusData(game, status);
  const notes = String(game.notes || '').trim();
  const appId = String(game.appId || '');

  root.innerHTML = `
    <article class="blog-game-card blog-game-card-full">
      <div class="blog-game-heading">
        <h2 title="${escapeHtml(game.name || `Steam App ${appId}`)}">${escapeHtml(game.name || `Steam App ${appId}`)}</h2>
        <p>App ID ${escapeHtml(appId)} · patch ${formatDate(game.latestPatchAt)}</p>
      </div>

      <div class="blog-status-detail-grid">
        ${statusBox('Status game', gameState)}
        ${statusBox('Status terjemahan', translationState)}
      </div>

      <div class="blog-build-grid">
        <div><span>Build lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div>
        <div><span>Build publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div>
        <div><span>Build terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum ditandai')}</strong></div>
      </div>

      ${notes ? `<div class="blog-note blog-note-compact"><strong>Catatan</strong><p>${escapeHtml(notes)}</p></div>` : ''}

      <div class="blog-card-actions">
        <a href="https://steamdb.info/app/${encodeURIComponent(appId)}/patchnotes/" target="_blank" rel="noopener">SteamDB Patch Notes</a>
        ${game.latestNewsUrl ? `<a href="${escapeHtml(game.latestNewsUrl)}" target="_blank" rel="noopener">Berita patch</a>` : ''}
      </div>
    </article>`;
}

function renderError(message) {
  root.innerHTML = `<div class="blog-embed-message">${escapeHtml(message)}</div>`;
}

async function boot() {
  if (!requestedGame) return renderError('Game belum dipilih.');
  try {
    const { db, firestoreModule } = await createFirebaseClient({ firestore: true });
    const { doc, getDoc, collection, getDocs } = firestoreModule;
    const direct = await getDoc(doc(db, 'games', requestedGame));
    if (direct.exists()) return renderGame({ id: direct.id, ...direct.data() });

    const snapshot = await getDocs(collection(db, 'games'));
    const found = snapshot.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((game) => String(game.appId || '') === requestedGame);
    if (!found) return renderError('Game tidak ditemukan di library YOSENOV.');
    renderGame(found);
  } catch (error) {
    console.error(error);
    renderError('Status game belum dapat dimuat.');
  }
}

boot();
