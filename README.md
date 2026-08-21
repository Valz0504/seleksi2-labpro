# Identity & Authorization Provider

- **Nama:** Emilio Justin
- **NIM:** 13524043

-----

## Cara menjalankan sistem

Seluruh sistem dijalankan menggunakan Docker Compose. Node.js dan pnpm tidak perlu dipasang pada host.

### Prasyarat

- Docker Desktop atau Docker Engine dengan Docker Compose v2;
- port 3000–3004, 5432, 5433, 5672, dan 15672 tersedia.

Semua command dijalankan dari root repository.

### 1. Siapkan environment

Salin template environment:

```bash
cp .env.example .env
```

Ganti seluruh nilai `replace-with-*` di dalam `.env`, terutama:

- `RABBITMQ_PASSWORD`;
- `SSO_COOKIE_SECRET`, minimal 32 karakter;
- `INTERNAL_SERVICE_SECRET`, minimal 16 karakter;
- `MFA_ENCRYPTION_KEY`, tepat 64 karakter hexadecimal (32 byte);
- `SEED_ADMIN_PASSWORD`;
- `APP_A_CLIENT_SECRET`, minimal 16 karakter;
- `APP_B_CLIENT_SECRET`, minimal 16 karakter.

Secret lokal dapat dibuat dengan:

```bash
openssl rand -hex 32
```

Gunakan hasil berbeda untuk setiap secret.

### 2. Jalankan seluruh sistem

```bash
docker compose up --build -d
```

Compose akan menjalankan proses berikut secara otomatis:

1. Primary PostgreSQL, Local PostgreSQL, dan RabbitMQ dimulai;
2. migration Primary Database dijalankan;
3. seed user administrator, group `control-panel-admins`, OAuth client, redirect URI, membership, dan policy dijalankan;
4. migration database App A dan App B dijalankan;
5. Auth Provider, Sync Worker, Control Panel, App A, dan App B dimulai setelah dependency siap.

Periksa status seluruh service:

```bash
docker compose ps -a
```

Service aplikasi seharusnya berstatus `healthy`. Service migration dan seed berstatus `Exited (0)` karena hanya dijalankan satu kali.

### 3. Login

- buka Control Panel pada <http://localhost:3000>;
- email administrator: `admin@example.com`;
- password administrator: nilai `SEED_ADMIN_PASSWORD` pada `.env`.

User hasil seed menjadi anggota `control-panel-admins`, App A, dan App B sehingga dapat mengakses Control Panel sekaligus langsung mencoba SSO pada kedua aplikasi.

### 4. Hentikan sistem

```bash
docker compose down
```

Command tersebut mempertahankan data pada Docker volume.

### URL komponen

- Control Panel: <http://localhost:3000>
- Auth Provider: <http://localhost:3001>
- Auth Provider liveness: <http://localhost:3001/health/live>
- Auth Provider readiness: <http://localhost:3001/health/ready>
- Swagger Auth Provider: <http://localhost:3001/docs>
- App A: <http://localhost:3002>
- App B: <http://localhost:3003>
- Sync Worker health: <http://localhost:3004/health>
- RabbitMQ Management: <http://localhost:15672>
- Primary PostgreSQL: `localhost:5432`
- Local PostgreSQL: `localhost:5433`

Port mengikuti konfigurasi root `.env`.

-----

## Arsitektur dan alur

```text
Browser
   |
   +---- Control Panel :3000
   |
   +---- App A :3002 -------- app_a database
   |
   +---- App B :3003 -------- app_b database
              |
              | Authorization Code + PKCE
              v
      Auth Provider :3001 ---- Primary Database
              |
              | Transactional Outbox
              v
          RabbitMQ
              |
              v
      Sync Worker :3004
              |
              +---- POST App A /internal/logout
              +---- POST App B /internal/logout
```

### Login dan SSO

1. App A/B membuat `state` dan PKCE, lalu mengarahkan browser ke Auth Provider.
2. Auth Provider memvalidasi central session, status user/application, exact redirect URI, serta policy group.
3. Auth Provider menerbitkan authorization code berumur pendek dan sekali pakai.
4. Backend aplikasi menukar code menjadi opaque access token melalui back channel.
5. Backend meminta userinfo, membuat local session, lalu membuang access token dari memori.
6. Central session yang sama memungkinkan login ke aplikasi lain tanpa memasukkan password kembali.

### Revocation asynchronous

1. Logout global, perubahan password, deaktivasi user, atau kehilangan policy mencabut akses di Primary Database.
2. Perubahan dan outbox event disimpan dalam transaction yang sama.
3. Publisher mengirim event persistent ke RabbitMQ menggunakan publisher confirm.
4. Sync Worker mengonsumsi event dan membuat satu delivery untuk setiap aplikasi tujuan.
5. Worker memanggil `POST /internal/logout` milik App A/B.
6. Aplikasi mencabut local session secara idempotent menggunakan tabel `processed_events`.
7. Delivery gagal menjalani retry dengan exponential backoff; setelah batas terlampaui delivery masuk Dead-Letter Queue.

-----

## Keputusan teknis

### Opaque token

Central-session token, authorization code, access token, dan local-session token menggunakan nilai opaque acak. Database hanya menyimpan hash token.

Konsekuensinya:

- revocation berlaku segera karena status diperiksa ke database;
- detail user, policy, dan session tidak dibawa di dalam token;
- isi token tidak mengekspos claims;
- validasi membutuhkan database lookup dan tidak dapat dilakukan secara offline seperti JWT.

JWT tidak dipilih karena sistem membutuhkan revocation langsung dan seluruh komponen berada dalam satu ekosistem lokal.

### RabbitMQ

RabbitMQ dipilih karena menyediakan durable queue, acknowledgement, routing, publisher confirm, persistent message, dan Dead-Letter Queue.

Konsekuensinya adalah pola delivery at-least-once. Event dapat diterima ulang sehingga App A/B wajib memproses event secara idempotent.

### Autentikasi service-to-service

Sync Worker memanggil `POST /internal/logout` menggunakan Bearer `INTERNAL_SERVICE_SECRET`.

App A/B:

- memvalidasi credential sebelum memproses payload;
- membandingkan secret secara timing-safe;
- hanya menerima `application/json` dengan ukuran terbatas;
- memvalidasi kontrak event secara ketat;
- tidak mengekspos secret melalui variable `NEXT_PUBLIC_*`.

Mekanisme shared secret dipilih karena sederhana dan cukup untuk lingkungan lokal. Deployment nyata tetap memerlukan HTTPS, secret rotation, dan secret manager.

### Soft-delete dan hard-delete

- User dan application memakai state transition menjadi `INACTIVE` agar referensi serta audit history tetap tersedia.
- Session dan access token memakai status `REVOKED` atau `EXPIRED` agar alasan revocation dapat ditelusuri.
- Group biasa, membership, policy, dan redirect URI dapat dihapus secara transaksional karena merupakan konfigurasi. Group sistem `control-panel-admins` dilindungi dari rename dan delete.
- Audit log dan processed event dipertahankan untuk audit serta idempotency.

Penghapusan relasi akses memicu evaluasi ulang policy. Session hanya dicabut ketika user benar-benar kehilangan jalur `ALLOW` terakhir.

-----

## Technology stack

- Node.js 22, melalui image `node:22-alpine`;
- pnpm 10.15.0;
- TypeScript 5.9.3;
- NestJS 11.1.28;
- Next.js 16.3.0;
- React dan React DOM 19.2.8;
- Prisma ORM dan Prisma Client 7.9.1;
- PostgreSQL, melalui image `postgres:17-alpine`;
- RabbitMQ, melalui image `rabbitmq:4-management-alpine`;
- Tailwind CSS 4.3.3;
- PostgreSQL driver `pg` 8.22.0;
- RabbitMQ client `amqplib` 2.0.1;
- Prometheus client `prom-client` 15.1.3;
- TOTP library `otpauth` 9.5.1;
- QR generator `qrcode` 1.5.4;
- Argon2 0.45.1;
- Jest 30.4.2;
- ESLint 9.39.5;
- Prettier 3.9.6;
- Docker Compose v2.

-----

## Daftar Endpoint dan Route

### Auth Provider — http://localhost:3001

Endpoint dasar:

- `GET /` — informasi service;
- `GET /health` — compatibility health check dengan semantik liveness;
- `GET /health/live` — memastikan proses Auth Provider masih merespons tanpa memeriksa dependency;
- `GET /health/ready` — memeriksa koneksi Primary Database dan RabbitMQ;
- `GET /metrics` — metrics Auth Server dalam format Prometheus;
- `GET /docs` — antarmuka Swagger/OpenAPI;
- `GET /docs-json` — dokumen OpenAPI dalam format JSON;
- `GET /docs-yaml` — dokumen OpenAPI dalam format YAML.

Authentication dan central session:

- `POST /auth/login` — login langsung; membuat central session atau pending MFA challenge;
- `POST /auth/login/continue` — login untuk melanjutkan authorization request, termasuk MFA gate;
- `POST /auth/login/admin` — login anggota `control-panel-admins`, termasuk MFA gate;
- `POST /auth/login/mfa` — memverifikasi TOTP atau recovery code untuk login API yang masih pending;
- `POST /auth/login/mfa/continue` — memverifikasi TOTP/recovery code lalu melanjutkan OAuth atau login admin;
- `GET /auth/mfa/status` — membaca status MFA dan jumlah recovery code tersisa;
- `POST /auth/mfa/enroll/start` — membuat enrollment TOTP dan QR sementara;
- `POST /auth/mfa/enroll/confirm` — mengaktifkan MFA dan mengembalikan recovery code satu kali;
- `POST /auth/mfa/recovery/regenerate` — mengganti seluruh recovery code setelah reauthentication;
- `DELETE /auth/mfa` — menonaktifkan MFA setelah reauthentication;
- `GET /auth/session` — membaca central session aktif;
- `POST /auth/logout` — mencabut central session melalui API;
- `POST /auth/logout/browser` — global logout dari browser;
- `POST /auth/logout/admin` — logout dari Control Panel.

OAuth:

- `GET /authorize` — memulai atau melanjutkan Authorization Code Flow;
- `POST /token` — menukar authorization code dengan opaque access token;
- `GET /userinfo` — membaca identitas berdasarkan access token.

Administrasi user:

- `GET /admin/users` — daftar user;
- `GET /admin/users/:userId` — detail user;
- `POST /admin/users` — membuat user;
- `PATCH /admin/users/:userId` — mengubah profil user;
- `PATCH /admin/users/:userId/status` — mengaktifkan atau menonaktifkan user;
- `PUT /admin/users/:userId/password` — mengganti password user;
- `POST /admin/users/:userId/groups/:groupId` — menambahkan membership;
- `DELETE /admin/users/:userId/groups/:groupId` — menghapus membership.

Administrasi group:

- `GET /admin/groups` — daftar group;
- `GET /admin/groups/:groupId` — detail group;
- `POST /admin/groups` — membuat group;
- `PATCH /admin/groups/:groupId` — mengubah group;
- `DELETE /admin/groups/:groupId` — menghapus group.

Administrasi application:

- `GET /admin/applications` — daftar application;
- `GET /admin/applications/:applicationId` — detail application;
- `POST /admin/applications` — membuat application;
- `PATCH /admin/applications/:applicationId` — mengubah application atau statusnya;
- `POST /admin/applications/:applicationId/rotate-secret` — merotasi client secret;
- `POST /admin/applications/:applicationId/redirect-uris` — menambahkan redirect URI;
- `DELETE /admin/applications/:applicationId/redirect-uris/:redirectUriId` — menghapus redirect URI;
- `POST /admin/applications/:applicationId/policies` — menambahkan group policy;
- `DELETE /admin/applications/:applicationId/policies/:policyId` — menghapus group policy.

Observability administrator:

- `GET /admin/metrics` — snapshot JSON agregat untuk dashboard metrics; membutuhkan central session dan membership `control-panel-admins`.

### Control Panel — http://localhost:3000

- `GET /` — status central session dan global logout;
- `GET /login` — login untuk melanjutkan OAuth;
- `GET /login/mfa` — form TOTP/recovery code untuk menyelesaikan login browser;
- `GET /security/mfa` — enrollment, recovery code, dan pengelolaan MFA pribadi;
- `POST /api/mfa/enrollment` — proxy same-origin untuk enrollment, regenerate, dan disable MFA;
- `GET /admin/login` — login administrator;
- `GET /admin` — dashboard administrator;
- `GET /admin/users` — daftar user;
- `GET /admin/users/new` — form pembuatan user;
- `GET /admin/users/:userId` — pengelolaan profil, password, status, dan membership user;
- `GET /admin/groups` — daftar group;
- `GET /admin/groups/new` — form pembuatan group;
- `GET /admin/groups/:groupId` — pengelolaan group;
- `GET /admin/applications` — daftar application;
- `GET /admin/applications/new` — form pembuatan application;
- `GET /admin/applications/:applicationId` — pengelolaan application, secret, redirect URI, dan policy;
- `GET /admin/metrics` — dashboard observability administrator dengan refresh otomatis;
- `GET /api/admin/metrics` — proxy snapshot metrics untuk dashboard; membutuhkan central session administrator;
- `GET /api/health` — health check proses Control Panel.

Mutasi pada Control Panel dilakukan melalui Next.js Server Actions dari halaman administrator.

### App A — http://localhost:3002

- `GET /` — halaman login atau dashboard local session App A;
- `GET /api/health` — health check database App A;
- `POST /auth/login` — memulai Authorization Code Flow;
- `GET /auth/callback` — memvalidasi callback, menukar code, mengambil userinfo, dan membuat local session;
- `POST /auth/logout` — local logout App A;
- `GET /auth/session/clear` — membersihkan cookie session terminal atau invalid;
- `POST /internal/logout` — menerima back-channel revocation dari Sync Worker.

### App B — http://localhost:3003

- `GET /` — halaman login atau dashboard local session App B;
- `GET /api/health` — health check database App B;
- `POST /auth/login` — memulai Authorization Code Flow;
- `GET /auth/callback` — memvalidasi callback, menukar code, mengambil userinfo, dan membuat local session;
- `POST /auth/logout` — local logout App B;
- `GET /auth/session/clear` — membersihkan cookie session terminal atau invalid;
- `POST /internal/logout` — menerima back-channel revocation dari Sync Worker.

### Sync Worker — http://localhost:3004

- `GET /` — informasi service;
- `GET /health` — health check Sync Worker.
- `GET /metrics` — metrics consumer dan delivery dalam format Prometheus.

-----

## Bonus yang Dikerjakan

### B01 — Multi-Factor Authentication

Auth Provider memakai TOTP enam digit sebagai faktor kedua. Secret disimpan menggunakan AES-256-GCM, sedangkan pending challenge dan recovery code hanya disimpan sebagai hash. User dapat enrollment, menyimpan recovery code sekali, regenerate, atau disable pada `/security/mfa`. Setelah MFA aktif, login API, OAuth, dan admin baru menerbitkan central session setelah TOTP atau recovery code valid; setiap recovery code hanya dapat dipakai sekali.

<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 23 00" src="https://github.com/user-attachments/assets/75946dd1-7401-4aad-9b48-5655f895d176" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 23 17" src="https://github.com/user-attachments/assets/3d61c891-9f10-4ddb-b645-4ed118008264" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 13 13" src="https://github.com/user-attachments/assets/93ec6c4b-1b55-4715-b6a7-d502af9fd390" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 25 58" src="https://github.com/user-attachments/assets/ea4d5085-b94e-464a-bbf0-3a085268b7b9" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 27 39" src="https://github.com/user-attachments/assets/4ffb4c58-d36b-45eb-b317-03c4a2689566" />

### B02 — Observability

Auth Server dan Sync Worker menyediakan metrics Prometheus untuk HTTP rate/error/duration, auth, outbox, delivery, dependency, serta kondisi RabbitMQ sebenarnya. Control Panel menyediakan dashboard administrator pada `GET /admin/metrics` yang menampilkan latency, request/error rate, queue depth, DLQ, status dependency, dan event processing dengan refresh otomatis setiap lima detik.

<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 18 14" src="https://github.com/user-attachments/assets/7c391c56-5bdb-4cdd-bdba-305328b3f50c" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 18 31" src="https://github.com/user-attachments/assets/dc98d93f-30ee-4a31-a75f-3360322f38bf" />

### B03 — Liveness dan Readiness Probe

Auth Provider menyediakan dua probe dengan semantik berbeda:

- `GET /health/live` selalu mengembalikan `200` selama proses dan HTTP event loop masih merespons. Endpoint ini tidak mengakses database atau RabbitMQ.
- `GET /health/ready` menjalankan query ringan `SELECT 1` ke Primary Database dan memeriksa queue melalui channel RabbitMQ. Response `200` diberikan jika keduanya tersedia; jika salah satu gagal, response menjadi `503` dengan status komponen yang aman.

### B04 — Graceful Shutdown

Auth Server dan Sync Worker menangani `SIGTERM`/`SIGINT` sebelum proses berhenti:

- listener HTTP ditutup agar tidak menerima koneksi baru;
- Auth Server menghentikan polling outbox dan menunggu request/publish aktif;
- Sync Worker membatalkan consumer, menunggu message aktif, lalu mengembalikan message yang melewati timeout ke queue;
- koneksi RabbitMQ dan database ditutup setelah drain;
- timeout aplikasi default 10 detik, sedangkan Docker memberi grace period 15 detik.

-----

## Screenshot 

*Halaman Awal App A dan B*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 11 38" src="https://github.com/user-attachments/assets/30c9b84e-f3e6-499e-9431-f74297c9ac12" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 11 42" src="https://github.com/user-attachments/assets/ef8c0918-0ba1-4d09-b13d-2c0d4d99e3b0" />

*Halaman Form Login*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 12 12" src="https://github.com/user-attachments/assets/466ee07e-6928-4206-830c-bfc1e290f6ea" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 12 20" src="https://github.com/user-attachments/assets/36ec5a37-8715-4c62-b1df-996bb8e550b6" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 12 52" src="https://github.com/user-attachments/assets/17e488ee-2060-471a-a5fe-dffe2b30f292" />

*Homepage Auth Provider (setelah login)*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 29 29" src="https://github.com/user-attachments/assets/4fd4cbd6-1d50-41df-aa40-ee0b5129fac1" />

*Halaman Control Panel Dashboard*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 13 38" src="https://github.com/user-attachments/assets/06ad44b4-192c-4ba0-a78b-092856d63199" />

*Halaman Control Panel User, Tambah User, dan Detail User*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 14 09" src="https://github.com/user-attachments/assets/3ad4f740-4819-41a6-9819-f9c7f68ca242" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 14 36" src="https://github.com/user-attachments/assets/b7001bc0-e9ed-438d-9b94-86df3436db28" />
<img width="1710" height="1072" alt="image" src="https://github.com/user-attachments/assets/7e751d18-169e-48be-9a70-e570127b4ca2" />
<img width="1710" height="1072" alt="image" src="https://github.com/user-attachments/assets/35144b71-087b-4a31-a8b8-29500574212c" />
<img width="1710" height="1072" alt="image" src="https://github.com/user-attachments/assets/246ba553-f7d1-4913-9fcc-0da1f82ba72e" />

*Halaman Control Panel Group, Tambah Group, dan Detail Group*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 15 32" src="https://github.com/user-attachments/assets/ddd92764-5a1a-4c0e-bd8a-0784a44c9cf7" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 15 43" src="https://github.com/user-attachments/assets/ee4faeac-34e0-4b3e-b3a5-b030c3dfe977" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 16 07" src="https://github.com/user-attachments/assets/9cc3a8f4-656b-43c3-9898-ad399612d063" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 16 21" src="https://github.com/user-attachments/assets/e4bf339a-1da4-4e8f-8c74-f56df8cbab2d" />

*Halaman Control Panel Application, Daftar Application, dan Detail Application*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 16 48" src="https://github.com/user-attachments/assets/be2bddd3-6908-42ff-9950-008f1776b100" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 17 04" src="https://github.com/user-attachments/assets/032636cc-17ea-4867-979a-3f8f1353352e" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 17 21" src="https://github.com/user-attachments/assets/5900d6a4-a47f-4a5d-93ce-c0031b4b96c8" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 17 35" src="https://github.com/user-attachments/assets/128d6cf7-cc3a-4cbe-b9f6-2e8a7592b7fd" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 17 43" src="https://github.com/user-attachments/assets/e06810e4-0619-41a9-8b9a-a52b7a955b22" />

*Halaman App A dan B*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 21 30" src="https://github.com/user-attachments/assets/98750ce7-2a70-4437-b5fa-efdef3249c4a" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 21 45" src="https://github.com/user-attachments/assets/8a934304-68d9-427a-b7ee-f63126f2d5f0" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 21 57" src="https://github.com/user-attachments/assets/a643cd51-d5f6-46a9-a691-88fe56340792" />
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 22 05" src="https://github.com/user-attachments/assets/ead7efb9-0cdf-4e6f-abcb-d86ce38beaf0" />

*Tampilan Logout Local Session*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 24 00" src="https://github.com/user-attachments/assets/ccceadff-f35b-4d58-98e2-58a7fc8bb229" />

*Tampilan Central Session dicabut menyebabkan local session dicabut*
<img width="1710" height="1072" alt="Screenshot 2026-08-21 at 11 24 38" src="https://github.com/user-attachments/assets/7c1dbab5-a5d4-4503-a18b-e9cdb4cd9156" />














