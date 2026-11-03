<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Equivalent of canManageScheduling in routes/scheduling.js:
 * supervisors/admins always allowed; staff need the 'scheduling' permission.
 */
class CanManageScheduling
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('authUser');
        $role = $user['role'] ?? null;
        $permissions = $user['permissions'] ?? [];

        if (in_array($role, ['supervisor', 'admin'], true)) {
            return $next($request);
        }

        if ($role === 'staff' && is_array($permissions) && in_array('scheduling', $permissions, true)) {
            return $next($request);
        }

        return response()->json(['message' => 'You do not have permission to manage scheduling'], 403);
    }
}
