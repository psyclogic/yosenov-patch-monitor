# V13

- Sort ditambahkan di Admin / Kelola status terjemahan, Dashboard Utama, dan View Mode.
- Opsi: Nama A–Z dan Terjemahan terbaru ditambahkan.
- Saat terjemahan ditandai sudah sesuai, field `translationUpdatedAt` disimpan agar urutan terjemahan terbaru akurat.
- Jika terjemahan ditandai belum sesuai, timestamp tersebut dikosongkan.
- Data lama tanpa `translationUpdatedAt` memakai `updatedAt/createdAt` sebagai fallback sampai status terjemahannya diperbarui lagi.
