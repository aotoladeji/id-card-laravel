<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of backend/middleware/auth.js -> authorizeRole(['admin', 'supervisor'])
 * Usage in routes: ->middleware('role:admin,supervisor')
 */
class AuthorizeRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->attributes->get('authUser');

        if (! $user || ! in_array($user['role'] ?? null, $roles, true)) {
            return response()->json([
                'message' => 'You do not have permission to perform this action',
            ], 403);
        }

        return $next($request);
    }
}
