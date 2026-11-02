<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CaptureAppService;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CollectionController extends Controller
{
    public function __construct(private CaptureAppService $captureApp) {}

    // GET /api/collections?status=&search=
    public function index(Request $request)
    {
        $query = DB::table('card_collections as cc')
            ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'cc.card_id')
            ->leftJoin('users as u', 'cc.collected_by', '=', 'u.id')
            ->selectRaw("
                cc.*,
                COALESCE(NULLIF(cc.surname, ''), ac.surname) AS surname,
                COALESCE(NULLIF(cc.other_names, ''), ac.other_names) AS other_names,
                COALESCE(NULLIF(cc.matric_no, ''), ac.matric_no) AS matric_no,
                COALESCE(NULLIF(cc.staff_id, ''), ac.staff_id) AS staff_id,
                COALESCE(NULLIF(cc.faculty, ''), ac.faculty) AS faculty,
                COALESCE(NULLIF(cc.department, ''), ac.department) AS department,
                COALESCE(NULLIF(cc.card_number, ''), ac.card_number) AS card_number,
                ac.level, ac.session,
                u.name as collected_by_name,
                u.name as printed_by_name
            ");

        if ($status = $request->query('status')) {
            $query->where('cc.status', $status);
        }

        if ($search = $request->query('search')) {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like) {
                $q->where('cc.surname', 'like', $like)
                    ->orWhere('cc.other_names', 'like', $like)
                    ->orWhere('cc.matric_no', 'like', $like)
                    ->orWhere('cc.card_number', 'like', $like);
            });
        }

        $collections = $query->orderByDesc('cc.printed_at')->get();

        return response()->json(['success' => true, 'collections' => $collections]);
    }

    // PUT /api/collections/{id}/collect
    public function markAsCollected(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $notes = $request->input('notes');

        $affected = DB::table('card_collections')->where('id', $id)->update([
            'status' => 'collected',
            'collected_at' => now(),
            'collected_by' => $user['id'],
            'notes' => $notes,
            'updated_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Collection record not found'], 404);
        }

        $card = DB::table('card_collections')->where('id', $id)->first();

        try {
            $this->captureApp->notifyCardCollected($card->card_id);
        } catch (\Throwable $e) {
            report($e);
        }

        ActivityLogger::log($user['id'], 'CARD_COLLECTED', "Card collected: {$card->surname} {$card->other_names}");

        return response()->json(['success' => true, 'message' => 'Card marked as collected']);
    }

    // POST /api/collections/{id}/verify
    public function verifyAndCollect(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        $collection = DB::table('card_collections as cc')
            ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'cc.card_id')
            ->selectRaw("
                cc.*,
                COALESCE(NULLIF(cc.faculty, ''), ac.faculty) AS faculty,
                COALESCE(NULLIF(cc.department, ''), ac.department) AS department,
                COALESCE(NULLIF(cc.card_number, ''), ac.card_number) AS card_number,
                ac.level, ac.session
            ")
            ->where('cc.id', $id)
            ->first();

        if (! $collection) {
            return response()->json(['success' => false, 'message' => 'Collection record not found'], 404);
        }

        if ($collection->status === 'collected') {
            return response()->json(['success' => false, 'message' => 'Card has already been collected'], 400);
        }

        $scannedFingerprint = $request->input('scannedFingerprint');
        $scannedFingerprintImage = $request->input('scannedFingerprintImage');
        $scanPayload = $request->input('scanPayload');

        if (! $scannedFingerprint || ! is_string($scannedFingerprint)) {
            return response()->json([
                'success' => false,
                'verified' => false,
                'message' => 'No fingerprint scan payload was provided. Please scan and try again.',
            ], 400);
        }

        $verification = $this->captureApp->verifyFingerprint(
            $collection->card_id,
            $scannedFingerprint,
            is_array($scanPayload) ? $scanPayload : [],
            [
                'identityCandidates' => [$collection->card_number, $collection->matric_no, $collection->staff_id],
                'scannedFingerprintImage' => $scannedFingerprintImage,
            ]
        );

        if (! empty($verification['configIssue']) || ! empty($verification['connectionError']) || ! empty($verification['timeoutError'])) {
            return response()->json([
                'success' => false,
                'verified' => false,
                'message' => $verification['message'],
                'diagnostic' => $verification['diagnostic'] ?? $verification['appError'] ?? null,
            ], 503);
        }

        if (empty($verification['matched'])) {
            return response()->json([
                'success' => false,
                'verified' => false,
                'message' => $verification['message'] ?? 'Fingerprint did not match. Please try again.',
            ]);
        }

        $studentName = $verification['studentName'] ?? "{$collection->surname} {$collection->other_names}";

        $affected = DB::table('card_collections')->where('id', $id)->update([
            'status' => 'collected',
            'collected_at' => now(),
            'collected_by' => $user['id'],
            'notes' => "Verified by fingerprint — Collected by: {$studentName}",
            'updated_at' => now(),
        ]);

        if (! $affected) {
            return response()->json([
                'success' => false,
                'verified' => false,
                'message' => 'Collection record changed during verification. Please refresh and try again.',
            ], 409);
        }

        $card = DB::table('card_collections')->where('id', $id)->first();

        try {
            $this->captureApp->notifyCardCollected($card->card_id);
        } catch (\Throwable $e) {
            report($e);
        }

        ActivityLogger::log($user['id'], 'CARD_COLLECTED_FINGERPRINT', "Fingerprint verified: {$card->surname} {$card->other_names}");

        return response()->json([
            'success' => true,
            'verified' => true,
            'message' => "Fingerprint verified! Card collected by {$studentName}.",
            'collectedBy' => $studentName,
        ]);
    }

    // GET /api/collections/stats
    public function stats()
    {
        $stats = DB::selectOne("
            SELECT
                COUNT(*) as total_printed,
                SUM(CASE WHEN status = 'collected' THEN 1 ELSE 0 END) as total_collected,
                SUM(CASE WHEN status = 'awaiting_collection' THEN 1 ELSE 0 END) as awaiting_collection,
                SUM(CASE WHEN status = 'collected' AND DATE(collected_at) = CURDATE() THEN 1 ELSE 0 END) as collected_today
            FROM card_collections
        ");

        return response()->json(['success' => true, 'stats' => $stats]);
    }
}
