<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MaterialController extends Controller
{
    // GET /api/material
    public function index()
    {
        $requests = DB::table('material_requests as m')
            ->leftJoin('users as u1', 'm.requested_by', '=', 'u1.id')
            ->leftJoin('users as u2', 'm.responded_by', '=', 'u2.id')
            ->select(
                'm.*',
                'u1.username as requested_by_username',
                'u1.name as requested_by_name',
                'u2.username as responded_by_username',
                'u2.name as responded_by_name'
            )
            ->orderByDesc('m.created_at')
            ->get();

        return response()->json(['success' => true, 'requests' => $requests]);
    }

    // POST /api/material
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $itemName = $request->input('itemName');
        $quantity = $request->input('quantity');
        $urgency = $request->input('urgency', 'normal');

        if (! $itemName || ! $quantity) {
            return response()->json(['message' => 'Item name and quantity are required'], 400);
        }

        $id = DB::table('material_requests')->insertGetId([
            'item_name' => $itemName,
            'quantity' => (int) $quantity,
            'urgency' => $urgency ?: 'normal',
            'status' => 'pending',
            'requested_by' => $user['id'],
            'created_at' => now(),
        ]);

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_CREATED', "Requested {$quantity} {$itemName}");

        return response()->json(['success' => true, 'message' => 'Material request created successfully', 'request' => $materialRequest], 201);
    }

    // PUT /api/material/{id}/respond
    public function respond(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');
        $responseMessage = $request->input('responseMessage');

        $affected = DB::table('material_requests')->where('id', $id)->update([
            'status' => $status,
            'response_message' => $responseMessage,
            'responded_by' => $user['id'],
            'responded_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_RESPONDED', "Responded to request ID: {$id} - {$status}");

        return response()->json(['success' => true, 'message' => 'Response submitted successfully', 'request' => $materialRequest]);
    }

    // PUT /api/material/{id}/forward
    public function forward(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $urgency = $request->input('urgency');
        $forwardNotes = $request->input('forwardNotes');

        $affected = DB::table('material_requests')->where('id', $id)->update([
            'urgency' => $urgency,
            'response_message' => 'Forwarded to admin: '.($forwardNotes ?: 'Please review'),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_FORWARDED', "Forwarded request ID: {$id} with urgency: {$urgency}");

        return response()->json(['success' => true, 'message' => 'Request forwarded to admin successfully', 'request' => $materialRequest]);
    }

    // PUT /api/material/{id}/address
    public function address(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');
        $responseMessage = $request->input('responseMessage');
        $actionTaken = $request->input('actionTaken');

        $affected = DB::table('material_requests')->where('id', $id)->update([
            'status' => $status,
            'response_message' => "{$responseMessage}\n\nAction Taken: ".($actionTaken ?: 'N/A'),
            'responded_by' => $user['id'],
            'responded_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        // Deduct from inventory when approved or fulfilled.
        if (in_array($status, ['approved', 'fulfilled'], true)) {
            $remaining = $materialRequest->quantity;

            $invRows = DB::table('inventory')
                ->whereRaw('LOWER(item_name) = LOWER(?)', [$materialRequest->item_name])
                ->where('status', 'approved')
                ->where('quantity', '>', 0)
                ->orderByRaw('last_restocked IS NULL, last_restocked DESC')
                ->orderByDesc('created_at')
                ->get(['id', 'quantity']);

            foreach ($invRows as $row) {
                if ($remaining <= 0) {
                    break;
                }
                $deduct = min($remaining, $row->quantity);
                DB::table('inventory')->where('id', $row->id)->update([
                    'quantity' => DB::raw("quantity - {$deduct}"),
                    'updated_at' => now(),
                ]);
                $remaining -= $deduct;
            }
        }

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_ADDRESSED', "Addressed request ID: {$id} - {$status}");

        return response()->json(['success' => true, 'message' => 'Material request addressed successfully', 'request' => $materialRequest]);
    }

    // PUT /api/material/{id}/query
    public function query(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $queryMessage = trim((string) $request->input('queryMessage'));

        if (! $queryMessage) {
            return response()->json(['message' => 'Query message is required'], 400);
        }

        $affected = DB::table('material_requests')->where('id', $id)->update([
            'status' => 'queried',
            'query_message' => $queryMessage,
            'queried_by' => $user['id'],
            'queried_at' => now(),
            'query_reply' => null,
            'query_replied_at' => null,
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Request not found'], 404);
        }

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_QUERIED', "Queried request ID: {$id} — ".Str::limit($queryMessage, 80));

        return response()->json(['success' => true, 'message' => 'Query sent to staff member', 'request' => $materialRequest]);
    }

    // PUT /api/material/{id}/reply
    public function reply(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $queryReply = trim((string) $request->input('queryReply'));

        if (! $queryReply) {
            return response()->json(['message' => 'Reply is required'], 400);
        }

        $exists = DB::table('material_requests')
            ->where('id', $id)
            ->where('requested_by', $user['id'])
            ->where('status', 'queried')
            ->exists();

        if (! $exists) {
            return response()->json(['message' => 'Request not found or not in queried state'], 403);
        }

        DB::table('material_requests')->where('id', $id)->update([
            'query_reply' => $queryReply,
            'query_replied_at' => now(),
            'status' => 'pending',
        ]);

        $materialRequest = DB::table('material_requests')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'MATERIAL_REQUEST_QUERY_REPLIED', "Replied to query on request ID: {$id}");

        return response()->json(['success' => true, 'message' => 'Reply submitted successfully', 'request' => $materialRequest]);
    }
}
