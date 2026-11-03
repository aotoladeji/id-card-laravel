<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReprintController extends Controller
{
    // GET /api/reprint?status=
    public function index(Request $request)
    {
        $query = DB::table('reprint_requests as r')
            ->leftJoin('users as u1', 'r.requested_by', '=', 'u1.id')
            ->leftJoin('users as u2', 'r.resolved_by', '=', 'u2.id')
            ->select('r.*', 'u1.username as requested_by_username', 'u2.username as resolved_by_username');

        if ($status = $request->query('status')) {
            $query->where('r.status', $status);
        }

        $requests = $query->orderByDesc('r.created_at')->get();

        return response()->json(['success' => true, 'requests' => $requests]);
    }

    // POST /api/reprint
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $matricNumber = $request->input('matricNumber');
        $studentName = $request->input('studentName');
        $reason = $request->input('reason');

        $id = DB::table('reprint_requests')->insertGetId([
            'matric_number' => $matricNumber,
            'student_name' => $studentName,
            'reason' => $reason,
            'requested_by' => $user['id'],
            'status' => 'pending',
            'created_at' => now(),
        ]);

        $reprintRequest = DB::table('reprint_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'REPRINT_REQUEST_CREATED', "Reprint request for {$matricNumber}");

        return response()->json(['success' => true, 'message' => 'Reprint request created successfully', 'request' => $reprintRequest], 201);
    }

    // PUT /api/reprint/{id}
    public function update(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');
        $notes = $request->input('notes');

        // Only a supervisor may approve or reject a reprint request. Staff can
        // still mark an already-approved request as completed (e.g. after
        // queueing it for printing).
        if (in_array($status, ['approved', 'rejected'], true) && ($user['role'] ?? null) !== 'supervisor') {
            return response()->json([
                'message' => 'Only a supervisor can approve or reject reprint requests',
            ], 403);
        }

        $affected = DB::table('reprint_requests')->where('id', $id)->update([
            'status' => $status,
            'notes' => $notes,
            'resolved_by' => $user['id'],
            'resolved_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        $reprintRequest = DB::table('reprint_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'REPRINT_REQUEST_'.Str::upper($status), "Request ID: {$id}");

        return response()->json(['success' => true, 'message' => "Request {$status} successfully", 'request' => $reprintRequest]);
    }
}
