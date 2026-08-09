import { createFirebaseClient } from './firebase-client.js';
import { escapeHtml, extractAppId, fetchSteamInfo, getStatus, toast, friendlyFirebaseError } from './common.js?v=20260809-v13';

let games = [];
let firebase = null;
let unsubscribeGames = null;
let selectionMode = false;
const selectedIds = new Set();
let scanCandidates = [];
let scanUpdatedGames = [];
let scanManifestCount = 0;
const scanSelectedIds = new Set();
let manualLookupTimer = null;
let manualLookupToken = 0;
let manualLookupCache = null;

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
      .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
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

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function translationAddedAt(game) {
  if (!String(game.translationBuildId || '').trim()) return 0;
  return toMillis(game.translationUpdatedAt || game.updatedAt || game.createdAt);
}

function gameAddedAt(game) {
  return toMillis(game.createdAt);
}

function sortAdminStatuses(items, mode = 'name-asc') {
  const byName = (a, b) => String(a.game.name || a.game.appId || '').localeCompare(String(b.game.name || b.game.appId || ''), 'id', { sensitivity: 'base' });
  if (mode === 'translation-newest') {
    return [...items].sort((a, b) => {
      const diff = translationAddedAt(b.game) - translationAddedAt(a.game);
      return diff || byName(a, b);
    });
  }
  if (mode === 'game-newest') {
    return [...items].sort((a, b) => {
      const diff = gameAddedAt(b.game) - gameAddedAt(a.game);
      return diff || byName(a, b);
    });
  }
  return [...items].sort(byName);
}

function getFilteredStatuses() {
  const keyword = el('admin-search').value.trim().toLowerCase();
  const filter = el('admin-filter').value || 'all';
  const sortMode = el('admin-sort')?.value || 'name-asc';
  const statuses = games.map(game => ({ game, status: getStatus(game) }));
  const filtered = statuses.filter(({game, status}) => {
    const searchOk = `${game.name || ''} ${game.appId || ''}`.toLowerCase().includes(keyword);
    const filterOk = filter === 'all'
      || (filter === 'translation' && status.translationNeedsUpdate)
      || (filter === 'game' && status.gameNeedsUpdate)
      || (filter === 'ready' && status.ready);
    return searchOk && filterOk;
  });
  return { statuses, filtered: sortAdminStatuses(filtered, sortMode), filter };
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
  const bar = el('bulk-bar');
  const count = el('selected-count');
  const filteredCount = el('filtered-count');
  const toggleText = el('bulk-toggle-text');
  const hasSelection = selectedIds.size > 0;

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
      ? { cls: 'danger', title: 'Terjemahan belum sesuai', detail: 'Terjemahan belum ditandai sesuai dengan build publik terbaru.' }
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

  const translationIsCurrent = Boolean(game.remoteBuildId && String(game.translationBuildId || '') === String(game.remoteBuildId));
  const translationIsPending = Boolean(game.remoteBuildId && !translationIsCurrent);
  const checked = selectedIds.has(game.id);

  return `<article class="admin-game-card ${translationState.cls === 'danger' ? 'needs-translation' : ''}${selectionMode ? ' selection-mode' : ''}">
    ${selectionMode ? `<button type="button" class="select-chip ${checked ? 'checked' : ''}" data-action="toggle-select" data-id="${game.id}" aria-pressed="${checked ? 'true' : 'false'}" title="${checked ? 'Batalkan pilihan' : 'Pilih game'}">${checked ? '✓' : ''}</button>` : ''}
    <img class="admin-cover" src="${escapeHtml(game.coverUrl || '/assets/logo.svg')}" alt="">
    <div class="admin-game-main">
      <div class="admin-game-title-row"><div><h3>${escapeHtml(game.name || game.appId)}</h3><div class="game-id">Steam App ID ${escapeHtml(game.appId)}</div></div><div class="admin-status-pills"><span class="badge ${gameState.cls}">${gameState.title}</span><span class="badge ${translationState.cls}">${translationState.title}</span></div></div>
      <div class="admin-build-grid"><div><span>Lokal</span><strong>${escapeHtml(game.localBuildId || 'Belum dipindai')}</strong></div><div><span>Publik</span><strong>${escapeHtml(game.remoteBuildId || 'Belum tersedia')}</strong></div><div><span>Terjemahan</span><strong>${escapeHtml(game.translationBuildId || 'Belum sesuai')}</strong></div></div>
      <div class="translation-callout ${translationState.cls}"><strong>${translationState.title}</strong><span>${escapeHtml(translationState.detail)}</span></div>
      ${notes ? `<div class="admin-note"><span>Catatan</span><p>${escapeHtml(notes)}</p></div>` : ''}
      <div class="admin-item-actions">
        <button class="button small" data-action="sync" data-id="${game.id}">↻ Sync</button>
        <button class="button small primary" data-action="mark" data-id="${game.id}" ${translationIsCurrent || !game.remoteBuildId ? 'disabled' : ''}>✓ Terjemahan sudah sesuai</button>
        <button class="button small translation-pending-button" data-action="unmark" data-id="${game.id}" ${translationIsPending || !game.remoteBuildId ? 'disabled' : ''}>✕ Terjemahan belum sesuai</button>
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

function closeBulkMenu() {
  const details = el('bulk-actions');
  if (details?.open) details.open = false;
}

function bindBulkControls() {
  el('bulk-toggle-mode')?.addEventListener('click', () => {
    setSelectionMode(!selectionMode);
    closeBulkMenu();
  });

  el('bulk-select-filtered')?.addEventListener('click', () => {
    const { filtered } = getFilteredStatuses();
    filtered.forEach(({ game }) => selectedIds.add(game.id));
    selectionMode = true;
    closeBulkMenu();
    renderAdmin();
  });

  el('bulk-clear')?.addEventListener('click', () => {
    selectedIds.clear();
    closeBulkMenu();
    renderAdmin();
  });

  el('bulk-clear-inline')?.addEventListener('click', () => {
    selectedIds.clear();
    renderAdmin();
  });

  el('bulk-done')?.addEventListener('click', () => {
    setSelectionMode(false);
  });

  el('bulk-delete')?.addEventListener('click', deleteSelectedGames);
}

async function deleteSelectedGames() {
  if (!firebase) return toast('Firebase belum tersambung.', 'error');
  if (!selectedIds.size) return toast('Pilih minimal satu game terlebih dahulu.', 'error');

  const selectedGames = games.filter((game) => selectedIds.has(game.id));
  const preview = selectedGames.slice(0, 5).map((game) => `• ${game.name || game.appId}`).join('\n');
  const more = selectedGames.length > 5 ? `\n• dan ${selectedGames.length - 5} game lainnya` : '';
  const ok = confirm(`Hapus ${selectedGames.length} game terpilih dari library?\n\n${preview}${more}\n\nTindakan ini tidak dapat dibatalkan.`);
  if (!ok) return;

  const button = el('bulk-delete');
  button.disabled = true;
  button.textContent = 'Menghapus…';
  try {
    const { doc, deleteDoc } = firebase.firestoreModule;
    for (const game of selectedGames) {
      await deleteDoc(doc(firebase.db, 'games', game.id));
    }
    selectedIds.clear();
    selectionMode = false;
    toast(`${selectedGames.length} game berhasil dihapus.`);
    renderAdmin();
  } catch (error) {
    toast(friendlyFirebaseError(error), 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Hapus yang dipilih';
  }
}

el('admin-search').addEventListener('input', renderAdmin);
el('admin-filter').addEventListener('change', renderAdmin);
el('admin-sort')?.addEventListener('change', renderAdmin);
document.querySelectorAll('[data-admin-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    setAdminFilter(button.dataset.adminFilter || 'all');
    renderAdmin();
    el('library').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

function findLocalBuildForApp(appId) {
  const id = String(appId || '');
  const scanned = scanCandidates.find(game => String(game.appId) === id);
  if (scanned?.localBuildId) return { build: String(scanned.localBuildId), source: 'Hasil Sync Laptop pada sesi ini' };

  const existing = games.find(game => String(game.appId) === id);
  if (existing?.localBuildId) return { build: String(existing.localBuildId), source: 'Build lokal dari library YOSENOV' };

  const updated = scanUpdatedGames.find(game => String(game.appId) === id);
  if (updated?.localBuildId) return { build: String(updated.localBuildId), source: 'Hasil Sync Laptop pada sesi ini' };

  return { build: '', source: 'Belum ditemukan. Gunakan Sync Laptop untuk membaca build lokal.' };
}

function setManualLookupUi({ loading = false, message = '', type = '', info = null } = {}) {
  el('manual-lookup-spinner')?.classList.toggle('hidden', !loading);
  const status = el('manual-lookup-status');
  if (status) {
    status.textContent = message || 'Masukkan App ID atau URL SteamDB untuk mendeteksi game otomatis.';
    status.className = `lookup-status ${type}`.trim();
  }
  const preview = el('manual-preview');
  preview?.classList.toggle('hidden', !info);
  if (info) {
    el('manual-preview-appid').textContent = String(info.appId || '—');
    el('manual-preview-public').textContent = String(info.remoteBuildId || 'Belum tersedia');
    el('manual-preview-patch').textContent = info.latestPatchAt ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(info.latestPatchAt)) : 'Belum diketahui';
  }
}

function applyLocalBuildSuggestion(appId, remoteBuildId = '') {
  const remote = String(remoteBuildId || manualLookupCache?.remoteBuildId || '');
  const local = findLocalBuildForApp(appId);
  const selectedBuild = remote || local.build || '';
  if (el('local-build')) el('local-build').value = selectedBuild;
  if (el('public-build')) el('public-build').value = remote || '';
  const hint = el('local-build-source');
  if (hint) {
    hint.textContent = remote
      ? 'Otomatis mengikuti Build publik untuk game yang ditambahkan manual. Sync Laptop dapat memperbarui build lokal sebenarnya setelah game masuk library.'
      : local.source;
    hint.className = `field-hint ${selectedBuild ? 'success' : ''}`.trim();
  }
}

async function lookupManualGame() {
  const raw = el('app-input').value;
  const appId = extractAppId(raw);
  const token = ++manualLookupToken;

  if (!raw.trim()) {
    manualLookupCache = null;
    el('custom-name').value = '';
    if (el('public-build')) el('public-build').value = '';
    if (el('local-build')) el('local-build').value = '';
    setManualLookupUi();
    return;
  }
  if (!appId) {
    manualLookupCache = null;
    setManualLookupUi({ message: 'App ID atau URL SteamDB belum valid.', type: 'error' });
    return;
  }

  setManualLookupUi({ loading: true, message: `Mendeteksi Steam App ${appId}…` });
  applyLocalBuildSuggestion(appId);
  try {
    const info = await fetchSteamInfo(appId);
    if (token !== manualLookupToken) return;
    manualLookupCache = { ...info, appId: String(appId) };
    el('custom-name').value = info.name || `Steam App ${appId}`;
    applyLocalBuildSuggestion(appId, info.remoteBuildId);
    setManualLookupUi({
      message: `${info.name || `Steam App ${appId}`} berhasil dikenali. Anda bisa langsung menyimpan ke library.`,
      type: 'success',
      info: manualLookupCache
    });
  } catch (error) {
    if (token !== manualLookupToken) return;
    manualLookupCache = null;
    setManualLookupUi({ message: error.message || 'Data Steam tidak dapat diambil.', type: 'error' });
  }
}

el('app-input').addEventListener('input', () => {
  clearTimeout(manualLookupTimer);
  manualLookupTimer = setTimeout(lookupManualGame, 500);
});
el('app-input').addEventListener('change', () => {
  clearTimeout(manualLookupTimer);
  lookupManualGame();
});
el('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const appId = extractAppId(el('app-input').value);
  if (!appId) return toast('App ID tidak valid.', 'error');
  const button = event.submitter || el('manual-save-button');
  button.disabled = true;
  button.textContent = 'Menyimpan…';
  try {
    let info = manualLookupCache && String(manualLookupCache.appId) === String(appId)
      ? manualLookupCache
      : await fetchSteamInfo(appId);
    const local = findLocalBuildForApp(appId);
    const newGame = {
      ...info,
      appId,
      name: el('custom-name').value.trim() || info.name || `Steam App ${appId}`,
      localBuildId: String(info.remoteBuildId || el('local-build').value.trim() || local.build || ''),
      source: 'manual'
    };
    const newNotes = el('add-notes').value.trim();
    if (newNotes) newGame.notes = newNotes;
    await saveGame(newGame);
    event.target.reset();
    if (el('public-build')) el('public-build').value = '';
    manualLookupCache = null;
    setManualLookupUi();
    if (el('local-build-source')) {
      el('local-build-source').textContent = 'Belum ada data lokal.';
      el('local-build-source').className = 'field-hint';
    }
    toast('Game berhasil ditambahkan.');
    el('library').scrollIntoView({ behavior: 'smooth' });
  } catch (error) {
    toast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Simpan ke library';
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
    translationUpdatedAt: previous.translationUpdatedAt || '',
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
      const now = new Date().toISOString();
      await updateDoc(doc(firebase.db, 'games', game.id), {
        translationBuildId: String(game.remoteBuildId),
        translationUpdatedAt: now,
        updatedAt: now
      });
      toast('Terjemahan ditandai sesuai patch terbaru.');
    }
    if (button.dataset.action === 'unmark') {
      if (!game.remoteBuildId) throw new Error('Build publik belum tersedia. Sync terlebih dahulu.');
      const now = new Date().toISOString();
      await updateDoc(doc(firebase.db, 'games', game.id), {
        translationBuildId: '',
        translationUpdatedAt: '',
        updatedAt: now
      });
      toast('Terjemahan ditandai belum sesuai dengan patch terbaru.');
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


// ===== V6: popup window for laptop sync =====
const scanWindowBackdrop = el('scan-window-backdrop');
const scanWindow = el('scan-window');
const scanWindowBody = el('scan-window-body');
const scanWindowMinimized = el('scan-window-minimized');

function openScanWindow() {
  if (!scanWindowBackdrop) return;
  scanWindowBackdrop.classList.remove('hidden', 'minimized');
  scanWindowBackdrop.setAttribute('aria-hidden', 'false');
  scanWindowBody?.classList.remove('hidden');
  scanWindowMinimized?.classList.add('hidden');
  document.body.classList.add('scan-dialog-open');
  window.setTimeout(() => el('scan-folder')?.focus(), 30);
}

function closeScanWindow() {
  if (!scanWindowBackdrop) return;
  scanWindowBackdrop.classList.add('hidden');
  scanWindowBackdrop.classList.remove('minimized');
  scanWindowBackdrop.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('scan-dialog-open');
}

function minimizeScanWindow() {
  if (!scanWindowBackdrop) return;
  scanWindowBackdrop.classList.add('minimized');
  scanWindow?.classList.remove('maximized');
  scanWindowBody?.classList.add('hidden');
  scanWindowMinimized?.classList.remove('hidden');
  document.body.classList.remove('scan-dialog-open');
}

function restoreScanWindow() {
  if (!scanWindowBackdrop) return;
  scanWindowBackdrop.classList.remove('minimized');
  scanWindowBody?.classList.remove('hidden');
  scanWindowMinimized?.classList.add('hidden');
  document.body.classList.add('scan-dialog-open');
}

function toggleMaximizeScanWindow() {
  if (!scanWindow) return;
  scanWindow.style.transform = '';
  scanWindow.dataset.dragX = '0';
  scanWindow.dataset.dragY = '0';
  scanWindow.classList.toggle('maximized');
  const maximized = scanWindow.classList.contains('maximized');
  const button = el('scan-window-maximize');
  if (button) {
    button.textContent = maximized ? '❐' : '□';
    button.title = maximized ? 'Restore' : 'Maximize';
    button.setAttribute('aria-label', maximized ? 'Restore' : 'Maximize');
  }
}

el('open-scan-window')?.addEventListener('click', openScanWindow);
el('sidebar-open-scan')?.addEventListener('click', openScanWindow);
el('scan-window-close')?.addEventListener('click', closeScanWindow);
el('scan-window-minimize')?.addEventListener('click', minimizeScanWindow);
el('scan-window-restore')?.addEventListener('click', restoreScanWindow);
el('scan-window-maximize')?.addEventListener('click', toggleMaximizeScanWindow);
scanWindowBackdrop?.addEventListener('click', (event) => {
  if (event.target === scanWindowBackdrop && !scanWindowBackdrop.classList.contains('minimized')) closeScanWindow();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && scanWindowBackdrop && !scanWindowBackdrop.classList.contains('hidden')) closeScanWindow();
});

// Desktop-like drag behavior. It never changes scan data or writes anything to storage.
const scanTitlebar = document.querySelector('.scan-window-titlebar');
let scanDrag = null;
scanTitlebar?.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.scan-window-controls') || scanWindow?.classList.contains('maximized')) return;
  scanDrag = { startX: event.clientX, startY: event.clientY, x: Number(scanWindow?.dataset.dragX || 0), y: Number(scanWindow?.dataset.dragY || 0) };
  scanTitlebar.setPointerCapture?.(event.pointerId);
});
scanTitlebar?.addEventListener('pointermove', (event) => {
  if (!scanDrag || !scanWindow) return;
  const x = scanDrag.x + event.clientX - scanDrag.startX;
  const y = scanDrag.y + event.clientY - scanDrag.startY;
  scanWindow.dataset.dragX = String(x);
  scanWindow.dataset.dragY = String(y);
  scanWindow.style.transform = `translate(${x}px, ${y}px)`;
});
function stopScanDrag() { scanDrag = null; }
scanTitlebar?.addEventListener('pointerup', stopScanDrag);
scanTitlebar?.addEventListener('pointercancel', stopScanDrag);

el('scan-folder').addEventListener('click', async () => {
  if (!window.showDirectoryPicker) return toast('Browser tidak mendukung pemindaian folder. Gunakan Chrome atau Edge desktop terbaru.', 'error');
  try {
    const root = await window.showDirectoryPicker({ mode: 'read' });
    const manifests = [];
    await findManifests(root, manifests, 0);
    if (!manifests.length) throw new Error('Tidak menemukan appmanifest_*.acf. Pilih folder steamapps atau folder Steam utama.');

    resetScanSession();
    scanManifestCount = manifests.length;
    const progress = el('scan-progress');
    const status = el('scan-status');
    const existingByAppId = new Map(games.map(game => [String(game.appId), game]));

    for (let i = 0; i < manifests.length; i++) {
      const file = await manifests[i].getFile();
      const parsed = parseManifest(await file.text());
      status.textContent = `Membaca ${i + 1}/${manifests.length}: ${parsed.name || parsed.appId || file.name}`;
      progress.style.width = `${Math.round(((i + 1) / manifests.length) * 100)}%`;
      if (!parsed.appId) continue;

      const existing = existingByAppId.get(String(parsed.appId));
      if (existing) {
        try {
          const info = await fetchSteamInfo(parsed.appId);
          await saveGame({ ...existing, ...info, localBuildId: parsed.localBuildId, source: existing.source || 'manual' });
        } catch (error) {
          console.warn('Steam info gagal saat scan existing:', parsed.appId, error);
          await updateExistingLocalBuild(existing, parsed.localBuildId);
        }
        scanUpdatedGames.push({
          appId: String(parsed.appId),
          name: existing.name || parsed.name || `Steam App ${parsed.appId}`,
          localBuildId: parsed.localBuildId || '',
          previousLocalBuildId: existing.localBuildId || ''
        });
      } else {
        let preview = { ...parsed };
        try {
          const info = await fetchSteamInfo(parsed.appId);
          preview = { ...info, ...parsed, name: info.name || parsed.name || `Steam App ${parsed.appId}` };
        } catch (_) {
          preview.name = parsed.name || `Steam App ${parsed.appId}`;
        }
        scanCandidates.push({
          appId: String(preview.appId),
          name: preview.name || `Steam App ${preview.appId}`,
          localBuildId: String(preview.localBuildId || ''),
          remoteBuildId: String(preview.remoteBuildId || ''),
          coverUrl: preview.coverUrl || '',
          latestPatchAt: preview.latestPatchAt || '',
          latestNewsUrl: preview.latestNewsUrl || '',
          source: 'steam-folder'
        });
      }
      await new Promise(r => setTimeout(r, 80));
    }

    scanCandidates.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
    scanUpdatedGames.sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
    progress.style.width = '100%';
    status.textContent = `${manifests.length} manifest dibaca · ${scanUpdatedGames.length} game library diperbarui · ${scanCandidates.length} game baru menunggu pilihan.`;
    renderScanResults();
    toast(scanCandidates.length
      ? `Scan selesai. ${scanCandidates.length} game baru belum disimpan ke library.`
      : 'Scan selesai. Tidak ada game baru yang dimasukkan otomatis.');
  } catch (error) {
    if (error.name !== 'AbortError') toast(error.message, 'error');
  }
});

async function updateExistingLocalBuild(game, localBuildId) {
  if (!firebase) return;
  const { doc, updateDoc } = firebase.firestoreModule;
  await updateDoc(doc(firebase.db, 'games', game.id), {
    localBuildId: String(localBuildId || game.localBuildId || ''),
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function resetScanSession() {
  scanCandidates = [];
  scanUpdatedGames = [];
  scanManifestCount = 0;
  scanSelectedIds.clear();
  if (el('scan-search')) el('scan-search').value = '';
  if (el('scan-progress')) el('scan-progress').style.width = '0%';
  renderScanResults();
}

function renderScanResults() {
  const results = el('scan-results');
  const hasResults = scanManifestCount > 0 || scanCandidates.length > 0 || scanUpdatedGames.length > 0;
  results?.classList.toggle('hidden', !hasResults);
  el('clear-scan')?.classList.toggle('hidden', !hasResults);
  if (!hasResults) return;

  el('scan-total').textContent = String(scanManifestCount);
  el('scan-existing').textContent = String(scanUpdatedGames.length);
  el('scan-new').textContent = String(scanCandidates.length);
  el('scan-updated-count').textContent = `${scanUpdatedGames.length} diperbarui`;

  const updatedWrap = el('scan-updated-wrap');
  updatedWrap.classList.toggle('hidden', scanUpdatedGames.length === 0);
  el('scan-updated-list').innerHTML = scanUpdatedGames.map(game => {
    const changed = game.previousLocalBuildId && game.localBuildId && game.previousLocalBuildId !== game.localBuildId;
    const detail = changed
      ? `${escapeHtml(game.previousLocalBuildId)} → ${escapeHtml(game.localBuildId)}`
      : escapeHtml(game.localBuildId || 'Build belum terbaca');
    return `<div class="scan-updated-item"><div><strong>${escapeHtml(game.name)}</strong><span>App ID ${escapeHtml(game.appId)}</span></div><span class="scan-build-chip">${detail}</span></div>`;
  }).join('');

  const newWrap = el('scan-new-wrap');
  newWrap.classList.toggle('hidden', scanCandidates.length === 0);
  renderScanCandidates();
}

function getVisibleScanCandidates() {
  const keyword = el('scan-search')?.value.trim().toLowerCase() || '';
  return scanCandidates.filter(game => !keyword || `${game.name} ${game.appId}`.toLowerCase().includes(keyword));
}

function renderScanCandidates() {
  const list = el('scan-candidate-list');
  if (!list) return;
  const visible = getVisibleScanCandidates();
  el('scan-candidate-empty')?.classList.toggle('hidden', visible.length > 0);
  list.innerHTML = visible.map(game => {
    const selected = scanSelectedIds.has(game.appId);
    return `<article class="scan-candidate ${selected ? 'selected' : ''}" data-scan-appid="${escapeHtml(game.appId)}">
      <button type="button" class="scan-check ${selected ? 'checked' : ''}" data-scan-action="toggle" data-appid="${escapeHtml(game.appId)}" aria-pressed="${selected ? 'true' : 'false'}">${selected ? '✓' : ''}</button>
      <div class="scan-candidate-main">
        <button type="button" class="scan-game-title" data-scan-action="add" data-appid="${escapeHtml(game.appId)}">${escapeHtml(game.name)}</button>
        <div class="game-id">Steam App ID ${escapeHtml(game.appId)} · Build lokal ${escapeHtml(game.localBuildId || 'belum terbaca')}</div>
      </div>
      <button type="button" class="button small primary" data-scan-action="add" data-appid="${escapeHtml(game.appId)}">Tambah ke library</button>
    </article>`;
  }).join('');

  el('scan-selected-count').textContent = String(scanSelectedIds.size);
  el('scan-add-selected').disabled = scanSelectedIds.size === 0;
}

el('scan-search')?.addEventListener('input', renderScanCandidates);
el('scan-select-all')?.addEventListener('click', () => {
  getVisibleScanCandidates().forEach(game => scanSelectedIds.add(game.appId));
  renderScanCandidates();
});
el('scan-clear-selection')?.addEventListener('click', () => {
  scanSelectedIds.clear();
  renderScanCandidates();
});
el('clear-scan')?.addEventListener('click', () => {
  resetScanSession();
  el('scan-status').textContent = 'Riwayat scan dihapus dari sesi browser. Game baru yang belum ditambahkan tidak pernah disimpan ke web.';
});

el('scan-candidate-list')?.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-scan-action]');
  if (!button) return;
  const appId = String(button.dataset.appid || '');
  if (button.dataset.scanAction === 'toggle') {
    if (scanSelectedIds.has(appId)) scanSelectedIds.delete(appId);
    else scanSelectedIds.add(appId);
    renderScanCandidates();
    return;
  }
  if (button.dataset.scanAction === 'add') {
    await addScannedGames([appId], button);
  }
});

el('scan-add-selected')?.addEventListener('click', async () => {
  await addScannedGames([...scanSelectedIds], el('scan-add-selected'));
});

async function addScannedGames(appIds, triggerButton) {
  const ids = [...new Set(appIds.map(String))].filter(Boolean);
  if (!ids.length) return;
  const selected = scanCandidates.filter(game => ids.includes(game.appId));
  if (!selected.length) return;

  const originalText = triggerButton?.textContent;
  if (triggerButton) {
    triggerButton.disabled = true;
    triggerButton.textContent = selected.length > 1 ? `Menambahkan ${selected.length} game…` : 'Menambahkan…';
  }

  let added = 0;
  try {
    for (const candidate of selected) {
      let info = candidate;
      try {
        const latest = await fetchSteamInfo(candidate.appId);
        info = { ...candidate, ...latest, appId: candidate.appId, localBuildId: candidate.localBuildId, source: 'steam-folder' };
      } catch (_) {}
      await saveGame(info);
      added += 1;
      scanCandidates = scanCandidates.filter(game => game.appId !== candidate.appId);
      scanSelectedIds.delete(candidate.appId);
    }
    toast(`${added} game ditambahkan ke library.`);
    renderScanResults();
  } catch (error) {
    toast(friendlyFirebaseError(error), 'error');
  } finally {
    if (triggerButton) {
      triggerButton.disabled = false;
      triggerButton.textContent = originalText || 'Tambah ke library';
    }
  }
}

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
  el('edit-public').value = game.remoteBuildId || '';
  el('edit-local').value = game.localBuildId || game.remoteBuildId || '';
  el('edit-translation').value = game.translationBuildId || '';
  el('edit-notes').value = game.notes || '';
  el('edit-modal').classList.remove('hidden');
}

function buildEmbedCode(game, withBorder = true) {
  const url = `${window.location.origin}/game-embed.html?game=${encodeURIComponent(game.appId)}&border=${withBorder ? '1' : '0'}`;
  const title = escapeAttribute(game.name || `Steam App ${game.appId}`);
  const iframeStyle = withBorder
    ? 'display: block; width: 100%; height: 245px; border: none; border-radius: 14px; background: transparent; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);'
    : 'display: block; width: 100%; height: 245px; border: none; border-radius: 0; background: transparent; overflow: hidden; box-shadow: none;';

  return {
    url,
    code: `<div style="width: 100%; margin: 20px 0; overflow: hidden;">
  <iframe
    src="${url}"
    title="Status update ${title}"
    width="100%"
    height="245"
    scrolling="no"
    loading="lazy"
    style="${iframeStyle}">
  </iframe>
</div>`
  };
}

function openEmbed(game) {
  const bordered = buildEmbedCode(game, true);
  const clean = buildEmbedCode(game, false);
  el('embed-game-name').value = game.name || `Steam App ${game.appId}`;
  el('embed-url').value = `${window.location.origin}/game-embed.html?game=${encodeURIComponent(game.appId)}`;
  el('embed-code-border').value = bordered.code;
  el('embed-code-clean').value = clean.code;
  el('preview-embed-border').href = bordered.url;
  el('preview-embed-clean').href = clean.url;
  el('embed-modal').classList.remove('hidden');
}

function escapeAttribute(value = '') {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

el('edit-use-public')?.addEventListener('click', () => {
  el('edit-local').value = el('edit-public').value || '';
  toast('Build lokal disamakan dengan Build publik.');
});

el('close-modal').addEventListener('click', () => el('edit-modal').classList.add('hidden'));
el('edit-modal').addEventListener('click', e => { if (e.target === el('edit-modal')) el('edit-modal').classList.add('hidden'); });
el('edit-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!firebase) return;
  const { doc, updateDoc } = firebase.firestoreModule;
  const gameId = el('edit-id').value;
  const previousGame = games.find((game) => game.id === gameId);
  const previousTranslation = String(previousGame?.translationBuildId || '').trim();
  const nextTranslation = el('edit-translation').value.trim();
  const now = new Date().toISOString();
  const updatePayload = {
    name: el('edit-name').value.trim(),
    localBuildId: el('edit-local').value.trim(),
    translationBuildId: nextTranslation,
    notes: el('edit-notes').value.trim(),
    updatedAt: now
  };
  if (nextTranslation !== previousTranslation) {
    updatePayload.translationUpdatedAt = nextTranslation ? now : '';
  }
  await updateDoc(doc(firebase.db, 'games', gameId), updatePayload);
  el('edit-modal').classList.add('hidden');
  toast('Perubahan disimpan.');
});

el('close-embed').addEventListener('click', () => el('embed-modal').classList.add('hidden'));
el('embed-modal').addEventListener('click', e => { if (e.target === el('embed-modal')) el('embed-modal').classList.add('hidden'); });
async function copyEmbedFrom(fieldId, message) {
  const field = el(fieldId);
  const code = field?.value || '';
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast(message);
  } catch (_) {
    field.select();
    document.execCommand('copy');
    toast(message);
  }
}

el('copy-embed-border').addEventListener('click', () => copyEmbedFrom('embed-code-border', 'Embed dengan border berhasil disalin.'));
el('copy-embed-clean').addEventListener('click', () => copyEmbedFrom('embed-code-clean', 'Embed tanpa border berhasil disalin.'));

bindBulkControls();
boot();
