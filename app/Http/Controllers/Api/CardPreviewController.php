<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CaptureAppService;
use App\Support\ActivityLogger;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CardPreviewController extends Controller
{
    public function __construct(private CaptureAppService $captureApp) {}

    // POST /api/card-preview/sync-approved
    public function syncApproved(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $result = $this->captureApp->syncApprovedCards();

        if (($result['addedToQueue'] ?? 0) > 0) {
            ActivityLogger::log($user['id'], 'CARDS_SYNCED', "Synced {$result['addedToQueue']} new cards to print queue");
        }

        return response()->json(array_merge(['success' => true], $result));
    }

    // GET /api/card-preview/approved-list
    public function approvedList()
    {
        try {
            $response = (new Client(['timeout' => 300]))->get(rtrim(config('services.capture_app.url'), '/').'/api/printing/approved');
            $data = json_decode((string) $response->getBody(), true) ?: [];

            if (empty($data['success'])) {
                return response()->json(['message' => 'Failed to fetch approved cards from capture app', 'cards' => []], 500);
            }

            $cards = $data['cards'] ?? [];

            return response()->json(['success' => true, 'cards' => $cards, 'total' => count($cards)]);
        } catch (ConnectException $e) {
            return response()->json(['message' => 'Capture app is not available. Please ensure it is running.', 'cards' => []], 503);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error fetching approved cards list', 'error' => $e->getMessage(), 'cards' => []], 500);
        }
    }

    // POST /api/card-preview/reprint
    public function reprint(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $cardId = $request->input('cardId');

        try {
            $response = (new Client(['timeout' => 300]))->get(rtrim(config('services.capture_app.url'), '/').'/api/printing/approved');
            $data = json_decode((string) $response->getBody(), true) ?: [];

            if (empty($data['success'])) {
                return response()->json(['success' => false, 'message' => 'Failed to fetch card from capture app'], 500);
            }

            $card = collect($data['cards'] ?? [])->first(fn ($c) => (string) ($c['id'] ?? '') === (string) $cardId);

            if (! $card) {
                return response()->json(['success' => false, 'message' => 'Card not found in capture app'], 404);
            }

            if (DB::table('print_queue')->where('card_id', $cardId)->exists()) {
                return response()->json(['success' => true, 'message' => 'Card is already in print queue', 'alreadyExists' => true]);
            }

            DB::table('print_queue')->insert([
                'card_id' => $card['id'],
                'surname' => $card['surname'] ?? null,
                'other_names' => $card['other_names'] ?? null,
                'matric_no' => $card['matric_no'] ?? null,
                'staff_id' => $card['staff_id'] ?? null,
                'faculty' => $card['faculty'] ?? null,
                'department' => $card['department'] ?? null,
                'level' => $card['level'] ?? null,
                'card_number' => $card['card_number'] ?? null,
                'session' => $card['session'] ?? null,
                'passport_photo' => ! empty($card['passport_photo']) ? base64_decode($card['passport_photo']) : null,
                'signature' => $this->captureApp->decodeImageData(
                    $card['signature']
                        ?? $card['signature_photo']
                        ?? $card['signaturePhoto']
                        ?? $card['signature_image']
                        ?? $card['signatureImage']
                        ?? $card['signature_base64']
                        ?? $card['signatureBase64']
                        ?? null
                ),
                'status' => 'queued',
                'manually_edited_at' => now(),
                'added_to_queue_at' => now(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            ActivityLogger::log($user['id'], 'CARD_REPRINT_REQUESTED', "Sent {$card['surname']} {$card['other_names']} to print queue for reprinting");

            return response()->json(['success' => true, 'message' => 'Card sent to print queue for reprinting']);
        } catch (\Throwable $e) {
            return response()->json(['success' => false, 'message' => 'Error sending card for reprint', 'error' => $e->getMessage()], 500);
        }
    }
}
