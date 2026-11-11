<?php

namespace App\Services;

use App\ValueObjects\CardDimensions;
use GdImage;

/**
 * Handles text rendering with Times New Roman, shrink-to-fit logic, and rotation.
 */
class TextRenderingService
{
    private string $boldFontPath;
    private string $regularFontPath;

    public function __construct()
    {
        $this->boldFontPath = storage_path('app/fonts/timesbd.ttf');
        $this->regularFontPath = storage_path('app/fonts/times.ttf');

        if (!file_exists($this->boldFontPath)) {
            throw new \RuntimeException("Bold font not found at {$this->boldFontPath}");
        }
        if (!file_exists($this->regularFontPath)) {
            throw new \RuntimeException("Regular font not found at {$this->regularFontPath}");
        }
    }

    /**
     * Render text on the card image at the specified field position.
     *
     * @param GdImage $image Card canvas
     * @param string $field Field name (e.g., 'matric', 'surname')
     * @param string $text Text to render
     * @return float Actual font size used (in units)
     */
    public function renderTextField(GdImage $image, string $field, string $text): float
    {
        $config = CardDimensions::getTextFieldPixels($field);
        if (!$config) {
            throw new \InvalidArgumentException("Unknown text field: {$field}");
        }

        $fontPath = $config['bold'] ? $this->boldFontPath : $this->regularFontPath;
        $baseX = $config['x'];
        $baseY = $config['y'];
        $baseSizeUnits = $config['size_units'];
        $baseSizePt = $config['size_pt'];
        $rotation = $config['rotation'];

        // Calculate maximum width in pixels
        $maxWidthPixels = CardDimensions::unitsToPixels(CardDimensions::TEXT_MAX_WIDTH_UNITS);
        $minSizeUnits = CardDimensions::TEXT_MIN_FONT_SIZE_UNITS;

        // Find the right font size with shrink-to-fit
        $currentSizeUnits = $baseSizeUnits;
        $currentSizePt = $baseSizePt;

        while ($currentSizeUnits >= $minSizeUnits) {
            $bbox = imagettfbbox($currentSizePt, $rotation, $fontPath, $text);
            if ($bbox === false) {
                throw new \RuntimeException("Failed to calculate text bounding box for: {$text}");
            }

            $textWidth = abs($bbox[2] - $bbox[0]);

            if ($textWidth <= $maxWidthPixels) {
                break; // Text fits
            }

            // Shrink by 5%
            $currentSizeUnits *= 0.95;
            $currentSizePt = CardDimensions::unitsToPoints($currentSizeUnits);

            if ($currentSizeUnits < $minSizeUnits) {
                $currentSizeUnits = $minSizeUnits;
                $currentSizePt = CardDimensions::unitsToPoints($minSizeUnits);
                break;
            }
        }

        // Render the text with multiple overlays for bolder appearance
        $black = imagecolorallocate($image, 0, 0, 0);
        
        // Determine number of overlays based on field type
        // Fields with 16.6 units (matric, level, hall) need extra boldness
        $needsExtraBold = in_array($field, ['matric', 'level', 'hall']);
        
        if ($needsExtraBold) {
            // 5-6 passes for extra bold fields
            imagettftext($image, $currentSizePt, $rotation, $baseX, $baseY, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX + 1, $baseY, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX, $baseY + 1, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX + 1, $baseY + 1, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX + 2, $baseY, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX, $baseY + 2, $black, $fontPath, $text);
        } else {
            // 4 passes for standard fields
            imagettftext($image, $currentSizePt, $rotation, $baseX, $baseY, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX + 1, $baseY, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX, $baseY + 1, $black, $fontPath, $text);
            imagettftext($image, $currentSizePt, $rotation, $baseX + 1, $baseY + 1, $black, $fontPath, $text);
        }

        return $currentSizeUnits;
    }

    /**
     * Render rotated text for the session field (bottom-to-top).
     * GD angles are counter-clockwise: +90 runs the text upward from the
     * baseline anchor, so (x, y) is the bottom of the text (y=173).
     */
    public function renderSessionText(GdImage $image, string $text): void
    {
        $config = CardDimensions::getTextFieldPixels('session');
        if (!$config) {
            throw new \RuntimeException("Session field configuration not found");
        }

        $fontPath = $this->boldFontPath;
        $baselineX = $config['x'];
        $startY = $config['y']; // Bottom of text (y=173)
        $sizePt = $config['size_pt'];
        $rotation = $config['rotation']; // 90 degrees — reads bottom-to-top

        $black = imagecolorallocate($image, 0, 0, 0);

        // For +90° rotation, text runs upward from the anchor: the anchor
        // is the baseline of the first (bottom) glyph, ink extends up from
        // it and to the left of the baseline x.
        // Apply multiple overlays for bolder appearance
        imagettftext($image, $sizePt, $rotation, $baselineX, $startY, $black, $fontPath, $text);
        imagettftext($image, $sizePt, $rotation, $baselineX + 1, $startY, $black, $fontPath, $text);
        imagettftext($image, $sizePt, $rotation, $baselineX, $startY + 1, $black, $fontPath, $text);
        imagettftext($image, $sizePt, $rotation, $baselineX + 1, $startY + 1, $black, $fontPath, $text);
    }

    /**
     * Calculate the actual width a text would occupy at given size.
     *
     * @param string $text Text to measure
     * @param float $sizePt Font size in points
     * @param bool $bold Use bold font
     * @return int Width in pixels
     */
    public function getTextWidth(string $text, float $sizePt, bool $bold = true): int
    {
        $fontPath = $bold ? $this->boldFontPath : $this->regularFontPath;
        $bbox = imagettfbbox($sizePt, 0, $fontPath, $text);
        
        if ($bbox === false) {
            return 0;
        }

        return abs($bbox[2] - $bbox[0]);
    }
}
