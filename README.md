# Identity & Authorization Provider

- **Nama:** Emilio Justin
- **NIM:** 13524043

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
3. seed administrator, group, OAuth client, redirect URI, membership, dan policy dijalankan;
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

Administrator hasil seed sudah menjadi anggota group App A dan App B sehingga dapat langsung mencoba alur SSO pada kedua aplikasi.

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
- Group, membership, policy, dan redirect URI dapat dihapus secara transaksional karena merupakan konfigurasi.
- Audit log dan processed event dipertahankan untuk audit serta idempotency.

Penghapusan relasi akses memicu evaluasi ulang policy. Session hanya dicabut ketika user benar-benar kehilangan jalur `ALLOW` terakhir.

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
- Argon2 0.45.1;
- Jest 30.4.2;
- ESLint 9.39.5;
- Prettier 3.9.6;
- Docker Compose v2.

## Daftar Endpoint dan Route

### Auth Provider — http://localhost:3001

Endpoint dasar:

- `GET /` — informasi service;
- `GET /health` — compatibility health check dengan semantik liveness;
- `GET /health/live` — memastikan proses Auth Provider masih merespons tanpa memeriksa dependency;
- `GET /health/ready` — memeriksa koneksi Primary Database dan RabbitMQ;
- `GET /docs` — antarmuka Swagger/OpenAPI;
- `GET /docs-json` — dokumen OpenAPI dalam format JSON;
- `GET /docs-yaml` — dokumen OpenAPI dalam format YAML.

Authentication dan central session:

- `POST /auth/login` — login langsung dan membuat central session;
- `POST /auth/login/continue` — login untuk melanjutkan authorization request;
- `POST /auth/login/admin` — login administrator;
- `GET /auth/session` — membaca central session aktif;
- `POST /auth/logout` — mencabut central session melalui API;
- `POST /auth/logout/browser` — global logout dari browser;
- `POST /auth/logout/admin` — logout administrator.

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

### Control Panel — http://localhost:3000

- `GET /` — status central session dan global logout;
- `GET /login` — login untuk melanjutkan OAuth;
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

## Bonus yang Dikerjakan

### B03 — Liveness dan Readiness Probe

Auth Provider menyediakan dua probe dengan semantik berbeda:

- `GET /health/live` selalu mengembalikan `200` selama proses dan HTTP event loop masih merespons. Endpoint ini tidak mengakses database atau RabbitMQ.
- `GET /health/ready` menjalankan query ringan `SELECT 1` ke Primary Database dan memeriksa queue melalui channel RabbitMQ. Response `200` diberikan jika keduanya tersedia; jika salah satu gagal, response menjadi `503` dengan status komponen yang aman.
