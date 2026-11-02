# ID Card Unit — Launch Guide

This folder contains the **whole app**: the Laravel API backend
(`backend/`) and the React/Vite frontend (`frontend/`). The frontend
builds straight into `backend/public`, so in production it's all served
by one Apache vhost, on one URL, with no CORS to configure.

```
id-card-unit-app/
├── backend/     Laravel app (API, database, auth) — see backend/README.md for details
├── frontend/    React/Vite source
└── build-frontend.sh   builds frontend/ into backend/public/
```

## 0. Requirements

- PHP 8.2+ with the `pdo_mysql`, `mbstring`, `xml`, `curl`, `zip` extensions
  (add `imagick` if you want the card-image PNG rasterization endpoint)
- Composer 2
- MySQL 8 / MariaDB 10.6+
- Node.js 20+ and npm (only needed to *build* the frontend, not to run it)
- Nginx + PHP-FPM 8.2+ (for production; `php artisan serve` works for local
  testing without a web server). Apache + `mod_rewrite` works too — see
  `backend/deploy/apache-vhost.conf` — but Nginx is the documented path below.

## 1. Database

```sql
CREATE DATABASE id_card_unit CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 2. Backend setup

```bash
cd backend
composer install
cp .env.example .env
php artisan key:generate
```

Edit `backend/.env`:

| Variable | What to set |
|---|---|
| `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` | your MySQL credentials |
| `JWT_SECRET` | a long random string — **required**, login will fail without it |
| `APP_URL` | the URL you'll actually access the app at, e.g. `http://localhost:8000` |
| `CAPTURE_APP_URL` | address of your fingerprint/capture-app service |
| `MAIL_*` | SMTP credentials, only needed for the scheduling email feature |
| `DEVELOPER_RESET_PASSWORD` | change this from the default |

Then create the schema and the default admin account:

```bash
php artisan migrate
php artisan db:seed
```

## 3. Frontend build

From the project root:

```bash
./build-frontend.sh
```

This runs `npm install` + `npm run build` inside `frontend/`, with Vite
configured to output directly into `backend/public/` (see
`frontend/vite.config.js`). After it finishes, `backend/public/` contains
`index.html` + hashed `assets/*.js`/`*.css` **alongside** Laravel's
`index.php` — that's expected, they coexist fine (see `backend/routes/web.php`
for how Laravel serves the SPA for any non-`/api` route).

Re-run this script any time you change frontend code and want to redeploy.

## 4. Run it

**Local development (no Apache needed):**

```bash
cd frontend
npm run dev
```

Open **http://localhost:3001**. This command starts Laravel on port `8000`
and Vite on port `3001`; Vite proxies `/api/...` requests to Laravel. It reuses
an already-running Laravel server when one is available.

**Production (Nginx + PHP-FPM):**

1. Copy the whole `id-card-unit-app/` folder to your server, e.g.
   `/var/www/id-card-unit-app`.
2. On the server: `cd backend && composer install --no-dev --optimize-autoloader`
   and `../build-frontend.sh` (or build locally and just copy `backend/public/`
   over — no Node needed on the server if you do that).
3. Use `backend/deploy/nginx-vhost.conf` as a starting point — point `root`
   at `.../id-card-unit-app/backend/public` and `fastcgi_pass` at your
   PHP-FPM socket. It already sets every relevant timeout (client, send,
   keepalive, fastcgi) to a 5-minute minimum so slow capture-app calls or
   large uploads aren't cut off. Enable it:
   ```bash
   ln -s /etc/nginx/sites-available/id-card-unit /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
   (Apache + `mod_rewrite` also works — see `backend/deploy/apache-vhost.conf`,
   which sets the equivalent `Timeout 300`.)
4. Make storage writable: `chown -R www-data:www-data backend/storage backend/bootstrap/cache`
5. In `backend/.env`: `APP_ENV=production`, `APP_DEBUG=false`, `APP_URL=https://your-domain`.
6. `php artisan config:cache route:cache` after every deploy.
7. If PHP-FPM's own pool config caps request time, raise `request_terminate_timeout`
   in your pool's `.conf` (e.g. `/etc/php/8.2/fpm/pool.d/www.conf`) to at least `300`.

## 5. Log in

The database seeder creates one default account:

| Field | Value |
|---|---|
| **Username** | `MIS001` |
| **Password** | `ChangeMe123!` |
| Role | admin |

This account has `must_change_password` set to `true`, so the app will
prompt you to change the password immediately after your first login —
**do this straight away**, especially before deploying anywhere reachable
outside your own machine.

Once logged in as admin, use **Users → Add User** in the app to create
real supervisor/staff accounts (admins can create any role; supervisors
can only create staff accounts), then consider disabling or changing the
password on `MIS001` again if you don't plan to keep using it day-to-day.

> The original Node app's schema had its own hard-coded admin
> (`MIS001` / a bcrypt hash whose plaintext password is unknown to us),
> so this seeder deliberately issues a **fresh** password rather than
> reusing that unrecoverable hash. If you're migrating real production
> data from the old Postgres database, either import your existing
> `users` table as-is (its bcrypt hashes work unchanged in Laravel) and
> skip `php artisan db:seed`, or keep the seeded account only as a
> fallback.

## 6. Troubleshooting

- **Blank page / 404 on refresh at a route like `/staff`:** means Apache
  isn't rewriting to `index.php`, or `mod_rewrite`/`AllowOverride All`
  isn't enabled — check `backend/public/.htaccess` is being read.
- **`/api/...` calls fail with CORS errors:** you're likely running the
  frontend dev server (`npm run dev`, port 3001) against a backend on a
  different port — this is fine in dev (Vite's proxy handles it, see
  `frontend/vite.config.js`), but shouldn't happen in the merged/built
  deployment since everything is same-origin.
- **"Frontend build not found" message at `/`:** run `./build-frontend.sh`
  — `backend/public/index.html` doesn't exist yet.
- Everything else (auth, capture-app integration, scheduling emails, etc.)
  is documented in `backend/README.md`.
