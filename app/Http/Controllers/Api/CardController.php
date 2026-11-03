<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CardController extends Controller
{
    // GET /api/cards?status=
    public function index(Request $request)
    {
        $query = DB::table('id_cards as c')
            ->leftJoin('users as u1', 'c.captured_by', '=', 'u1.id')
            ->leftJoin('users as u2', 'c.approved_by', '=', 'u2.id')
            ->select('c.*', 'u1.name as captured_by_name', 'u2.name as approved_by_name');

        if ($status = $request->query('status')) {
            $query->where('c.status', $status);
        }

        $cards = $query->orderByDesc('c.created_at')->get();

        return response()->json(['success' => true, 'cards' => $cards]);
    }

    // POST /api/cards
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');

        $data = $request->only(['matricNumber', 'fullName', 'faculty', 'department', 'level', 'photoUrl', 'signatureUrl']);

        try {
            $id = DB::table('id_cards')->insertGetId([
                'matric_number' => $data['matricNumber'] ?? null,
                'full_name' => $data['fullName'] ?? null,
                'faculty' => $data['faculty'] ?? null,
                'department' => $data['department'] ?? null,
                'level' => $data['level'] ?? null,
                'photo_url' => $data['photoUrl'] ?? null,
                'signature_url' => $data['signatureUrl'] ?? null,
                'captured_by' => $user['id'],
                'status' => 'pending',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['message' => 'Matric number already exists'], 400);
            }
            throw $e;
        }

        $card = DB::table('id_cards')->where('id', $id)->first();

        return response()->json(['success' => true, 'message' => 'ID card created successfully', 'card' => $card], 201);
    }

    // PUT /api/cards/{id}/status
    public function updateStatus(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $status = $request->input('status');
        $notes = $request->input('notes');

        $update = ['status' => $status, 'updated_at' => now()];

        if ($status === 'approved') {
            $update['approved_by'] = $user['id'];
        } elseif ($status === 'printed') {
            $update['printed_by'] = $user['id'];
        } elseif ($status === 'collected') {
            $update['collected_by'] = $user['id'];
        }

        if ($notes) {
            $update['notes'] = $notes;
        }

        $affected = DB::table('id_cards')->where('id', $id)->update($update);

        if (! $affected) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        $card = DB::table('id_cards')->where('id', $id)->first();

        return response()->json(['success' => true, 'message' => 'Card status updated successfully', 'card' => $card]);
    }

    /**
     * PUT /api/cards/{id}/details
     * Update the captured student/card info (e.g. department change, name
     * correction) before the card has been approved. New endpoint added
     * alongside the equivalent approved-cards edit feature.
     */
    public function updateDetails(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        // Check if the card is approved
        $card = DB::table('id_cards')->where('id', $id)->first();

        if (! $card) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        // Only supervisors can edit approved cards
        if ($card->status === 'approved' && $user['role'] !== 'supervisor') {
            return response()->json(['message' => 'Only supervisors can edit approved cards'], 403);
        }

        // Staff can only edit unapproved cards
        if ($user['role'] === 'staff' && $card->status === 'approved') {
            return response()->json(['message' => 'Staff cannot edit approved cards'], 403);
        }

        $editable = [
            'matricNumber' => 'matric_number',
            'fullName' => 'full_name',
            'faculty' => 'faculty',
            'department' => 'department',
            'level' => 'level',
        ];

        $update = [];
        foreach ($editable as $bodyKey => $column) {
            if ($request->has($bodyKey)) {
                $value = trim((string) $request->input($bodyKey));
                if ($value === '') {
                    return response()->json(['message' => "{$bodyKey} cannot be empty"], 400);
                }
                $update[$column] = $value;
            }
        }

        if (empty($update)) {
            return response()->json(['message' => 'No editable fields were provided'], 400);
        }

        $update['updated_at'] = now();

        try {
            $affected = DB::table('id_cards')->where('id', $id)->update($update);
        } catch (QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['message' => 'Matric number already exists'], 400);
            }
            throw $e;
        }

        if (! $affected) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        $updatedCard = DB::table('id_cards')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'CARD_DETAILS_UPDATED', "Updated details for {$updatedCard->full_name} ({$updatedCard->matric_number})");

        return response()->json(['success' => true, 'message' => 'Card details updated successfully', 'card' => $updatedCard]);
    }

    // DELETE /api/cards/{id}
    public function destroy(int $id)
    {
        $affected = DB::table('id_cards')->where('id', $id)->delete();

        if (! $affected) {
            return response()->json(['message' => 'Card not found'], 404);
        }

        return response()->json(['success' => true, 'message' => 'Card deleted successfully']);
    }
}
