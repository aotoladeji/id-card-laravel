<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

/**
 * Converted from the /api/ping and /api/health routes defined directly in
 * backend/server.js.
 */
class HealthController extends Controller
{
    // GET /api/ping — liveness endpoint, no DB access
    public function ping()
    {
        return response()->json([
            'status' => 'OK',
            'message' => 'API reachable',
            'timestamp' => now()->toIso8601String(),
        ]);
    }

    // GET /api/health — includes DB connectivity diagnostics
    public function health()
    {
        $checks = [
            'status' => 'OK',
            'timestamp' => now()->toIso8601String(),
            'env' => config('app.env'),
            'jwt_secret' => config('app.jwt_secret') ? 'set' : 'MISSING',
            'db_connection' => config('database.default'),
            'db_host_hint' => config('database.connections.'.config('database.default').'.host'),
            'database' => null,
            'users_table' => null,
        ];

        try {
            DB::select('SELECT 1 AS alive');
            $checks['database'] = 'connected';
        } catch (\Throwable $e) {
            $checks['database'] = 'error: '.$e->getMessage();
            $checks['status'] = 'DEGRADED';
        }

        try {
            DB::select('SELECT 1 FROM users LIMIT 1');
            $checks['users_table'] = 'exists';
        } catch (\Throwable $e) {
            $checks['users_table'] = 'error: '.$e->getMessage();
            if ($checks['status'] === 'OK') {
                $checks['status'] = 'DEGRADED';
            }
        }

        return response()->json($checks, $checks['status'] === 'OK' ? 200 : 503);
    }
}
