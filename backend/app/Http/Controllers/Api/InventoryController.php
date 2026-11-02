<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    // GET /api/inventory
    public function index()
    {
        $inventory = DB::table('inventory as i')
            ->leftJoin('users as u', 'i.added_by', '=', 'u.id')
            ->select('i.*', 'u.username as added_by_username', 'u.name as added_by_name')
            ->orderByDesc('i.created_at')
            ->get();

        return response()->json(['success' => true, 'inventory' => $inventory]);
    }

    // POST /api/inventory
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $itemName = $request->input('itemName');
        $quantity = $request->input('quantity');
        $unit = $request->input('unit', 'units');

        if (! $itemName || ! $quantity) {
            return response()->json(['message' => 'Item name and quantity are required'], 400);
        }

        $id = DB::table('inventory')->insertGetId([
            'item_name' => $itemName,
            'quantity' => (int) $quantity,
            'unit' => $unit ?: 'units',
            'added_by' => $user['id'],
            'status' => 'pending',
            'last_restocked' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $item = DB::table('inventory')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'INVENTORY_ADDED', "Added {$quantity} {$itemName}");

        return response()->json(['success' => true, 'message' => 'Inventory item added successfully', 'item' => $item], 201);
    }

    // POST /api/inventory/faulty
    public function logFaultyDelivery(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $itemName = $request->input('itemName');
        $quantity = $request->input('quantity');
        $issueDescription = $request->input('issueDescription');

        if (! $itemName || ! $quantity || ! $issueDescription) {
            return response()->json(['message' => 'All fields are required'], 400);
        }

        $id = DB::table('faulty_deliveries')->insertGetId([
            'item_name' => $itemName,
            'quantity' => (int) $quantity,
            'issue_description' => $issueDescription,
            'reported_by' => $user['id'],
            'status' => 'pending',
            'created_at' => now(),
        ]);

        $report = DB::table('faulty_deliveries')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'FAULTY_DELIVERY_REPORTED', "Reported faulty {$itemName}");

        return response()->json(['success' => true, 'message' => 'Faulty delivery logged successfully', 'report' => $report], 201);
    }

    // GET /api/inventory/faulty
    public function getFaultyDeliveries()
    {
        $deliveries = DB::table('faulty_deliveries as f')
            ->leftJoin('users as u', 'f.reported_by', '=', 'u.id')
            ->select('f.*', 'u.username as reported_by_username', 'u.name as reported_by_name')
            ->orderByDesc('f.created_at')
            ->get();

        return response()->json(['success' => true, 'deliveries' => $deliveries]);
    }

    // PUT /api/inventory/faulty/{id}/attest
    public function attestFaultyDelivery(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');
        $resolutionNotes = $request->input('resolutionNotes');

        $affected = DB::table('faulty_deliveries')->where('id', $id)->update([
            'status' => $status,
            'resolution_notes' => $resolutionNotes,
            'resolved_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Faulty delivery not found'], 404);
        }

        $delivery = DB::table('faulty_deliveries')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'FAULTY_DELIVERY_ATTESTED', "Attested faulty delivery ID: {$id} - {$status}");

        return response()->json(['success' => true, 'message' => 'Faulty delivery attested successfully', 'delivery' => $delivery]);
    }

    // PUT /api/inventory/{id}/approve
    public function approve(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');

        $affected = DB::table('inventory')->where('id', $id)->update([
            'status' => $status,
            'updated_at' => now(),
        ]);

        if (! $affected) {
            return response()->json(['message' => 'Inventory item not found'], 404);
        }

        $item = DB::table('inventory')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'INVENTORY_APPROVED', "Approved inventory item ID: {$id}");

        return response()->json(['success' => true, 'message' => 'Inventory item approved successfully', 'item' => $item]);
    }
}
