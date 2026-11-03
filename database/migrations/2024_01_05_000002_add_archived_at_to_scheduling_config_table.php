<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Archived" schedules are hidden from the normal list but keep ALL their data
 * (students, time slots, appointments). Used when a supervisor chooses to keep
 * the data while deleting a schedule or replacing it with a new batch.
 */
return new class extends Migration {
    public function up(): void
    {
        if (! Schema::hasColumn('scheduling_config', 'archived_at')) {
            Schema::table('scheduling_config', function (Blueprint $table) {
                $table->timestamp('archived_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('scheduling_config', 'archived_at')) {
            Schema::table('scheduling_config', function (Blueprint $table) {
                $table->dropColumn('archived_at');
            });
        }
    }
};
