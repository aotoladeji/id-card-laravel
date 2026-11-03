<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('scheduling_config', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('type', 50)->default('appointment');
            $table->integer('slots_per_period')->default(0);
            $table->boolean('is_active')->default(true);
            $table->boolean('is_closed')->default(false);
            $table->date('start_date');
            $table->date('end_date');
            $table->time('daily_start_time')->default('09:00:00');
            $table->time('daily_end_time')->default('17:00:00');
            $table->boolean('exclude_weekends')->default(true);
            $table->text('location')->nullable();
            $table->text('important_message')->nullable();
            $table->integer('slots_per_day')->default(8);
            $table->integer('max_capacity')->default(1000);
            $table->integer('default_slot_capacity')->default(5);
            $table->timestamps();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduling_config');
    }
};
