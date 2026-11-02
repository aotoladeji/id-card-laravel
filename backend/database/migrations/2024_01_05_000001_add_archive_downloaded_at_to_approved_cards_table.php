<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Remembers when a supervisor downloaded a backup ZIP containing this card.
 * The Printed Cards Archive only allows deleting cards that have been backed up.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('approved_cards', 'archive_downloaded_at')) {
            Schema::table('approved_cards', function (Blueprint $table) {
                $table->timestamp('archive_downloaded_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('approved_cards', 'archive_downloaded_at')) {
            Schema::table('approved_cards', function (Blueprint $table) {
                $table->dropColumn('archive_downloaded_at');
            });
        }
    }
};
