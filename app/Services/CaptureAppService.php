<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Faithful port of backend/services/captureAppIntegration.js.
 *
 * Talks to the external "capture app" (the fingerprint/photo capture
 * application) over HTTP, syncs its approved cards into this system's
 * approved_cards/print_queue tables, and proxies fingerprint verification
 * for the collections workflow.
 */
class CaptureAppService
{
    private Client $http;

    private string $baseUrl;

    public function __construct()
    {
        $this->baseUrl = rtrim(config('services.capture_app.url'), '/');
        $this->http = new Client(['timeout' => 300]);
    }

    private function verifyApiKeyHeader(): array
    {
        return ['X-Api-Key' => config('services.capture_app.verify_api_key', '')];
    }

    private function toNullableText($value): ?string
    {
        if ($value === null) {
            return null;
        }
        $text = trim((string) $value);

        return $text !== '' ? $text : null;
    }

    private function firstNonEmpty(...$values): ?string
    {
        foreach ($values as $value) {
            $normalized = $this->toNullableText($value);
            if ($normalized !== null) {
                return $normalized;
            }
        }

        return null;
    }

    private function firstImageValue(...$values): ?string
    {
        foreach ($values as $value) {
            if (is_string($value) && trim($value) !== '') {
                return trim($value);
            }
        }

        return null;
    }

    public function decodeImageData(mixed $encoded): ?string
    {
        if ($encoded === null || $encoded === '') {
            return null;
        }

        if (!is_string($encoded)) {
            Log::warning('Capture app returned image data in an unsupported format');

            return null;
        }

        if (trim($encoded) === '') {
            return null;
        }

        $encoded = preg_replace('/^data:image\/[^;]+;base64,/i', '', trim($encoded));
        $decoded = base64_decode(preg_replace('/\s+/', '', $encoded), true);

        if ($decoded === false) {
            Log::warning('Capture app returned invalid base64 image data');

            return null;
        }

        return $decoded;
    }

    private function normalizeFingerprint(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        $trimmed = trim($value);
        if ($trimmed === '') {
            return null;
        }
        $marker = 'base64,';
        $pos = strpos($trimmed, $marker);
        if ($pos !== false) {
            return preg_replace('/\s+/', '', substr($trimmed, $pos + strlen($marker)));
        }

        return preg_replace('/\s+/', '', $trimmed);
    }

    private function extractScannedTemplateCandidates(array $scanPayload): array
    {
        $keys = ['template', 'Template', 'fingerprintTemplate', 'fingerprintData', 'ISOFMR', 'AnsiTemplate', 'WSQ', 'Base64Template'];
        $templates = [];
        foreach ($keys as $key) {
            $normalized = $this->normalizeFingerprint($scanPayload[$key] ?? null);
            if ($normalized) {
                $templates[] = $normalized;
            }
        }

        return array_values(array_unique($templates));
    }

    private function extractImageCandidates(array $scanPayload): array
    {
        $keys = ['FigPicBase64', 'figPicBase64', 'image', 'fingerImage'];
        $images = [];
        foreach ($keys as $key) {
            $normalized = $this->normalizeFingerprint($scanPayload[$key] ?? null);
            if ($normalized) {
                $images[] = $normalized;
            }
        }

        return array_values(array_unique($images));
    }

    private function extractStoredTemplateCandidates(array $payload): array
    {
        $keys = ['template', 'Template', 'fingerprintTemplate', 'fingerprintData', 'ISOFMR', 'AnsiTemplate', 'WSQ', 'Base64Template', 'data'];
        $out = [];
        foreach ($keys as $key) {
            $value = $payload[$key] ?? null;
            if (is_string($value)) {
                $normalized = $this->normalizeFingerprint($value);
                if ($normalized) {
                    $out[] = $normalized;
                }
            } elseif (is_array($value)) {
                foreach ($this->extractStoredTemplateCandidates($value) as $nested) {
                    $out[] = $nested;
                }
            }
        }

        return array_values(array_unique($out));
    }

    private function extractIdentityCandidatesFromFingerprintPayload(array $payload): array
    {
        $data = $payload['data'] ?? [];
        $candidates = [
            $payload['cardId'] ?? null, $payload['card_id'] ?? null,
            $payload['userId'] ?? null, $payload['user_id'] ?? null,
            $data['cardId'] ?? null, $data['card_id'] ?? null,
        ];

        return array_values(array_unique(array_filter(array_map([$this, 'toNullableText'], $candidates))));
    }

    private function isMatchedResponse(array $responseData): bool
    {
        $truthy = function ($value) {
            if ($value === true) {
                return true;
            }
            if (is_numeric($value)) {
                return $value > 0;
            }
            if (is_string($value)) {
                return in_array(strtolower(trim($value)), ['true', 'matched', 'match', 'success', 'ok', 'verified', 'pass'], true);
            }

            return false;
        };

        foreach (['matched', 'match', 'isMatch', 'verified', 'success'] as $key) {
            if ($truthy($responseData[$key] ?? null)) {
                return true;
            }
        }

        $nested = $responseData['data'] ?? null;
        if (is_array($nested)) {
            foreach (['matched', 'match', 'isMatch', 'verified', 'success'] as $key) {
                if ($truthy($nested[$key] ?? null)) {
                    return true;
                }
            }
        }

        return false;
    }

    private function verifyWithCaptureMatcher(array $identityCandidates, array $scanCandidates): array
    {
        $ids = array_values(array_unique(array_filter(array_map('strval', $identityCandidates))));
        $scans = array_values(array_unique(array_filter(array_map('strval', $scanCandidates))));

        foreach ($ids as $idValue) {
            foreach ($scans as $scanValue) {
                if (strlen($scanValue) < 16) {
                    continue;
                }

                try {
                    $response = $this->http->post("{$this->baseUrl}/api/verify/fingerprint", [
                        'headers' => $this->verifyApiKeyHeader(),
                        'json' => [
                            'cardId' => $idValue,
                            'card_id' => $idValue,
                            'userId' => $idValue,
                            'fingerprintData' => $scanValue,
                            'scannedFingerprint' => $scanValue,
                            'fingerprintImage' => $scanValue,
                            'scannedFingerprintImage' => $scanValue,
                        ],
                    ]);

                    $data = json_decode((string) $response->getBody(), true) ?: [];

                    if ($this->isMatchedResponse($data)) {
                        $nested = is_array($data['data'] ?? null) ? $data['data'] : [];

                        return [
                            'success' => true,
                            'matched' => true,
                            'studentName' => $data['studentName'] ?? $data['fullName'] ?? $nested['studentName'] ?? $nested['fullName'] ?? null,
                            'message' => $data['message'] ?? $nested['message'] ?? 'Verification complete',
                        ];
                    }
                } catch (RequestException $e) {
                    $status = $e->getResponse()?->getStatusCode();
                    if (in_array($status, [400, 404], true)) {
                        continue;
                    }
                    throw $e;
                }
            }
        }

        return [
            'success' => true,
            'matched' => false,
            'studentName' => null,
            'message' => 'Fingerprint did not match stored templates',
        ];
    }

    private function extractCardIdentity(array $card): array
    {
        $academic = $card['academic'] ?? $card['academic_info'] ?? $card['academicInfo'] ?? $card['student'] ?? [];
        $identity = $card['identity'] ?? $card['student_identity'] ?? $card['studentIdentity'] ?? [];

        return [
            'id' => $card['id'] ?? $card['card_id'] ?? $card['cardId'] ?? $card['approved_card_id'] ?? $card['approvedCardId'] ?? null,
            'surname' => $this->firstNonEmpty($card['surname'] ?? null, $card['last_name'] ?? null, $card['lastName'] ?? null, $card['family_name'] ?? null, $identity['surname'] ?? null, $identity['last_name'] ?? null),
            'other_names' => $this->firstNonEmpty($card['other_names'] ?? null, $card['otherNames'] ?? null, $card['first_name'] ?? null, $card['full_name'] ?? null, $card['name'] ?? null, $identity['other_names'] ?? null, $identity['full_name'] ?? null),
            'matric_no' => $this->firstNonEmpty($card['matric_no'] ?? null, $card['matricNumber'] ?? null, $card['matric_number'] ?? null, $identity['matric_no'] ?? null),
            'staff_id' => $this->firstNonEmpty($card['staff_id'] ?? null, $card['staffId'] ?? null, $identity['staff_id'] ?? null),
            'faculty' => $this->firstNonEmpty($card['faculty'] ?? null, $card['school'] ?? null, $academic['faculty'] ?? null, $academic['school'] ?? null),
            'department' => $this->firstNonEmpty($card['department'] ?? null, $card['dept'] ?? null, $academic['department'] ?? null, $academic['programme'] ?? null),
            'level' => $this->firstNonEmpty($card['level'] ?? null, $card['class_level'] ?? null, $academic['level'] ?? null),
            'card_number' => $this->firstNonEmpty($card['card_number'] ?? null, $card['cardNumber'] ?? null, $card['id_number'] ?? null, $identity['card_number'] ?? null),
            'session' => $this->firstNonEmpty($card['session'] ?? null, $card['academic_session'] ?? null, $academic['session'] ?? null),
            'hall' => $this->firstNonEmpty($card['hall'] ?? null, $card['hostel'] ?? null, $card['residence'] ?? null, $identity['hall'] ?? null),
            'passport_photo' => $card['passport_photo'] ?? $card['passportPhoto'] ?? $card['photo'] ?? null,
            'signature' => $this->firstImageValue(
                $card['signature'] ?? null,
                $card['signature_photo'] ?? null,
                $card['signaturePhoto'] ?? null,
                $card['signature_image'] ?? null,
                $card['signatureImage'] ?? null,
                $card['signature_base64'] ?? null,
                $card['signatureBase64'] ?? null,
                $identity['signature'] ?? null
            ),
            'approved_at' => $card['approved_at'] ?? $card['updated_at'] ?? $card['created_at'] ?? now()->toIso8601String(),
        ];
    }

    private function mergeCardIdentity(array $primary, array $fallback): array
    {
        return [
            'id' => $primary['id'] ?? $fallback['id'] ?? $fallback['card_id'] ?? null,
            'surname' => $this->firstNonEmpty($primary['surname'] ?? null, $fallback['surname'] ?? null),
            'other_names' => $this->firstNonEmpty($primary['other_names'] ?? null, $fallback['other_names'] ?? null),
            'matric_no' => $this->firstNonEmpty($primary['matric_no'] ?? null, $fallback['matric_no'] ?? null),
            'staff_id' => $this->firstNonEmpty($primary['staff_id'] ?? null, $fallback['staff_id'] ?? null),
            'faculty' => $this->firstNonEmpty($primary['faculty'] ?? null, $fallback['faculty'] ?? null),
            'department' => $this->firstNonEmpty($primary['department'] ?? null, $fallback['department'] ?? null),
            'level' => $this->firstNonEmpty($primary['level'] ?? null, $fallback['level'] ?? null),
            'card_number' => $this->firstNonEmpty($primary['card_number'] ?? null, $fallback['card_number'] ?? null),
            'session' => $this->firstNonEmpty($primary['session'] ?? null, $fallback['session'] ?? null),
            'hall' => $this->firstNonEmpty($primary['hall'] ?? null, $fallback['hall'] ?? null),
            'passport_photo' => $primary['passport_photo'] ?? $fallback['passport_photo'] ?? null,
            'signature' => $this->firstImageValue($primary['signature'] ?? null, $fallback['signature'] ?? null),
            'approved_at' => $primary['approved_at'] ?? $fallback['approved_at'] ?? now()->toIso8601String(),
        ];
    }

    private function buildMetadataLookupKeys(array $card): array
    {
        $keys = [$card['id'] ?? null, $card['matric_no'] ?? null, $card['staff_id'] ?? null, $card['card_number'] ?? null];
        $keys = array_filter(array_map([$this, 'toNullableText'], $keys));

        return array_values(array_unique(array_map('strval', $keys)));
    }

    private function fetchApprovedCards(): array
    {
        try {
            $response = $this->http->get("{$this->baseUrl}/api/printing/approved");
            $data = json_decode((string) $response->getBody(), true) ?: [];

            if (empty($data['success'])) {
                return [];
            }

            return $data['cards'] ?? $data['approved'] ?? [];
        } catch (\Throwable $e) {
            Log::warning('Unable to fetch approved metadata from capture app: '.$e->getMessage());

            return [];
        }
    }

    private function buildApprovedMetadataMap(array $cards): array
    {
        $map = [];
        foreach ($cards as $rawCard) {
            if (!is_array($rawCard)) {
                continue;
            }

            $identity = $this->extractCardIdentity($rawCard);
            foreach ($this->buildMetadataLookupKeys($identity) as $key) {
                $map[$key] = $identity;
            }
        }

        return $map;
    }

    private function backfillExistingSignatures(array $cards): int
    {
        // Only rows that still lack a signature can be backfilled. Load those
        // card IDs once, so after the first pass this issues zero queries
        // instead of two per capture-app card on every sync.
        $missingApproved = DB::table('approved_cards')->whereNull('signature')->pluck('card_id')->flip();
        $missingQueue = DB::table('print_queue')->whereNull('signature')->pluck('card_id')->flip();

        if ($missingApproved->isEmpty() && $missingQueue->isEmpty()) {
            return 0;
        }

        $updated = 0;

        foreach ($cards as $rawCard) {
            if (!is_array($rawCard)) {
                continue;
            }

            $identity = $this->extractCardIdentity($rawCard);
            $id = $identity['id'] ?? null;
            if (empty($id) || empty($identity['signature'])) {
                continue;
            }

            $needsApproved = isset($missingApproved[$id]);
            $needsQueue = isset($missingQueue[$id]);
            if (! $needsApproved && ! $needsQueue) {
                continue;
            }

            $signature = $this->decodeImageData($identity['signature']);
            if ($signature === null) {
                continue;
            }

            if ($needsApproved) {
                $updated += DB::table('approved_cards')
                    ->where('card_id', $id)
                    ->whereNull('signature')
                    ->update(['signature' => $signature, 'updated_at' => now()]);
                $missingApproved->forget($id);
            }

            if ($needsQueue) {
                $updated += DB::table('print_queue')
                    ->where('card_id', $id)
                    ->whereNull('signature')
                    ->update(['signature' => $signature, 'updated_at' => now()]);
                $missingQueue->forget($id);
            }
        }

        return $updated;
    }

    public function ensureQueueExclusionsTable(): void
    {
        // Table is created by the print_queue migration; kept as a no-op
        // method to preserve the original call sites/behaviour.
    }

    public function excludeCardFromQueue(int $cardId, string $reason = 'removed', ?int $userId = null): void
    {
        DB::table('print_queue_exclusions')->updateOrInsert(
            ['card_id' => $cardId],
            ['reason' => $reason, 'created_by' => $userId, 'created_at' => now()]
        );
    }

    /**
     * Fetch approved cards from capture app and save to approved_cards
     * history table. Also adds new cards to the print queue.
     */
    public function syncApprovedCards(): array
    {
        try {
            $response = $this->http->get("{$this->baseUrl}/api/printing/queue");
            $data = json_decode((string) $response->getBody(), true) ?: [];

            if (empty($data['success'])) {
                throw new \RuntimeException('Failed to fetch print queue from capture app');
            }

            $queueCards = $data['cards'] ?? $data['queue'] ?? [];
            $approvedSourceCards = $this->fetchApprovedCards();
            $approvedMetadataMap = $this->buildApprovedMetadataMap($approvedSourceCards);
            $signatureBackfilled = $this->backfillExistingSignatures($approvedSourceCards);

            $approvedCards = [];
            foreach ($queueCards as $queueCard) {
                $queueIdentity = $this->extractCardIdentity($queueCard);
                $approvedIdentity = null;
                foreach ($this->buildMetadataLookupKeys($queueIdentity) as $key) {
                    if (isset($approvedMetadataMap[$key])) {
                        $approvedIdentity = $approvedMetadataMap[$key];
                        break;
                    }
                }
                $merged = $this->mergeCardIdentity($queueIdentity, $approvedIdentity ?: []);

                if ($merged['id'] === null) {
                    continue;
                }

                $status = $queueCard['status'] ?? null;
                if ($status !== null && strtolower($status) !== 'approved') {
                    continue;
                }

                $approvedCards[] = $merged;
            }

            $addedToHistory = 0;
            $addedToQueue = 0;
            $skipped = 0;
            $errors = 0;

            // Batch lookups: the loop used to issue ~5 queries per card, which
            // is painfully slow over a Wasmer region link (each query pays the
            // network round-trip). These five queries replace all of them.
            // Scalar columns only — no LONGBLOBs — except the on-demand fetch
            // below for locally corrected cards that need queueing.
            $historyMap = DB::table('approved_cards')
                ->select('card_id', 'manually_edited_at', 'surname', 'other_names', 'matric_no', 'staff_id', 'faculty', 'department', 'level', 'card_number', 'session', 'hall')
                ->get()
                ->keyBy('card_id');
            $queueMap = DB::table('print_queue')
                ->select('id', 'card_id', 'manually_edited_at')
                ->get()
                ->keyBy('card_id');
            $excludedIds = DB::table('print_queue_exclusions')->pluck('card_id')->flip();
            $collectedIds = DB::table('card_collections')->pluck('card_id')->flip();
            $historyIds = DB::table('print_history')->pluck('card_id')->flip();

            foreach ($approvedCards as $card) {
                try {
                    $passportBinary = $this->decodeImageData($card['passport_photo']);
                    $signatureBinary = $this->decodeImageData($card['signature']);

                    $historyExists = $historyMap->get($card['id']);
                    $historyEditedLocally = $historyExists && ($historyExists->manually_edited_at ?? null) !== null;

                    if (! $historyExists) {
                        DB::table('approved_cards')->insert([
                            'card_id' => $card['id'],
                            'surname' => $card['surname'],
                            'other_names' => $card['other_names'],
                            'matric_no' => $card['matric_no'],
                            'staff_id' => $card['staff_id'],
                            'faculty' => $card['faculty'],
                            'department' => $card['department'],
                            'level' => $card['level'],
                            'card_number' => $card['card_number'],
                            'session' => $card['session'],
                            'hall' => $card['hall'],
                            'passport_photo' => $passportBinary,
                            'signature' => $signatureBinary,
                            'approved_at' => $card['approved_at'] ?: now(),
                            'created_at' => now(),
                            'updated_at' => now(),
                        ]);
                        $addedToHistory++;
                        $historyMap[$card['id']] = (object) ['card_id' => $card['id'], 'manually_edited_at' => null];
                    } elseif (! $historyEditedLocally) {
                        DB::table('approved_cards')->where('card_id', $card['id'])->update(array_filter([
                            'surname' => $card['surname'],
                            'other_names' => $card['other_names'],
                            'matric_no' => $card['matric_no'],
                            'staff_id' => $card['staff_id'],
                            'faculty' => $card['faculty'],
                            'department' => $card['department'],
                            'level' => $card['level'],
                            'card_number' => $card['card_number'],
                            'session' => $card['session'],
                            'hall' => $card['hall'],
                        ], fn ($v) => $v !== null && $v !== '') + [
                            'passport_photo' => $passportBinary ?: DB::raw('passport_photo'),
                            'signature' => $signatureBinary ?: DB::raw('signature'),
                            'updated_at' => now(),
                            'synced_from_capture_app_at' => now(),
                        ]);
                    }

                    if (isset($excludedIds[$card['id']])) {
                        $skipped++;

                        continue;
                    }

                    if (isset($collectedIds[$card['id']])) {
                        $skipped++;

                        continue;
                    }

                    if (isset($historyIds[$card['id']])) {
                        $skipped++;

                        continue;
                    }

                    $queuedCard = $queueMap->get($card['id']);
                    if ($queuedCard) {
                        // Never overwrite a card that a supervisor corrected in
                        // this app (reprint edits, department changes, etc.).
                        if (($queuedCard->manually_edited_at ?? null) === null) {
                            DB::table('print_queue')->where('card_id', $card['id'])->update(array_filter([
                                'surname' => $card['surname'],
                                'other_names' => $card['other_names'],
                                'matric_no' => $card['matric_no'],
                                'staff_id' => $card['staff_id'],
                                'faculty' => $card['faculty'],
                                'department' => $card['department'],
                                'level' => $card['level'],
                                'card_number' => $card['card_number'],
                                'session' => $card['session'],
                                'hall' => $card['hall'],
                            ], fn ($v) => $v !== null && $v !== '') + [
                                'signature' => $signatureBinary ?: DB::raw('signature'),
                                'updated_at' => now(),
                            ]);
                        }
                        $skipped++;

                        continue;
                    }

                    // If a supervisor corrected this card, queue their corrected
                    // values rather than the stale capture-app copy. The batch
                    // map holds scalars only, so fetch the full row (with
                    // images) just for this rare case.
                    $localCard = $historyEditedLocally
                        ? DB::table('approved_cards')->where('card_id', $card['id'])->first()
                        : null;

                    DB::table('print_queue')->insert([
                        'card_id' => $card['id'],
                        'surname' => $localCard->surname ?? $card['surname'],
                        'other_names' => $localCard->other_names ?? $card['other_names'],
                        'matric_no' => $localCard->matric_no ?? $card['matric_no'],
                        'staff_id' => $localCard->staff_id ?? $card['staff_id'],
                        'faculty' => $localCard->faculty ?? $card['faculty'],
                        'department' => $localCard->department ?? $card['department'],
                        'level' => $localCard->level ?? $card['level'],
                        'card_number' => $localCard->card_number ?? $card['card_number'],
                        'session' => $localCard->session ?? $card['session'],
                        'hall' => $localCard->hall ?? $card['hall'],
                        'passport_photo' => $localCard->passport_photo ?? $passportBinary,
                        'signature' => $localCard->signature ?? $signatureBinary,
                        'status' => 'queued',
                        'manually_edited_at' => $historyEditedLocally ? now() : null,
                        'added_to_queue_at' => now(),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                    $addedToQueue++;
                    $queueMap[$card['id']] = (object) ['id' => null, 'card_id' => $card['id'], 'manually_edited_at' => $historyEditedLocally ? now() : null];
                } catch (\Throwable $e) {
                    Log::error("Error processing card {$card['id']}: ".$e->getMessage());
                    $errors++;
                }
            }

            return [
                'addedToHistory' => $addedToHistory,
                'addedToQueue' => $addedToQueue,
                'skipped' => $skipped,
                'errors' => $errors,
                'signaturesBackfilled' => $signatureBackfilled,
                'total' => count($approvedCards),
                'message' => "Synced {$addedToHistory} to history, {$addedToQueue} to queue, {$skipped} already in queue, {$signatureBackfilled} existing signatures restored, {$errors} errors",
            ];
        } catch (ConnectException $e) {
            Log::error("Capture app is not available at {$this->baseUrl}");

            return [
                'addedToHistory' => 0, 'addedToQueue' => 0, 'skipped' => 0, 'errors' => 0,
                'total' => 0, 'signaturesBackfilled' => 0, 'message' => 'Capture app not available',
            ];
        }
    }

    public function notifyCardPrinted(int $cardId): void
    {
        try {
            $this->http->post("{$this->baseUrl}/api/printing/mark-printed/{$cardId}");
        } catch (\Throwable $e) {
            Log::warning("Error notifying capture app for card {$cardId}: ".$e->getMessage());
        }
    }

    public function notifyCardCollected(int $cardId): void
    {
        try {
            $this->http->post("{$this->baseUrl}/api/printing/mark-collected/{$cardId}");
        } catch (\Throwable $e) {
            Log::warning("Error notifying capture app for card {$cardId}: ".$e->getMessage());
        }
    }

    /**
     * Verify a scanned fingerprint against the capture app's stored
     * templates for a card. Only one candidate needs to match.
     */
    public function verifyFingerprint($cardId, ?string $scannedFingerprintBase64, ?array $scanPayload = null, array $options = []): array
    {
        if (! $cardId) {
            return ['success' => false, 'matched' => false, 'message' => 'Card ID is required for fingerprint verification'];
        }

        if (! config('services.capture_app.url') || config('services.capture_app.url') === 'http://localhost:5001') {
            return [
                'success' => false,
                'matched' => false,
                'message' => 'Fingerprint verification is not available in this environment. Please configure CAPTURE_APP_URL.',
                'configIssue' => true,
                'diagnostic' => ['captureAppUrl' => $this->baseUrl],
            ];
        }

        $identityCandidates = array_values(array_filter(
            array_merge([$cardId], $options['identityCandidates'] ?? []),
            fn ($v) => $v !== null && trim((string) $v) !== ''
        ));

        $scanned = $this->normalizeFingerprint($scannedFingerprintBase64);
        if (! $scanned) {
            return ['success' => false, 'matched' => false, 'message' => 'Scanned fingerprint is required for verification'];
        }

        try {
            $storedTemplateCandidates = [];
            $payload = null;
            $resolvedIdentityCandidates = [];

            foreach ($identityCandidates as $candidate) {
                try {
                    $response = $this->http->get("{$this->baseUrl}/api/printing/fingerprint", [
                        'query' => ['cardId' => $candidate],
                        'headers' => $this->verifyApiKeyHeader(),
                    ]);
                    $data = json_decode((string) $response->getBody(), true) ?: [];

                    if (! empty($data['success'])) {
                        $payload = $data;
                        $storedTemplateCandidates = $this->extractStoredTemplateCandidates($data);
                        $resolvedIdentityCandidates = $this->extractIdentityCandidatesFromFingerprintPayload($data);
                        break;
                    }
                } catch (RequestException $e) {
                    if ($e->getResponse()?->getStatusCode() !== 404) {
                        throw $e;
                    }
                }
            }

            $scanImage = $this->normalizeFingerprint($options['scannedFingerprintImage'] ?? null);
            $scannedTemplates = $this->extractScannedTemplateCandidates($scanPayload ?: []);
            $imageCandidates = $this->extractImageCandidates($scanPayload ?: []);

            $scannerCandidates = array_values(array_filter(
                array_merge($scannedTemplates, [$scanned], $imageCandidates, [$scanImage]),
                fn ($v) => $v !== null && trim((string) $v) !== ''
            ));

            $uniqueScannerCandidates = array_values(array_unique($scannerCandidates));
            $fallbackStoredTemplates = empty($uniqueScannerCandidates) ? $storedTemplateCandidates : [];

            $matcherScanCandidates = array_merge($uniqueScannerCandidates, $fallbackStoredTemplates);
            $matcherIdentityCandidates = array_values(array_filter(
                array_merge($resolvedIdentityCandidates, $identityCandidates),
                fn ($v) => $v !== null && trim((string) $v) !== ''
            ));

            $matcherResult = $this->verifyWithCaptureMatcher($matcherIdentityCandidates, $matcherScanCandidates);

            return [
                'success' => true,
                'matched' => $matcherResult['matched'],
                'studentName' => $matcherResult['studentName']
                    ?? $payload['studentName'] ?? $payload['full_name']
                    ?? trim(($payload['surname'] ?? '').' '.($payload['other_names'] ?? '')) ?: null,
                'message' => $matcherResult['message'] ?? ($payload ? 'Fingerprint did not match stored templates' : 'Fingerprint record not found for this card'),
            ];
        } catch (ConnectException $e) {
            return [
                'success' => false,
                'matched' => false,
                'message' => "Cannot reach capture app at {$this->baseUrl}. Fingerprint verification unavailable.",
                'connectionError' => true,
                'diagnostic' => ['url' => $this->baseUrl],
            ];
        } catch (RequestException $e) {
            $status = $e->getResponse()?->getStatusCode();
            if ($status === 404) {
                return ['success' => false, 'matched' => false, 'message' => 'Fingerprint record not found for this card'];
            }
            $body = $e->getResponse() ? json_decode((string) $e->getResponse()->getBody(), true) : null;

            return [
                'success' => false,
                'matched' => false,
                'message' => $body['message'] ?? 'Fingerprint verification failed at capture app',
                'statusCode' => $status,
                'appError' => $body,
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'matched' => false, 'message' => 'Verification error: '.$e->getMessage()];
        }
    }
}
