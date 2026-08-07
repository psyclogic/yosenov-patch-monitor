# YOSENOV Patch Monitor

Website gratis untuk memantau:

- build game yang terpasang di laptop;
- build publik terbaru di Steam;
- build terakhir yang sudah didukung terjemahan Bahasa Indonesia;
- status game perlu update / terjemahan perlu update;
- public view tanpa login dan embed Blogspot;
- admin login, tambah manual, scan folder Steam, sync, edit, tandai terjemahan selesai, dan hapus game;
- dark/light mode;
- sinkronisasi otomatis harian melalui GitHub Actions.

## Arsitektur gratis

- **Vercel Hobby**: hosting website dan API proxy `/api/steam`.
- **Firebase Spark**: Email/Password Authentication + Cloud Firestore realtime.
- **GitHub**: penyimpanan source code dan GitHub Actions untuk sync build harian.
- **Steam Store + Steam News + SteamCMD API**: metadata, berita patch, dan public build ID.
- **SteamDB**: tautan referensi patch notes pada tiap game, bukan scraping otomatis.

## Batasan yang perlu dipahami

Browser tidak boleh memindai hard disk tanpa izin. Tombol **Pilih Steam Folder** menggunakan File System Access API, sehingga pengguna tetap harus memilih folder `steamapps`. Fitur ini paling stabil di Chrome/Edge desktop. Untuk library Steam di beberapa drive, pilih masing-masing folder `steamapps` satu per satu.

## 1. Buat proyek Firebase

1. Buka Firebase Console dan buat project baru.
2. Tambahkan **Web App**.
3. Aktifkan **Authentication > Sign-in method > Email/Password**.
4. Buat **Cloud Firestore** dalam Production mode.
5. Salin web config ke `assets/firebase-config.js`.
6. Deploy isi `firestore.rules` melalui Firebase Console > Firestore > Rules.

## 2. Buat akun admin pertama

1. Authentication > Users > Add user.
2. Salin UID user tersebut.
3. Firestore > Start collection: `admins`.
4. Document ID = UID user. Tambahkan field opsional `email` bertipe string.

Hanya UID yang memiliki document pada `admins/{uid}` yang dapat mengubah library.

## 3. Upload ke GitHub

Buat repository baru, lalu upload seluruh folder proyek ini. Jangan memasukkan service account ke file repository.

## 4. Deploy ke Vercel

1. Login Vercel menggunakan GitHub.
2. Add New Project > pilih repository.
3. Framework Preset: **Other**.
4. Build command: kosong.
5. Output directory: kosong.
6. Deploy.

Setelah deploy, buka `/admin.html` dan login.

## 5. Aktifkan sync otomatis harian

GitHub repository > Settings > Secrets and variables > Actions > New repository secret:

- `FIREBASE_PROJECT_ID`: Project ID Firebase.
- `FIREBASE_SERVICE_ACCOUNT`: isi JSON utuh service account Firebase.

Membuat service account:

Firebase Console > Project settings > Service accounts > Generate new private key. Simpan JSON hanya sebagai GitHub Secret, jangan commit ke repository.

Workflow `.github/workflows/daily-sync.yml` berjalan setiap hari pukul 08.00 WIB dan juga dapat dijalankan manual dari tab Actions.

## 6. Embed ke Blogspot

Buka `BLOGSPOT-EMBED.html`, ganti domain, kemudian tempel iframe pada editor HTML Blogspot. Public view tidak memerlukan login.

## 7. Agar muncul di Google

1. Ganti domain pada `robots.txt` dan `sitemap.xml`.
2. Deploy ulang.
3. Tambahkan domain Vercel ke Google Search Console.
4. Submit `/sitemap.xml`.

## Alur status

- `localBuildId`: dibaca dari `appmanifest_*.acf` atau diisi manual.
- `remoteBuildId`: build cabang public terbaru.
- `translationBuildId`: build yang terakhir sudah selesai diterjemahkan.
- Bila `remoteBuildId != localBuildId`, game perlu update.
- Bila `remoteBuildId != translationBuildId`, terjemahan perlu update.
- Tombol **Terjemahan selesai** mengisi `translationBuildId` dengan build publik terbaru.

## Contoh input

- App ID: `1796790`
- SteamDB URL: `https://steamdb.info/app/1796790/patchnotes/`

## Catatan sumber data

SteamDB tidak menyediakan API publik. Proyek ini tidak melakukan scraping SteamDB. Build otomatis menggunakan SteamCMD API yang bersifat open-source, sedangkan berita patch memakai endpoint Steam News. Tautan SteamDB tetap tersedia untuk pemeriksaan detail patch.
