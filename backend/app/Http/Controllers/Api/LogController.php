<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\DB;

class LogController extends Controller
{
    // GET /api/logs
    public function index()
    {
        $logs = DB::table('activity_logs as l')
            ->leftJoin('users as u', 'l.user_id', '=', 'u.id')
            ->select('l.*', 'u.username')
            ->orderByDesc('l.created_at')
            ->limit(100)
            ->get();

        return response()->json(['success' => true, 'logs' => $logs]);
    }
}
