<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('print_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('card_id');
            $table->string('surname');
            $table->string('other_names');
            $table->string('matric_no', 50)->nullable();
            $table->string('staff_id', 50)->nullable();
            $table->string('card_number', 50)->nullable();
            $table->timestamp('printed_at')->useCurrent();
            $table->foreignId('printed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('printer_name')->nullable();
            $table->string('print_quality', 50)->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index('card_id');
            $table->index('printed_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_history');
    }
};
