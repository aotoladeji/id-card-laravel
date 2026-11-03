<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Firebase\JWT\JWT;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class AuthController extends Controller
{
    // POST /api/auth/login
    public function login(Request $request)
    {
        $username = $request->input('username');
        $password = $request->input('password');

        if (! config('app.jwt_secret')) {
            return response()->json(['message' => 'Authentication service not configured'], 503);
        }

        if (! $username || ! $password) {
            return response()->json(['message' => 'Username and password are required'], 400);
        }

        $user = DB::table('users')->whereRaw('LOWER(username) = LOWER(?)', [$username])->first();

        if (! $user) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $storedPassword = (string) $user->password;
        if (! $storedPassword) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        // Supports bcrypt hashes ($2a$/$2b$/$2y$) and legacy plain-text values,
        // matching the fallback comparison in the original authController.js.
        if (Str::startsWith($storedPassword, ['$2a$', '$2b$', '$2y$'])) {
            $passwordMatch = Hash::check($password, $storedPassword);
        } else {
            $passwordMatch = hash_equals($storedPassword, (string) $password);
        }

        if (! $passwordMatch) {
            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $permissions = json_decode($user->permissions ?? '[]', true) ?: [];

        $payload = [
            'id' => $user->id,
            'username' => $user->username,
            'role' => $user->role,
            'permissions' => $permissions,
            'iat' => time(),
            'exp' => time() + (config('app.jwt_ttl_minutes') * 60),
        ];

        $token = JWT::encode($payload, config('app.jwt_secret'), 'HS256');

        ActivityLogger::log($user->id, 'LOGIN', "User {$user->username} logged in");

        $userWithoutPassword = (array) $user;
        unset($userWithoutPassword['password']);
        $userWithoutPassword['permissions'] = $permissions;

        return response()->json([
            'message' => 'Login successful',
            'token' => $token,
            'user' => $userWithoutPassword,
            'mustChangePassword' => (bool) $user->must_change_password,
        ]);
    }

    // PUT /api/auth/change-password
    public function changePassword(Request $request)
    {
        $currentPassword = $request->input('currentPassword');
        $newPassword = $request->input('newPassword');
        $userId = $request->attributes->get('authUser')['id'];

        if (! $currentPassword || ! $newPassword) {
            return response()->json(['message' => 'Current and new password are required'], 400);
        }

        if (strlen($newPassword) < 6) {
            return response()->json(['message' => 'Password must be at least 6 characters long'], 400);
        }

        $user = DB::table('users')->where('id', $userId)->first();

        if (! $user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if (! Hash::check($currentPassword, $user->password)) {
            return response()->json(['message' => 'Current password is incorrect'], 401);
        }

        DB::table('users')->where('id', $userId)->update([
            'password' => Hash::make($newPassword),
            'must_change_password' => false,
            'updated_at' => now(),
        ]);

        ActivityLogger::log($userId, 'PASSWORD_CHANGE', 'User changed their password');

        return response()->json(['message' => 'Password changed successfully']);
    }

    // POST /api/auth/register
    public function register(Request $request)
    {
        $requester = $request->attributes->get('authUser');

        $name = $request->input('name');
        $staffId = $request->input('staffId');
        $username = $request->input('username');
        $password = $request->input('password');
        $role = $request->input('role');
        $permissions = $request->input('permissions', []);

        if (! $name || ! $staffId || ! $username || ! $password || ! $role) {
            return response()->json(['message' => 'All fields are required'], 400);
        }

        if ($requester['role'] === 'supervisor' && $role !== 'staff') {
            return response()->json(['message' => 'Supervisors can only create staff accounts'], 403);
        }

        if ($role === 'supervisor' && $requester['role'] !== 'admin') {
            return response()->json(['message' => 'Only admins can create supervisor accounts'], 403);
        }

        if ($role === 'admin' && $requester['role'] !== 'admin') {
            return response()->json(['message' => 'Only admins can create admin accounts'], 403);
        }

        $existing = DB::table('users')
            ->where('username', $username)
            ->orWhere('staff_id', $staffId)
            ->exists();

        if ($existing) {
            return response()->json(['message' => 'Username or Staff ID already exists'], 400);
        }

        $userPermissions = $role === 'supervisor' ? ['all'] : $permissions;

        $newUserId = DB::table('users')->insertGetId([
            'name' => $name,
            'staff_id' => $staffId,
            'username' => $username,
            'password' => Hash::make($password),
            'role' => $role,
            'permissions' => json_encode($userPermissions),
            'must_change_password' => true,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $newUser = DB::table('users')
            ->select('id', 'name', 'staff_id', 'username', 'role', 'permissions', 'must_change_password', 'created_at')
            ->where('id', $newUserId)
            ->first();

        ActivityLogger::log($requester['id'], 'USER_CREATED', "Created new {$role}: {$name}");

        return response()->json([
            'message' => 'User created successfully. They must change password on first login.',
            'user' => $newUser,
        ], 201);
    }
}
