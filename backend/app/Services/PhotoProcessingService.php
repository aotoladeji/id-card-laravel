<?php

namespace App\Services;

use App\ValueObjects\CardDimensions;
use GdImage;
use Illuminate\Support\Facades\Log;

/**
 * Handles passport photo processing: face detection, dark photo enhancement, and reframing.
 */
class PhotoProcessingService
{
    /**
     * Process a passport photo: detect face, enhance if dark, reframe to fit card specs.
     *
     * @param string $photoBlob Binary image data
     * @return GdImage Processed image at card photo frame dimensions
     */
    public function processPhoto(string $photoBlob): GdImage
    {
        $sourceImage = imagecreatefromstring($photoBlob);
        if (!$sourceImage) {
            throw new \RuntimeException('Failed to load passport photo from BLOB');
        }

        // Detect face
        $faceBox = $this->detectFace($sourceImage);

        // Enhance if dark
        if ($faceBox) {
            $brightness = $this->calculateFaceBrightness($sourceImage, $faceBox);
            if ($brightness < CardDimensions::DARK_THRESHOLD) {
                $this->enhanceDarkPhoto($sourceImage, $brightness);
            }
        }

        // Reframe and crop to card photo dimensions
        $framedImage = $this->reframePhoto($sourceImage, $faceBox);

        imagedestroy($sourceImage);

        return $framedImage;
    }

    /**
     * Simple face detection using brightness analysis.
     * Looks for a bright region in the upper portion of the image.
     *
     * @return array|null ['x', 'y', 'width', 'height'] or null if no face detected
     */
    private function detectFace(GdImage $image): ?array
    {
        $width = imagesx($image);
        $height = imagesy($image);

        // Sample a grid in the upper 60% of the image
        $scanHeight = (int)($height * 0.6);
        $stepX = max(1, (int)($width / 20));
        $stepY = max(1, (int)($scanHeight / 20));

        $brightestX = 0;
        $brightestY = 0;
        $maxBrightness = 0;

        for ($y = 0; $y < $scanHeight; $y += $stepY) {
            for ($x = 0; $x < $width; $x += $stepX) {
                $rgb = imagecolorat($image, $x, $y);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                $brightness = ($r + $g + $b) / 3;

                if ($brightness > $maxBrightness) {
                    $maxBrightness = $brightness;
                    $brightestX = $x;
                    $brightestY = $y;
                }
            }
        }

        // If we found a reasonably bright spot, assume it's the face
        if ($maxBrightness > 50) {
            // Estimate face box centered on brightest point
            $faceWidth = (int)($width * 0.6);
            $faceHeight = (int)($faceWidth * 1.2); // Face is typically taller than wide
            
            return [
                'x' => max(0, $brightestX - $faceWidth / 2),
                'y' => max(0, $brightestY - $faceHeight / 3), // Face center is above eyes
                'width' => min($faceWidth, $width),
                'height' => min($faceHeight, $height),
            ];
        }

        return null; // No face detected
    }

    /**
     * Calculate average brightness in the face region.
     */
    private function calculateFaceBrightness(GdImage $image, array $faceBox): float
    {
        $x = (int)$faceBox['x'];
        $y = (int)$faceBox['y'];
        $w = (int)$faceBox['width'];
        $h = (int)$faceBox['height'];

        $totalBrightness = 0;
        $sampleCount = 0;
        $step = max(1, (int)(min($w, $h) / 10));

        for ($py = $y; $py < $y + $h; $py += $step) {
            for ($px = $x; $px < $x + $w; $px += $step) {
                if ($px >= imagesx($image) || $py >= imagesy($image)) {
                    continue;
                }

                $rgb = imagecolorat($image, $px, $py);
                $r = ($rgb >> 16) & 0xFF;
                $g = ($rgb >> 8) & 0xFF;
                $b = $rgb & 0xFF;
                $totalBrightness += ($r + $g + $b) / 3;
                $sampleCount++;
            }
        }

        return $sampleCount > 0 ? $totalBrightness / $sampleCount : 128;
    }

    /**
     * Enhance a dark photo by increasing brightness and contrast.
     */
    private function enhanceDarkPhoto(GdImage $image, float $currentBrightness): void
    {
        // Calculate required lift, capped at max
        $requiredLift = CardDimensions::DARK_TARGET_BRIGHTNESS / max($currentBrightness, 1);
        $lift = min($requiredLift, CardDimensions::DARK_MAX_LIFT);

        // Apply brightness adjustment (range -255 to 255)
        $brightnessAdjust = (int)(($lift - 1) * 60);
        imagefilter($image, IMG_FILTER_BRIGHTNESS, $brightnessAdjust);

        // Apply slight contrast increase to maintain definition
        imagefilter($image, IMG_FILTER_CONTRAST, -15);

        Log::info('Enhanced dark photo', [
            'original_brightness' => round($currentBrightness, 2),
            'lift' => round($lift, 2),
            'adjustment' => $brightnessAdjust,
        ]);
    }

    /**
     * Reframe photo to match card specifications.
     * Face height should be 50% of frame height, chin at 71% down.
     */
    private function reframePhoto(GdImage $sourceImage, ?array $faceBox): GdImage
    {
        $framePixels = CardDimensions::getPhotoFramePixels();
        $frameWidth = $framePixels['width'];
        $frameHeight = $framePixels['height'];

        $framedImage = imagecreatetruecolor($frameWidth, $frameHeight);
        if (!$framedImage) {
            throw new \RuntimeException('Failed to create photo frame');
        }

        // Fill with white background
        $white = imagecolorallocate($framedImage, 255, 255, 255);
        imagefill($framedImage, 0, 0, $white);

        if (!$faceBox) {
            // No face detected - scale and center the original photo
            $this->scaleToCover($sourceImage, $framedImage, $frameWidth, $frameHeight);
            return $framedImage;
        }

        // Calculate zoom and position to achieve:
        // - Face height = 50% of frame height
        // - Chin at 71% down frame
        $targetFaceHeight = $frameHeight * CardDimensions::FACE_HEIGHT_PERCENT;
        $scale = $targetFaceHeight / $faceBox['height'];

        // Position so chin is at 71% down frame
        $chinY = $faceBox['y'] + $faceBox['height'];
        $targetChinY = $frameHeight * CardDimensions::FACE_CHIN_PERCENT;
        
        $scaledChinY = $chinY * $scale;
        $offsetY = $targetChinY - $scaledChinY;

        // Center face horizontally
        $faceCenterX = $faceBox['x'] + $faceBox['width'] / 2;
        $scaledFaceCenterX = $faceCenterX * $scale;
        $offsetX = ($frameWidth / 2) - $scaledFaceCenterX;

        // Copy and scale
        $srcWidth = imagesx($sourceImage);
        $srcHeight = imagesy($sourceImage);
        
        imagecopyresampled(
            $framedImage, $sourceImage,
            (int)$offsetX, (int)$offsetY,
            0, 0,
            (int)($srcWidth * $scale), (int)($srcHeight * $scale),
            $srcWidth, $srcHeight
        );

        return $framedImage;
    }

    /**
     * Scale source image to cover the frame (fill with no letterboxing).
     */
    private function scaleToCover(GdImage $source, GdImage $dest, int $destWidth, int $destHeight): void
    {
        $srcWidth = imagesx($source);
        $srcHeight = imagesy($source);

        $scaleX = $destWidth / $srcWidth;
        $scaleY = $destHeight / $srcHeight;
        $scale = max($scaleX, $scaleY);

        $newWidth = (int)($srcWidth * $scale);
        $newHeight = (int)($srcHeight * $scale);

        $offsetX = (int)(($destWidth - $newWidth) / 2);
        $offsetY = (int)(($destHeight - $newHeight) / 2);

        imagecopyresampled(
            $dest, $source,
            $offsetX, $offsetY,
            0, 0,
            $newWidth, $newHeight,
            $srcWidth, $srcHeight
        );
    }
}
