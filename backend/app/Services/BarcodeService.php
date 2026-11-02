<?php

namespace App\Services;

use App\ValueObjects\CardDimensions;
use GdImage;
use Picqer\Barcode\Types\TypeCode128;
use Picqer\Barcode\Renderers\PngRenderer;

/**
 * Handles barcode generation for card numbers.
 */
class BarcodeService
{
    public function renderBarcode(GdImage $cardImage, string $cardNumber): void
    {
        if (empty($cardNumber)) {
            return; // No barcode if no card number
        }

        try {
            // Generate barcode
            $barcode = (new TypeCode128())->getBarcode($cardNumber);
            $renderer = new PngRenderer();

            // Generate barcode at appropriate width (integer multiple of barcode width)
            $widthMultiplier = 2;
            $barcodeWidth = $barcode->getWidth() * $widthMultiplier;
            $barcodeHeight = 60;

            $barcodeData = $renderer->render($barcode, $barcodeWidth, $barcodeHeight);

            $barcodeImage = imagecreatefromstring($barcodeData);
            if (!$barcodeImage) {
                throw new \RuntimeException('Failed to create barcode image');
            }

            // Get barcode dimensions
            $actualWidth = imagesx($barcodeImage);
            $actualHeight = imagesy($barcodeImage);

            // Get position on card
            $position = CardDimensions::getBarcodePixels();
            $x = $position['x'];
            $y = $position['y'];

            // Copy barcode onto card
            imagecopy($cardImage, $barcodeImage, $x, $y, 0, 0, $actualWidth, $actualHeight);

            imagedestroy($barcodeImage);
        } catch (\Exception $e) {
            // Log but don't fail card generation if barcode fails
            \Log::warning('Barcode generation failed', [
                'card_number' => $cardNumber,
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Validate a card number for barcode generation.
     */
    public function isValidCardNumber(string $cardNumber): bool
    {
        // Code128 can encode most ASCII characters
        return !empty($cardNumber) && strlen($cardNumber) <= 80;
    }
}
