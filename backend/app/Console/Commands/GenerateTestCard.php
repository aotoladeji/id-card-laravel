<?php

namespace App\Console\Commands;

use App\Services\CardGenerationService;
use App\ValueObjects\CardDimensions;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class GenerateTestCard extends Command
{
    protected $signature = 'card:generate-test {cardId}';
    protected $description = 'Generate a test ID card image for verification';

    public function __construct(
        private CardGenerationService $cardGeneration
    ) {
        parent::__construct();
    }

    public function handle()
    {
        $cardId = $this->argument('cardId');

        $this->info("Fetching card data for ID: {$cardId}");

        $card = DB::table('print_queue')->where('card_id', $cardId)->first();
        if (!$card) {
            $card = DB::table('approved_cards')->where('card_id', $cardId)->first();
        }

        if (!$card) {
            $this->error("Card not found for ID: {$cardId}");
            return 1;
        }

        $this->info("Found card: {$card->surname}, {$card->other_names}");
        
        $dimensions = CardDimensions::getCanvasPixels();
        $this->info("Canvas: {$dimensions['width']}×{$dimensions['height']} pixels @ 300 DPI");

        $startTime = microtime(true);

        try {
            $png = $this->cardGeneration->generateCardImage($card);
            $duration = round((microtime(true) - $startTime) * 1000, 2);

            // Save to test cards directory
            $filename = "test-cards/{$cardId}.png";
            Storage::put($filename, $png);

            $path = storage_path("app/{$filename}");
            $sizeKb = round(strlen($png) / 1024, 2);

            $this->newLine();
            $this->info("✓ Card generated successfully!");
            $this->info("  Duration: {$duration}ms");
            $this->info("  Size: {$sizeKb} KB");
            $this->info("  Path: {$path}");

            return 0;
        } catch (\Exception $e) {
            $this->error("Failed to generate card: " . $e->getMessage());
            $this->error($e->getTraceAsString());
            return 1;
        }
    }
}
