<?php

namespace App\Services;

use App\ValueObjects\CardDimensions;
use GdImage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Main service for generating ID card images with precise dimensions.
 */
class CardGenerationService
{
    public function __construct(
        private PhotoProcessingService $photoProcessing,
        private TextRenderingService $textRendering,
        private BarcodeService $barcode
    ) {}

    /**
     * Generate a complete ID card image from card data.
     *
     * @param object $card Card data from approved_cards or print_queue
     * @return string PNG binary data
     */
    public function generateCardImage(object $card): string
    {
        $startTime = microtime(true);

        // Create canvas
        $canvas = $this->createCanvas();

        // Process and place passport photo
        if (!empty($card->passport_photo)) {
            $this->placePassportPhoto($canvas, $card->passport_photo);
        }

        if (!empty($card->signature)) {
            $this->placeSignature($canvas, $card->signature);
        }

        // Render all text fields
        $this->renderAllTextFields($canvas, $card);

        // Render barcode
        if (!empty($card->card_number)) {
            $this->barcode->renderBarcode($canvas, $card->card_number);
        }

        // Convert to PNG
        ob_start();
        imagepng($canvas, null, 9); // Max compression
        $png = ob_get_clean();
        imagedestroy($canvas);

        $duration = round((microtime(true) - $startTime) * 1000, 2);
        Log::info('Generated card image', [
            'card_id' => $card->card_id ?? 'unknown',
            'duration_ms' => $duration,
            'size_bytes' => strlen($png),
        ]);

        return $png;
    }

    /**
     * Generate card image with caching.
     *
     * @param object $card Card data
     * @param bool $forceRegenerate Bypass cache
     * @return string PNG binary data
     */
    public function generateWithCache(object $card, bool $forceRegenerate = false): string
    {
        $cacheKey = $this->getCacheKey($card);
        
        if (!$forceRegenerate && Storage::exists($cacheKey)) {
            Log::debug('Card image served from cache', ['cache_key' => $cacheKey]);
            return Storage::get($cacheKey);
        }

        $png = $this->generateCardImage($card);
        
        // Store in cache
        Storage::put($cacheKey, $png);
        
        return $png;
    }

    /**
     * Clear cached image for a card.
     */
    public function clearCache(string $cardId): void
    {
        $pattern = "card-images/{$cardId}*.png";
        $files = Storage::files('card-images');
        
        foreach ($files as $file) {
            if (str_starts_with(basename($file), $cardId)) {
                Storage::delete($file);
            }
        }
    }

    private function placeSignature(GdImage $canvas, string $signatureBlob): void
    {
        $signature = @imagecreatefromstring($signatureBlob);
        if (!$signature) {
            Log::warning('Failed to load captured card signature');

            return;
        }

        $bounds = CardDimensions::getSignatureBoxPixels();
        $scale = min(
            $bounds['width'] / imagesx($signature),
            $bounds['height'] / imagesy($signature)
        );
        $width = max(1, (int) round(imagesx($signature) * $scale));
        $height = max(1, (int) round(imagesy($signature) * $scale));
        $x = $bounds['x'] + intdiv($bounds['width'] - $width, 2);
        $y = $bounds['y'] + intdiv($bounds['height'] - $height, 2);

        imagecopyresampled(
            $canvas,
            $signature,
            $x,
            $y,
            0,
            0,
            $width,
            $height,
            imagesx($signature),
            imagesy($signature)
        );

        imagedestroy($signature);
    }

    /**
     * Create blank white canvas at card dimensions.
     */
    private function createCanvas(): GdImage
    {
        $dimensions = CardDimensions::getCanvasPixels();
        $canvas = imagecreatetruecolor($dimensions['width'], $dimensions['height']);
        
        if (!$canvas) {
            throw new \RuntimeException('Failed to create card canvas');
        }

        // Fill with white
        $white = imagecolorallocate($canvas, 255, 255, 255);
        imagefill($canvas, 0, 0, $white);

        return $canvas;
    }

    /**
     * Process and place passport photo on card.
     */
    private function placePassportPhoto(GdImage $canvas, string $photoBlob): void
    {
        try {
            $processedPhoto = $this->photoProcessing->processPhoto($photoBlob);
            $position = CardDimensions::getPhotoFramePixels();

            imagecopy(
                $canvas,
                $processedPhoto,
                $position['x'],
                $position['y'],
                0,
                0,
                $position['width'],
                $position['height']
            );

            imagedestroy($processedPhoto);
        } catch (\Exception $e) {
            Log::error('Failed to process passport photo', ['error' => $e->getMessage()]);
            // Continue without photo rather than failing entire card
        }
    }

    /**
     * Render all text fields on the card.
     */
    private function renderAllTextFields(GdImage $canvas, object $card): void
    {
        $fields = [
            'matric' => $card->matric_no ?? $card->staff_id ?? '',
            'surname' => $card->surname ?? '',
            'other_names' => $card->other_names ?? '',
            'faculty' => $card->faculty ?? '',
            'department' => $card->department ?? '',
            'level' => $card->level ?? '',
            'hall' => $card->hall ?? '',
            'card_number' => $card->card_number ?? '',
        ];

        foreach ($fields as $fieldName => $value) {
            if (!empty($value)) {
                try {
                    $actualSize = $this->textRendering->renderTextField($canvas, $fieldName, (string)$value);
                    
                    if ($actualSize < CardDimensions::TEXT_FIELDS[$fieldName]['size']) {
                        Log::debug('Text shrunk to fit', [
                            'field' => $fieldName,
                            'text' => $value,
                            'original_size' => CardDimensions::TEXT_FIELDS[$fieldName]['size'],
                            'actual_size' => round($actualSize, 2),
                        ]);
                    }
                } catch (\Exception $e) {
                    Log::error('Failed to render text field', [
                        'field' => $fieldName,
                        'error' => $e->getMessage(),
                    ]);
                }
            }
        }

        // Session text (rotated)
        if (!empty($card->session)) {
            try {
                $this->textRendering->renderSessionText($canvas, (string)$card->session);
            } catch (\Exception $e) {
                Log::error('Failed to render session text', ['error' => $e->getMessage()]);
            }
        }
    }

    /**
     * Generate cache key for a card.
     */
    private function getCacheKey(object $card): string
    {
        $cardId = $card->card_id ?? 'unknown';

        // Hash binary images separately so their contents participate in the cache key.
        $fields = ['surname', 'other_names', 'matric_no', 'staff_id', 'faculty', 'department', 'level', 'card_number', 'session', 'hall'];
        $data = [];
        foreach ($fields as $field) {
            $data[$field] = $card->{$field} ?? null;
        }
        $data['photo'] = md5((string) ($card->passport_photo ?? ''));
        $data['signature'] = md5((string) ($card->signature ?? ''));
        $hash = md5(json_encode($data));

        return "card-images/{$cardId}-v4-{$hash}.png";
    }
}
