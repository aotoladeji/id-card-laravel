<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // Marks records that were corrected by a supervisor in this app. The
        // capture-app sync must not overwrite these, otherwise edits made in
        // "Reprint Approvals" / "Card Approval" vanish on the next sync.
        Schema::table('approved_cards', function (Blueprint $table) {
            $table->timestamp('manually_edited_at')->nullable();
        });

        Schema::table('print_queue', function (Blueprint $table) {
            $table->timestamp('manually_edited_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('print_queue', function (Blueprint $table) {
            $table->dropColumn('manually_edited_at');
        });

        Schema::table('approved_cards', function (Blueprint $table) {
            $table->dropColumn('manually_edited_at');
        });
    }
};
