<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PrintHistoryController extends Controller
{
    // GET /api/print-history?search=&startDate=&endDate=&page=&limit=
    public function index(Request $request)
    {
        $search = $request->query('search');
        $startDate = $request->query('startDate');
        $endDate = $request->query('endDate');
        $page = max(1, (int) $request->query('page', 1));
        $limit = max(1, (int) $request->query('limit', 50));

        $base = fn () => DB::table('print_history as ph')
            ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'ph.card_id')
            ->when($search, function ($q) use ($search) {
                $like = "%{$search}%";
                $q->where(function ($sub) use ($like) {
                    $sub->where('ph.surname', 'like', $like)
                        ->orWhere('ph.other_names', 'like', $like)
                        ->orWhere('ph.matric_no', 'like', $like)
                        ->orWhere('ph.card_number', 'like', $like);
                });
            })
            ->when($startDate, fn ($q) => $q->where('ph.printed_at', '>=', $startDate))
            ->when($endDate, fn ($q) => $q->where('ph.printed_at', '<=', $endDate));

        $total = $base()->count();

        $history = $base()
            ->leftJoin('users as u', 'ph.printed_by', '=', 'u.id')
            ->selectRaw("
                ph.*,
                COALESCE(NULLIF(ph.surname, ''), ac.surname) AS surname,
                COALESCE(NULLIF(ph.other_names, ''), ac.other_names) AS other_names,
                COALESCE(NULLIF(ph.matric_no, ''), ac.matric_no) AS matric_no,
                COALESCE(NULLIF(ph.staff_id, ''), ac.staff_id) AS staff_id,
                COALESCE(NULLIF(ph.card_number, ''), ac.card_number) AS card_number,
                ac.faculty, ac.department, ac.level, ac.session,
                u.name as printed_by_name
            ")
            ->orderByDesc('ph.printed_at')
            ->forPage($page, $limit)
            ->get();

        return response()->json([
            'success' => true,
            'history' => $history,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'pages' => (int) ceil($total / $limit),
            ],
        ]);
    }

    // GET /api/print-history/stats
    public function stats()
    {
        $stats = DB::selectOne("
            SELECT
                COUNT(*) as total_printed,
                SUM(CASE WHEN DATE(printed_at) = CURDATE() THEN 1 ELSE 0 END) as printed_today,
                SUM(CASE WHEN printed_at >= CURDATE() - INTERVAL 7 DAY THEN 1 ELSE 0 END) as printed_this_week,
                SUM(CASE WHEN YEAR(printed_at) = YEAR(CURDATE()) AND MONTH(printed_at) = MONTH(CURDATE()) THEN 1 ELSE 0 END) as printed_this_month
            FROM print_history
        ");

        return response()->json(['success' => true, 'stats' => $stats]);
    }
}
