<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
| This backend now also serves the built React/Vite frontend (see
| ../frontend and build-frontend.sh at the project root, which build the
| SPA straight into public/). Every non-API GET request returns the SPA's
| index.html so React Router can handle client-side routing/deep links.
| /api/* requests never reach here — they're matched by routes/api.php
| first, since Laravel resolves the "api" route file's routes independently
| of "web" and /api/* is more specific.
*/

// One-time browser setup for hosts without a shell. Disabled unless the
// SETUP_TOKEN env var is set; remove that var once the database is migrated.
Route::get('/setup/migrate/{token}', function (string $token) {
    $expected = (string) env('SETUP_TOKEN', '');

    if ($expected === '' || ! hash_equals($expected, $token)) {
        abort(404);
    }

    try {
        $cfg = config('database.connections.mysql');
        $info = 'DB host='.$cfg['host'].' port='.$cfg['port'].' database='.$cfg['database'].' user='.$cfg['username']."\n";
        \Illuminate\Support\Facades\Artisan::call('migrate', ['--force' => true]);
        $output = \Illuminate\Support\Facades\Artisan::output();
        \Illuminate\Support\Facades\Artisan::call('db:seed', ['--force' => true]);
    } catch (\Throwable $e) {
        return response(($info ?? '').'ERROR: '.$e->getMessage(), 200)
            ->header('Content-Type', 'text/plain');
    }

    return response($info.$output."\nSeeded. Now remove SETUP_TOKEN.", 200)
        ->header('Content-Type', 'text/plain');
});

Route::get('/{any}', function () {
    $indexFile = public_path('index.html');

    if (! file_exists($indexFile)) {
        return response(
            'Frontend build not found. Run build-frontend.sh (or `npm run build` '.
            'inside /frontend) to generate public/index.html first.',
            503
        );
    }

    return response(file_get_contents($indexFile), 200)
        ->header('Content-Type', 'text/html; charset=UTF-8');
})->where('any', '^(?!api).*$');
