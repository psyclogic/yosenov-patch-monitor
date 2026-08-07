import { createFirebaseClient } from './firebase-client.js';
import { escapeHtml, extractAppId, fetchSteamInfo, getStatus, toast, friendlyFirebaseError } from './common.js';

let games = [];
let firebase = null;
let unsubscribeGames = null;
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
        toast('Login Firebase berhasil, tetapi UID ini belum terdaftar sebagai admin.', 'error');
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
    renderAdmin();
  }, error => toast(friendlyFirebaseError(error), 'error'));
}

function renderAdmin() {
  const keyword = el('admin-search').value.trim().toLowerCase();
  const filtered = games.filter(g => `${g.name || ''} ${g.appId || ''}`.toLowerCase().includes(keyword));
  el('admin-empty').classList.toggle('hidden', filtered.length > 0);
  el('admin-list').innerHTML = filtered.map(game => {
    const status = getStatus(game);
    const statusText = status.translationNeedsUpdate ? 'Terjemahan perlu update' : status.gameNeedsUpdate ? 'Game perlu update' : status.ready ? 'Sinkron' : 'Perlu data build';
    return `<article class="admin-item"><img src="${escapeHtml(game.coverUrl || '/assets/logo.svg')}" alt=""><div><h3>${escapeHtml(game.name || game.appId)}</h3><p>App ${escapeHtml(game.appId)} · lokal ${escapeHtml(game.localBuildId || '-')} · publik ${escapeHtml(game.remoteBuildId || '-')} · ${statusText}</p></div><div class="admin-item-actions"><button class="button small" data-action="sync" data-id="${game.id}">Sync</button><button class="button small primary" data-action="mark" data-id="${game.id}">Terjemahan selesai</button><button class="button small" data-action="edit" data-id="${game.id}">Edit</button><button class="button small danger" data-action="delete" data-id="${game.id}">Hapus</button></div></article>`;
  }).join('');
}
el('admin-search').addEventListener('input', renderAdmin);

el('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const appId = extractAppId(el('app-input').value);
  if (!appId) return toast('App ID tidak valid.', 'error');
  const button = event.submitter;
  button.disabled = true;
  button.textContent = 'Mengambil data…';
  try {
    const info = await fetchSteamInfo(appId);
    await saveGame({ ...info, appId, name: el('custom-name').value.trim() || info.name || `Steam App ${appId}`, localBuildId: el('local-build').value.trim() || '', source: 'manual' });
    event.target.reset();
    toast('Game berhasil ditambahkan.');
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
    notes: previous.notes || '',
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (!existing.exists()) payload.createdAt = new Date().toISOString();
  await setDoc(ref, payload, { merge: true });
}

el('admin-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button || !firebase) return;
  const game = games.find(g => g.id === button.dataset.id);
  if (!game) return;
  try {
    button.disabled = true;
    const { doc, updateDoc, deleteDoc } = firebase.firestoreModule;
    if (button.dataset.action === 'sync') await syncOne(game);
    if (button.dataset.action === 'mark') {
      if (!game.remoteBuildId) throw new Error('Build publik belum tersedia. Sync terlebih dahulu.');
      await updateDoc(doc(firebase.db, 'games', game.id), { translationBuildId: String(game.remoteBuildId), updatedAt: new Date().toISOString() });
      toast('Build terjemahan ditandai selesai.');
    }
    if (button.dataset.action === 'edit') openEdit(game);
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
  toast(`${game.name} sudah disinkronkan.`);
}

el('sync-all').addEventListener('click', async () => {
  if (!games.length) return toast('Library masih kosong.');
  const progress = el('scan-progress');
  const status = el('scan-status');
  for (let i = 0; i < games.length; i++) {
    status.textContent = `Menyinkronkan ${i + 1}/${games.length}: ${games[i].name}`;
    progress.style.width = `${Math.round((i / games.length) * 100)}%`;
    try { await syncOne(games[i]); } catch (error) { console.error(error); }
    await new Promise(r => setTimeout(r, 180));
  }
  progress.style.width = '100%';
  status.textContent = 'Semua game selesai diperiksa.';
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

boot();
