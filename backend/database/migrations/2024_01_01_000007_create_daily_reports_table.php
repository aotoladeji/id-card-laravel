<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('daily_reports', function (Blueprint $table) {
            $table->id();
            $table->date('report_date');
            $table->integer('cards_captured')->default(0);
            $table->integer('cards_approved')->default(0);
            $table->integer('cards_printed')->default(0);
            $table->integer('cards_collected')->default(0);
            $table->text('issues_encountered')->nullable();
            $table->json('inventory_used')->nullable();
            $table->foreignId('submitted_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('verification_status', ['pending', 'verified', 'rejected'])->default('pending');
            $table->text('supervisor_remarks')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('verified_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_reports');
    }
};
