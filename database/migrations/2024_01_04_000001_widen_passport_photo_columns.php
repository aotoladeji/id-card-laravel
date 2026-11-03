<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration {
    public function up(): void
    {
        // `binary()` created plain BLOB columns (64KB max) — passport photos
        // synced from the capture app are larger than that, causing "Data too
        // long for column 'passport_photo'" on every sync and silently dropping
        // approved cards from the print queue.
        DB::statement('ALTER TABLE approved_cards MODIFY passport_photo LONGBLOB NULL');
        DB::statement('ALTER TABLE print_queue MODIFY passport_photo LONGBLOB NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE approved_cards MODIFY passport_photo BLOB NULL');
        DB::statement('ALTER TABLE print_queue MODIFY passport_photo BLOB NULL');
    }
};
