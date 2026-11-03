<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Converted from backend/controllers/cardSyncController.js.
 * Legacy sync path that pulls capture-app approved cards into id_cards as
 * "pending" records (distinct from the print_queue sync used elsewhere).
 */
class CardSyncController extends Controller
{
    // POST /api/cards/sync  (kept for parity; the app primarily uses /api/print-queue/sync)
    public function sync(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $baseUrl = rtrim(config('services.capture_app.url'), '/');

        try {
            $client = new Client(['timeout' => 300]);
            $response = $client->get("{$baseUrl}/api/printing/approved");
            $data = json_decode((string) $response->getBody(), true) ?: [];

            if (empty($data['success'])) {
                return response()->json(['message' => 'Failed to fetch approved cards from capture app', 'synced' => 0], 500);
            }

            $approvedCards = $data['cards'] ?? [];
            $synced = 0;

            foreach ($approvedCards as $card) {
                $identifier = $card['matric_no'] ?? $card['staff_id'] ?? null;
                $fullName = trim(($card['surname'] ?? '').' '.($card['other_names'] ?? ''));

                $exists = DB::table('id_cards')
                    ->where('matric_number', $identifier)
                    ->orWhere(function ($q) use ($identifier, $fullName) {
                        $q->whereNull('matric_number')->where('full_name', $fullName);
                    })
                    ->exists();

                if ($exists) {
                    continue;
                }

                try {
                    DB::table('id_cards')->insert([
                        'matric_number' => $identifier,
                        'full_name' => $fullName,
                        'faculty' => $card['faculty'] ?? null,
                        'department' => $card['department'] ?? null,
                        'level' => $card['level'] ?? null,
                        'photo_url' => ! empty($card['passport_photo']) ? 'capture_app_photo' : null,
                        'signature_url' => ! empty($card['signature']) ? 'capture_app_signature' : null,
                        'status' => 'pending',
                        'notes' => "Synced from capture app - Card ID: {$card['id']}",
                        'captured_by' => $user['id'],
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $synced++;
                } catch (\Throwable $e) {
                    report($e);
                }
            }

            if ($synced > 0) {
                ActivityLogger::log($user['id'], 'CARDS_SYNCED', "Synced {$synced} approved cards from capture app");
            }

            return response()->json([
                'success' => true,
                'message' => $synced > 0 ? "Synced {$synced} card(s)" : 'No new cards to sync',
                'synced' => $synced,
                'total' => count($approvedCards),
            ]);
        } catch (ConnectException $e) {
            return response()->json([
                'message' => 'Capture app is not available. Please ensure it is running.',
                'synced' => 0,
            ], 503);
        } catch (\Throwable $e) {
            return response()->json(['message' => 'Error syncing approved cards', 'error' => $e->getMessage(), 'synced' => 0], 500);
        }
    }
}
