import { escapeHtml, formatDate, getStatus } from './common.js';
import { createFirebaseClient } from './firebase-client.js';

const params = new URLSearchParams(window.location.search);
const requestedGame = (params.get('game') || params.get('appid') || '').trim();
const borderMode = params.get('border') !== '0';
const root = document.querySelector('#game-embed-root');

const frameId = (params.get('frame') || '').trim();

function notifyParentHeight() {
  const element = document.documentElement;
  const body = document.body;
  const height = Math.ceil(Math.max(
    body?.scrollHeight || 0,
    body?.offsetHeight || 0,
    element?.scrollHeight || 0,
    element?.offsetHeight || 0
  ));
  if (window.parent && window.parent !== window && frameId) {
    window.parent.postMessage({ type: 'yosenov-embed-resize', frameId, height }, '*');
  }
}

document.documentElement.classList.toggle('blog-embed-borderless', !borderMode);
document.body.classList.toggle('blog-embed-borderless', !borderMode);

function statusText(game, status) {
  const gameStatus = status.remoteUnknown
    ? ['Build publik belum tersedia', 'neutral']
    : status.gameNeedsUpdate
      ? ['Game perlu update', 'warning']
      : status.localUnknown
        ? ['Build lokal belum dipindai', 'neutral']
        : ['Game terbaru', 'success'];

  const translationStatus = !game.remoteBuildId
    ? ['Status terjemahan belum dapat dibandingkan', 'neutral']
    : !game.translationBuildId
      ? ['Terjemahan belum ditandai', 'danger']
      : status.translationNeedsUpdate
        ? ['Terjemahan perlu update', 'danger']
        : ['Terjemahan sudah sesuai', 'success'];

  return { gameStatus, translationStatus };
}

function renderGame(game) {
  const status = getStatus(game);
  const { gameStatus, translationStatus } = statusText(game, status);
  const notes = String(game.notes || '').trim();
  root.innerHTML = `
    <article class="blog-game-card">
      <div class="blog-game-heading">
        <div>
          <h2>${escapeHtml(game.name || `Steam App ${game.appId}`)}</h2>
          <p>App ID ${escapeHtml(game.appId || '')} · patch ${formatDate(game.latestPatchAt)}</p>
        </div>
      </div>
      <div class="blog-status-row">
        <span class="blog-status ${gameStatus[1]}">${gameStatus[0]}</span>
        <span class="blog-status ${translationStatus[1]}">${translationStatus[0]}</span>
      </div>
      <div class="blog-build-grid">
        <div><span>Build lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div>
        <div><span>Build publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div>
        <div><span>Build terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum ditandai')}</strong></div>
      </div>
      ${notes ? `<div class="blog-note"><strong>Catatan</strong><p>${escapeHtml(notes)}</p></div>` : ''}
    </article>`;
  requestAnimationFrame(notifyParentHeight);
  setTimeout(notifyParentHeight, 80);
  setTimeout(notifyParentHeight, 240);
}


function renderError(message) {
  root.innerHTML = `<div class="blog-embed-message">${escapeHtml(message)}</div>`;
  requestAnimationFrame(notifyParentHeight);
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

window.addEventListener('load', notifyParentHeight);
window.addEventListener('resize', notifyParentHeight);
if ('ResizeObserver' in window) { new ResizeObserver(() => notifyParentHeight()).observe(document.body); }
