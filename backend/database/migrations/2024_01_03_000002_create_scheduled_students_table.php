<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('scheduled_students', function (Blueprint $table) {
            $table->id();
            $table->foreignId('config_id')->constrained('scheduling_config')->cascadeOnDelete();
            $table->string('full_name');
            $table->string('email')->nullable();
            $table->string('phone', 50)->nullable();
            $table->string('matric_number', 50)->nullable();
            $table->string('jamb_number', 50)->nullable();
            $table->string('pg_reg_number', 50)->nullable();
            $table->string('faculty')->nullable();
            $table->string('department')->nullable();
            $table->string('level', 50)->nullable();
            $table->string('login_code', 6)->nullable();
            $table->string('capture_login_code', 6)->nullable()->unique();
            $table->boolean('email_sent')->default(false);
            $table->boolean('has_scheduled')->default(false);
            $table->date('scheduled_date')->nullable();
            $table->time('scheduled_time')->nullable();
            $table->timestamps();

            $table->unique(['config_id', 'jamb_number', 'pg_reg_number'], 'unique_student_per_config');
            $table->index('matric_number');
            $table->index('jamb_number');
            $table->index('pg_reg_number');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('scheduled_students');
    }
};
