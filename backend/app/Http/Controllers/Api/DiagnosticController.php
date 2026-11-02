<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use GuzzleHttp\Client;
use Illuminate\Support\Facades\DB;

class DiagnosticController extends Controller
{
    // GET /api/diagnostic/capture-app-status
    public function captureAppStatus()
    {
        $url = config('services.capture_app.url');
        $config = [
            'CAPTURE_APP_URL' => $url,
            'isProduction' => ! str_contains($url, 'localhost'),
            'VERIFY_API_KEY' => config('services.capture_app.verify_api_key') ? 'set' : 'not set',
            'environment' => config('app.env'),
        ];

        try {
            $client = new Client(['timeout' => 300]);
            $response = $client->get("{$url}/api/health");

            return response()->json([
                'success' => true,
                'status' => 'operational',
                'capture_app' => $config,
                'captureAppResponse' => [
                    'statusCode' => $response->getStatusCode(),
                    'data' => json_decode((string) $response->getBody(), true),
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'status' => 'unreachable',
                'capture_app' => $config,
                'error' => $e->getMessage(),
            ], 503);
        }
    }

    // GET /api/diagnostic/config
    public function config()
    {
        $checks = [
            'status' => 'OK',
            'timestamp' => now()->toIso8601String(),
            'env' => config('app.env'),
            'jwt_secret' => config('app.jwt_secret') ? 'set' : 'MISSING',
            'db_connection' => config('database.default'),
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
            $checks['status'] = $checks['status'] === 'OK' ? 'DEGRADED' : $checks['status'];
        }

        return response()->json($checks, $checks['status'] === 'OK' ? 200 : 503);
    }
}
