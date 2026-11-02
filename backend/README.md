# ID Card Unit — Laravel Backend

# ID Card Unit — Laravel Backend

> **Looking to run the whole app (frontend + backend together)?** See
> `../LAUNCH_GUIDE.md` at the project root — it has the full setup steps
> and default login. This file focuses on the backend internals.

This is a conversion of the original Node/Express backend (`backend/`) to
**Laravel 11, served by Apache, backed by MySQL/MariaDB** (PostgreSQL is
also supported — see below).

The React/Vite frontend is unchanged and talks to this backend over the
same `/api/*` JSON endpoints as before, so no frontend changes are
required beyond pointing `VITE_API_URL` / your API base URL at the new
backend's address.

## 1. What's included

- **Full API surface** for: auth, users, id_cards (capture queue), approved
  cards history (incl. the department/name-edit feature), activity logs,
  reprint requests, material requests, daily reports, inventory + faulty
  deliveries, card collections (incl. fingerprint verification), print
  history, print queue, capture-app sync, scheduling (admin + public
  student booking), and the developer/operational reset tool.
- **Migrations** for every table in the original schema (including the
  legacy `scheduling_slots`/`scheduling_bookings` tables kept only for
  parity with the reset tool).
- **JWT auth** (`firebase/php-jwt`) that issues/reads the same kind of
  bearer tokens as the old Express app — your frontend's `Authorization:
  Bearer <token>` header handling needs no changes.
- **Apache config** (`deploy/apache-vhost.conf`) and a Laravel-standard
  `public/index.php` + `.htaccess` front controller.
- `NODE_REFERENCE/` — a copy of the original Node controllers/routes/
  services, kept inside this package so you (or another engineer) can
  diff against the exact original behaviour for any edge case.

## 2. Design choices worth knowing about

- **Query builder over Eloquent.** Most controllers use `DB::table(...)`
  (Laravel's query builder) rather than Eloquent models, deliberately
  mirroring the original hand-written SQL as closely as possible. This
  was the fastest way to get a faithful, low-risk conversion of ~7,800
  lines of business logic. You're welcome to introduce Eloquent
  models/relationships incrementally — the migrations already define
  proper foreign keys.
- **MySQL by default.** `config/database.php` defaults to `mysql`, matching
  a typical Apache/LAMP deployment. If you'd rather keep PostgreSQL, set
  `DB_CONNECTION=pgsql` in `.env` — the `pgsql` connection is already
  configured — but double check the `approved_cards`/`print_queue`/etc.
  migrations' `binary()` columns behave as you expect on Postgres (BYTEA).
  Note: a handful of stats queries (`ApprovedCardController::stats`,
  `CollectionController::stats`, `PrintHistoryController::stats`) use
  raw SQL with MySQL date functions (`CURDATE()`, `INTERVAL n DAY`). If you
  switch to `pgsql`, swap those for `CURRENT_DATE` / `INTERVAL 'n days'`.
- **Passwords / bcrypt hashes** carry over as-is — Laravel's `Hash::check`
  understands the same bcrypt hashes the Node app (bcryptjs) produced, so
  existing user accounts and passwords keep working if you migrate your
  existing data rather than starting from the seeder.
- **The default admin seeder** (`database/seeders/DatabaseSeeder.php`)
  creates a fresh `MIS001` / `ChangeMe123!` admin account, because the
  original schema's admin password hash's plaintext is unknown. Change
  this password immediately (`must_change_password` is already `true`).

## 3. Deliberately out of scope / simplified

- **`printing/cardPrinter.js`** was not referenced by any API route in the
  original app (a standalone local utility using `sharp`, `bwip-js`, and
  shell `exec` calls) — it wasn't converted. If you actually use it,
  say so and it can be ported as a Laravel queued job.
- **`routes/admin/migration.js`** (a schema-migration-over-HTTP endpoint) is
  superseded by `php artisan migrate` — no HTTP equivalent was built, since
  that pattern is an anti-pattern in Laravel and a security risk.
- **Card image/preview proxy** (`app/Http/Controllers/Api/CardImageController.php`,
  `CardPreviewController.php`) is a simplified but functional port of the
  original's ~550 lines of image-location heuristics and `sharp`-based
  SVG→PNG rasterization (now using `ext-imagick` if available). If your
  capture-app deployment relies on the more exotic fallback paths in the
  original file, cross-reference `NODE_REFERENCE/routes/captureAppCardImage.js`.
- **Scheduling emails / Excel header detection**
  (`app/Http/Controllers/Api/SchedulingController.php`) reproduces the
  common header aliases and general send-failure handling, but not every
  SMTP-error-classification branch from the original. See the class
  docblock and `NODE_REFERENCE/controllers/schedulingController.js`.

## 4. Local setup

```bash
cd laravel-backend
composer install
cp .env.example .env
php artisan key:generate
```

Edit `.env`:
- `DB_*` — your MySQL credentials (create the database first: `CREATE DATABASE id_card_unit;`)
- `JWT_SECRET` — long random string (**must** be set, auth will refuse to work otherwise)
- `CAPTURE_APP_URL` — wherever your capture-app/fingerprint service runs
- `MAIL_*` — SMTP creds if you use the scheduling email feature
- `CORS_ORIGINS` — your frontend's origin(s), comma separated
- `DEVELOPER_RESET_PASSWORD` — change from the default

Then:

```bash
php artisan migrate
php artisan db:seed
php artisan serve   # quick local check at http://127.0.0.1:8000
```

Visit `http://127.0.0.1:8000/api/ping` — should return `{"status":"OK",...}`.

## 5. Apache deployment

1. `composer install --no-dev --optimize-autoloader` on the server.
2. Copy `deploy/apache-vhost.conf` into your Apache sites, adjusting the
   `DocumentRoot` to point at this project's `public/` folder (not the
   project root — Apache should only ever serve `public/`).
3. Enable `mod_rewrite` (`a2enmod rewrite`) — required for the front
   controller `.htaccess`.
4. Make `storage/` and `bootstrap/cache/` writable by the Apache user:
   `chown -R www-data:www-data storage bootstrap/cache`
5. Set `APP_ENV=production`, `APP_DEBUG=false` in `.env`.
6. Run `php artisan config:cache route:cache` after every deploy.
7. Run `php artisan migrate --force` for schema changes.

## 6. Endpoint parity

Every route from the original `backend/routes/*.js` has a matching route
in `routes/api.php` at the same path and HTTP verb (so the existing
frontend fetch calls need no changes), except the two intentionally
dropped endpoints noted in section 3.
