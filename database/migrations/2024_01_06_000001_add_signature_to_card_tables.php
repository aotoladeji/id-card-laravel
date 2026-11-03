<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('approved_cards', function (Blueprint $table) {
            $table->binary('signature')->nullable();
        });

        Schema::table('print_queue', function (Blueprint $table) {
            $table->binary('signature')->nullable();
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement('ALTER TABLE approved_cards MODIFY signature LONGBLOB NULL');
            DB::statement('ALTER TABLE print_queue MODIFY signature LONGBLOB NULL');
        }
    }

    public function down(): void
    {
        Schema::table('print_queue', function (Blueprint $table) {
            $table->dropColumn('signature');
        });

        Schema::table('approved_cards', function (Blueprint $table) {
            $table->dropColumn('signature');
        });
    }
};
