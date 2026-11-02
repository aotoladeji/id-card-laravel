<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * These two tables (scheduling_slots / scheduling_bookings) existed in the
 * original Postgres schema (database-migration-print-collections.sql) as an
 * earlier/parallel scheduling design. They are not driven by any controller
 * logic in the current app (the active system is scheduling_config /
 * scheduled_students / time_slots / appointments), but are preserved here
 * for schema parity since backend/controllers/developerResetController.js
 * references them directly (TRUNCATE ... scheduling_bookings).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('scheduling_slots', function (Blueprint $table) {
            $table->id();
            $table->date('slot_date');
            $table->time('slot_time');
            $table->integer('capacity')->default(10);
            $table->integer('booked')->default(0);
            $table->enum('status', ['available', 'full', 'closed'])->default('available');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['slot_date', 'slot_time']);
        });

        Schema::create('scheduling_bookings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('slot_id')->constrained('scheduling_slots')->cascadeOnDelete();
            $table->string('student_name');
            $table->string('matric_number', 50);
            $table->string('email');
            $table->string('phone', 50)->nullable();
            $table->enum('status', ['confirmed', 'cancelled', 'completed'])->default('confirmed');
            $table->string('booking_code', 50)->unique();
            $table->timestamp('booked_at')->useCurrent();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->text('notes')->nullable();

            $table->index('matric_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduling_bookings');
        Schema::dropIfExists('scheduling_slots');
    }
};
