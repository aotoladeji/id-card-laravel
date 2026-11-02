<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Equivalent of the repeated:
 *   pool.query('INSERT INTO activity_logs (user_id, action, details) VALUES ($1, $2, $3)', [...])
 * pattern used throughout the original controllers.
 */
class ActivityLogger
{
    public static function log(?int $userId, string $action, ?string $details = null): void
    {
        try {
            DB::table('activity_logs')->insert([
                'user_id' => $userId,
                'action' => $action,
                'details' => $details,
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            // Non-fatal, matching the "console.warn(...)" swallow-and-continue
            // behaviour used around login/activity logging in the Node app.
            Log::warning('Non-fatal activity log error: '.$e->getMessage());
        }
    }
}
