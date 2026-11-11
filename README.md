# Media Downloader — Standalone

Tempel link media, ambil file-nya. Versi mandiri yang bisa di-deploy ke hosting sendiri, supaya bisa dibuka siapa saja lewat link — tanpa perlu login, tanpa kartu persetujuan.

Dibangun di atas library [scrapr](https://github.com/coflyn/scrapr) (`@coflyn/scrapr`).

## Platform yang didukung

Apa pun yang didukung scrapr, antara lain: TikTok, Instagram, YouTube, Spotify, X/Twitter, Facebook, SoundCloud, Pinterest, Apple Music, Bilibili, Douyin, Threads, Reddit, Pixiv, RedNote, Bandcamp, TeraBox, plus resolver file host & shortlink (MediaFire, Sfile, Pixeldrain, Catbox, Google Drive, Krakenfiles, Doodstream, Safelinku, Sub2Unlock, Rekonise, dan unshorten umum).

Per platform dicoba beberapa scraper berurutan (fallback chain) sampai ada yang berhasil. Scraper yang butuh headless browser (savetik, fdown, snapinsta) sengaja tidak dipakai.

## Jalankan di laptop sendiri

Butuh Node.js 18+.

```bash
npm install
npm start
```

Lalu buka http://localhost:3000 di browser.

## Cara pakai

1. Tempel satu atau banyak link (satu link per baris) di tab **Unduh**.
2. Klik **Ambil Link Download**. Setiap link diproses paralel; status per link tampil jujur (memproses → selesai / gagal + alasan).
3. Klik link download yang muncul (tombol pertama biru, sisanya outline).
4. Hasil yang berhasil otomatis tersimpan di tab **Riwayat** — bisa di-download ulang, di-resolve ulang (Coba Lagi), atau dihapus.

## Riwayat per-perangkat

Riwayat **tidak disimpan di server**. Setiap hasil resolve yang berhasil disimpan di browser pengunjung itu sendiri (localStorage, kunci `md-history-v1`, maks 200 item, terbaru dulu). Artinya:

- Riwayat hanya terlihat di perangkat/browser yang memakainya — pengunjung lain tidak bisa melihat riwayatmu, dan kamu tidak bisa melihat riwayat mereka.
- Riwayat hilang kalau pengunjung menghapus data situs / membersihkan localStorage di browsernya.
- Server tidak menyimpan, tidak membaca, dan tidak bisa menghapus riwayat siapa pun.

## API

| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/api/resolve` | Body `{ urls: ["...", ...] }` (maks 20). Resolve paralel, batas 60 detik per link. |
| GET | `/api/health` | Cek server hidup. |

## Deploy ke Render (gratis)

1. Buat akun di https://render.com (bisa daftar pakai GitHub/Google).
2. Upload folder proyek ini ke repo GitHub (repo bisa privat).
3. Di dashboard Render: **New → Web Service → pilih repo tadi**.
4. Isi:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** Free
   - File `render.yaml` di repo ini sudah berisi pengaturan yang sama, jadi Render bisa langsung memakainya (Blueprint).
5. Klik **Create Web Service**, tunggu deploy selesai (±2–5 menit).
6. Buka URL yang diberikan Render (mis. `https://media-downloader-xxxx.onrender.com`). Link itu bisa dibuka siapa saja.

Tidak perlu domain sendiri. Tidak ada secret/API key yang perlu diisi.

### Catatan jujur soal free tier Render

- **Service tidur setelah ~15 menit tidak ada yang buka.** Request pertama setelah tidur butuh sekitar 30–60 detik untuk bangun (halaman akan loading lebih lama sekali, lalu normal).
- **Riwayat tersimpan di browser masing-masing, bukan di server.** Jadi tidak ada riwayat bersama yang perlu dikhawatirkan soal disk ephemeral — tiap pengunjung menyimpan riwayatnya sendiri di perangkatnya (localStorage), dan riwayat itu hilang kalau dia menghapus data situs di browsernya.
- Kalau banyak orang memakai bersamaan dan scraper sumber membatasi (rate limit), beberapa resolve bisa gagal — coba lagi beberapa saat kemudian.

## Deploy pakai Docker (alternatif)

```bash
docker build -t media-downloader .
docker run -p 3000:3000 media-downloader
```

Lalu buka http://localhost:3000. Tidak ada lagi data riwayat di server, jadi tidak perlu volume.

## Troubleshooting

- **Link gagal di-resolve:** situs sumber sering berubah atau membatasi akses. Coba lagi, atau coba link lain dari platform yang sama. Pesan error tampil di kartu hasil.
- **Server tidak bisa diakses setelah deploy:** pastikan Start Command `node server.js` dan port mengikuti variabel `PORT` dari hosting (sudah ditangani di `server.js`).
- **Di VM/lingkungan ber-proxy:** server membaca `HTTPS_PROXY`/`HTTP_PROXY` dari environment dan meneruskannya ke scrapr (sesuai pola konfigurasi di README scrapr).

## Lisensi

MIT. Library scrapr oleh coflyn (MIT).
