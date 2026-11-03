<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('material_requests', function (Blueprint $table) {
            $table->id();
            $table->string('item_name');
            $table->integer('quantity');
            $table->enum('urgency', ['normal', 'high', 'urgent'])->default('normal');
            $table->enum('status', ['pending', 'approved', 'rejected', 'fulfilled', 'queried'])->default('pending');
            $table->foreignId('requested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('responded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('response_message')->nullable();
            // Query / reply workflow (from queryMaterialRequest / replyToQuery in materialController.js)
            $table->text('query_message')->nullable();
            $table->foreignId('queried_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('queried_at')->nullable();
            $table->text('query_reply')->nullable();
            $table->timestamp('query_replied_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('responded_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('material_requests');
    }
};
