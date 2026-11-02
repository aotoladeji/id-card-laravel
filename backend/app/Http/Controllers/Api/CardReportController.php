<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CardReportController extends Controller
{
    /**
     * Generate a daily card printing report.
     * GET /api/reports/cards/daily?date=YYYY-MM-DD
     */
    public function daily(Request $request)
    {
        $date = $request->query('date');

        if (! $date) {
            return response()->json(['message' => 'Date parameter is required (YYYY-MM-DD)'], 400);
        }

        // Validate date format
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            return response()->json(['message' => 'Invalid date format. Expected YYYY-MM-DD'], 400);
        }

        $report = $this->generateReport('daily', $date, null, null);

        return response()->json([
            'success' => true,
            'report' => $report,
        ]);
    }

    /**
     * Generate a weekly card printing report.
     * GET /api/reports/cards/weekly?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
     */
    public function weekly(Request $request)
    {
        $startDate = $request->query('start_date');
        $endDate = $request->query('end_date');

        if (! $startDate || ! $endDate) {
            return response()->json(['message' => 'start_date and end_date parameters are required (YYYY-MM-DD)'], 400);
        }

        // Validate date formats
        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $startDate) || ! preg_match('/^\d{4}-\d{2}-\d{2}$/', $endDate)) {
            return response()->json(['message' => 'Invalid date format. Expected YYYY-MM-DD'], 400);
        }

        $report = $this->generateReport('weekly', null, $startDate, $endDate);

        return response()->json([
            'success' => true,
            'report' => $report,
        ]);
    }

    /**
     * Generate a monthly card printing report.
     * GET /api/reports/cards/monthly?month=YYYY-MM
     */
    public function monthly(Request $request)
    {
        $month = $request->query('month');

        if (! $month) {
            return response()->json(['message' => 'month parameter is required (YYYY-MM)'], 400);
        }

        // Validate month format
        if (! preg_match('/^\d{4}-\d{2}$/', $month)) {
            return response()->json(['message' => 'Invalid month format. Expected YYYY-MM'], 400);
        }

        $report = $this->generateReport('monthly', null, null, null, $month);

        return response()->json([
            'success' => true,
            'report' => $report,
        ]);
    }

    /**
     * Core report generation logic shared by all report types.
     */
    private function generateReport(string $type, ?string $date = null, ?string $startDate = null, ?string $endDate = null, ?string $month = null): array
    {
        // Build the base query with date filter
        $query = DB::table('print_history as ph')
            ->leftJoin('approved_cards as ac', 'ph.card_id', '=', 'ac.card_id')
            ->leftJoin('users as u', 'ph.printed_by', '=', 'u.id');

        // Apply date filter based on report type
        if ($type === 'daily' && $date) {
            $query->whereRaw('DATE(ph.printed_at) = ?', [$date]);
            $period = $date;
        } elseif ($type === 'weekly' && $startDate && $endDate) {
            $query->whereRaw('DATE(ph.printed_at) BETWEEN ? AND ?', [$startDate, $endDate]);
            $period = "{$startDate} to {$endDate}";
        } elseif ($type === 'monthly' && $month) {
            [$year, $monthNum] = explode('-', $month);
            $query->whereRaw('YEAR(ph.printed_at) = ? AND MONTH(ph.printed_at) = ?', [(int) $year, (int) $monthNum]);
            $period = $month;
        } else {
            $period = 'Unknown';
        }

        // Get total count
        $totalPrinted = (clone $query)->count();

        // Get breakdown by faculty
        $byFaculty = (clone $query)
            ->selectRaw('COALESCE(ac.faculty, "Unknown") as faculty, COUNT(*) as count')
            ->groupBy('ac.faculty')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['faculty' => $row->faculty, 'count' => (int) $row->count])
            ->toArray();

        // Get breakdown by department
        $byDepartment = (clone $query)
            ->selectRaw('COALESCE(ac.department, "Unknown") as department, COUNT(*) as count')
            ->groupBy('ac.department')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['department' => $row->department, 'count' => (int) $row->count])
            ->toArray();

        // Get breakdown by level
        $byLevel = (clone $query)
            ->selectRaw('COALESCE(ac.level, "Unknown") as level, COUNT(*) as count')
            ->groupBy('ac.level')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => ['level' => $row->level, 'count' => (int) $row->count])
            ->toArray();

        // Get breakdown by staff member who printed
        $byStaff = (clone $query)
            ->selectRaw('ph.printed_by, COALESCE(u.name, "Unknown") as staff_name, COUNT(*) as count')
            ->groupBy('ph.printed_by', 'u.name')
            ->orderByDesc('count')
            ->get()
            ->map(fn ($row) => [
                'userId' => $row->printed_by,
                'staffName' => $row->staff_name,
                'count' => (int) $row->count,
            ])
            ->toArray();

        // Get detailed card list
        $cards = (clone $query)
            ->selectRaw("
                ph.id,
                ph.card_id,
                COALESCE(NULLIF(ph.matric_no, ''), ac.matric_no) as matric_no,
                COALESCE(NULLIF(ph.staff_id, ''), ac.staff_id) as staff_id,
                COALESCE(NULLIF(ph.surname, ''), ac.surname) as surname,
                COALESCE(NULLIF(ph.other_names, ''), ac.other_names) as other_names,
                COALESCE(NULLIF(ph.card_number, ''), ac.card_number) as card_number,
                ac.faculty,
                ac.department,
                ac.level,
                ac.session,
                ph.printed_at,
                ph.printed_by,
                u.name as printed_by_name,
                ph.printer_name,
                ph.print_quality
            ")
            ->orderByDesc('ph.printed_at')
            ->get()
            ->map(function ($row) {
                return [
                    'id' => $row->id,
                    'cardId' => $row->card_id,
                    'matricNo' => $row->matric_no,
                    'staffId' => $row->staff_id,
                    'surname' => $row->surname,
                    'otherNames' => $row->other_names,
                    'fullName' => trim(($row->surname ?? '').' '.($row->other_names ?? '')),
                    'cardNumber' => $row->card_number,
                    'faculty' => $row->faculty,
                    'department' => $row->department,
                    'level' => $row->level,
                    'session' => $row->session,
                    'printedAt' => $row->printed_at,
                    'printedBy' => $row->printed_by,
                    'printedByName' => $row->printed_by_name,
                    'printerName' => $row->printer_name,
                    'printQuality' => $row->print_quality,
                ];
            })
            ->toArray();

        return [
            'period' => $period,
            'type' => $type,
            'totalPrinted' => $totalPrinted,
            'byFaculty' => $byFaculty,
            'byDepartment' => $byDepartment,
            'byLevel' => $byLevel,
            'byStaff' => $byStaff,
            'cards' => $cards,
        ];
    }
}
