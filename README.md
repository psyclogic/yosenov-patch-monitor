# YOSENOV Patch Monitor — Fixed Firebase/Vercel Edition

Website gratis untuk memantau build game Steam dan status pembaruan terjemahan Bahasa Indonesia.

## Perbaikan versi ini

- Dark/light mode sekarang **mandiri** (`assets/theme.js`) dan tetap berfungsi walaupun Firebase gagal dimuat.
- Firebase tidak lagi wajib ditulis di source code. Konfigurasi Web App dapat diambil dari **Vercel Environment Variables** melalui `/api/firebase-config`.
- Login admin menampilkan status koneksi Firebase dan pesan error yang lebih jelas.
- Firebase SDK diperbarui ke 12.16.0.
- Public view tetap tampil dan memberi pesan setup apabila Firebase belum dikonfigurasi.
- Service account tetap tidak pernah dikirim ke browser dan tidak disimpan di repository.

## 1. Firebase: buat Web App

Firebase Console > Project settings > General > Your apps > Add app > Web.
Salin nilai pada `firebaseConfig`.

Aktifkan juga:

1. Authentication > Sign-in method > **Email/Password** > Enable.
2. Authentication > Users > Add user.
3. Firestore Database > Create database.
4. Firestore > Rules > salin isi `firestore.rules` lalu Publish.

## 2. Vercel Environment Variables

Vercel > Project > Settings > Environment Variables. Tambahkan untuk **Production, Preview, Development**:

- `FIREBASE_WEB_API_KEY`
- `FIREBASE_WEB_AUTH_DOMAIN`
- `FIREBASE_WEB_PROJECT_ID`
- `FIREBASE_WEB_STORAGE_BUCKET`
- `FIREBASE_WEB_MESSAGING_SENDER_ID`
- `FIREBASE_WEB_APP_ID`

Contoh pemetaan dari Firebase:

```text
apiKey            -> FIREBASE_WEB_API_KEY
authDomain        -> FIREBASE_WEB_AUTH_DOMAIN
projectId         -> FIREBASE_WEB_PROJECT_ID
storageBucket     -> FIREBASE_WEB_STORAGE_BUCKET
messagingSenderId -> FIREBASE_WEB_MESSAGING_SENDER_ID
appId             -> FIREBASE_WEB_APP_ID
```

Setelah menambah/mengubah Environment Variables, lakukan **Redeploy** di Vercel.

> Firebase Web config bukan service account. Jangan pernah menaruh `private_key`, JSON service account, atau `firebase-adminsdk*.json` di repository.

## 3. Daftarkan akun sebagai admin

Setelah membuat user di Authentication:

1. Firebase Console > Authentication > Users.
2. Salin **User UID** (bukan email).
3. Firestore Database > Data > Start collection.
4. Collection ID: `admins`.
5. Document ID: **UID yang disalin persis**.
6. Tambahkan field opsional `email` dengan tipe string dan isi email admin.

Contoh:

```text
admins
└── abcDEFG123456789       <- Document ID harus UID Authentication
    └── email: "admin@example.com"
```

## 4. Firestore Rules

Gunakan `firestore.rules` di repository. Public dapat membaca `games`, tetapi hanya user yang memiliki `admins/{UID}` yang boleh membuat/mengubah/menghapus game.

## 5. Deploy Vercel

- Framework Preset: Other
- Root Directory: `./`
- Build Command: kosong
- Output Directory: kosong

Setelah deploy, tes:

```text
https://DOMAIN-ANDA.vercel.app/api/firebase-config
```

Jika benar, respons memiliki:

```json
{"configured":true,"config":{...}}
```

Lalu buka:

```text
https://DOMAIN-ANDA.vercel.app/admin.html
```

Status harus berubah menjadi **Firebase tersambung. Silakan login.**

## 6. GitHub Actions untuk sync otomatis

Service account hanya disimpan sebagai GitHub Repository Secrets:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_SERVICE_ACCOUNT`

Jangan commit service account ke repository.

## 7. Troubleshooting cepat

### Dark mode tidak bekerja
Pastikan `/assets/theme.js` dapat dibuka dari domain Vercel dan lakukan hard refresh `Ctrl+F5`.

### Login button nonaktif / Firebase belum dikonfigurasi
Periksa `/api/firebase-config`, Environment Variables Vercel, lalu Redeploy.

### Email/password salah
Pastikan user ada di Firebase Authentication pada project yang sama dengan `FIREBASE_WEB_PROJECT_ID`.

### Login berhasil lalu langsung keluar
UID user belum menjadi Document ID pada collection `admins`.

### `Missing or insufficient permissions`
Publish `firestore.rules` dari repository ke Firebase Console.

## 8. Revisi UI status & Blogspot embed per game

Versi ini menambahkan beberapa kemudahan pengelolaan:

- Kartu **Total game**, **Game perlu update**, **Terjemahan perlu update**, dan **Siap / sinkron** dapat diklik sebagai filter cepat pada halaman utama dan View Mode.
- Dashboard admin memiliki ringkasan status yang juga dapat diklik.
- Status game dan status terjemahan dipisahkan menjadi dua panel agar tidak tertukar.
- Catatan game bersifat opsional. Catatan tidak ditampilkan jika kosong; setelah admin mengisi catatan, catatan akan muncul pada kartu game publik dan embed.
- Admin dapat menyalin kode **Embed Blogspot** untuk satu game saja.
- View Mode memiliki tombol dark/light mode.

### Embed seluruh library

```html
<iframe
  src="https://DOMAIN-ANDA.vercel.app/embed.html"
  title="YOSENOV Game Update Library"
  width="100%"
  height="900"
  style="border:0;display:block;width:100%;"
  loading="lazy">
</iframe>
```

### Embed satu game saja

Gunakan Steam App ID sebagai parameter `game`:

```text
https://DOMAIN-ANDA.vercel.app/embed.html?game=374900&compact=1
```

Parameter `game` juga menerima nama/slug game, tetapi **Steam App ID lebih direkomendasikan** karena tidak berubah ketika judul game diubah.

Di dashboard admin, klik **Embed Blogspot** pada game yang diinginkan. Kode iframe dibuat otomatis dan dapat langsung ditempel pada mode HTML postingan Blogspot, misalnya tepat setelah:

```text
📅 Update Terakhir: 20 Juli 2026
```

Contoh:

```html
<p><strong>📅 Update Terakhir:</strong> 20 Juli 2026</p>

<iframe
  src="https://DOMAIN-ANDA.vercel.app/embed.html?game=374900&compact=1"
  title="Status update Agatha Christie - The ABC Murders"
  width="100%"
  height="420"
  style="border:0;display:block;width:100%;"
  loading="lazy">
</iframe>

<p><strong>Life is Strange 2</strong> adalah game petualangan naratif...</p>
```

Jika kartu memuat catatan yang panjang, tinggi iframe dapat dinaikkan dari `420` menjadi `480` atau `520`.
