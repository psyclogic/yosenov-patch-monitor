# YOSENOV V6 — Popup Sync Laptop

- Sync laptop dipindahkan ke popup bergaya desktop agar halaman admin tidak memanjang.
- Popup memiliki kontrol minimize, maximize/restore, close, dan dapat digeser melalui title bar di desktop.
- Game yang belum masuk library selalu ditampilkan terlebih dahulu.
- Hasil scan game baru hanya disimpan pada variabel JavaScript di memori halaman; tidak memakai localStorage/sessionStorage/Firestore.
- Tombol **Hapus riwayat scan** menghapus seluruh hasil scan sementara dan pilihan pada sesi browser.
- Game yang sudah ada di library tetap auto-sync build lokal sesuai permintaan.
- Menutup/minimize popup tidak menambahkan game baru ke library.
