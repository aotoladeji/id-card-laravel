<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Forces the Accept header to JSON (so validation/exception responses come back
 * as JSON like the original Express API), and applies the same CORS origin
 * allow-list logic that lived in backend/server.js (corsOptions).
 */
class ForceJsonResponse
{
    public function handle(Request $request, Closure $next): Response
    {
        // Prevent PHP built-in server 60-second timeout from killing slow DB queries.
        set_time_limit(0);

        $request->headers->set('Accept', 'application/json');

        // Handle CORS preflight
        if ($request->getMethod() === 'OPTIONS') {
            $response = response('', 204);
        } else {
            $response = $next($request);
        }

        $origin = $request->headers->get('Origin');

        if ($origin && $this->isAllowedOrigin($origin)) {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Vary', 'Origin');
            $response->headers->set('Access-Control-Allow-Credentials', 'true');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
            $response->headers->set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
        }

        return $response;
    }

    private function isAllowedOrigin(string $origin): bool
    {
        $normalized = $this->normalize($origin);

        $explicit = array_filter(array_map(
            fn ($o) => $this->normalize(trim($o)),
            explode(',', (string) env('CORS_ORIGINS', ''))
        ));

        $allowed = $explicit ?: array_filter([$this->normalize((string) env('FRONTEND_URL', ''))]);

        if (empty($allowed)) {
            return true;
        }

        if (in_array($normalized, $allowed, true)) {
            return true;
        }

        if (filter_var(env('CORS_ALLOW_VERCEL_PREVIEWS', false), FILTER_VALIDATE_BOOLEAN)) {
            return (bool) preg_match('/^https:\/\/[a-z0-9-]+\.vercel\.app$/i', $origin);
        }

        return false;
    }

    private function normalize(string $value): string
    {
        $value = rtrim(trim($value), '/');

        return strtolower($value);
    }
}
