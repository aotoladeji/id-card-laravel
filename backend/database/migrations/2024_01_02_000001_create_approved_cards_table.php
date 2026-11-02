<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('approved_cards', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('card_id')->unique();
            $table->string('surname');
            $table->string('other_names');
            $table->string('matric_no', 50)->nullable();
            $table->string('staff_id', 50)->nullable();
            $table->string('faculty')->nullable();
            $table->string('department')->nullable();
            $table->string('level', 50)->nullable();
            $table->string('card_number', 50)->nullable();
            $table->string('session', 50)->nullable();
            // Postgres BYTEA -> MySQL LONGBLOB (binary passport photo)
            $table->binary('passport_photo')->nullable();
            $table->timestamp('approved_at')->useCurrent();
            $table->timestamp('synced_from_capture_app_at')->nullable();
            $table->timestamps();

            $table->index('matric_no');
            $table->index('staff_id');
            $table->index('surname');
            $table->index('approved_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('approved_cards');
    }
};
