# Boslay Order Bot — Manual QRIS

Bot Telegram untuk menjual produk digital melalui chat, dengan panel admin React,
database SQLite, stok terbatas/unlimited, wallet, tiket dukungan, broadcast, review,
audit log, dan backup.

Pembayaran produk dan top-up wallet menggunakan QRIS merchant statis. Tidak ada
payment gateway, webhook pembayaran, pembuatan QR dinamis, atau polling provider.

## Alur pembayaran

1. Pembeli memilih produk dan jumlah.
2. Server membuat order unik berstatus `pending_payment`.
3. Bot mengirim detail order, total, instruksi, dan gambar QRIS merchant.
4. Pembeli menekan **Saya Sudah Bayar**.
5. Bot meminta foto bukti pembayaran (JPG, PNG, atau WebP; maksimum 2 MB).
6. Bukti disimpan secara privat dan order menjadi `waiting_confirmation`.
7. Admin membuka menu **Payments** di panel admin.
8. Admin menyetujui, menolak, atau meminta bukti ulang.
9. Persetujuan mengubah status menjadi `delivery_pending`, lalu server mengklaim
   delivery secara kondisional menjadi `delivering`.
10. Produk dialokasikan sekali dan dikirim melalui Telegram.
11. Order baru menjadi `delivered` setelah Telegram menerima pengiriman produk.
12. Jika Telegram gagal, order kembali ke `delivery_pending`, alokasi dipertahankan,
    error disimpan, dan admin dapat mencoba pengiriman kembali.

Status order manual:

- `pending_payment`
- `waiting_confirmation`
- `payment_rejected`
- `delivery_pending`
- `delivering`
- `delivered`
- `cancelled`
- `expired`

Status lama pada riwayat (`pending`, `paid`, dan `failed`) tetap dapat dibaca dan
tidak dimigrasikan secara destruktif.

## Struktur proyek

```text
.
├── apps/
│   ├── admin/                 # Panel admin React + Vite
│   │   └── src/
│   │       ├── App.jsx
│   │       ├── lib/api.js
│   │       └── styles.css
│   └── server/                # Hono + Telegram Bot API + SQLite
│       ├── schema.sql
│       ├── src/
│       │   ├── index.js
│       │   ├── db.js
│       │   ├── services/payment.js
│       │   ├── services/telegram.js
│       │   └── utils/security.js
│       └── test/manual-payment.test.js
├── packages/shared/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Persyaratan

- Node.js 20 LTS (runtime yang sama dengan Dockerfile)
- npm dengan workspace support
- Token bot Telegram
- ID Telegram admin
- Gambar QRIS merchant JPG/PNG/WebP maksimum 2 MB

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu isi:

```env
PORT=3000
DATA_DIR=./data

API_BASE_URL=https://api.domainmu.com
ADMIN_APP_ORIGIN=https://admin.domainmu.com

BOT_TOKEN=your-telegram-bot-token
TELEGRAM_WEBHOOK_SECRET=random-secret-string

ADMIN_PANEL_PASSWORD=strong-password
ADMIN_SESSION_SECRET=random-64-char-secret
ADMIN_ID=123456789

MANUAL_PAYMENT_ENABLED=true
MANUAL_PAYMENT_METHOD_NAME=QRIS
MANUAL_PAYMENT_ACCOUNT_NAME=Boslay Store
MANUAL_PAYMENT_QRIS_IMAGE=/uploads/payment/qris.png
MANUAL_PAYMENT_INSTRUCTIONS=Bayar sesuai nominal lalu kirim bukti pembayaran.
ORDER_EXPIRY_MINUTES=60
```

`MANUAL_PAYMENT_QRIS_IMAGE` menunjuk ke file di bawah
`DATA_DIR/uploads`. Contoh di atas berarti:

```text
DATA_DIR/uploads/payment/qris.png
```

Cara yang direkomendasikan adalah login ke panel admin, buka **Settings → Manual
QRIS Configuration**, lalu gunakan **Upload / Ganti QRIS**. Upload dari panel:

- memvalidasi magic bytes, bukan hanya ekstensi;
- hanya menerima JPG, PNG, atau WebP;
- membatasi ukuran 2 MB;
- memakai nama file UUID acak;
- mencegah path traversal;
- menyimpan file di direktori privat;
- hanya menyediakan preview melalui endpoint admin terautentikasi.

Nilai yang disimpan dari panel admin mengambil prioritas atas `.env`. Kosongkan
nilai setting database jika ingin kembali memakai `.env`.

## Menjalankan secara lokal

```bash
npm install
npm run check
npm test
npm run build
npm start --workspace @belugaw/server
```

Panel admin hasil build dilayani oleh server dari `/admin` ketika direktori
`apps/server/public/admin` tersedia. Untuk development terpisah:

```bash
npm run dev --workspace @belugaw/server
npm run dev --workspace @belugaw/admin
```

Set `VITE_API_BASE_URL` ke URL server saat panel dijalankan dari origin berbeda.

## Docker

```bash
docker compose build
docker compose up -d
docker compose logs -f
```

Dockerfile hanya membangun `apps/admin`; proyek ini tidak mempunyai
`apps/miniapp`. Hasil build disalin ke `/app/apps/server/public/admin`, yaitu
lokasi yang benar-benar dilayani oleh backend.

Volume `./data:/app/data` menyimpan:

```text
data/
├── belugawbot.db
├── backups/
└── uploads/
    ├── downloads/
    └── payment/
        ├── <qris-uuid>.<ext>
        └── proofs/
            └── <proof-uuid>.<ext>
```

Jangan expose direktori `data/uploads/payment` sebagai static directory di
reverse proxy.

## Telegram webhook

Webhook dapat dipasang dari menu **Settings → Telegram Webhook**, atau manual:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.domainmu.com/telegram/webhook",
    "secret_token": "<TELEGRAM_WEBHOOK_SECRET>",
    "allowed_updates": ["message", "callback_query"]
  }'
```

Tidak ada webhook pembayaran yang perlu didaftarkan.

## Panel admin: review pembayaran

Menu **Payments** menampilkan:

- ID order;
- pembeli dan Telegram user ID;
- produk dan jumlah;
- total;
- waktu order dan waktu bukti dikirim;
- bukti pembayaran;
- status;
- admin reviewer;
- catatan admin;
- alasan penolakan;
- error delivery.

Aksi:

- **Setujui Pembayaran** — konfirmasi pembayaran dan mulai delivery;
- **Tolak Pembayaran** — simpan alasan dan izinkan bukti baru;
- **Minta Bukti Ulang** — simpan catatan khusus dan minta foto baru;
- **Coba Kirim Produk Kembali** — hanya muncul setelah delivery gagal.

Klik persetujuan dua kali atau dua request bersamaan tidak mengalokasikan stok
atau mengirim delivery dua kali. Hanya transisi kondisional
`delivery_pending → delivering` yang memperoleh hak mengirim.

## Penyimpanan bukti

Bukti tidak memiliki route publik. Endpoint berikut membutuhkan cookie sesi
admin yang valid:

```text
GET /api/admin/orders/:id/payment-proof
GET /api/admin/payment/qris-image
```

Respons menggunakan `Cache-Control: private, no-store` dan
`X-Content-Type-Options: nosniff`.

## Migrasi SQLite

Saat server mulai, `schema.sql` dijalankan dengan `CREATE TABLE/INDEX IF NOT
EXISTS`, lalu `db.js` menjalankan `ALTER TABLE ... ADD COLUMN` satu per satu.
Error "column already exists" diabaikan. Tidak ada tabel order lama yang dihapus
dan foreign key tetap aktif.

Migrasi juga mengubah setting gateway aktif menjadi `manual` dan mengosongkan
nilai `sakurupiah_api_id`/`sakurupiah_api_key` lama. Kolom transaksi lama tetap
ada agar riwayat order tidak rusak, tetapi tidak lagi dipakai runtime.

Kolom tambahan pada `orders` mencakup:

- lokasi dan MIME bukti;
- waktu bukti dikirim;
- admin reviewer dan aksi review;
- alasan penolakan dan catatan admin;
- waktu pembayaran dikonfirmasi;
- ID stok yang dialokasikan dan waktunya;
- error, waktu, dan jumlah percobaan delivery;
- penanda top-up wallet sudah dikreditkan.

Tabel `payment_proof_sessions` menghubungkan user Telegram dengan order yang
sedang menunggu foto, sehingga bukti tidak salah masuk ke order lain.

Produk sistem ID `0` dibuat untuk top-up wallet. Ini menggantikan pola lama yang
mematikan foreign key secara global.

Sebelum upgrade production, tetap buat backup:

```bash
cp data/belugawbot.db data/belugawbot-before-manual-payment.db
```

## Keamanan dan idempotensi

- User terblokir tetap terblokir ketika mengirim update Telegram.
- Checkout dan top-up menolak user terblokir.
- Bukti ditolak untuk order `delivered`, `cancelled`, atau `expired`.
- Persetujuan memakai update status kondisional.
- Klaim delivery dan alokasi stok berada dalam transaksi SQLite.
- Retry memakai `allocated_stock_ids` yang sama.
- Order tidak ditandai `delivered` sebelum pesan produk berhasil dikirim.
- Secret provider lama tidak ditampilkan atau dapat disimpan dari panel.
- API publik tidak mengembalikan bukti, credential stok, atau file QRIS.

Catatan batas eksternal: Telegram Bot API tidak menyediakan idempotency key
untuk `sendMessage`. Sistem mencegah dua proses delivery bersamaan; pada kegagalan
jaringan ambigu (Telegram mungkin menerima pesan tetapi respons hilang), admin
tetap perlu memeriksa chat pembeli sebelum retry.

## Pengujian

```bash
npm run check
npm test
npm run build
```

Test mencakup:

- pembuatan order;
- pengiriman dan penggantian bukti;
- persetujuan/penolakan;
- persetujuan ganda dan bersamaan;
- delivery bersamaan;
- kegagalan Telegram;
- retry tanpa alokasi stok baru;
- format/ukuran/path upload tidak valid;
- blokir user tidak otomatis hilang.

## Backup

Panel admin dapat membuat backup manual. Server juga menjadwalkan backup SQLite
harian dan mempertahankan tujuh file terbaru di `DATA_DIR/backups`.
