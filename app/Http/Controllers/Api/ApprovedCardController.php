<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ApprovedCardController extends Controller
{
    // GET /api/approved-cards?search=
    public function index(Request $request)
    {
        $query = DB::table('approved_cards')->select([
            'id', 'card_id', 'surname', 'other_names', 'matric_no', 'staff_id', 'faculty',
            'department', 'level', 'card_number', 'session', 'hall', 'approved_at',
            'synced_from_capture_app_at', 'archive_downloaded_at', 'manually_edited_at',
            'created_at', 'updated_at',
        ]);

        if ($search = $request->query('search')) {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like) {
                $q->where('surname', 'like', $like)
                    ->orWhere('other_names', 'like', $like)
                    ->orWhere('matric_no', 'like', $like)
                    ->orWhere('staff_id', 'like', $like)
                    ->orWhere('faculty', 'like', $like)
                    ->orWhere('department', 'like', $like)
                    ->orWhere('card_number', 'like', $like);
            });
        }

        // List payloads must not carry the LONGBLOB columns: no UI reads
        // passport_photo/signature from this endpoint, and every row used to be
        // base64-encoded and shipped (megabytes per request on Wasmer).
        // Detail views use show(), which still returns the images.
        $cards = $query->orderByDesc('approved_at')->get();

        return response()->json(['success' => true, 'cards' => $cards, 'total' => $cards->count()]);
    }

    // GET /api/approved-cards/stats
    public function stats()
    {
        $stats = DB::selectOne("
            SELECT
                COUNT(*) as total_approved,
                SUM(CASE WHEN DATE(approved_at) = CURDATE() THEN 1 ELSE 0 END) as approved_today,
                SUM(CASE WHEN approved_at >= CURDATE() - INTERVAL 7 DAY THEN 1 ELSE 0 END) as approved_this_week,
                SUM(CASE WHEN approved_at >= CURDATE() - INTERVAL 30 DAY THEN 1 ELSE 0 END) as approved_this_month
            FROM approved_cards
        ");

        return response()->json(['success' => true, 'stats' => $stats]);
    }

    // GET /api/approved-cards/{id}  (id here is card_id, matching getApprovedCardById in the Node app)
    public function show(int $id)
    {
        $card = DB::table('approved_cards')->where('card_id', $id)->first();

        if (! $card) {
            return response()->json(['success' => false, 'message' => 'Card not found'], 404);
        }

        $card->passport_photo = $card->passport_photo ? base64_encode($card->passport_photo) : null;
        $card->signature = $card->signature ? base64_encode($card->signature) : null;

        return response()->json(['success' => true, 'card' => $card]);
    }

    /**
     * PUT /api/approved-cards/{id}
     * Update an approved card's student info (surname, department, level, etc.)
     * — e.g. when a student changes department after their card was approved.
     */
    public function update(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        if (($user['role'] ?? null) !== 'supervisor') {
            return response()->json(['success' => false, 'message' => 'Only supervisors can edit card info'], 403);
        }

        $editable = [
            'surname' => 'surname',
            'otherNames' => 'other_names',
            'matricNo' => 'matric_no',
            'staffId' => 'staff_id',
            'faculty' => 'faculty',
            'department' => 'department',
            'level' => 'level',
            'cardNumber' => 'card_number',
            'session' => 'session',
            'hall' => 'hall',
        ];

        $update = [];
        foreach ($editable as $bodyKey => $column) {
            if ($request->has($bodyKey)) {
                $value = $request->input($bodyKey);
                $value = is_string($value) ? trim($value) : $value;

                if (in_array($column, ['surname', 'other_names'], true) && ! $value) {
                    return response()->json(['success' => false, 'message' => 'Surname and other names cannot be empty'], 400);
                }

                $update[$column] = $value;
            }
        }

        if (empty($update)) {
            return response()->json(['success' => false, 'message' => 'No editable fields were provided'], 400);
        }

        $update['updated_at'] = now();
        $update['manually_edited_at'] = now();

        $affected = DB::table('approved_cards')->where('card_id', $id)->update($update);

        if (! $affected) {
            return response()->json(['success' => false, 'message' => 'Card not found'], 404);
        }

        // Keep the queued copy (used to render/print the card) in step with the
        // edit, and protect it from being reverted by the capture-app sync.
        DB::table('print_queue')->where('card_id', $id)->update($update);

        $card = DB::table('approved_cards')->where('card_id', $id)->first();
        $card->passport_photo = $card->passport_photo ? base64_encode($card->passport_photo) : null;
        $card->signature = $card->signature ? base64_encode($card->signature) : null;

        ActivityLogger::log(
            $user['id'],
            'APPROVED_CARD_UPDATED',
            "Updated card info for {$card->surname} {$card->other_names} (".($card->matric_no ?: $card->staff_id).')'
        );

        return response()->json(['success' => true, 'message' => 'Card details updated successfully', 'card' => $card]);
    }
}
