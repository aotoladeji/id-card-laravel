<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\ActivityLogger;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use PhpOffice\PhpSpreadsheet\IOFactory;
use Symfony\Component\Mime\Part\DataPart;
use Symfony\Component\Mime\Part\File;

/**
 * Converted from backend/controllers/schedulingController.js.
 *
 * NOTE: The original file also contains very detailed SMTP error
 * classification (sender-rejection retries, daily-limit detection) and an
 * elaborate Excel header-alias detector. Both are reproduced here at a
 * functional level (common header aliases + general send-failure handling)
 * rather than reproducing every heuristic branch — see
 * NODE_REFERENCE/controllers/schedulingController.js for the exact original
 * behaviour if you need to port a specific edge case.
 */
class SchedulingController extends Controller
{
    private const STUDENT_HEADER_ALIASES = [
        'full_name' => ['full_name', 'fullname', 'full_names', 'name', 'student_name'],
        'email' => ['email', 'e_mail', 'email_address', 'mail'],
        'matric_number' => ['matric_number', 'matric_no', 'matric', 'matricnumber', 'mat_no'],
        'jamb_number' => ['jamb_number', 'jamb_no', 'jamb', 'jamb_reg_no', 'jamb_reg_number', 'jamb_registration_number'],
        'pg_reg_number' => ['pg_reg_number', 'pg_no', 'pg_number', 'pg_reg_no', 'pg_registration_number'],
        'phone' => ['phone', 'phone_number', 'mobile', 'mobile_number', 'gsm'],
        'faculty' => ['faculty'],
        'department' => ['department', 'dept'],
        'level' => ['level', 'class_level'],
        'surname' => ['surname', 'last_name', 'lastname'],
        'other_names' => ['other_names', 'other_name', 'first_name', 'othernames'],
    ];

    private function normalizeHeader(?string $header): string
    {
        $header = strtolower(trim((string) $header));

        return trim(preg_replace('/[^a-z0-9]+/', '_', $header), '_');
    }

    private function canonicalHeader(?string $header): string
    {
        $normalized = $this->normalizeHeader($header);
        if ($normalized === '') {
            return '';
        }
        foreach (self::STUDENT_HEADER_ALIASES as $canonical => $aliases) {
            if (in_array($normalized, $aliases, true)) {
                return $canonical;
            }
        }

        return $normalized;
    }

    /**
     * Parse an uploaded student list (xlsx/xls/csv) into normalized rows,
     * auto-detecting which row is the header row (mirrors
     * parseStudentsFromWorksheet in the original controller).
     */
    private function parseStudentsFromFile(string $path): array
    {
        $reader = IOFactory::createReaderForFile($path);
        if (method_exists($reader, 'setReadDataOnly')) {
            $reader->setReadDataOnly(true);
        }
        if (method_exists($reader, 'setReadEmptyCells')) {
            $reader->setReadEmptyCells(false);
        }
        $spreadsheet = $reader->load($path);
        $rows = $spreadsheet->getActiveSheet()->toArray(null, false, false, false);

        if (empty($rows)) {
            return [];
        }

        $scanLimit = min(count($rows), 15);
        $bestHeaderIndex = 0;
        $bestScore = -1;

        for ($i = 0; $i < $scanLimit; $i++) {
            $row = $rows[$i] ?? [];
            $seen = [];
            $score = 0;
            foreach ($row as $cell) {
                $canonical = $this->canonicalHeader((string) $cell);
                if ($canonical === '' || isset($seen[$canonical])) {
                    continue;
                }
                $seen[$canonical] = true;
                if (array_key_exists($canonical, self::STUDENT_HEADER_ALIASES)) {
                    $score++;
                }
            }
            if ($score > $bestScore) {
                $bestScore = $score;
                $bestHeaderIndex = $i;
            }
        }

        $headerRow = $rows[$bestHeaderIndex] ?? [];
        $headers = [];
        foreach ($headerRow as $idx => $cell) {
            $canonical = $this->canonicalHeader((string) $cell);
            $headers[$idx] = $canonical !== '' ? $canonical : "column_{$idx}";
        }

        $students = [];
        for ($i = $bestHeaderIndex + 1; $i < count($rows); $i++) {
            $row = $rows[$i] ?? [];
            $student = [];
            $hasValue = false;
            foreach ($headers as $idx => $header) {
                $value = is_string($row[$idx] ?? null) ? trim($row[$idx]) : ($row[$idx] ?? null);
                if ($value !== null && $value !== '') {
                    $hasValue = true;
                }
                // Keep first non-empty value if a logical header repeats.
                if (! isset($student[$header]) || $student[$header] === '' || $student[$header] === null) {
                    $student[$header] = $value;
                }
            }
            if ($hasValue) {
                $students[] = $student;
            }
        }

        return $students;
    }

    private function studentValue(array $student, string $canonical): ?string
    {
        $value = $student[$canonical] ?? null;
        if ($value === null) {
            return null;
        }
        $trimmed = trim((string) $value);

        return $trimmed !== '' ? $trimmed : null;
    }

    private function studentFullName(array $student): string
    {
        $direct = $this->studentValue($student, 'full_name');
        if ($direct) {
            return $direct;
        }
        $combined = trim(($this->studentValue($student, 'surname') ?? '').' '.($this->studentValue($student, 'other_names') ?? ''));

        return $combined !== '' ? $combined : 'Unknown Student';
    }

    /**
     * Keep every column from the uploaded Excel row (canonical keys for known
     * headers, normalized header names for the rest) so the capture app can use
     * whatever field it needs. Stored verbatim in scheduled_students.extra_fields.
     */
    private function studentExtraFields(array $student): array
    {
        $fields = [];
        foreach ($student as $key => $value) {
            $fields[$key] = is_string($value) ? trim($value) : $value;
        }

        return $fields;
    }

    private function generateLoginCode(): string
    {
        return (string) random_int(100000, 999999);
    }

    // Mail clients (Gmail, Outlook, etc.) strip base64 data: URIs from HTML email,
    // so the logo must be a proper CID-embedded attachment instead. The CID must
    // be fixed/known up front since the HTML body is rendered before the mail
    // message is built, and Symfony's own auto-generated CIDs aren't predictable.
    private const LOGO_CID = 'ui-logo-schedule@idcardunit.local';

    private function logoPath(): ?string
    {
        $matches = glob(public_path('assets/ui-logo*.png'));
        $path = $matches[0] ?? null;

        return ($path && is_file($path)) ? $path : null;
    }

    private function generateUniqueLoginCode(): string
    {
        do {
            $code = $this->generateLoginCode();
            $exists = DB::table('scheduled_students')->where('login_code', $code)->exists();
        } while ($exists);

        return $code;
    }

    /**
     * Generate many unused login codes in bulk (a few DB queries instead of
     * one exists() query per imported student).
     */
    private function generateUniqueLoginCodes(int $count): array
    {
        $codes = [];
        $attempts = 0;

        while (count($codes) < $count && $attempts < 50) {
            $attempts++;
            $candidates = [];
            for ($i = 0; $i < max($count * 3, 30); $i++) {
                $candidates[] = (string) random_int(100000, 999999);
            }
            $candidates = array_values(array_unique($candidates));

            $existing = DB::table('scheduled_students')
                ->whereIn('login_code', $candidates)
                ->pluck('login_code')
                ->flip();

            foreach ($candidates as $candidate) {
                if (count($codes) >= $count) {
                    break;
                }
                if (! $existing->has($candidate)) {
                    $codes[] = $candidate;
                }
            }
        }

        // Fallback if the pooled search somehow could not fill the count.
        while (count($codes) < $count) {
            $codes[] = $this->generateUniqueLoginCode();
        }

        return $codes;
    }

    private function generateUniqueCaptureLoginCode(): string
    {
        do {
            $code = $this->generateLoginCode();
            $exists = DB::table('scheduled_students')->where('capture_login_code', $code)->exists();
        } while ($exists);

        return $code;
    }

    private function generateTimeSlotsForDate(string $dailyEndTime, int $slotsPerDay): array
    {
        $startHour = 10;
        $endHour = (int) explode(':', $dailyEndTime)[0];
        $totalMinutes = ($endHour - $startHour) * 60;
        $intervalMinutes = $slotsPerDay > 0 ? intdiv($totalMinutes, $slotsPerDay) : $totalMinutes;

        $slots = [];
        for ($i = 0; $i < $slotsPerDay; $i++) {
            $minutes = ($startHour * 60) + ($i * $intervalMinutes);
            $hour = intdiv($minutes, 60);
            $minute = $minutes % 60;
            $slots[] = sprintf('%02d:%02d:00', $hour, $minute);
        }

        return $slots;
    }

    private function generateSlotsForRange(int $configId, Carbon $start, Carbon $end, bool $excludeWeekends, string $dailyEndTime, int $slotsPerDay): void
    {
        $current = $start->copy();
        while ($current->lte($end)) {
            if ($excludeWeekends && $current->isWeekend()) {
                $current->addDay();

                continue;
            }

            $dateStr = $current->toDateString();
            foreach ($this->generateTimeSlotsForDate($dailyEndTime, $slotsPerDay) as $time) {
                DB::table('time_slots')->insertOrIgnore([
                    'config_id' => $configId,
                    'slot_date' => $dateStr,
                    'slot_time' => $time,
                    'capacity' => 10,
                    'created_at' => now(),
                ]);
            }
            $current->addDay();
        }
    }

    // POST /api/scheduling
    public function store(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $title = $request->input('title');
        $description = $request->input('description');
        $type = $request->input('type');
        $slotsPerPeriod = (int) $request->input('slotsPerPeriod');
        $startDate = $request->input('startDate');
        $endDate = $request->input('endDate');
        $dailyEndTime = $request->input('dailyEndTime', '14:00:00');
        $excludeWeekends = $request->input('excludeWeekends', true) !== false;
        $location = $request->input('location', 'MACARTHUR BUILDING UNIVERSITY OF IBADAN');
        $importantMessage = $request->input('importantMessage');

        if (! $title || ! $type || ! $slotsPerPeriod || ! $startDate) {
            return response()->json(['message' => 'Missing required fields'], 400);
        }
        if ($slotsPerPeriod < 1) {
            return response()->json(['message' => 'Slots per period must be at least 1'], 400);
        }

        $configId = DB::table('scheduling_config')->insertGetId([
            'title' => $title,
            'description' => $description,
            'type' => $type,
            'slots_per_period' => $slotsPerPeriod,
            'start_date' => $startDate,
            'end_date' => $endDate,
            'daily_end_time' => $dailyEndTime ?: '14:00:00',
            'exclude_weekends' => $excludeWeekends,
            'location' => $location,
            'important_message' => $importantMessage,
            'created_by' => $user['id'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $start = Carbon::parse($startDate);
        $end = $endDate ? Carbon::parse($endDate) : $start->copy()->addDays($type === 'weekly' ? 7 : 30);
        $slotsPerDay = (int) ceil($slotsPerPeriod / ($type === 'weekly' ? 5 : 20));

        $this->generateSlotsForRange($configId, $start, $end, $excludeWeekends, $dailyEndTime ?: '14:00:00', $slotsPerDay);

        $config = DB::table('scheduling_config')->where('id', $configId)->first();

        ActivityLogger::log($user['id'], 'SCHEDULING_CREATED', "Created scheduling: {$title}");

        return response()->json(['success' => true, 'message' => 'Scheduling configuration created successfully', 'config' => $config], 201);
    }

      // GET /api/scheduling            -> active schedules
    // GET /api/scheduling?archived=1 -> archived schedules (data kept, hidden from the normal list)
    public function index(Request $request)
    {
        $archived = $request->boolean('archived', false);

        $query = DB::table('scheduling_config as sc')
            ->leftJoin('users as u', 'sc.created_by', '=', 'u.id')
            ->selectRaw('sc.*, u.name as created_by_name,
                (SELECT COUNT(*) FROM scheduled_students WHERE config_id = sc.id) as total_students,
                (SELECT COUNT(*) FROM scheduled_students WHERE config_id = sc.id AND has_scheduled = 1) as scheduled_count');

        if ($archived) {
            $query->whereNotNull('sc.archived_at');
        } else {
            $query->whereNull('sc.archived_at');
        }

        $configs = $query->orderByDesc('sc.created_at')->get();
        $archivedCount = DB::table('scheduling_config')->whereNotNull('archived_at')->count();

        return response()->json(['success' => true, 'configs' => $configs, 'archived_count' => $archivedCount]);
    }

    // GET /api/scheduling/{id}
    public function show(int $id)
    {
        $config = DB::table('scheduling_config')->where('id', $id)->first();

        if (! $config) {
            return response()->json(['message' => 'Scheduling configuration not found'], 404);
        }

        $students = DB::table('scheduled_students')->where('config_id', $id)->orderByDesc('created_at')->get();
        $slots = DB::table('time_slots')->where('config_id', $id)->orderBy('slot_date')->orderBy('slot_time')->get();

        return response()->json(['success' => true, 'config' => $config, 'students' => $students, 'slots' => $slots]);
    }

    // PUT /api/scheduling/{id}
    public function update(Request $request, int $id)
    {
        $update = array_filter([
            'title' => $request->input('title'),
            'description' => $request->input('description'),
            'daily_end_time' => $request->input('dailyEndTime'),
            'end_date' => $request->input('endDate'),
        ], fn ($v) => $v !== null);

        if (empty($update)) {
            $config = DB::table('scheduling_config')->where('id', $id)->first();

            return $config
                ? response()->json(['success' => true, 'message' => 'Configuration updated successfully', 'config' => $config])
                : response()->json(['message' => 'Configuration not found'], 404);
        }

        $update['updated_at'] = now();
        $affected = DB::table('scheduling_config')->where('id', $id)->update($update);

        if (! $affected && ! DB::table('scheduling_config')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Configuration not found'], 404);
        }

        $config = DB::table('scheduling_config')->where('id', $id)->first();

        return response()->json(['success' => true, 'message' => 'Configuration updated successfully', 'config' => $config]);
    }

    // PUT /api/scheduling/{id}/toggle
    public function toggle(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $isClosed = (bool) $request->input('is_closed');

        $affected = DB::table('scheduling_config')->where('id', $id)->update([
            'is_closed' => $isClosed,
            'updated_at' => now(),
        ]);

        if (! $affected && ! DB::table('scheduling_config')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Configuration not found'], 404);
        }

        $config = DB::table('scheduling_config')->where('id', $id)->first();

        ActivityLogger::log($user['id'], 'SCHEDULING_TOGGLED', ($isClosed ? 'Closed' : 'Reopened')." scheduling ID: {$id}");

        return response()->json([
            'success' => true,
            'message' => 'Scheduling '.($isClosed ? 'closed' : 'reopened').' successfully',
            'config' => $config,
        ]);
    }

    // POST /api/scheduling/{id}/reopen (multipart: file)
    public function reopenWithNewBatch(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $startDate = $request->input('startDate');
        $endDate = $request->input('endDate');

        if (! $startDate) {
            return response()->json(['message' => 'Start date is required'], 400);
        }
        if (! $request->hasFile('file')) {
            return response()->json(['message' => 'Student list file is required'], 400);
        }

        $config = DB::table('scheduling_config')->where('id', $id)->first();
        if (! $config) {
            return response()->json(['message' => 'Configuration not found'], 404);
        }

        $students = $this->parseStudentsFromFile($request->file('file')->getRealPath());
        if (empty($students)) {
            return response()->json(['message' => 'Student list file is empty or invalid format'], 400);
        }

        $imported = 0;
        $errors = [];
        $now = now();
        $codes = $this->generateUniqueLoginCodes(count($students));

        // Deleting the previous batch is OPTIONAL. By default it is kept (moved into an archived copy).
        $deleteOldData = $request->boolean('deleteOldData', false);

        DB::transaction(function () use ($id, $config, $startDate, $endDate, $students, $codes, $now, $deleteOldData, &$imported, &$errors) {
            if ($deleteOldData) {
                DB::table('appointments')->where('config_id', $id)->delete();
                DB::table('scheduled_students')->where('config_id', $id)->delete();
                DB::table('time_slots')->where('config_id', $id)->delete();
            } else {
                $this->archivePreviousBatch($config, $now);
            }

            DB::table('scheduling_config')->where('id', $id)->update([
                'start_date' => $startDate,
                'end_date' => $endDate,
                'is_closed' => false,
                'updated_at' => $now,
            ]);

            $start = Carbon::parse($startDate);
            $end = $endDate ? Carbon::parse($endDate) : $start->copy()->addDays($config->type === 'weekly' ? 7 : 30);
            $slotsPerDay = (int) ceil($config->slots_per_period / ($config->type === 'weekly' ? 5 : 20));
            $this->generateSlotsForRange($id, $start, $end, (bool) $config->exclude_weekends, $config->daily_end_time ?: '14:00:00', $slotsPerDay);

            foreach ($students as $i => $student) {
                try {
                    DB::table('scheduled_students')->insert([
                        'config_id' => $id,
                        'matric_number' => $this->studentValue($student, 'matric_number'),
                        'jamb_number' => $this->studentValue($student, 'jamb_number'),
                        'pg_reg_number' => $this->studentValue($student, 'pg_reg_number'),
                        'full_name' => $this->studentFullName($student),
                        'surname' => $this->studentValue($student, 'surname'),
                        'other_names' => $this->studentValue($student, 'other_names'),
                        'email' => $this->studentValue($student, 'email'),
                        'phone' => $this->studentValue($student, 'phone'),
                        'faculty' => $this->studentValue($student, 'faculty'),
                        'department' => $this->studentValue($student, 'department'),
                        'level' => $this->studentValue($student, 'level'),
                        'extra_fields' => json_encode($this->studentExtraFields($student)),
                        'login_code' => $codes[$i],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                    $imported++;
                } catch (\Throwable $e) {
                    $errors[] = ['student' => $this->studentValue($student, 'email') ?? 'unknown-email', 'error' => $e->getMessage()];
                }
            }
        });

        ActivityLogger::log($user['id'], 'SCHEDULING_REOPENED', "Reopened scheduling ID: {$id} with {$imported} new students ({$startDate} – ".($endDate ?: 'open-ended').')');

        return response()->json([
            'success' => true,
            'message' => "Schedule reopened with {$imported} students.",
            'imported' => $imported,
            'errors' => $errors ?: null,
        ]);
    }

    // POST /api/scheduling/{id}/students (multipart: file)
    public function uploadStudentList(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        if (! $request->hasFile('file')) {
            return response()->json(['message' => 'No file uploaded'], 400);
        }

        $students = $this->parseStudentsFromFile($request->file('file')->getRealPath());
        if (empty($students)) {
            return response()->json(['message' => 'Student list file is empty or invalid format'], 400);
        }

        // Detect duplicates by matric_number for this config_id
        $matricNumbers = array_filter(array_map(fn ($s) => $this->studentValue($s, 'matric_number'), $students));
        
        if (! empty($matricNumbers)) {
            $existingStudents = DB::table('scheduled_students')
                ->where('config_id', $id)
                ->whereIn('matric_number', $matricNumbers)
                ->get()
                ->keyBy('matric_number');

            if ($existingStudents->isNotEmpty()) {
                // Build duplicate details and separate non-duplicates
                $duplicates = [];
                $nonDuplicates = [];

                foreach ($students as $student) {
                    $matricNo = $this->studentValue($student, 'matric_number');
                    
                    if ($matricNo && isset($existingStudents[$matricNo])) {
                        $existing = $existingStudents[$matricNo];
                        $duplicates[] = [
                            'matricNumber' => $matricNo,
                            'existingStudentId' => $existing->id,
                            'existing' => [
                                'id' => $existing->id,
                                'fullName' => $existing->full_name,
                                'surname' => $existing->surname,
                                'otherNames' => $existing->other_names,
                                'email' => $existing->email,
                                'phone' => $existing->phone,
                                'faculty' => $existing->faculty,
                                'department' => $existing->department,
                                'level' => $existing->level,
                                'hasScheduled' => (bool) $existing->has_scheduled,
                            ],
                            'new' => [
                                'fullName' => $this->studentFullName($student),
                                'surname' => $this->studentValue($student, 'surname'),
                                'otherNames' => $this->studentValue($student, 'other_names'),
                                'email' => $this->studentValue($student, 'email'),
                                'phone' => $this->studentValue($student, 'phone'),
                                'faculty' => $this->studentValue($student, 'faculty'),
                                'department' => $this->studentValue($student, 'department'),
                                'level' => $this->studentValue($student, 'level'),
                                'jambNumber' => $this->studentValue($student, 'jamb_number'),
                                'pgRegNumber' => $this->studentValue($student, 'pg_reg_number'),
                                'extraFields' => $this->studentExtraFields($student),
                            ],
                        ];
                    } else {
                        $nonDuplicates[] = $student;
                    }
                }

                // Return duplicates for user decision
                return response()->json([
                    'success' => true,
                    'hasDuplicates' => true,
                    'duplicates' => $duplicates,
                    'nonDuplicates' => $nonDuplicates,
                    'message' => count($duplicates).' duplicate matric number(s) found. Please review and decide how to handle them.',
                ]);
            }
        }

        // No duplicates - proceed with normal import
        $imported = 0;
        $errors = [];
        $now = now();
        $codes = $this->generateUniqueLoginCodes(count($students));

        try {
            DB::beginTransaction();
            foreach ($students as $i => $student) {
                try {
                    DB::table('scheduled_students')->insert([
                        'config_id' => $id,
                        'matric_number' => $this->studentValue($student, 'matric_number'),
                        'jamb_number' => $this->studentValue($student, 'jamb_number'),
                        'pg_reg_number' => $this->studentValue($student, 'pg_reg_number'),
                        'full_name' => $this->studentFullName($student),
                        'surname' => $this->studentValue($student, 'surname'),
                        'other_names' => $this->studentValue($student, 'other_names'),
                        'email' => $this->studentValue($student, 'email'),
                        'phone' => $this->studentValue($student, 'phone'),
                        'faculty' => $this->studentValue($student, 'faculty'),
                        'department' => $this->studentValue($student, 'department'),
                        'level' => $this->studentValue($student, 'level'),
                        'extra_fields' => json_encode($this->studentExtraFields($student)),
                        'login_code' => $codes[$i],
                        'created_at' => $now,
                        'updated_at' => $now,
                    ]);
                    $imported++;
                } catch (\Throwable $e) {
                    $errors[] = ['student' => $this->studentValue($student, 'email') ?? 'unknown-email', 'error' => $e->getMessage()];
                }
            }
            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();
            report($e);

            return response()->json(['message' => 'Student import failed: '.$e->getMessage()], 500);
        }

        ActivityLogger::log($user['id'], 'STUDENTS_IMPORTED', "Imported {$imported} students for scheduling ID: {$id}");

        return response()->json([
            'success' => true,
            'message' => "Successfully imported {$imported} students",
            'imported' => $imported,
            'errors' => $errors ?: null,
        ]);
    }

    // GET /api/scheduling/{id}/students
    public function students(int $id)
    {
        $students = DB::table('scheduled_students as ss')
            ->leftJoin('appointments as a', 'ss.id', '=', 'a.student_id')
            ->select('ss.*', 'a.appointment_date', 'a.appointment_time', 'a.status as appointment_status')
            ->where('ss.config_id', $id)
            ->orderByDesc('ss.has_scheduled')
            ->orderByDesc('ss.created_at')
            ->get();

        return response()->json(['success' => true, 'students' => $students]);
    }

    // GET /api/scheduling/{id}/slots
    public function slots(int $id)
    {
        $slots = DB::table('time_slots')
            ->where('config_id', $id)
            ->where('is_available', true)
            ->whereColumn('booked', '<', 'capacity')
            ->orderBy('slot_date')
            ->orderBy('slot_time')
            ->get();

        return response()->json(['success' => true, 'slots' => $slots]);
    }

    // POST /api/scheduling/{id}/send-emails
    public function sendEmails(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        if (! config('mail.mailers.smtp.username') || ! config('mail.mailers.smtp.password')) {
            return response()->json(['message' => 'SMTP credentials are not configured'], 400);
        }

        $config = DB::table('scheduling_config')->where('id', $id)->first();
        if (! $config) {
            return response()->json(['message' => 'Configuration not found'], 404);
        }

        // Students who already have a successful appointment don't need the
        // booking invite again, so they're excluded from every step below.
        DB::table('scheduled_students')->where('config_id', $id)->where('has_scheduled', false)->update(['email_sent' => false]);

        // Backfill any student left with a NULL login_code (e.g. from a cancelled
        // booking before that flow re-issued one) so every invite actually has a code.
        $studentsMissingCode = DB::table('scheduled_students')->where('config_id', $id)->where('has_scheduled', false)->whereNull('login_code')->get(['id']);
        foreach ($studentsMissingCode as $row) {
            DB::table('scheduled_students')->where('id', $row->id)->update([
                'login_code' => $this->generateUniqueLoginCode(),
                'updated_at' => now(),
            ]);
        }

        $students = DB::table('scheduled_students')->where('config_id', $id)->where('has_scheduled', false)->get();

        if ($students->isEmpty()) {
            return response()->json(['success' => true, 'message' => 'No students left to email for this schedule (all have already scheduled an appointment).', 'sent' => 0]);
        }

        $frontendUrl = rtrim((string) env('FRONTEND_URL', ''), '/');
        // Unset or a leftover localhost value: use the address this request came in on.
        if ($frontendUrl === '' || preg_match('#^https?://(localhost|127\.0\.0\.1)#i', $frontendUrl)) {
            $frontendUrl = request()->getSchemeAndHttpHost();
        }
        $schedulingUrl = "{$frontendUrl}/schedule/{$id}";

        $startDateStr = $config->start_date ? Carbon::parse($config->start_date)->format('j F Y') : 'TBD';
        $endDateStr = $config->end_date ? Carbon::parse($config->end_date)->format('j F Y') : 'TBD';
        $location = $config->location ?: 'ID Card Unit, University of Ibadan';
        $importantLines = array_values(array_filter(array_map('trim', explode("\n", (string) $config->important_message))));
        $logoPath = $this->logoPath();

        $sent = 0;
        $failed = 0;
        $errors = [];

        foreach ($students as $student) {
            if (! $student->email) {
                continue;
            }

            try {
                $logoCid = 'ui-logo@idcardunit';

                $html = view('emails.scheduling-invite', [
                    'student' => $student,
                    'config' => $config,
                    'schedulingUrl' => $schedulingUrl,
                    'startDateStr' => $startDateStr,
                    'endDateStr' => $endDateStr,
                    'location' => $location,
                    'importantLines' => $importantLines,
                    'logoCid' => $logoPath ? $logoCid : null,
                ])->render();

                Mail::html($html, function ($message) use ($student, $config, $logoPath, $logoCid) {
                    $message->to($student->email)->subject("Book Your ID Card Appointment — {$config->title}");
                    if ($logoPath && is_file($logoPath)) {
                        $message->embedData(file_get_contents($logoPath), $logoCid, 'image/png');
                    }
                });

                DB::table('scheduled_students')->where('id', $student->id)->update(['email_sent' => true]);
                $sent++;
            } catch (\Throwable $e) {
                $failed++;
                $errors[] = ['student' => $student->email, 'error' => $e->getMessage()];
                report($e);
            }
        }

        ActivityLogger::log($user['id'], 'EMAILS_SENT', "Sent {$sent}/{$students->count()} scheduling emails for config ID: {$id}".($failed ? " ({$failed} failed to send)" : ''));

        $message = $failed > 0
            ? "Sent {$sent} of {$students->count()} email(s). {$failed} failed to send."
            : "Sent {$sent} email(s).";

        return response()->json([
            'success' => true,
            'message' => $message,
            'sent' => $sent,
            'failed' => $failed,
            'errors' => $errors ?: null,
        ]);
    }

    // DELETE /api/scheduling/{id}              -> keeps all data (archives the schedule)
    // DELETE /api/scheduling/{id}?deleteData=1 -> permanently deletes the schedule AND its data
    public function destroy(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        $config = DB::table('scheduling_config')->where('id', $id)->first();
        if (! $config) {
            return response()->json(['message' => 'Scheduling configuration not found'], 404);
        }

        $studentCount = DB::table('scheduled_students')->where('config_id', $id)->count();
        $appointmentCount = DB::table('appointments')->where('config_id', $id)->count();
        $counts = ['config' => $config->title, 'students' => $studentCount, 'appointments' => $appointmentCount];

        if (! $request->boolean('deleteData', false)) {
            // Keep everything: just hide the schedule and stop students from using it.
            DB::table('scheduling_config')->where('id', $id)->update([
                'archived_at' => now(),
                'is_closed' => true,
                'is_active' => false,
                'updated_at' => now(),
            ]);

            ActivityLogger::log($user['id'], 'SCHEDULING_ARCHIVED', "Archived scheduling (data kept): {$config->title} ({$studentCount} students, {$appointmentCount} appointments)");

            return response()->json([
                'success' => true,
                'archived' => true,
                'message' => "\"{$config->title}\" was archived. All its data was kept.",
                'deleted' => $counts,
            ]);
        }

        // scheduled_students / time_slots / appointments cascade via FK on delete.
        DB::table('scheduling_config')->where('id', $id)->delete();

        ActivityLogger::log($user['id'], 'SCHEDULING_DELETED', "Deleted scheduling: {$config->title} ({$studentCount} students, {$appointmentCount} appointments)");

        return response()->json([
            'success' => true,
            'archived' => false,
            'message' => 'Scheduling configuration and all related data deleted successfully',
            'deleted' => $counts,
        ]);
    }

    // PUT /api/scheduling/{id}/restore
    public function restore(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');

        $config = DB::table('scheduling_config')->where('id', $id)->first();
        if (! $config) {
            return response()->json(['message' => 'Scheduling configuration not found'], 404);
        }
        if (! $config->archived_at) {
            return response()->json(['message' => 'This schedule is not archived'], 400);
        }

        // Comes back CLOSED so nothing opens to students by accident.
        DB::table('scheduling_config')->where('id', $id)->update([
            'archived_at' => null,
            'is_active' => true,
            'is_closed' => true,
            'updated_at' => now(),
        ]);

        ActivityLogger::log($user['id'], 'SCHEDULING_RESTORED', "Restored archived scheduling: {$config->title}");

        return response()->json([
            'success' => true,
            'message' => "\"{$config->title}\" was restored. It is closed - reopen it when you are ready.",
        ]);
    }

    /**
     * Moves the current students, slots and appointments of $config into a NEW archived
     * copy of the schedule, so the live schedule can start fresh without losing any data.
     */
    private function archivePreviousBatch(object $config, $now): void
    {
        $hasData = DB::table('scheduled_students')->where('config_id', $config->id)->exists()
            || DB::table('time_slots')->where('config_id', $config->id)->exists()
            || DB::table('appointments')->where('config_id', $config->id)->exists();

        if (! $hasData) {
            return;
        }

        $copy = (array) $config;
        unset($copy['id']);
        $copy['title'] = Str::limit($config->title, 190, '').' (previous batch, archived '.$now->format('Y-m-d H:i').')';
        $copy['is_active'] = false;
        $copy['is_closed'] = true;
        $copy['archived_at'] = $now;
        $copy['updated_at'] = $now;

        $archiveId = DB::table('scheduling_config')->insertGetId($copy);

        DB::table('appointments')->where('config_id', $config->id)->update(['config_id' => $archiveId]);
        DB::table('scheduled_students')->where('config_id', $config->id)->update(['config_id' => $archiveId]);
        DB::table('time_slots')->where('config_id', $config->id)->update(['config_id' => $archiveId]);
    }

    // POST /api/scheduling/{id}/manual-book
    public function manualBookStudent(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $existingStudentId = $request->input('existingStudentId');
        $slotId = $request->input('slotId');
        $fullName = $request->input('fullName');
        $email = $request->input('email');
        $matricNumber = $request->input('matricNumber');

        if (! $slotId) {
            return response()->json(['message' => 'slotId is required'], 400);
        }

        $config = DB::table('scheduling_config')->where('id', $id)->first(['title', 'location']);
        if (! $config) {
            return response()->json(['message' => 'Scheduling configuration not found'], 404);
        }

        return DB::transaction(function () use ($id, $config, $existingStudentId, $slotId, $fullName, $email, $matricNumber, $user) {
            $slot = DB::table('time_slots')
                ->where('id', $slotId)->where('config_id', $id)
                ->whereColumn('booked', '<', 'capacity')
                ->lockForUpdate()
                ->first();

            if (! $slot) {
                return response()->json(['message' => 'Slot is not available or does not belong to this config'], 400);
            }

            if ($existingStudentId) {
                $studentRow = DB::table('scheduled_students')->where('id', $existingStudentId)->where('config_id', $id)->first();
                if (! $studentRow) {
                    return response()->json(['message' => 'Student not found in this config'], 404);
                }
                if ($studentRow->has_scheduled) {
                    return response()->json(['message' => 'Student is already scheduled'], 400);
                }
            } else {
                if (! $fullName || ! $email) {
                    return response()->json(['message' => 'fullName and email are required for new students'], 400);
                }
                $newId = DB::table('scheduled_students')->insertGetId([
                    'config_id' => $id,
                    'full_name' => $fullName,
                    'email' => $email,
                    'matric_number' => $matricNumber,
                    'login_code' => $this->generateUniqueLoginCode(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $studentRow = DB::table('scheduled_students')->where('id', $newId)->first();
            }

            $captureLoginCode = $this->generateUniqueCaptureLoginCode();

            DB::table('appointments')->insert([
                'config_id' => $id,
                'student_id' => $studentRow->id,
                'slot_id' => $slotId,
                'appointment_date' => $slot->slot_date,
                'appointment_time' => $slot->slot_time,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            DB::table('time_slots')->where('id', $slotId)->increment('booked');

            DB::table('scheduled_students')->where('id', $studentRow->id)->update([
                'has_scheduled' => true,
                'scheduled_date' => $slot->slot_date,
                'scheduled_time' => $slot->slot_time,
                'login_code' => null,
                'capture_login_code' => $captureLoginCode,
                'updated_at' => now(),
            ]);

            ActivityLogger::log($user['id'], 'STUDENT_MANUALLY_INSERTED', "{$studentRow->full_name} inserted into slot {$slotId} for config {$id}");

            $emailSent = false;
            $emailError = null;
            if ($studentRow->email) {
                try {
                    $html = view('emails.manual-booking-confirmed', [
                        'student' => $studentRow,
                        'slot' => $slot,
                        'configTitle' => $config->title,
                        'captureLoginCode' => $captureLoginCode,
                        'location' => $config->location,
                        'matricNumber' => $matricNumber,
                    ])->render();

                    Mail::html($html, function ($message) use ($studentRow, $config) {
                        $message->to($studentRow->email)->subject("Booking Confirmed — {$config->title}");
                    });
                    $emailSent = true;
                } catch (\Throwable $e) {
                    $emailError = $e->getMessage();
                    report($e);
                }
            }

            return response()->json([
                'success' => true,
                'message' => "{$studentRow->full_name} has been scheduled for ".Carbon::parse($slot->slot_date)->toFormattedDateString().' at '.substr($slot->slot_time, 0, 5),
                'captureLoginCode' => $captureLoginCode,
                'confirmationEmailSent' => $emailSent,
                'confirmationEmailError' => $emailError,
            ]);
        });
    }

    // POST /api/scheduling/{id}/resolve-duplicates
    public function resolveDuplicates(Request $request, int $id)
    {
        $user = $request->attributes->get('authUser');
        $decisions = $request->input('decisions', []);
        $nonDuplicates = $request->input('nonDuplicates', []);

        if (empty($decisions) && empty($nonDuplicates)) {
            return response()->json(['message' => 'No decisions or non-duplicates provided'], 400);
        }

        $overwriteCount = 0;
        $keepBothCount = 0;
        $nonDuplicateCount = 0;
        $errors = [];
        $now = now();

        try {
            DB::beginTransaction();

            // Process duplicate decisions
            foreach ($decisions as $decision) {
                $matricNo = $decision['matricNumber'] ?? null;
                $action = $decision['action'] ?? null;
                $existingId = $decision['existingStudentId'] ?? null;
                $newData = $decision['new'] ?? null;

                if (! $matricNo || ! $action || ! $newData) {
                    $errors[] = ['matricNumber' => $matricNo, 'error' => 'Missing required fields'];

                    continue;
                }

                try {
                    if ($action === 'overwrite') {
                        // Update existing record with new data
                        $existing = DB::table('scheduled_students')->where('id', $existingId)->first();
                        if (! $existing) {
                            $errors[] = ['matricNumber' => $matricNo, 'error' => 'Existing student not found'];

                            continue;
                        }

                        $updateData = [
                            'full_name' => $newData['fullName'] ?? $existing->full_name,
                            'surname' => $newData['surname'],
                            'other_names' => $newData['otherNames'],
                            'email' => $newData['email'],
                            'phone' => $newData['phone'],
                            'faculty' => $newData['faculty'],
                            'department' => $newData['department'],
                            'level' => $newData['level'],
                            'jamb_number' => $newData['jambNumber'],
                            'pg_reg_number' => $newData['pgRegNumber'],
                            'extra_fields' => json_encode($newData['extraFields'] ?? []),
                            'updated_at' => $now,
                        ];

                        // Regenerate login code only if student hasn't scheduled yet
                        if (! $existing->has_scheduled) {
                            $updateData['login_code'] = $this->generateUniqueLoginCode();
                        }

                        DB::table('scheduled_students')->where('id', $existingId)->update($updateData);
                        $overwriteCount++;
                    } elseif ($action === 'keep_both') {
                        // Insert new record as-is
                        DB::table('scheduled_students')->insert([
                            'config_id' => $id,
                            'matric_number' => $matricNo,
                            'jamb_number' => $newData['jambNumber'],
                            'pg_reg_number' => $newData['pgRegNumber'],
                            'full_name' => $newData['fullName'] ?? 'Unknown Student',
                            'surname' => $newData['surname'],
                            'other_names' => $newData['otherNames'],
                            'email' => $newData['email'],
                            'phone' => $newData['phone'],
                            'faculty' => $newData['faculty'],
                            'department' => $newData['department'],
                            'level' => $newData['level'],
                            'extra_fields' => json_encode($newData['extraFields'] ?? []),
                            'login_code' => $this->generateUniqueLoginCode(),
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                        $keepBothCount++;
                    } else {
                        $errors[] = ['matricNumber' => $matricNo, 'error' => 'Invalid action: '.$action];
                    }
                } catch (\Throwable $e) {
                    $errors[] = ['matricNumber' => $matricNo, 'error' => $e->getMessage()];
                }
            }

            // Insert non-duplicates
            if (! empty($nonDuplicates)) {
                $codes = $this->generateUniqueLoginCodes(count($nonDuplicates));
                foreach ($nonDuplicates as $i => $student) {
                    try {
                        DB::table('scheduled_students')->insert([
                            'config_id' => $id,
                            'matric_number' => $this->studentValue($student, 'matric_number'),
                            'jamb_number' => $this->studentValue($student, 'jamb_number'),
                            'pg_reg_number' => $this->studentValue($student, 'pg_reg_number'),
                            'full_name' => $this->studentFullName($student),
                            'surname' => $this->studentValue($student, 'surname'),
                            'other_names' => $this->studentValue($student, 'other_names'),
                            'email' => $this->studentValue($student, 'email'),
                            'phone' => $this->studentValue($student, 'phone'),
                            'faculty' => $this->studentValue($student, 'faculty'),
                            'department' => $this->studentValue($student, 'department'),
                            'level' => $this->studentValue($student, 'level'),
                            'extra_fields' => json_encode($this->studentExtraFields($student)),
                            'login_code' => $codes[$i],
                            'created_at' => $now,
                            'updated_at' => $now,
                        ]);
                        $nonDuplicateCount++;
                    } catch (\Throwable $e) {
                        $errors[] = ['student' => $this->studentValue($student, 'email') ?? 'unknown', 'error' => $e->getMessage()];
                    }
                }
            }

            DB::commit();

            ActivityLogger::log($user['id'], 'DUPLICATES_RESOLVED', "Resolved duplicates for scheduling ID {$id}: {$overwriteCount} overwritten, {$keepBothCount} kept both, {$nonDuplicateCount} new inserted");

            return response()->json([
                'success' => true,
                'message' => 'Duplicates resolved successfully',
                'overwritten' => $overwriteCount,
                'keptBoth' => $keepBothCount,
                'imported' => $nonDuplicateCount,
                'errors' => $errors ?: null,
            ]);
        } catch (\Throwable $e) {
            DB::rollBack();
            report($e);

            return response()->json(['message' => 'Failed to resolve duplicates: '.$e->getMessage()], 500);
        }
    }
}
