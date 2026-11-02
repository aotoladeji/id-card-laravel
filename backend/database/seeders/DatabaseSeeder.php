<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Equivalent of the "DEFAULT ADMIN USER" insert at the bottom of
 * database-schema.sql. The original hash's plaintext password is unknown,
 * so this seeder creates a fresh admin account with a documented default
 * password that must be changed on first login (must_change_password=true).
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        if (DB::table('users')->where('username', 'MIS001')->exists()) {
            return;
        }

        DB::table('users')->insert([
            'name' => 'System Administrator',
            'staff_id' => 'ADMIN001',
            'username' => 'MIS001',
            'password' => Hash::make('ChangeMe123!'),
            'role' => 'admin',
            'permissions' => json_encode(['all']),
            'must_change_password' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->command->warn('Seeded default admin: username=MIS001 password=ChangeMe123! (must change on first login)');
    }
}
