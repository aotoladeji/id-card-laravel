<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('scheduled_students', function (Blueprint $table) {
            $table->string('surname')->nullable()->after('full_name');
            $table->string('other_names')->nullable()->after('surname');
            // Every column imported from the uploaded Excel sheet, so the
            // capture app can use whatever field it needs without a schema change.
            $table->json('extra_fields')->nullable()->after('level');
        });
    }

    public function down(): void
    {
        Schema::table('scheduled_students', function (Blueprint $table) {
            $table->dropColumn(['surname', 'other_names', 'extra_fields']);
        });
    }
};
