<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('print_queue', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('card_id');
            $table->string('surname');
            $table->string('other_names');
            $table->string('matric_no', 50)->nullable();
            $table->string('staff_id', 50)->nullable();
            $table->string('faculty')->nullable();
            $table->string('department')->nullable();
            $table->string('level', 50)->nullable();
            $table->string('card_number', 50)->nullable();
            $table->string('session', 50)->nullable();
            $table->binary('passport_photo')->nullable();
            $table->enum('status', ['queued', 'printing', 'printed', 'failed'])->default('queued');
            $table->timestamp('added_to_queue_at')->useCurrent();
            $table->timestamp('printed_at')->nullable();
            $table->foreignId('printed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->integer('print_attempts')->default(0);
            $table->text('last_error')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index('card_id');
        });

        Schema::create('print_queue_exclusions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('card_id')->unique();
            $table->string('reason', 50);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('print_queue_exclusions');
        Schema::dropIfExists('print_queue');
    }
};
