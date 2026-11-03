<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class User extends Model
{
    protected $table = 'users';

    protected $fillable = [
        'name', 'staff_id', 'username', 'password', 'role', 'permissions', 'must_change_password',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return [
            'permissions' => 'array',
            'must_change_password' => 'boolean',
        ];
    }
}
