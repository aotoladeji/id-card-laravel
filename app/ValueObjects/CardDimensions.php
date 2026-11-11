<?php

namespace App\ValueObjects;

/**
 * Card dimensions and unit conversion constants.
 * 
 * The card canvas is 336 × 212 units (85.6 × 54 mm, 242.9 × 153.3 pt).
 * One unit ≈ 0.255 mm ≈ 0.7222 pt, or 3.925 units per mm.
 * All positions are measured from the card's top-left corner.
 */
class CardDimensions
{
    // Canvas dimensions in card units
    public const CANVAS_WIDTH_UNITS = 336;
    public const CANVAS_HEIGHT_UNITS = 212;

    // Unit conversion factors
    public const UNIT_TO_MM = 0.255;
    public const UNIT_TO_PT = 0.7222;
    public const UNITS_PER_MM = 3.925;

    // DPI for print quality
    public const DPI = 300;

    // Pixels per mm at 300 DPI (300 / 25.4)
    public const PIXELS_PER_MM = 11.811024;

    // Text field positions (x from left edge, baseline y from top)
    public const TEXT_FIELDS = [
        'matric' => ['x' => 70, 'y' => 72, 'size' => 30.0, 'bold' => true],
        'surname' => ['x' => 70, 'y' => 90.5, 'size' => 30.0, 'bold' => true],
        'other_names' => ['x' => 70, 'y' => 109.5, 'size' => 30.0, 'bold' => true],
        'faculty' => ['x' => 70, 'y' => 127.5, 'size' => 30.0, 'bold' => true],
        'department' => ['x' => 70, 'y' => 144.5, 'size' => 30.0, 'bold' => true],
        'level' => ['x' => 70, 'y' => 164.5, 'size' => 30.0, 'bold' => true],
        'hall' => ['x' => 70, 'y' => 181, 'size' => 30.0, 'bold' => true],
        'card_number' => ['x' => 7.2, 'y' => 204.5, 'size' => 30.0, 'bold' => true],
        'session' => ['x' => 329.5, 'y' => 173, 'size' => 30.0, 'bold' => true, 'rotation' => 90],
    ];

    // Text overflow handling
    public const TEXT_MAX_WIDTH_UNITS = 155;  // Space before photo
    public const TEXT_MIN_FONT_SIZE_UNITS = 6;

    // Passport photo frame (in card units)
    public const PHOTO_X = 234;
    public const PHOTO_Y = 88;
    public const PHOTO_WIDTH = 78;
    public const PHOTO_HEIGHT = 96;

    // Signature box (in card units)
    public const SIGNATURE_X = 234;
    public const SIGNATURE_Y = 186;
    public const SIGNATURE_WIDTH = 78;
    public const SIGNATURE_HEIGHT = 22;

    // Barcode position (in card units)
    public const BARCODE_X = 144;
    public const BARCODE_Y = 192;

    // Face detection and reframing parameters
    public const FACE_HEIGHT_PERCENT = 0.63;  // Face height = 63% of frame (reduced to prevent cropping)
    public const FACE_CHIN_PERCENT = 0.71;    // Chin at 71% down frame
    public const FACE_CENTER_X = 273;         // Face horizontally centered

    // Dark photo enhancement
    public const DARK_THRESHOLD = 75;         // Brightness < 75/255 is dark
    public const DARK_TARGET_BRIGHTNESS = 100;
    public const DARK_MAX_LIFT = 2.5;

    /**
     * Convert card units to pixels at 300 DPI.
     */
    public static function unitsToPixels(float $units): int
    {
        $mm = $units * self::UNIT_TO_MM;
        return (int) round($mm * self::PIXELS_PER_MM);
    }

    /**
     * Convert card units to points.
     */
    public static function unitsToPoints(float $units): float
    {
        return $units * self::UNIT_TO_PT;
    }

    /**
     * Get canvas dimensions in pixels.
     */
    public static function getCanvasPixels(): array
    {
        return [
            'width' => self::unitsToPixels(self::CANVAS_WIDTH_UNITS),
            'height' => self::unitsToPixels(self::CANVAS_HEIGHT_UNITS),
        ];
    }

    /**
     * Get photo frame dimensions in pixels.
     */
    public static function getPhotoFramePixels(): array
    {
        return [
            'x' => self::unitsToPixels(self::PHOTO_X),
            'y' => self::unitsToPixels(self::PHOTO_Y),
            'width' => self::unitsToPixels(self::PHOTO_WIDTH),
            'height' => self::unitsToPixels(self::PHOTO_HEIGHT),
        ];
    }

    /**
     * Get signature box dimensions in pixels.
     */
    public static function getSignatureBoxPixels(): array
    {
        return [
            'x' => self::unitsToPixels(self::SIGNATURE_X),
            'y' => self::unitsToPixels(self::SIGNATURE_Y),
            'width' => self::unitsToPixels(self::SIGNATURE_WIDTH),
            'height' => self::unitsToPixels(self::SIGNATURE_HEIGHT),
        ];
    }

    /**
     * Get barcode position in pixels.
     */
    public static function getBarcodePixels(): array
    {
        return [
            'x' => self::unitsToPixels(self::BARCODE_X),
            'y' => self::unitsToPixels(self::BARCODE_Y),
        ];
    }

    /**
     * Get text field position in pixels with font size in points.
     */
    public static function getTextFieldPixels(string $field): ?array
    {
        if (!isset(self::TEXT_FIELDS[$field])) {
            return null;
        }

        $config = self::TEXT_FIELDS[$field];
        return [
            'x' => self::unitsToPixels($config['x']),
            'y' => self::unitsToPixels($config['y']),
            'size_pt' => self::unitsToPoints($config['size']),
            'size_units' => $config['size'],
            'bold' => $config['bold'],
            'rotation' => $config['rotation'] ?? 0,
        ];
    }
}
