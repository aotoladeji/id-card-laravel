<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DailyReportController extends Controller
{
    // GET /api/daily-reports
    public function index()
    {
        $reports = DB::table('daily_reports as d')
            ->leftJoin('users as u1', 'd.submitted_by', '=', 'u1.id')
            ->leftJoin('users as u2', 'd.verified_by', '=', 'u2.id')
            ->select(
                'd.*',
                'u1.username as submitted_by_username',
                'u1.name as submitted_by_name',
                'u2.username as verified_by_username',
                'u2.name as verified_by_name'
            )
            ->orderByDesc('d.report_date')
            ->orderByDesc('d.created_at')
            ->get();

        return response()->json(['success' => true, 'reports' => $reports]);
    }

    // POST /api/daily-reports
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');

        $reportDate = $request->input('reportDate');
        $cardsCaptured = (int) $request->input('cardsCaptured', 0);
        $cardsApproved = (int) $request->input('cardsApproved', 0);
        $cardsPrinted = (int) $request->input('cardsPrinted', 0);
        $cardsCollected = (int) $request->input('cardsCollected', 0);
        $issuesEncountered = $request->input('issuesEncountered', '');
        $inventoryUsed = $request->input('inventoryUsed');

        if (! $reportDate) {
            return response()->json(['message' => 'Report date is required'], 400);
        }

        $existing = DB::table('daily_reports')
            ->where('report_date', $reportDate)
            ->where('submitted_by', $user['id'])
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'You have already submitted a report for this date'], 400);
        }

        $id = DB::table('daily_reports')->insertGetId([
            'report_date' => $reportDate,
            'cards_captured' => $cardsCaptured,
            'cards_approved' => $cardsApproved,
            'cards_printed' => $cardsPrinted,
            'cards_collected' => $cardsCollected,
            'issues_encountered' => $issuesEncountered,
            'inventory_used' => $inventoryUsed ? json_encode($inventoryUsed) : json_encode((object) []),
            'submitted_by' => $user['id'],
            'verification_status' => 'pending',
            'created_at' => now(),
        ]);

        $report = DB::table('daily_reports')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'DAILY_REPORT_SUBMITTED', "Report for {$reportDate}");

        return response()->json(['success' => true, 'message' => 'Daily report submitted successfully', 'report' => $report], 201);
    }

    // PUT /api/daily-reports/{id}/verify
    public function verify(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $verificationStatus = $request->input('verificationStatus');
        $supervisorRemarks = $request->input('supervisorRemarks');

        $affected = DB::table('daily_reports')->where('id', $id)->update([
            'verification_status' => $verificationStatus,
            'supervisor_remarks' => $supervisorRemarks,
            'verified_by' => $user['id'],
            'verified_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Report not found'], 404);
        }

        $report = DB::table('daily_reports')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'DAILY_REPORT_VERIFIED', "Report ID: {$id} - {$verificationStatus}");

        return response()->json(['success' => true, 'message' => 'Report verified successfully', 'report' => $report]);
    }
}
