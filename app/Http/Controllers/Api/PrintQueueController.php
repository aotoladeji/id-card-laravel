<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CaptureAppService;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PrintQueueController extends Controller
{
    public function __construct(private CaptureAppService $captureApp) {}

    // POST /api/print-queue/sync
    public function sync(Request $request)
    {
        $user = $request->attributes->get('authUser');

        try {
            $result = $this->captureApp->syncApprovedCards();

            if (($result['addedToQueue'] ?? 0) > 0) {
                ActivityLogger::log($user['id'], 'CARDS_SYNCED', "Synced {$result['addedToQueue']} new cards to print queue");
            }

            return response()->json(array_merge(
                ['success' => true, 'message' => $result['message'] ?? 'Synced cards'],
                $result
            ));
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error syncing approved cards',
                'error' => $e->getMessage(),
            ], 500);
        }
    }

    // GET /api/print-queue?status=
    public function index(Request $request)
    {
        // Only scalar columns: the LONGBLOB passport_photo/signature were
        // base64-encoded and shipped for every queued card on every poll.
        // Nothing reads them from this list (printing fetches the rendered
        // card via /api/card-images/{id}/image), so they stay server-side.
        $query = DB::table('print_queue as pq')
            ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'pq.card_id')
            ->leftJoin('users as u', 'pq.printed_by', '=', 'u.id')
            ->selectRaw("
                pq.id,
                pq.card_id,
                pq.status,
                pq.added_to_queue_at,
                pq.printed_at,
                pq.printed_by,
                pq.print_attempts,
                pq.last_error,
                pq.manually_edited_at,
                pq.created_at,
                pq.updated_at,
                COALESCE(NULLIF(pq.surname, ''), ac.surname) AS surname,
                COALESCE(NULLIF(pq.other_names, ''), ac.other_names) AS other_names,
                COALESCE(NULLIF(pq.matric_no, ''), ac.matric_no) AS matric_no,
                COALESCE(NULLIF(pq.staff_id, ''), ac.staff_id) AS staff_id,
                COALESCE(NULLIF(pq.faculty, ''), ac.faculty) AS faculty,
                COALESCE(NULLIF(pq.department, ''), ac.department) AS department,
                COALESCE(NULLIF(pq.level, ''), ac.level) AS level,
                COALESCE(NULLIF(pq.card_number, ''), ac.card_number) AS card_number,
                COALESCE(NULLIF(pq.session, ''), ac.session) AS session,
                COALESCE(NULLIF(pq.hall, ''), ac.hall) AS hall,
                u.name as printed_by_name
            ");

        if ($status = $request->query('status')) {
            $query->where('pq.status', $status);
        } else {
            $query->whereIn('pq.status', ['queued', 'printing']);
        }

        $queue = $query->orderBy('pq.added_to_queue_at')->get();

        return response()->json(['success' => true, 'queue' => $queue]);
    }

    // POST /api/print-queue/add  (used for approved reprints)
    public function addCard(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $cardId = $request->input('cardId');

        if (! $cardId) {
            return response()->json(['success' => false, 'message' => 'cardId is required'], 400);
        }

        $approvedCard = DB::table('approved_cards')->where('card_id', $cardId)->first()
            ?? DB::table('approved_cards')->where('id', $cardId)->first();

        if (! $approvedCard) {
            return response()->json(['success' => false, 'message' => 'Approved card not found'], 404);
        }

        $existing = DB::table('print_queue')->where('card_id', $cardId)->first();

        if ($existing) {
            // Keep the queued row in sync with any edits just saved to the
            // approved card (e.g. a corrected hall), then report as queued.
            DB::table('print_queue')->where('id', $existing->id)->update([
                'surname' => $approvedCard->surname,
                'other_names' => $approvedCard->other_names,
                'matric_no' => $approvedCard->matric_no,
                'staff_id' => $approvedCard->staff_id,
                'faculty' => $approvedCard->faculty,
                'department' => $approvedCard->department,
                'level' => $approvedCard->level,
                'card_number' => $approvedCard->card_number,
                'session' => $approvedCard->session,
                'hall' => $approvedCard->hall,
                'signature' => $approvedCard->signature,
                'manually_edited_at' => now(),
                'updated_at' => now(),
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Card is already in print queue',
                'queueId' => $existing->id,
                'alreadyQueued' => true,
            ]);
        }

        DB::table('print_queue_exclusions')->where('card_id', $cardId)->delete();

        $queueId = DB::table('print_queue')->insertGetId([
            'card_id' => $approvedCard->card_id,
            'surname' => $approvedCard->surname,
            'other_names' => $approvedCard->other_names,
            'matric_no' => $approvedCard->matric_no,
            'staff_id' => $approvedCard->staff_id,
            'faculty' => $approvedCard->faculty,
            'department' => $approvedCard->department,
            'level' => $approvedCard->level,
            'card_number' => $approvedCard->card_number,
            'session' => $approvedCard->session,
            'hall' => $approvedCard->hall,
            'passport_photo' => $approvedCard->passport_photo,
            'signature' => $approvedCard->signature,
            'status' => 'queued',
            'manually_edited_at' => now(),
            'added_to_queue_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        ActivityLogger::log(
            $user['id'],
            'CARD_ADDED_TO_QUEUE',
            "Added approved reprint card {$approvedCard->card_id} ({$approvedCard->surname} {$approvedCard->other_names}) to print queue"
        );

        return response()->json(['success' => true, 'message' => 'Card added to print queue', 'queueId' => $queueId], 201);
    }

    // PUT /api/print-queue/{id}/printed
    public function markAsPrinted(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $printerName = $request->input('printerName', 'Default Printer');
        $quality = $request->input('quality', 'standard');

        return DB::transaction(function () use ($id, $user, $printerName, $quality) {
            $card = DB::table('print_queue as pq')
                ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'pq.card_id')
                ->selectRaw("
                    pq.*,
                    COALESCE(pq.faculty, ac.faculty) AS faculty,
                    COALESCE(pq.department, ac.department) AS department,
                    COALESCE(pq.level, ac.level) AS level,
                    COALESCE(pq.card_number, ac.card_number) AS card_number,
                    COALESCE(pq.session, ac.session) AS session
                ")
                ->where('pq.id', $id)
                ->first();

            if (! $card) {
                return response()->json(['message' => 'Card not found in queue'], 404);
            }

            DB::table('print_queue')->where('id', $id)->update([
                'status' => 'printed',
                'printed_at' => now(),
                'printed_by' => $user['id'],
            ]);

            DB::table('print_history')->insert([
                'card_id' => $card->card_id,
                'surname' => $card->surname,
                'other_names' => $card->other_names,
                'matric_no' => $card->matric_no,
                'staff_id' => $card->staff_id,
                'card_number' => $card->card_number,
                'printed_at' => now(),
                'printed_by' => $user['id'],
                'printer_name' => $printerName ?: 'Default Printer',
                'print_quality' => $quality ?: 'standard',
                'created_at' => now(),
            ]);

            DB::table('card_collections')->insert([
                'card_id' => $card->card_id,
                'surname' => $card->surname,
                'other_names' => $card->other_names,
                'matric_no' => $card->matric_no,
                'staff_id' => $card->staff_id,
                'faculty' => $card->faculty,
                'department' => $card->department,
                'card_number' => $card->card_number,
                'printed_at' => now(),
                'status' => 'awaiting_collection',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $this->captureApp->excludeCardFromQueue($card->card_id, 'printed', $user['id']);

            DB::table('print_queue')->where('id', $id)->delete();

            try {
                $this->captureApp->notifyCardPrinted($card->card_id);
            } catch (\Throwable $e) {
                report($e);
            }

            ActivityLogger::log($user['id'], 'CARD_PRINTED', "Printed card for {$card->surname} {$card->other_names}");

            return response()->json(['success' => true, 'message' => 'Card marked as printed']);
        });
    }

    // PUT /api/print-queue/{id}/failed
    public function markAsFailed(Request $request, int $id)
    {
        $error = $request->input('error', 'Unknown error');

        DB::table('print_queue')->where('id', $id)->update([
            'status' => 'failed',
            'print_attempts' => DB::raw('print_attempts + 1'),
            'last_error' => $error,
        ]);

        return response()->json(['success' => true, 'message' => 'Card marked as failed']);
    }

    // PUT /api/print-queue/{id}/retry
    public function retry(int $id)
    {
        DB::table('print_queue')->where('id', $id)->update([
            'status' => 'queued',
            'last_error' => null,
        ]);

        return response()->json(['success' => true, 'message' => 'Card queued for retry']);
    }

    // GET /api/print-queue/{id}/pdf
    public function generatePdf(int $id)
    {
        $card = DB::table('print_queue')->where('id', $id)->first();

        if (! $card) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        // Not yet implemented in the original Node app either — kept as a
        // placeholder response. Use browser print for now.
        return response()->json([
            'success' => true,
            'message' => 'PDF generation not yet implemented. Use browser print for now.',
            'card' => ['name' => "{$card->surname} {$card->other_names}", 'id' => $card->matric_no ?: $card->staff_id],
        ]);
    }

    // POST /api/print-queue/{id}/print-direct
    public function printDirect(Request $request, int $id)
    {
        $card = DB::table('print_queue')->where('id', $id)->first();

        if (! $card) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        // Not yet implemented in the original Node app either.
        return response()->json([
            'success' => true,
            'message' => 'Direct printing not yet implemented. Use browser print for now.',
            'printerName' => $request->input('printerName', 'Default'),
        ]);
    }

    // DELETE /api/print-queue
    public function clear(Request $request)
    {
        $user = $request->attributes->get('authUser');

        $count = DB::table('print_queue')->count();

        DB::statement('
            INSERT INTO print_queue_exclusions (card_id, reason, created_by, created_at)
            SELECT card_id, ?, ?, NOW() FROM print_queue
            ON DUPLICATE KEY UPDATE reason = VALUES(reason), created_by = VALUES(created_by), created_at = VALUES(created_at)
        ', ['removed', $user['id']]);

        DB::table('print_queue')->delete();

        ActivityLogger::log($user['id'], 'QUEUE_CLEARED', "Cleared {$count} cards from print queue");

        return response()->json(['success' => true, 'message' => "Cleared {$count} card(s) from print queue", 'count' => $count]);
    }

    // DELETE /api/print-queue/{id}
    public function destroy(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        $card = DB::table('print_queue')->where('id', $id)->first();

        if (! $card) {
            return response()->json(['success' => false, 'message' => 'Card not found in queue'], 404);
        }

        $this->captureApp->excludeCardFromQueue($card->card_id, 'removed', $user['id']);

        DB::table('print_queue')->where('id', $id)->delete();

        ActivityLogger::log($user['id'], 'CARD_DELETED_FROM_QUEUE', "Deleted {$card->surname} {$card->other_names} from print queue");

        return response()->json(['success' => true, 'message' => 'Card removed from queue']);
    }
}
