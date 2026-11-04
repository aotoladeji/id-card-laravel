<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Carbon\Carbon;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/**
 * Converted from backend/routes/publicScheduling.js — the student-facing
 * (unauthenticated) booking endpoints.
 */
class PublicSchedulingController extends Controller
{
    private function generateCode(): string
    {
        return (string) random_int(100000, 999999);
    }

    private function isCaptureApiKeyAuthorized(Request $request): bool
    {
        $expected = trim((string) config('services.capture_app.verify_api_key'));
        if (! $expected) {
            return false;
        }

        $headerKey = trim((string) $request->header('x-api-key'));
        $verifyHeaderKey = trim((string) $request->header('x-verify-api-key'));
        $bearer = $request->bearerToken();

        return in_array($expected, array_filter([$headerKey, $verifyHeaderKey, $bearer]), true);
    }

    // POST /api/public/scheduling/login
    public function login(Request $request)
    {
        $configId = $request->input('configId');
        $studentId = trim((string) $request->input('studentId'));
        $loginCode = trim((string) $request->input('loginCode'));

        if (! $configId || ! $studentId || ! $loginCode) {
            return response()->json(['message' => 'Missing required fields'], 400);
        }

        $config = DB::table('scheduling_config')
            ->where('id', $configId)->where('is_active', true)->where('is_closed', false)
            ->first();

        if (! $config) {
            return response()->json(['message' => 'Scheduling is not available or has been closed'], 404);
        }

        $student = DB::table('scheduled_students')
            ->where('config_id', $configId)
            ->whereRaw('LOWER(TRIM(COALESCE(matric_number, \'\'))) = LOWER(?)', [$studentId])
            ->where('login_code', $loginCode)
            ->first();

        if (! $student) {
            $used = DB::table('scheduled_students')
                ->where('config_id', $configId)
                ->whereRaw('LOWER(TRIM(COALESCE(matric_number, \'\'))) = LOWER(?)', [$studentId])
                ->whereNull('login_code')
                ->exists();

            if ($used) {
                return response()->json(['message' => 'Your login code has already been used. Appointment is already booked.'], 401);
            }

            return response()->json(['message' => 'Invalid credentials'], 401);
        }

        $appointment = DB::table('appointments')->where('student_id', $student->id)->first();

        return response()->json([
            'success' => true,
            'student' => [
                'id' => $student->id,
                'fullName' => $student->full_name,
                'email' => $student->email,
                'faculty' => $student->faculty,
                'department' => $student->department,
                'level' => $student->level,
                'hasScheduled' => (bool) $student->has_scheduled,
                'appointment' => $appointment,
            ],
            'config' => $config,
        ]);
    }

    // GET /api/public/scheduling/{configId}/available-slots
    public function availableSlots(int $configId)
    {
        $slots = DB::table('time_slots')
            ->where('config_id', $configId)
            ->where('is_available', true)
            ->whereColumn('booked', '<', 'capacity')
            ->whereDate('slot_date', '>=', now()->toDateString())
            ->orderBy('slot_date')->orderBy('slot_time')
            ->get();

        $byDate = [];
        foreach ($slots as $slot) {
            $key = Carbon::parse($slot->slot_date)->toDateString();
            $byDate[$key][] = $slot;
        }

        return response()->json(['success' => true, 'slots' => $byDate]);
    }

    // POST /api/public/scheduling/book
    public function book(Request $request)
    {
        $studentId = (int) $request->input('studentId');
        $slotId = (int) $request->input('slotId');
        $configId = (int) $request->input('configId');

        if (! $studentId || ! $slotId || ! $configId) {
            return response()->json(['message' => 'Invalid booking request payload'], 400);
        }

        try {
            return DB::transaction(function () use ($studentId, $slotId, $configId) {
                $config = DB::table('scheduling_config')->where('id', $configId)->first(['id', 'is_active', 'is_closed']);
                if (! $config) {
                    return response()->json(['message' => 'Scheduling configuration not found'], 404);
                }
                if (! $config->is_active || $config->is_closed) {
                    return response()->json(['message' => 'Scheduling is not available for booking'], 400);
                }

                $student = DB::table('scheduled_students')->where('id', $studentId)
                    ->first(['id', 'config_id', 'has_scheduled', 'email', 'full_name', 'matric_number']);

                if (! $student) {
                    return response()->json(['message' => 'Student not found for this booking'], 404);
                }
                if ((int) $student->config_id !== $configId) {
                    return response()->json(['message' => 'Student does not belong to this schedule'], 400);
                }
                if ($student->has_scheduled) {
                    return response()->json(['message' => 'You already have an appointment scheduled'], 409);
                }

                if (DB::table('appointments')->where('student_id', $studentId)->exists()) {
                    return response()->json(['message' => 'You already have an appointment scheduled'], 400);
                }

                $slot = DB::table('time_slots')
                    ->where('id', $slotId)->where('config_id', $configId)
                    ->whereColumn('booked', '<', 'capacity')
                    ->lockForUpdate()
                    ->first();

                if (! $slot) {
                    return response()->json(['message' => 'This slot is no longer available'], 400);
                }

                $captureLoginCode = null;
                do {
                    $candidate = $this->generateCode();
                    $taken = DB::table('scheduled_students')->where('capture_login_code', $candidate)->exists();
                    if (! $taken) {
                        $captureLoginCode = $candidate;
                    }
                } while (! $captureLoginCode);

                try {
                    DB::table('appointments')->insert([
                        'config_id' => $configId,
                        'student_id' => $studentId,
                        'slot_id' => $slotId,
                        'appointment_date' => $slot->slot_date,
                        'appointment_time' => $slot->slot_time,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } catch (QueryException $e) {
                    if ((int) $e->getCode() === 23000) {
                        return response()->json(['message' => 'You already have an appointment scheduled'], 409);
                    }
                    throw $e;
                }

                DB::table('time_slots')->where('id', $slotId)->increment('booked');

                DB::table('scheduled_students')->where('id', $studentId)->update([
                    'has_scheduled' => true,
                    'scheduled_date' => $slot->slot_date,
                    'scheduled_time' => $slot->slot_time,
                    'login_code' => null,
                    'capture_login_code' => $captureLoginCode,
                    'updated_at' => now(),
                ]);

                $emailSent = false;
                $emailError = null;

                if ($student->email && config('mail.mailers.smtp.username')) {
                    try {
                        $html = view('emails.booking-confirmed', ['student' => $student, 'slot' => $slot, 'captureLoginCode' => $captureLoginCode])->render();
                        Mail::html($html, function ($message) use ($student) {
                            $message->to($student->email)->subject('Booking Confirmed - Your Capture App Login Code');
                        });
                        $emailSent = true;
                    } catch (\Throwable $e) {
                        $emailError = $e->getMessage();
                        report($e);
                    }
                }

                $appointment = DB::table('appointments')->where('student_id', $studentId)->first();

                return response()->json([
                    'success' => true,
                    'message' => 'Appointment booked successfully',
                    'appointment' => $appointment,
                    'captureLoginCode' => $captureLoginCode,
                    'confirmationEmailSent' => $emailSent,
                    'confirmationEmailError' => $emailError,
                ]);
            });
        } catch (QueryException $e) {
            if ((int) $e->getCode() === 23000) {
                return response()->json(['message' => 'Appointment already exists for this student'], 409);
            }

            return response()->json(['message' => 'Invalid booking reference data'], 400);
        }
    }

    // GET /api/public/scheduling/capture-login-code/{matricNumber}
    public function captureLoginCode(Request $request, string $matricNumber)
    {
        if (! $this->isCaptureApiKeyAuthorized($request)) {
            return response()->json(['success' => false, 'message' => 'Forbidden'], 403);
        }

        $matricNumber = trim($matricNumber);
        if (! $matricNumber) {
            return response()->json(['success' => false, 'message' => 'Matric number is required'], 400);
        }

        // Look up the booked student straight from the database by matric number,
        // regardless of which schedule (active, closed, or archived) the record
        // belongs to. A new schedule must never block capture-app access for
        // students who already booked under an older schedule.
        $student = DB::table('scheduled_students')
            ->where('has_scheduled', true)
            ->whereRaw('LOWER(TRIM(COALESCE(matric_number, \'\'))) = LOWER(?)', [$matricNumber])
            ->orderByDesc('updated_at')
            ->first();

        if (! $student) {
            return response()->json(['success' => false, 'message' => 'No booked student found for this matric number'], 404);
        }

        $captureLoginCode = $student->capture_login_code;
        if (! $captureLoginCode) {
            do {
                $candidate = $this->generateCode();
                $updated = DB::table('scheduled_students')
                    ->where('id', $student->id)->whereNull('capture_login_code')
                    ->update(['capture_login_code' => $candidate, 'updated_at' => now()]);
            } while (! $updated && ! ($captureLoginCode = DB::table('scheduled_students')->where('id', $student->id)->value('capture_login_code')));
            $captureLoginCode = $captureLoginCode ?: $candidate;
        }

        // Expose every column that came in from the student Excel sheet so the
        // capture app can pick whatever field it needs (matric, jamb, pg reg,
        // faculty, department, ... plus any extra columns). Nulls are replaced
        // with empty strings so the capture app never has to handle a null.
        $extraFields = [];
        if (! empty($student->extra_fields)) {
            $decoded = is_array($student->extra_fields)
                ? $student->extra_fields
                : json_decode($student->extra_fields, true);
            if (is_array($decoded)) {
                $extraFields = $decoded;
            }
        }

        $fields = array_merge($extraFields, [
            'full_name' => $student->full_name,
            'surname' => $student->surname,
            'other_names' => $student->other_names,
            'matric_number' => $student->matric_number,
            'jamb_number' => $student->jamb_number,
            'pg_reg_number' => $student->pg_reg_number,
            'email' => $student->email,
            'phone' => $student->phone,
            'faculty' => $student->faculty,
            'department' => $student->department,
            'level' => $student->level,
        ]);

        $fields = array_map(function ($value) {
            return $value === null ? '' : $value;
        }, $fields);

        $fullName = trim((string) ($fields['full_name'] ?? ''));
        if ($fullName === '') {
            $fullName = trim(($fields['surname'] ?? '').' '.($fields['other_names'] ?? ''));
        }
        if ($fullName === '') {
            $fullName = 'Unknown Student';
        }

        return response()->json([
            'success' => true,
            'student' => array_merge($fields, [
                'id' => $student->id,
                'fullName' => $fullName,
                'matricNumber' => $fields['matric_number'] ?? '',
                'jambNumber' => $fields['jamb_number'] ?? '',
                'pgRegNumber' => $fields['pg_reg_number'] ?? '',
                'configId' => $student->config_id,
                'scheduledDate' => $student->scheduled_date ?? '',
                'scheduledTime' => $student->scheduled_time ?? '',
            ]),
            'fields' => $fields,
            'captureLoginCode' => $captureLoginCode,
        ]);
    }

    // POST /api/public/scheduling/cancel
    public function cancel(Request $request)
    {
        $studentId = $request->input('studentId');

        return DB::transaction(function () use ($studentId) {
            $appointment = DB::table('appointments')->where('student_id', $studentId)->first();

            if (! $appointment) {
                return response()->json(['message' => 'No appointment found'], 404);
            }

            DB::table('time_slots')->where('id', $appointment->slot_id)->decrement('booked');

            // Booking clears login_code (one-time use), so cancelling must issue a
            // fresh one — otherwise the student can never log back in to rebook.
            $loginCode = null;
            do {
                $candidate = $this->generateCode();
                $taken = DB::table('scheduled_students')->where('login_code', $candidate)->exists();
                if (! $taken) {
                    $loginCode = $candidate;
                }
            } while (! $loginCode);

            DB::table('scheduled_students')->where('id', $studentId)->update([
                'has_scheduled' => false,
                'scheduled_date' => null,
                'scheduled_time' => null,
                'login_code' => $loginCode,
                'capture_login_code' => null,
                'updated_at' => now(),
            ]);

            DB::table('appointments')->where('id', $appointment->id)->delete();

            return response()->json(['success' => true, 'message' => 'Appointment cancelled successfully']);
        });
    }
}
