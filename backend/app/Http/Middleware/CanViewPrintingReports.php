<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Middleware to check if user has permission to view printing reports.
 * Admins and supervisors always allowed; staff need 'printing' permission.
 */
class CanViewPrintingReports
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->attributes->get('authUser');
        $role = $user['role'] ?? null;
        $permissions = $user['permissions'] ?? [];

        if (in_array($role, ['supervisor', 'admin'], true)) {
            return $next($request);
        }

        if ($role === 'staff' && is_array($permissions) && in_array('printing', $permissions, true)) {
            return $next($request);
        }

        return response()->json(['message' => 'You do not have permission to view printing reports'], 403);
    }
}
