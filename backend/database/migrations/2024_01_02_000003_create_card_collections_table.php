<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('card_collections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('card_id');
            $table->string('surname');
            $table->string('other_names');
            $table->string('matric_no', 50)->nullable();
            $table->string('staff_id', 50)->nullable();
            $table->string('faculty')->nullable();
            $table->string('department')->nullable();
            $table->string('card_number', 50)->nullable();
            $table->timestamp('printed_at');
            $table->enum('status', ['awaiting_collection', 'collected'])->default('awaiting_collection');
            $table->timestamp('collected_at')->nullable();
            $table->foreignId('collected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('card_id');
            $table->index('matric_no');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('card_collections');
    }
};
