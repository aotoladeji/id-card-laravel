<?php

namespace App\Http\Middleware;

use Closure;
use Firebase\JWT\ExpiredException;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of backend/middleware/auth.js -> authenticateToken
 *
 * Reads "Authorization: Bearer <token>", verifies it with JWT_SECRET,
 * and attaches the decoded payload to the request (as $request->authUser).
 */
class JwtAuthenticate
{
    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        $token = null;

        if ($header && str_starts_with($header, 'Bearer ')) {
            $token = substr($header, 7);
        }

        if (! $token) {
            return response()->json(['message' => 'Access token required'], 401);
        }

        try {
            $decoded = JWT::decode($token, new Key(config('app.jwt_secret'), 'HS256'));
        } catch (ExpiredException $e) {
            return response()->json(['message' => 'Invalid or expired token'], 403);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Invalid or expired token'], 403);
        }

        // Mirrors req.user in the Express app: { id, username, role, permissions }
        $request->attributes->set('authUser', (array) $decoded);

        return $next($request);
    }
}
