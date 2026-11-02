<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('time_slots', function (Blueprint $table) {
            $table->id();
            $table->foreignId('config_id')->constrained('scheduling_config')->cascadeOnDelete();
            $table->date('slot_date');
            $table->time('slot_time');
            $table->integer('capacity')->default(5);
            $table->integer('booked')->default(0);
            $table->boolean('is_available')->default(true);
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['config_id', 'slot_date', 'slot_time'], 'unique_slot');
            $table->index('slot_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('time_slots');
    }
};
