<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('faulty_deliveries', function (Blueprint $table) {
            $table->id();
            $table->string('item_name');
            $table->integer('quantity');
            $table->text('issue_description');
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('status', ['pending', 'acknowledged', 'resolved'])->default('pending');
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('resolved_at')->nullable();
            $table->text('resolution_notes')->nullable();
        });

        // Referenced by usersController::deleteUser in the original app.
        Schema::create('faulty_inventory_logs', function (Blueprint $table) {
            $table->id();
            $table->string('item_name')->nullable();
            $table->integer('quantity')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('reported_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('faulty_inventory_logs');
        Schema::dropIfExists('faulty_deliveries');
    }
};
