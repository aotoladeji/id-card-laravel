<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    /**
     * Turns the permissions text stored in the database
     * (e.g. '["inventory","approval"]') into a real list.
     */
    private function decodePermissions($user)
    {
        if ($user && isset($user->permissions) && is_string($user->permissions)) {
            $user->permissions = json_decode($user->permissions, true) ?: [];
        } elseif ($user && empty($user->permissions)) {
            $user->permissions = [];
        }

        return $user;
    }

    // GET /api/users
    public function index()
    {
        $users = DB::table('users')
            ->select('id', 'name', 'staff_id', 'username', 'role', 'permissions', 'created_at', 'updated_at')
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($u) => $this->decodePermissions($u));

        return response()->json(['success' => true, 'users' => $users]);
    }

    // GET /api/users/{id}
    public function show(Request $request, int $id)
    {
        $user = DB::table('users')
            ->select('id', 'name', 'staff_id', 'username', 'role', 'permissions', 'created_at', 'updated_at')
            ->where('id', $id)
            ->first();

        if (! $user) {
            return response()->json(['message' => 'User not found'], 404);
        }

        return response()->json(['success' => true, 'user' => $this->decodePermissions($user)]);
    }

    // PUT /api/users/{id}/permissions
    public function updatePermissions(Request $request, int $id)
    {
        $requester = $request->attributes->get('authUser');
        $permissions = $request->input('permissions');

        if (! in_array($requester['role'], ['admin', 'supervisor'], true)) {
            return response()->json(['message' => 'You do not have permission to perform this action'], 403);
        }

        if (! is_array($permissions)) {
            return response()->json(['message' => 'Permissions must be an array'], 422);
        }
        $permissions = array_values(array_unique($permissions));

        $target = DB::table('users')->where('id', $id)->first();

        if (! $target) {
            return response()->json(['message' => 'User not found'], 404);
        }

        // Removed restriction to only edit staff permissions
        // if ($target->role !== 'staff') {
        //     return response()->json(['message' => 'Can only edit staff permissions'], 403);
        // }

        DB::table('users')->where('id', $id)->update([
            'permissions' => json_encode($permissions),
            'updated_at' => now(),
        ]);

        $updated = $this->decodePermissions(DB::table('users')->where('id', $id)->first());

        ActivityLogger::log($requester['id'], 'USER_PERMISSIONS_UPDATED', "Updated permissions for user ID: {$id}");

        return response()->json(['success' => true, 'message' => 'Permissions updated successfully', 'user' => $updated]);
    }

    // DELETE /api/users/{id}
    public function destroy(Request $request, int $id)
    {
        $requester = $request->attributes->get('authUser');

        if (! in_array($requester['role'], ['admin', 'supervisor'], true)) {
            return response()->json(['message' => 'You do not have permission to perform this action'], 403);
        }

        if ((int) $id === (int) $requester['id']) {
            return response()->json(['message' => 'You cannot delete your own account'], 400);
        }

        $target = DB::table('users')->where('id', $id)->first();

        if (! $target) {
            return response()->json(['message' => 'User not found'], 404);
        }

        if ($target->role === 'admin') {
            return response()->json(['message' => 'Admin accounts cannot be deleted'], 403);
        }

        if ($requester['role'] === 'supervisor' && $target->role !== 'staff') {
            return response()->json(['message' => 'Supervisors can only delete staff accounts'], 403);
        }

        // Nullify references in related tables before deleting (preserves history).
        DB::table('activity_logs')->where('user_id', $id)->update(['user_id' => null]);
        DB::table('daily_reports')->where('submitted_by', $id)->update(['submitted_by' => null]);
        DB::table('daily_reports')->where('verified_by', $id)->update(['verified_by' => null]);
        DB::table('reprint_requests')->where('requested_by', $id)->update(['requested_by' => null]);
        DB::table('reprint_requests')->where('resolved_by', $id)->update(['resolved_by' => null]);
        DB::table('material_requests')->where('requested_by', $id)->update(['requested_by' => null]);
        DB::table('material_requests')->where('responded_by', $id)->update(['responded_by' => null]);
        DB::table('inventory')->where('added_by', $id)->update(['added_by' => null]);
        DB::table('faulty_deliveries')->where('reported_by', $id)->update(['reported_by' => null]);
        DB::table('faulty_inventory_logs')->where('reported_by', $id)->update(['reported_by' => null]);
        DB::table('id_cards')->where('captured_by', $id)->update(['captured_by' => null]);
        DB::table('id_cards')->where('approved_by', $id)->update(['approved_by' => null]);
        DB::table('id_cards')->where('printed_by', $id)->update(['printed_by' => null]);
        DB::table('id_cards')->where('collected_by', $id)->update(['collected_by' => null]);

        DB::table('users')->where('id', $id)->delete();

        ActivityLogger::log($requester['id'], 'USER_DELETED', "Deleted user: {$target->name} (ID: {$id})");

        return response()->json([
            'success' => true,
            'message' => "{$target->name}'s account has been deleted. Their activities remain in the system.",
        ]);
    }
}