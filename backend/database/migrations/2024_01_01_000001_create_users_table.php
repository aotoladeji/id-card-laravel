<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('staff_id', 50)->unique();
            $table->string('username', 100)->unique();
            $table->string('password');
            $table->enum('role', ['admin', 'supervisor', 'staff']);
            // Postgres TEXT[] -> JSON array of permission strings on MySQL.
            $table->json('permissions')->nullable();
            $table->boolean('must_change_password')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};
