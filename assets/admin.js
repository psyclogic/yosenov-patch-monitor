import { createFirebaseClient } from './firebase-client.js';
import { escapeHtml, extractAppId, fetchSteamInfo, getStatus, toast, friendlyFirebaseError } from './common.js';

let games = [];
let firebase = null;
let unsubscribeGames = null;
let selectionMode = false;
const selectedIds = new Set();

const el = (id) => document.getElementById(id);
const loginView = el('login-view');
const adminView = el('admin-view');
const loginButton = el('login-submit');
const firebaseStatus = el('firebase-status');

function setFirebaseStatus(message, type = '') {
  if (!firebaseStatus) return;
  firebaseStatus.textContent = message;
  firebaseStatus.className = `setup-status ${type}`.trim();
}

function setLoginEnabled(enabled) {
  if (loginButton) loginButton.disabled = !enabled;
  el('email').disabled = !enabled;
  el('password').disabled = !enabled;
}

async function boot() {
  setLoginEnabled(false);
  setFirebaseStatus('Memeriksa konfigurasi Firebase…');
  try {
    firebase = await createFirebaseClient({ auth: true, firestore: true });
    setFirebaseStatus('Firebase tersambung. Silakan login.', 'success');
    setLoginEnabled(true);
    bindFirebaseAuth();
    bindBulkControls();
  } catch (error) {
    console.error('Firebase init:', error);
    setFirebaseStatus(error.message || 'Firebase gagal dimuat.', 'error');
    toast('Firebase belum siap. Dark mode tetap dapat digunakan.', 'error');
  }
}

function bindFirebaseAuth() {
  const { auth, db, authModule, firestoreModule } = firebase;
  const { onAuthStateChanged, signOut } = authModule;
  const { doc, getDoc } = firestoreModule;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      loginView.classList.remove('hidden');
      adminView.classList.add('hidden');
      if (unsubscribeGames) { unsubscribeGames(); unsubscribeGames = null; }
      return;
    }

    try {
      setFirebaseStatus('Login berhasil. Memeriksa hak admin…');
      const adminRecord = await getDoc(doc(db, 'admins', user.uid));
      if (!adminRecord.exists()) {
        await signOut(auth);
        setFirebaseStatus(`UID ${user.uid} belum terdaftar di Firestore collection admins.`, 'error');
        toast('Login berhasil, tetapi akun ini belum diberi akses admin.', 'error');
        return;
      }
      setFirebaseStatus(`Admin aktif: ${user.email || user.uid}`, 'success');
      loginView.classList.add('hidden');
      adminView.classList.remove('hidden');
      subscribeGames();
    } catch (error) {
      console.error(error);
      setFirebaseStatus(friendlyFirebaseError(error), 'error');
      toast(friendlyFirebaseError(error), 'error');
    }
  });
}

el('login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!firebase) return toast('Firebase belum dikonfigurasi.', 'error');
  const button = event.submitter || loginButton;
  button.disabled = true;
  button.textContent = 'Masuk…';
  try {
    const { signInWithEmailAndPassword } = firebase.authModule;
    await signInWithEmailAndPassword(firebase.auth, el('email').value.trim(), el('password').value);
  } catch (error) {
    setFirebaseStatus(friendlyFirebaseError(error), 'error');
    toast(friendlyFirebaseError(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Masuk';
  }
});

el('logout').addEventListener('click', async () => {
  if (firebase) await firebase.authModule.signOut(firebase.auth);
});

document.querySelectorAll('[data-scroll]').forEach(button => button.addEventListener('click', () => {
  document.querySelector(button.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
}));

function subscribeGames() {
  if (!firebase) return;
  if (unsubscribeGames) unsubscribeGames();
  const { collection, onSnapshot } = firebase.firestoreModule;
  unsubscribeGames = onSnapshot(collection(firebase.db, 'games'), (snapshot) => {
    games = snapshot.docs
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
      .sort((a, b) => String(a.name || a.appId || '').localeCompare(String(b.name || b.appId || ''), 'id'));
    pruneSelection();
    renderAdmin();
  }, error => toast(friendlyFirebaseError(error), 'error'));
}

function setAdminFilter(value) {
  el('admin-filter').value = value;
  document.querySelectorAll('[data-admin-filter]').forEach((button) => {
    const active = button.dataset.adminFilter === value;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

function getFilteredStatuses() {
  const keyword = el('admin-search').value.trim().toLowerCase();
  const filter = el('admin-filter').value || 'all';
  const statuses = games.map(game => ({ game, status: getStatus(game) }));
  const filtered = statuses.filter(({game, status}) => {
    const searchOk = `${game.name || ''} ${game.appId || ''}`.toLowerCase().includes(keyword);
    const filterOk = filter === 'all'
      || (filter === 'translation' && status.translationNeedsUpdate)
      || (filter === 'game' && status.gameNeedsUpdate)
      || (filter === 'ready' && status.ready);
    return searchOk && filterOk;
  });
  return { statuses, filtered, filter };
}

function renderAdmin() {
  const { statuses, filtered, filter } = getFilteredStatuses();

  el('a-total').textContent = games.length;
  el('a-game').textContent = statuses.filter(({status}) => status.gameNeedsUpdate).length;
  el('a-translation').textContent = statuses.filter(({status}) => status.translationNeedsUpdate).length;
  el('a-ready').textContent = statuses.filter(({status}) => status.ready).length;

  el('admin-empty').classList.toggle('hidden', filtered.length > 0);
  el('admin-list').innerHTML = filtered.map(({game, status}) => adminCard(game, status)).join('');
  setAdminFilter(filter);
  renderBulkUi(filtered);
}

function renderBulkUi(filtered) {
  const menu = el('bulk-menu');
  const bar = el('bulk-bar');
  const count = el('selected-count');
  const filteredCount = el('filtered-count');
  const toggleText = el('bulk-toggle-text');
  const hasSelection = selectedIds.size > 0;

  if (menu) menu.classList.remove('open');
  if (bar) bar.classList.toggle('hidden', !selectionMode);
  if (count) count.textContent = String(selectedIds.size);
  if (filteredCount) filteredCount.textContent = String(filtered.length);
  if (toggleText) toggleText.textContent = selectionMode ? 'Selesai memilih' : 'Pilih banyak game';
  el('bulk-delete').disabled = !hasSelection;
}

function adminCard(game, status) {
  const notes = String(game.notes || '').trim();
  const translationState = !game.remoteBuildId
    ? { cls: 'neutral', title: 'Menunggu build publik', detail: 'Sync data game terlebih dahulu.' }
    : !game.translationBuildId
      ? { cls: 'danger', title: 'Terjemahan belum ditandai', detail: 'Belum ada build terjemahan yang dikonfirmasi.' }
      : status.translationNeedsUpdate
        ? { cls: 'danger', title: 'Terjemahan perlu update', detail: `Terjemahan ${game.translationBuildId} → patch ${game.remoteBuildId}` }
        : { cls: 'success', title: 'Terjemahan sudah sesuai', detail: `Sesuai build ${game.remoteBuildId}` };

  const gameState = status.gameNeedsUpdate
    ? { cls: 'warning', title: 'Game perlu update' }
    : status.localUnknown
      ? { cls: 'neutral', title: 'Build lokal belum dipindai' }
      : status.remoteUnknown
        ? { cls: 'neutral', title: 'Build publik belum tersedia' }
        : { cls: 'success', title: 'Game terbaru' };

  const markDisabled = !game.remoteBuildId || (!status.translationNeedsUpdate && game.translationBuildId === game.remoteBuildId);
  const markText = markDisabled && game.translationBuildId === game.remoteBuildId ? '✓ Terjemahan sesuai' : '✓ Tandai terjemahan selesai';
  const checked = selectedIds.has(game.id);

  return `<article class="admin-game-card ${translationState.cls === 'danger' ? 'needs-translation' : ''}${selectionMode ? ' selection-mode' : ''}">
    ${selectionMode ? `<button type="button" class="select-chip ${checked ? 'checked' : ''}" data-action="toggle-select" data-id="${game.id}" aria-pressed="${checked ? 'true' : 'false'}" title="${checked ? 'Batalkan pilihan' : 'Pilih game'}">${checked ? '✓' : ''}</button>` : ''}
    <img class="admin-cover" src="${escapeHtml(game.coverUrl || '/assets/logo.svg')}" alt="">
    <div class="admin-game-main">
      <div class="admin-game-title-row"><div><h3>${escapeHtml(game.name || game.appId)}</h3><div class="game-id">Steam App ID ${escapeHtml(game.appId)}</div></div><div class="admin-status-pills"><span class="badge ${gameState.cls}">${gameState.title}</span><span class="badge ${translationState.cls}">${translationState.title}</span></div></div>
      <div class="admin-build-grid"><div><span>Lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div><div><span>Publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div><div><span>Terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum ditandai')}</strong></div></div>
      <div class="translation-callout ${translationState.cls}"><strong>${translationState.title}</strong><span>${escapeHtml(translationState.detail)}</span></div>
      ${notes ? `<div class="admin-note"><span>Catatan</span><p>${escapeHtml(notes)}</p></div>` : ''}
      <div class="admin-item-actions">
        <button class="button small" data-action="sync" data-id="${game.id}">↻ Sync</button>
        <button class="button small primary" data-action="mark" data-id="${game.id}" ${markDisabled ? 'disabled' : ''}>${markText}</button>
        <button class="button small" data-action="edit" data-id="${game.id}">Edit / Catatan</button>
        <button class="button small" data-action="embed" data-id="${game.id}">Embed Blogspot</button>
        <button class="button small danger" data-action="delete" data-id="${game.id}">Hapus</button>
      </div>
    </div>
  </article>`;
}

function pruneSelection() {
  const ids = new Set(games.map(game => game.id));
  [...selectedIds].forEach((id) => {
    if (!ids.has(id)) selectedIds.delete(id);
  });
}

function setSelectionMode(enabled) {
  selectionMode = Boolean(enabled);
  if (!selectionMode) selectedIds.clear();
  renderAdmin();
}

function toggleSelection(id) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  renderAdmin();
}

function bindBulkControls() {
  el('bulk-actions-button')?.addEventListener('click', (event) => {
    event.stopPropagation();
    el('bulk-menu')?.classList.toggle('open');
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.bulk-actions')) el('bulk-menu')?.classList.remove('open');
  });
  el('bulk-toggle-mode')?.addEventListener('click', () => {
    setSelectionMode(!selectionMode);
  });
  el('bulk-select-filtered')?.addEventListener('click', () => {
    const { filtered } = getFilteredStatuses();
    filtered.forEach(({ game }) => selectedIds.add(game.id));
    selectionMode = true;
    renderAdmin();
  });
  el('bulk-clear')?.addEventListener('click', () => {
    selectedIds.clear();
    renderAdmin();
  });
  el('bulk-clear-inline')?.addEventListener('click', () => {
    selectedIds.clear();
    renderAdmin();
  });
  el('bulk-done')?.addEventListener('click', () => {
    setSelectionMode(false);
  });
  el('bulk-delete')?.addEventListener('click', async () => {
    if (!firebase || !selectedIds.size) return;
    const names = games.filter((game) => selectedIds.has(game.id)).map((game) => game.name || game.appId);
    const preview = names.slice(0, 6).join(', ');
    const extra = names.length > 6 ? ` dan ${names.length - 6} game lainnya` : '';
    if (!confirm(`Hapus ${names.length} game terpilih?\n\n${preview}${extra}`)) return;
    const button = el('bulk-delete');
    button.disabled = true;
    try {
      const { doc, deleteDoc } = firebase.firestoreModule;
      for (const id of selectedIds) {
        await deleteDoc(doc(firebase.db, 'games', id));
      }
      toast(`${names.length} game berhasil dihapus.`);
      setSelectionMode(false);
    } catch (error) {
      toast(friendlyFirebaseError(error), 'error');
    } finally {
      button.disabled = false;
    }
  });
}

el('admin-search').addEventListener('input', renderAdmin);
el('admin-filter').addEventListener('change', renderAdmin);
document.querySelectorAll('[data-admin-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    setAdminFilter(button.dataset.adminFilter || 'all');
    renderAdmin();
    el('library').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

el('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const appId = extractAppId(el('app-input').value);
  if (!appId) return toast('App ID tidak valid.', 'error');
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Mengambil data…';
  try {
    const info = await fetchSteamInfo(appId);
    const newGame = {
      ...info,
      appId,
      name: el('custom-name').value.trim() || info.name || `Steam App ${appId}`,
      localBuildId: el('local-build').value.trim() || '',
      source: 'manual'
    };
    const newNotes = el('add-notes').value.trim();
    if (newNotes) newGame.notes = newNotes;
    await saveGame(newGame);
    event.target.reset();
    toast('Game berhasil ditambahkan.');
    el('library').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Ambil data & simpan';
  }
});

async function saveGame(game) {
  if (!firebase) throw new Error('Firebase belum tersambung.');
  const { doc, getDoc, setDoc } = firebase.firestoreModule;
  const ref = doc(firebase.db, 'games', String(game.appId));
  const existing = await getDoc(ref);
  const previous = existing.exists() ? existing.data() : {};
  const hasNotes = Object.prototype.hasOwnProperty.call(game, 'notes');
  const payload = {
    appId: String(game.appId),
    name: game.name || previous.name || `Steam App ${game.appId}`,
    coverUrl: game.coverUrl || previous.coverUrl || '',
    localBuildId: String(game.localBuildId || previous.localBuildId || ''),
    remoteBuildId: String(game.remoteBuildId || previous.remoteBuildId || ''),
    translationBuildId: String(previous.translationBuildId || ''),
    latestPatchAt: game.latestPatchAt || previous.latestPatchAt || '',
    latestNewsUrl: game.latestNewsUrl || previous.latestNewsUrl || '',
    source: game.source || previous.source || 'manual',
    notes: hasNotes ? String(game.notes || '') : String(previous.notes || ''),
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!existing.exists()) payload.createdAt = new Date().toISOString();
  await setDoc(ref, payload, { merge: true });
}

el('admin-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !firebase) return;

  if (button.dataset.action === 'toggle-select') {
    selectionMode = true;
    toggleSelection(button.dataset.id);
    return;
  }

  const game = games.find(g => g.id === button.dataset.id);
  if (!game) return;

  if (button.dataset.action === 'edit') return openEdit(game);
  if (button.dataset.action === 'embed') return openEmbed(game);

  try {
    button.disabled = true;
    const { doc, updateDoc, deleteDoc } = firebase.firestoreModule;
    if (button.dataset.action === 'sync') await syncOne(game);
    if (button.dataset.action === 'mark') {
      if (!game.remoteBuildId) throw new Error('Build publik belum tersedia. Sync terlebih dahulu.');
      await updateDoc(doc(firebase.db, 'games', game.id), {
        translationBuildId: String(game.remoteBuildId),
        updatedAt: new Date().toISOString()
      });
      toast('Terjemahan ditandai sesuai patch terbaru.');
    }
    if (button.dataset.action === 'delete' && confirm(`Hapus ${game.name} dari library?`)) {
      await deleteDoc(doc(firebase.db, 'games', game.id));
      toast('Game dihapus.');
    }
  } catch (error) {
    toast(friendlyFirebaseError(error), 'error');
  } finally {
    button.disabled = false;
  }
});

async function syncOne(game) {
  const info = await fetchSteamInfo(game.appId);
  await saveGame({ ...game, ...info, localBuildId: game.localBuildId, source: game.source });
  toast(`${game.name} sudah diperiksa.`);
}

el('sync-all').addEventListener('click', async () => {
  if (!games.length) return toast('Library masih kosong.');
  const button = el('sync-all');
  const progress = el('bulk-progress');
  const status = el('bulk-status');
  button.disabled = true;
  button.textContent = 'Memeriksa…';
  for (let i = 0; i < games.length; i++) {
    status.textContent = `Memeriksa ${i + 1}/${games.length}: ${games[i].name}`;
    progress.style.width = `${Math.round((i / games.length) * 100)}%`;
    try { await syncOne(games[i]); } catch (error) { console.error(error); }
    await new Promise(r => setTimeout(r, 180));
  }
  progress.style.width = '100%';
  status.textContent = 'Semua game selesai diperiksa.';
  button.disabled = false;
  button.textContent = '↻ Cek seluruh update';
});

el('scan-folder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) return toast('Browser tidak mendukung pemindaian folder. Gunakan Chrome atau Edge desktop terbaru.', 'error');
  try {
    const root = await window.showDirectoryPicker({ mode: 'read' });
    const manifests = [];
    await findManifests(root, manifests, 0);
    if (!manifests.length) throw new Error('Tidak menemukan appmanifest_*.acf. Pilih folder steamapps atau folder Steam utama.');
    const progress = el('scan-progress');
    const status = el('scan-status');
    for (let i = 0; i < manifests.length; i++) {
      const file = await manifests[i].getFile();
      const parsed = parseManifest(await file.text());
      status.textContent = `Memproses ${i + 1}/${manifests.length}: ${parsed.name || parsed.appId}`;
      progress.style.width = `${Math.round((i / manifests.length) * 100)}%`;
      if (!parsed.appId) continue;
      try {
        const info = await fetchSteamInfo(parsed.appId);
        await saveGame({ ...info, ...parsed, source: 'steam-folder' });
      } catch (_) {
        await saveGame({ ...parsed, name: parsed.name || `Steam App ${parsed.appId}`, source: 'steam-folder' });
      }
      await new Promise(r => setTimeout(r, 150));
    }
    progress.style.width = '100%';
    status.textContent = `${manifests.length} manifest berhasil dipindai.`;
    toast('Library laptop berhasil disinkronkan.');
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message, 'error');
  }
});

async function findManifests(handle, output, depth) {
  if (depth > 3) return;
  for await (const [name, entry] of handle.entries()) {
    if (entry.kind === 'file' && /^appmanifest_\d+\.acf$/i.test(name)) output.push(entry);
    else if (entry.kind === 'directory' && depth < 3 && ['steamapps','SteamLibrary','steam'].some(part => name.toLowerCase().includes(part.toLowerCase()))) {
      await findManifests(entry, output, depth + 1);
    }
  }
}

function parseManifest(text) {
  const read = (key) => text.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'))?.[1] || '';
  return { appId: read('appid'), name: read('name'), localBuildId: read('buildid') };
}

function openEdit(game) {
  el('edit-id').value = game.id;
  el('edit-name').value = game.name || '';
  el('edit-local').value = game.localBuildId || '';
  el('edit-translation').value = game.translationBuildId || '';
  el('edit-notes').value = game.notes || '';
  el('edit-modal').classList.remove('hidden');
}

function openEmbed(game) {
  const url = `${window.location.origin}/embed.html?game=${encodeURIComponent(game.appId)}&compact=1`;
  const code = `<iframe src="${url}" title="Status update ${escapeAttribute(game.name || `Steam App ${game.appId}`)}" width="100%" height="360" style="border:0;display:block;width:100%;background:#ffffff;" loading="lazy"></iframe>`;
  el('embed-game-name').value = game.name || `Steam App ${game.appId}`;
  el('embed-url').value = url;
  el('embed-code').value = code;
  el('preview-embed').href = url;
  el('embed-modal').classList.remove('hidden');
}

function escapeAttribute(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

el('close-modal').addEventListener('click', () => el('edit-modal').classList.add('hidden'));
el('edit-modal').addEventListener('click', e => { if (e.target === el('edit-modal')) el('edit-modal').classList.add('hidden'); });
el('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!firebase) return;
  const { doc, updateDoc } = firebase.firestoreModule;
  await updateDoc(doc(firebase.db, 'games', el('edit-id').value), {
    name: el('edit-name').value.trim(),
    localBuildId: el('edit-local').value.trim(),
    translationBuildId: el('edit-translation').value.trim(),
    notes: el('edit-notes').value.trim(),
    updatedAt: new Date().toISOString()
  });
  el('edit-modal').classList.add('hidden');
  toast('Perubahan disimpan.');
});

el('close-embed').addEventListener('click', () => el('embed-modal').classList.add('hidden'));
el('embed-modal').addEventListener('click', e => { if (e.target === el('embed-modal')) el('embed-modal').classList.add('hidden'); });
el('copy-embed').addEventListener('click', async () => {
  const code = el('embed-code').value;
  try {
    await navigator.clipboard.writeText(code);
    toast('Kode embed berhasil disalin.');
  } catch (_) {
    el('embed-code').select();
    document.execCommand('copy');
    toast('Kode embed berhasil disalin.');
  }
});

boot();
