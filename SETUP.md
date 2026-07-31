# Ciganstore Order Bot — Wallet + Manual GoPay Top Up

Bot Telegram untuk menjual produk digital menggunakan saldo wallet, dengan panel
admin React, database SQLite, stok terbatas/unlimited, tiket dukungan, broadcast,
review, audit log, dan backup.

QR GoPay merchant statis **hanya digunakan untuk mengisi saldo**. Pembelian produk
tidak menggunakan QR dan selalu dipotong dari wallet. Karena tidak ada payment
gateway atau webhook pembayaran, setiap bukti top up diverifikasi admin secara
manual.

## Alur penggunaan

### Top up wallet

1. Pengguna menjalankan `/topup 5000` atau memasukkan nominal Rupiah bulat positif
   lain sesuai kebutuhan. Nominal minimum saat ini Rp1.
2. Server membuat order sistem `Wallet Top Up` berstatus `pending_payment`.
3. Bot mengirim nominal, instruksi, dan QR GoPay merchant statis.
4. Pengguna menekan **Saya Sudah Bayar**, lalu mengirim foto bukti pembayaran.
5. File JPG, PNG, atau WebP maksimum 2 MB disimpan secara privat dan top up menjadi
   `waiting_confirmation`.
6. Admin membuka **Top Up Reviews**, mencocokkan nominal dengan bukti, kemudian
   menyetujui, menolak, atau meminta bukti ulang.
7. Persetujuan menambahkan saldo 1:1 tepat satu kali dan menyelesaikan top up.

Satu pengguna hanya dapat memiliki satu top up aktif. Pengguna harus menyelesaikan,
membatalkan, atau menunggu permintaan sebelumnya kedaluwarsa sebelum membuat yang
baru.

### Membeli produk

1. Pengguna memilih produk dan jumlah di bot.
2. Server memeriksa status akun, ketersediaan stok, dan saldo wallet.
3. Saldo dipotong dan stok dialokasikan dalam transaksi SQLite yang sama.
4. Produk dikirim melalui Telegram.
5. Klik atau callback yang sama tidak memotong saldo dua kali karena setiap checkout
   memiliki transaction ID unik.
6. Jika pengiriman Telegram gagal, order masuk `delivery_pending`; admin dapat retry
   tanpa memotong saldo atau mengalokasikan stok baru.

Top up adalah arus kas masuk ke wallet, bukan penjualan produk. Produk sistem ID `0`
(`Wallet Top Up`) tidak dihitung sebagai omzet, produk terlaris, atau belanja produk
pengguna.

## Status order

Status yang digunakan alur top up dan delivery:

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
│       └── test/
│           ├── manual-payment.test.js
│           ├── migration.test.js
│           └── wallet.test.js
├── packages/shared/
├── Dockerfile
├── docker-compose.yml
└── .env.example
```

## Persyaratan

- Node.js 20 LTS, sama dengan runtime pada `Dockerfile`;
- npm dengan workspace support;
- token bot Telegram;
- Telegram user ID admin;
- gambar QR GoPay merchant JPG/PNG/WebP maksimum 2 MB.

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu isi nilainya:

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
MANUAL_PAYMENT_METHOD_NAME=GoPay Merchant QR
MANUAL_PAYMENT_ACCOUNT_NAME=Ciganstore
MANUAL_PAYMENT_QRIS_IMAGE=/uploads/payment/qris.png
MANUAL_PAYMENT_INSTRUCTIONS=Bayar sesuai nominal top up lalu kirim bukti pembayaran.
ORDER_EXPIRY_MINUTES=60
```

Nama environment `MANUAL_PAYMENT_*` dipertahankan untuk kompatibilitas, tetapi hanya
mengonfigurasi top up wallet. Tidak ada pembayaran produk langsung melalui QR.

`MANUAL_PAYMENT_QRIS_IMAGE` menunjuk ke file privat di bawah `DATA_DIR/uploads`.
Contoh di atas berarti:

```text
DATA_DIR/uploads/payment/qris.png
```

Cara yang direkomendasikan adalah login ke panel admin, buka **Settings → GoPay
Wallet Top Up**, lalu pilih **Unggah / Ganti QR GoPay**. Upload dari panel:

- memvalidasi magic bytes, bukan hanya ekstensi;
- hanya menerima JPG, PNG, atau WebP;
- membatasi ukuran 2 MB;
- memakai nama file UUID acak;
- mencegah path traversal;
- menyimpan file di direktori privat;
- hanya menyediakan preview melalui endpoint admin terautentikasi.

Nilai yang disimpan melalui panel admin mengambil prioritas atas `.env`. Kosongkan
setting terkait di database jika ingin kembali menggunakan `.env`.

## Menjalankan secara lokal

Instal dan validasi proyek:

```bash
npm install
npm run check
npm test
npm run build
```

Mulai server:

```bash
npm start --workspace @belugaw/server
```

Untuk development server dan admin secara terpisah:

```bash
npm run dev --workspace @belugaw/server
npm run dev --workspace @belugaw/admin
```

Atur `VITE_API_BASE_URL` ke URL server jika panel admin dijalankan dari origin lain.
Build produksi memakai base path `/admin/`. Server melayani hasil build dari
`apps/server/public/admin` pada URL `/admin`.

> Jika mesin lokal menggunakan Node selain versi 20 dan native module
> `better-sqlite3` tidak kompatibel, jalankan instalasi dan test dengan Node.js 20.

## Docker

```bash
docker compose build
docker compose up -d
docker compose logs -f
```

`Dockerfile` membangun panel admin, menyalinnya ke
`/app/apps/server/public/admin`, lalu menjalankan server dengan Node.js 20.

Volume `./data:/app/data` menyimpan:

```text
data/
├── belugawbot.db
├── backups/
└── uploads/
    ├── downloads/
    └── payment/
        ├── <gopay-qr-uuid>.<ext>
        └── proofs/
            └── <proof-uuid>.<ext>
```

Jangan mengekspos `data/uploads/payment` sebagai static directory di reverse proxy.

## Telegram webhook

Webhook dapat dipasang dari **Settings → Telegram Webhook**, atau melalui Telegram
Bot API dengan URL:

```text
https://api.domainmu.com/telegram/webhook
```

Gunakan `TELEGRAM_WEBHOOK_SECRET` sebagai `secret_token` dan aktifkan update
`message` serta `callback_query`. Tidak ada webhook pembayaran yang perlu
didaftarkan karena verifikasi GoPay dilakukan manual.

## Panel admin: review top up

Menu **Top Up Reviews** menampilkan:

- ID permintaan dan Telegram user ID;
- nominal saldo yang akan ditambahkan;
- waktu permintaan dan waktu bukti dikirim;
- bukti pembayaran;
- status, reviewer, catatan, dan alasan penolakan;
- error pemrosesan saldo jika ada.

Aksi utama:

- **Setujui & Tambah Saldo** — konfirmasi pembayaran dan kreditkan saldo tepat satu
  kali;
- **Tolak Top Up** — simpan alasan dan izinkan pengguna mengirim bukti baru;
- **Minta Bukti Ulang** — meminta foto baru tanpa membuat top up lain;
- **Coba Proses Saldo Kembali** — muncul jika proses setelah persetujuan mengalami
  kendala.

Riwayat pembayaran produk manual dari versi lama tetap diberi label berbeda agar
admin dapat mengenalinya.

## Penyimpanan bukti

Bukti dan QR merchant tidak mempunyai route publik. Endpoint berikut membutuhkan
cookie sesi admin yang valid:

```text
GET /api/admin/orders/:id/payment-proof
GET /api/admin/payment/qris-image
```

Respons memakai `Cache-Control: private, no-store` dan
`X-Content-Type-Options: nosniff`.

## Migrasi SQLite

Saat server mulai, `schema.sql` dijalankan dengan `CREATE TABLE/INDEX IF NOT
EXISTS`, lalu `db.js` menambah kolom yang belum tersedia. Error kolom yang sudah ada
diabaikan. Tabel order lama tidak dihapus dan foreign key tetap aktif.

Migrasi mengosongkan credential provider lama, menetapkan gateway internal ke
`wallet`, dan mempertahankan kolom transaksi lama agar riwayat tidak rusak. Produk
sistem ID `0` dibuat untuk top up tanpa mematikan foreign key secara global.

Kolom tambahan pada `orders` mencakup:

- lokasi, MIME, dan waktu bukti dikirim;
- reviewer, aksi review, alasan penolakan, dan catatan admin;
- waktu pembayaran dikonfirmasi;
- ID stok yang dialokasikan dan waktu alokasi;
- error, waktu, dan jumlah percobaan delivery;
- `wallet_credited_at` sebagai penanda kredit top up exact-once.

Tabel `payment_proof_sessions` menghubungkan pengguna Telegram dengan top up yang
sedang menunggu foto sehingga bukti tidak salah masuk ke order lain.

Sebelum upgrade production, buat backup:

```bash
cp data/belugawbot.db data/belugawbot-before-wallet-upgrade.db
```

## Keamanan dan idempotensi

- User terblokir tidak dapat checkout atau top up.
- Nominal top up harus bilangan Rupiah bulat positif.
- Bukti ditolak untuk order `delivered`, `cancelled`, atau `expired`.
- Persetujuan dan klaim delivery memakai transisi status kondisional.
- Kredit top up dilindungi `wallet_credited_at` dan transaksi SQLite.
- Checkout wallet, pengurangan stok, dan pengurangan saldo bersifat atomik.
- Transaction ID unik mencegah pemotongan saldo karena klik ganda.
- Retry delivery memakai alokasi stok yang sama.
- Order tidak ditandai `delivered` sebelum pesan produk berhasil dikirim.
- API publik tidak mengembalikan bukti, credential stok, atau file QR GoPay.

Telegram Bot API tidak menyediakan idempotency key untuk `sendMessage`. Sistem
mencegah dua proses delivery bersamaan, tetapi pada kegagalan jaringan ambigu admin
sebaiknya memeriksa chat pembeli sebelum melakukan retry.

## Pengujian

```bash
npm run check
npm test
npm run build
```

Test meliputi:

- pembuatan top up nominal fleksibel;
- upload, penggantian, persetujuan, dan penolakan bukti;
- kredit saldo exact-once untuk persetujuan ganda atau bersamaan;
- checkout wallet atomik dan perlindungan klik ganda;
- saldo tidak cukup dan stok tidak cukup;
- delivery bersamaan, kegagalan Telegram, dan retry tanpa potongan baru;
- migrasi database lama;
- validasi format, ukuran, dan path upload;
- blokir user tidak otomatis hilang.

## Backup

Panel admin dapat membuat backup manual. Server juga menjadwalkan backup SQLite
harian dan mempertahankan tujuh file terbaru di `DATA_DIR/backups`.
