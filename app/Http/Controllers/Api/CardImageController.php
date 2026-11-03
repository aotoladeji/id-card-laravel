<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CardGenerationService;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

/**
 * Generates ID card images with precise dimensions using local card generation.
 * 
 * Replaced capture app proxy with CardGenerationService that implements
 * exact specifications: 336×212 units canvas, face detection, dark photo
 * enhancement, and precise text/photo positioning.
 */
class CardImageController extends Controller
{
    public function __construct(
        private CardGenerationService $cardGeneration
    ) {}
    /**
     * Fetch card data from database (print_queue or approved_cards).
     */
    private function getCardData(string $cardId): ?object
    {
        $card = DB::table('print_queue as pq')
            ->leftJoin('approved_cards as ac', 'ac.card_id', '=', 'pq.card_id')
            ->select('pq.*', 'ac.signature as approved_signature')
            ->where('pq.card_id', $cardId)
            ->first();

        if ($card) {
            $card->signature = $card->signature ?: $card->approved_signature;
            unset($card->approved_signature);

            return $card;
        }

        return DB::table('approved_cards')->where('card_id', $cardId)->first();
    }

    // GET /api/card-images/{cardId}/svg
    public function svg(string $cardId)
    {
        // SVG generation deprecated - redirect to PNG
        return $this->image($cardId);
    }

    // GET /api/card-images/{cardId}/image
    public function image(string $cardId)
    {
        $card = $this->getCardData($cardId);

        if (!$card) {
            return response()->json([
                'success' => false,
                'message' => "Card not found for ID {$cardId}.",
            ], 404);
        }

        try {
            $png = $this->cardGeneration->generateWithCache($card);

            return response($png, 200)
                ->header('Content-Type', 'image/png')
                ->header('Cache-Control', 'private, no-cache, must-revalidate');
        } catch (\Exception $e) {
            \Log::error('Card image generation failed', [
                'card_id' => $cardId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to generate card image: ' . $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Regenerate card image (clear cache and generate fresh).
     * POST /api/card-images/{cardId}/regenerate
     */
    public function regenerate(string $cardId)
    {
        $card = $this->getCardData($cardId);

        if (!$card) {
            return response()->json([
                'success' => false,
                'message' => "Card not found for ID {$cardId}.",
            ], 404);
        }

        try {
            $this->cardGeneration->clearCache($cardId);
            $png = $this->cardGeneration->generateCardImage($card);

            return response()->json([
                'success' => true,
                'message' => 'Card image regenerated successfully',
                'size_bytes' => strlen($png),
            ]);
        } catch (\Exception $e) {
            \Log::error('Card regeneration failed', [
                'card_id' => $cardId,
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to regenerate card image: ' . $e->getMessage(),
            ], 500);
        }
    }
}
