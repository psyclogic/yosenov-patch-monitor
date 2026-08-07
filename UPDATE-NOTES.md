# YOSENOV — UI/UX Revision

Perubahan utama:

1. Dashboard utama dan View Mode: empat kartu statistik sekarang dapat diklik sebagai filter cepat.
2. Kartu game: status game dan status terjemahan dipisahkan agar lebih jelas.
3. Catatan game: opsional; hanya tampil pada halaman publik/embed jika admin telah mengisinya.
4. Admin: ringkasan status klik-filter, daftar prioritas terjemahan, status build lebih jelas, dan tombol Edit/Catatan.
5. Admin: tombol **Embed Blogspot** pada setiap game menghasilkan iframe untuk satu game saja.
6. View Mode: tombol dark/light mode tersedia.
7. Single-game embed: `embed.html?game=APP_ID&compact=1` atau parameter nama/slug game.
8. Copy hero halaman utama diperbarui agar berorientasi pengguna dan tidak menyebut Firebase/implementasi teknis.

## Cara update repository yang sudah ada

Salin file versi revisi ke folder project, lalu jalankan:

```powershell
git add .
git commit -m "Improve YOSENOV status UI and single-game Blogspot embed"
git push
```

Vercel akan redeploy otomatis jika repository sudah terhubung.
