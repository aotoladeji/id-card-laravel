<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DeveloperResetController extends Controller
{
    public const RESET_CONFIRMATION_TEXT = 'RESET ACTIVITY DATA';

    private const RESET_TABLES = [
        'appointments',
        'scheduled_students',
        'scheduling_bookings',
        'card_collections',
        'print_history',
        'print_queue',
        'print_queue_exclusions',
        'approved_cards',
        'id_cards',
        'reprint_requests',
        'material_requests',
        'faulty_deliveries',
        'daily_reports',
        'activity_logs',
    ];

    // POST /api/admin/developer-reset
    public function reset(Request $request)
    {
        $password = (string) $request->input('password', '');
        $confirmation = trim((string) $request->input('confirmation', ''));
        $expected = (string) config('services.developer_reset.password');

        if (! hash_equals($expected, $password)) {
            return response()->json(['success' => false, 'message' => 'Invalid developer password'], 403);
        }

        if ($confirmation !== self::RESET_CONFIRMATION_TEXT) {
            return response()->json([
                'success' => false,
                'message' => 'Confirmation text must be exactly: '.self::RESET_CONFIRMATION_TEXT,
            ], 400);
        }

        $cleared = [];

        try {
            DB::transaction(function () use (&$cleared) {
                DB::statement('SET FOREIGN_KEY_CHECKS=0');

                foreach (self::RESET_TABLES as $table) {
                    if (! Schema::hasTable($table)) {
                        continue;
                    }
                    $cleared[$table] = DB::table($table)->count();
                    DB::table($table)->truncate();
                }

                if (Schema::hasTable('time_slots')) {
                    DB::table('time_slots')->update(['booked' => 0, 'is_available' => true]);
                }

                if (Schema::hasTable('scheduling_slots')) {
                    DB::table('scheduling_slots')->update(['booked' => 0, 'status' => 'available']);
                }

                DB::statement('SET FOREIGN_KEY_CHECKS=1');
            });
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to reset operational data',
                'error' => $e->getMessage(),
            ], 500);
        }

        return response()->json([
            'success' => true,
            'message' => 'Operational data reset completed successfully',
            'cleared' => $cleared,
            'preserved' => ['users', 'inventory', 'scheduling_config', 'time_slots', 'scheduling_slots'],
        ]);
    }
}
