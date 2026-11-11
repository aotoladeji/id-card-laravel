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

    // Reference code constants
    private const CARD_MAX_TEXT_WIDTH = 155;  // SVG units available before the photo
    private const CARD_MIN_FONT_SIZE = 6;

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
     * Calculate Times New Roman Bold character width in em units.
     * Uses advance widths per 1000 em from the font metrics.
     *
     * @param string $text Text to measure
     * @return float Width in em units
     */
    private function timesBoldWidthEm(string $text): float
    {
        static $w = [
            ' ' => 250, '&' => 833, '-' => 333, '/' => 278, '.' => 250, ',' => 250,
            '(' => 333, ')' => 333, "'" => 278,
            'A' => 722, 'B' => 667, 'C' => 722, 'D' => 722, 'E' => 667, 'F' => 611, 'G' => 778,
            'H' => 778, 'I' => 389, 'J' => 500, 'K' => 778, 'L' => 667, 'M' => 944, 'N' => 722,
            'O' => 778, 'P' => 611, 'Q' => 778, 'R' => 722, 'S' => 556, 'T' => 667, 'U' => 722,
            'V' => 722, 'W' => 1000, 'X' => 722, 'Y' => 722, 'Z' => 667,
            'a' => 500, 'b' => 556, 'c' => 444, 'd' => 556, 'e' => 444, 'f' => 333, 'g' => 500,
            'h' => 556, 'i' => 278, 'j' => 333, 'k' => 556, 'l' => 278, 'm' => 833, 'n' => 556,
            'o' => 500, 'p' => 556, 'q' => 556, 'r' => 444, 's' => 389, 't' => 333, 'u' => 556,
            'v' => 500, 'w' => 722, 'x' => 500, 'y' => 500, 'z' => 444,
        ];
        $total = 0;
        $chars = preg_split('//u', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        foreach ($chars as $ch) {
            $total += ctype_digit($ch) ? 500 : ($w[$ch] ?? 550);
        }
        return $total / 1000;
    }

    /**
     * Calculate the optimal font size using Times New Roman Bold em-width metrics.
     * Implements shrink-to-fit logic from reference code.
     *
     * @param string $text Text to fit
     * @param float $size Initial font size in units
     * @return float Final font size in units
     */
    private function fitCardFontSize(string $text, float $size): float
    {
        $em = $this->timesBoldWidthEm($text);
        return $em > 0 ? max(self::CARD_MIN_FONT_SIZE, min($size, self::CARD_MAX_TEXT_WIDTH / $em)) : $size;
    }

    /**
     * Render text on the card image at the specified field position.
     * Uses single imagettftext() call with Times New Roman Bold font.
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
        $rotation = $config['rotation'];

        // Calculate optimal font size using em-width metrics
        $finalSizeUnits = $this->fitCardFontSize($text, $baseSizeUnits);
        $finalSizePt = CardDimensions::unitsToPoints($finalSizeUnits);

        // Render text with single imagettftext() call
        $black = imagecolorallocate($image, 0, 0, 0);
        imagettftext($image, $finalSizePt, $rotation, $baseX, $baseY, $black, $fontPath, $text);

        return $finalSizeUnits;
    }

    /**
     * Render rotated text for the session field (bottom-to-top).
     * GD angles are counter-clockwise: +90 runs the text upward from the
     * baseline anchor, so (x, y) is the bottom of the text (y=173).
     * Uses single imagettftext() call consistent with other fields.
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

        // Single imagettftext() call for clean, crisp rendering
        imagettftext($image, $sizePt, $rotation, $baselineX, $startY, $black, $fontPath, $text);
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
