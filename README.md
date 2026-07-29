# Chat E2EE (MVP) — Panduan Deploy dari Nol

## Apa ini
Chat 1-on-1 real-time dengan enkripsi end-to-end asli (ECDH P-256 + AES-GCM).
Server hanya menyimpan/meneruskan teks terenkripsi — tidak bisa membaca isi pesan.

**Batasan MVP ini (jujur biar tidak salah ekspektasi):**
- Baru chat 1-on-1, belum ada grup
- Belum ada kirim gambar/voice note/video call
- Kunci privat tersimpan di browser (IndexedDB) satu device — kalau ganti device/browser, akun lama tidak bisa dipakai (perlu daftar ulang di device itu). Sinkronisasi multi-device adalah pengembangan lanjutan.
- Belum ada notifikasi push saat app ditutup

Ini fondasi yang solid untuk dikembangkan bertahap, bukan pengganti WhatsApp yang lengkap.

---

## Langkah 1 — Siapkan akun
1. Buat akun di **railway.app** (bisa login pakai GitHub)
2. Buat akun **github.com** kalau belum punya

## Langkah 2 — Upload kode ke GitHub
1. Buat repo baru di GitHub, misal `chat-e2ee`
2. Upload seluruh folder `server/` (isinya: `index.js`, `db.js`, `package.json`, folder `public/`) ke repo itu lewat **Add file → Upload files** (drag semua file & foldernya)

## Langkah 3 — Buat project di Railway
1. Di dashboard Railway → **New Project** → **Deploy from GitHub repo** → pilih repo `chat-e2ee`
2. Railway otomatis mendeteksi Node.js dan mulai build

## Langkah 4 — Tambah database PostgreSQL
1. Di project yang sama, klik **New** → **Database** → **Add PostgreSQL**
2. Railway otomatis membuat variabel `DATABASE_URL` dan menyambungkannya ke service kamu

## Langkah 5 — Set variabel environment
Di service Node.js kamu (bukan di database) → tab **Variables** → tambahkan:

| Key | Value |
|---|---|
| `JWT_SECRET` | teks acak panjang, contoh: `ubah-ini-jadi-string-rahasia-panjang-123!@#` |

(`DATABASE_URL` dan `PORT` sudah otomatis dari Railway, tidak perlu ditambah manual)

## Langkah 6 — Deploy
1. Railway otomatis build & jalankan `npm start`
2. Setelah selesai, klik **Settings** → **Networking** → **Generate Domain**
3. Kamu akan dapat URL seperti `https://chat-e2ee-production.up.railway.app`

## Langkah 7 — Coba
1. Buka URL itu di browser → akan muncul halaman login
2. Klik "Belum punya akun? Daftar" → buat 2 akun berbeda (bisa pakai 2 tab/browser berbeda, misal Chrome & Firefox, supaya IndexedDB-nya terpisah)
3. Di akun A, cari username akun B di kolom pencarian kontak → klik "+"
4. Kirim pesan — coba buka Network tab di DevTools, isi pesan yang lewat ke server terlihat sebagai teks acak (terenkripsi), bukan teks asli

---

## Kalau mau lanjut kembangkan
Beberapa arah pengembangan berikutnya yang bisa saya bantu kalau MVP ini sudah jalan lancar:
- Kirim gambar/file (upload ke storage seperti S3/Cloudflare R2, dikirim juga dalam bentuk terenkripsi)
- Notifikasi push (lewat service worker + Web Push API)
- Grup chat
- Multi-device (butuh desain ulang skema kunci — biasanya per-device key + key sync terenkripsi)
- Upgrade ke Double Ratchet penuh (forward secrecy per pesan, seperti Signal Protocol asli) — bisa pakai library `libsignal` client-side

## Menjalankan di komputer sendiri dulu (opsional, sebelum deploy)
```bash
cd server
npm install
# Butuh Postgres lokal atau pakai DATABASE_URL dari Railway langsung
DATABASE_URL="postgres://..." JWT_SECRET="rahasia" npm start
```
Lalu buka `http://localhost:3000`
