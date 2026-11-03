<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\CardGenerationService;
use App\Support\ActivityLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use ZipArchive;

/**
 * Printed Cards Archive (supervisor only - enforced in routes/api.php).
 *
 *  - list printed cards that still have their data on this server
 *  - download selected cards as a ZIP backup (card images, passport photos, manifest.csv)
 *  - delete selected cards from the server to free space (only if backed up)
 *
 * Deleting removes the row from approved_cards (which holds the passport photo)
 * and the cached card PNGs. It does NOT touch card_collections, print_history or
 * print_queue_exclusions, so the printing/collection records stay and the card is
 * never put back into the print queue by the capture-app sync.
 */
class CardArchiveController extends Controller
{
    private const MAX_PER_DOWNLOAD = 100;
    private const MAX_PER_DELETE = 500;
    private const MAX_IDS_RETURNED = 20000;
    private const MAX_RESTORE_ROWS = 1000;
    private const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
    private const MAX_MANIFEST_BYTES = 20 * 1024 * 1024;

    public function __construct(private CardGenerationService $cardGeneration) {}

    /**
     * Printed cards (latest collection row per card) that still have an approved_cards row.
     */
    private function baseQuery(Request $request)
    {
        $query = DB::table('card_collections as cc')
            ->join('approved_cards as ac', 'ac.card_id', '=', 'cc.card_id')
            ->whereRaw('cc.id = (SELECT MAX(c2.id) FROM card_collections c2 WHERE c2.card_id = cc.card_id)');

        $search = trim((string) $request->query('search', ''));
        if ($search !== '') {
            $like = "%{$search}%";
            $query->where(function ($q) use ($like) {
                $q->where('cc.surname', 'like', $like)
                    ->orWhere('cc.other_names', 'like', $like)
                    ->orWhere('cc.matric_no', 'like', $like)
                    ->orWhere('cc.staff_id', 'like', $like)
                    ->orWhere('cc.card_number', 'like', $like);
            });
        }

        $status = $request->query('status');
        if (in_array($status, ['collected', 'awaiting_collection'], true)) {
            $query->where('cc.status', $status);
        }

        $backup = $request->query('backup');
        if ($backup === 'yes') {
            $query->whereNotNull('ac.archive_downloaded_at');
        } elseif ($backup === 'no') {
            $query->whereNull('ac.archive_downloaded_at');
        }

        if ($from = $request->query('startDate')) {
            $query->whereDate('cc.printed_at', '>=', $from);
        }
        if ($to = $request->query('endDate')) {
            $query->whereDate('cc.printed_at', '<=', $to);
        }

        return $query;
    }

    private function cleanIds($value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_unique(array_filter(
            array_map('intval', $value),
            fn ($v) => $v > 0
        )));
    }

    // GET /api/card-archive
    public function index(Request $request)
    {
        $page = max(1, (int) $request->query('page', 1));
        $limit = min(200, max(10, (int) $request->query('limit', 50)));

        $base = $this->baseQuery($request);
        $total = (clone $base)->count();

        $cards = $base
            ->select(
                'cc.card_id', 'cc.surname', 'cc.other_names', 'cc.matric_no', 'cc.staff_id',
                'cc.faculty', 'cc.department', 'cc.card_number', 'cc.printed_at', 'cc.status',
                'cc.collected_at', 'ac.archive_downloaded_at'
            )
            ->selectRaw('COALESCE(LENGTH(ac.passport_photo), 0) AS photo_bytes')
            ->orderByDesc('cc.printed_at')
            ->orderByDesc('cc.id')
            ->forPage($page, $limit)
            ->get();

        return response()->json([
            'success' => true,
            'cards' => $cards,
            'pagination' => [
                'page' => $page,
                'limit' => $limit,
                'total' => $total,
                'pages' => (int) max(1, ceil($total / $limit)),
            ],
        ]);
    }

    // GET /api/card-archive/ids  (every card id matching the filters, for "select all")
    public function ids(Request $request)
    {
        $ids = $this->baseQuery($request)
            ->orderByDesc('cc.printed_at')
            ->limit(self::MAX_IDS_RETURNED)
            ->pluck('cc.card_id')
            ->map(fn ($v) => (int) $v)
            ->all();

        return response()->json(['success' => true, 'ids' => $ids]);
    }

    // GET /api/card-archive/stats
    public function stats()
    {
        $row = DB::selectOne('
            SELECT
                COUNT(*) AS total_cards,
                COALESCE(SUM(LENGTH(ac.passport_photo)), 0) AS photo_bytes,
                COALESCE(SUM(CASE WHEN ac.archive_downloaded_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS backed_up
            FROM approved_cards ac
            WHERE EXISTS (SELECT 1 FROM card_collections cc WHERE cc.card_id = ac.card_id)
        ');

        $cacheBytes = 0;
        $cacheFiles = 0;
        try {
            foreach (Storage::files('card-images') as $file) {
                $cacheFiles++;
                $cacheBytes += (int) Storage::size($file);
            }
        } catch (\Throwable $e) {
            report($e);
        }

        $diskFree = @disk_free_space(storage_path());
        $diskTotal = @disk_total_space(storage_path());

        return response()->json([
            'success' => true,
            'stats' => [
                'total_cards' => (int) $row->total_cards,
                'backed_up' => (int) $row->backed_up,
                'photo_bytes' => (int) $row->photo_bytes,
                'cache_files' => $cacheFiles,
                'cache_bytes' => $cacheBytes,
                'disk_free_bytes' => $diskFree === false ? null : (int) $diskFree,
                'disk_total_bytes' => $diskTotal === false ? null : (int) $diskTotal,
                'upload_limit_bytes' => $this->uploadLimitBytes(),
            ],
        ]);
    }

    private function fileLabel(object $card): string
    {
        $idPart = $card->matric_no ?: ($card->staff_id ?: 'card');
        $label = preg_replace('/[^A-Za-z0-9_-]+/', '_', $idPart.'_'.$card->card_id);

        return trim((string) $label, '_');
    }

    private function photoExtension(string $binary): string
    {
        if (str_starts_with($binary, "\xFF\xD8")) {
            return 'jpg';
        }
        if (str_starts_with($binary, "\x89PNG")) {
            return 'png';
        }

        return 'bin';
    }

    // POST /api/card-archive/download   body: { cardIds: [...], includeCardImages: true }
    public function download(Request $request)
    {
        if (! class_exists(ZipArchive::class)) {
            return response()->json(['message' => 'The PHP "zip" extension is not enabled on the server.'], 500);
        }

        $user = $request->attributes->get('authUser');
        $ids = $this->cleanIds($request->input('cardIds'));
        $includeImages = $request->boolean('includeCardImages', true);

        if (empty($ids)) {
            return response()->json(['message' => 'Select at least one card to download.'], 422);
        }
        if (count($ids) > self::MAX_PER_DOWNLOAD) {
            return response()->json(['message' => 'Too many cards in one download (max '.self::MAX_PER_DOWNLOAD.').'], 422);
        }

        @set_time_limit(0);
        @ini_set('memory_limit', '1024M');

        $cards = DB::table('approved_cards')->whereIn('card_id', $ids)->orderBy('id')->get();
        if ($cards->isEmpty()) {
            return response()->json(['message' => 'None of the selected cards were found on the server.'], 404);
        }

        // Latest collection row per card (later rows overwrite earlier ones).
        $collections = DB::table('card_collections')
            ->whereIn('card_id', $ids)
            ->orderBy('id')
            ->get()
            ->keyBy('card_id');

        $tmp = tempnam(sys_get_temp_dir(), 'cards_');
        $zip = new ZipArchive();
        if ($zip->open($tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            return response()->json(['message' => 'Could not create the ZIP file on the server.'], 500);
        }

        $manifest = fopen('php://temp', 'r+');
        fputcsv($manifest, [
            'card_id', 'surname', 'other_names', 'matric_no', 'staff_id', 'faculty', 'department',
            'level', 'card_number', 'session', 'hall', 'approved_at', 'printed_at',
            'collection_status', 'collected_at', 'passport_photo_file', 'card_image_file',
        ], ',', '"', '\\');

        $imageFailures = 0;

        foreach ($cards as $card) {
            $label = $this->fileLabel($card);
            $collection = $collections->get($card->card_id);

            $photoFile = '';
            if (! empty($card->passport_photo)) {
                $photoFile = "passport_photos/{$label}.".$this->photoExtension($card->passport_photo);
                $zip->addFromString($photoFile, $card->passport_photo);
            }

            $imageFile = '';
            if ($includeImages) {
                try {
                    // Generated fresh (not from the cache) so the backup always matches current data.
                    $png = $this->cardGeneration->generateCardImage($card);
                    $imageFile = "card_images/{$label}.png";
                    $zip->addFromString($imageFile, $png);
                } catch (\Throwable $e) {
                    $imageFailures++;
                    report($e);
                }
            }

            fputcsv($manifest, [
                $card->card_id, $card->surname, $card->other_names, $card->matric_no, $card->staff_id,
                $card->faculty, $card->department, $card->level, $card->card_number, $card->session ?? '',
                $card->hall ?? '', $card->approved_at, $collection->printed_at ?? '',
                $collection->status ?? '', $collection->collected_at ?? '', $photoFile, $imageFile,
            ], ',', '"', '\\');
        }

        rewind($manifest);
        // UTF-8 BOM so Excel shows names with accents correctly.
        $zip->addFromString('manifest.csv', "\xEF\xBB\xBF".stream_get_contents($manifest));
        fclose($manifest);

        if (! $zip->close()) {
            @unlink($tmp);

            return response()->json(['message' => 'Failed to finish the ZIP file (is the server disk full?).'], 500);
        }

        $backedUpIds = $cards->pluck('card_id')->all();
        DB::table('approved_cards')->whereIn('card_id', $backedUpIds)->update(['archive_downloaded_at' => now()]);

        ActivityLogger::log(
            $user['id'] ?? null,
            'CARD_ARCHIVE_DOWNLOADED',
            'Downloaded backup ZIP of '.count($backedUpIds).' printed card(s)'
        );

        $name = 'printed-cards-backup-'.now()->format('Ymd-His').'.zip';

        return response()->download($tmp, $name, [
            'Content-Type' => 'application/zip',
            'X-Archive-Card-Count' => (string) count($backedUpIds),
            'X-Archive-Image-Failures' => (string) $imageFailures,
        ])->deleteFileAfterSend(true);
    }

    // POST /api/card-archive/delete   body: { cardIds: [...] }
    public function destroyMany(Request $request)
    {
        $user = $request->attributes->get('authUser');
        $ids = $this->cleanIds($request->input('cardIds'));

        if (empty($ids)) {
            return response()->json(['message' => 'Select at least one card to delete.'], 422);
        }
        if (count($ids) > self::MAX_PER_DELETE) {
            return response()->json(['message' => 'Too many cards in one request (max '.self::MAX_PER_DELETE.').'], 422);
        }

        // Columns only - the passport photo is NOT loaded here.
        $cards = DB::table('approved_cards')
            ->whereIn('card_id', $ids)
            ->get(['card_id', 'matric_no', 'updated_at', 'archive_downloaded_at'])
            ->keyBy('card_id');

        $collections = DB::table('card_collections')
            ->whereIn('card_id', $ids)
            ->orderBy('id')
            ->get(['card_id', 'status'])
            ->keyBy('card_id');

        $queuedSet = array_flip(
            DB::table('print_queue')
                ->whereIn('card_id', $ids)
                ->whereIn('status', ['queued', 'printing'])
                ->pluck('card_id')
                ->map(fn ($v) => (int) $v)
                ->all()
        );

        $matrics = $cards->pluck('matric_no')->filter()->unique()->values()->all();
        $openReprintSet = $matrics
            ? array_flip(
                DB::table('reprint_requests')
                    ->whereIn('matric_number', $matrics)
                    ->whereIn('status', ['pending', 'approved'])
                    ->pluck('matric_number')
                    ->all()
            )
            : [];

        $skipped = [
            'not found on server' => 0,
            'not printed yet' => 0,
            'still awaiting collection' => 0,
            'not backed up (download a ZIP first)' => 0,
            'changed since the backup (download again)' => 0,
            'currently in the print queue' => 0,
            'has an open reprint request' => 0,
        ];
        $eligible = [];

        foreach ($ids as $id) {
            $card = $cards->get($id);
            if (! $card) {
                $skipped['not found on server']++;
                continue;
            }

            $collection = $collections->get($id);
            if (! $collection) {
                $skipped['not printed yet']++;
                continue;
            }
            if ($collection->status !== 'collected') {
                $skipped['still awaiting collection']++;
                continue;
            }
            if (! $card->archive_downloaded_at) {
                $skipped['not backed up (download a ZIP first)']++;
                continue;
            }
            if ($card->updated_at && strtotime((string) $card->updated_at) > strtotime((string) $card->archive_downloaded_at)) {
                $skipped['changed since the backup (download again)']++;
                continue;
            }
            if (isset($queuedSet[$id])) {
                $skipped['currently in the print queue']++;
                continue;
            }
            if ($card->matric_no && isset($openReprintSet[$card->matric_no])) {
                $skipped['has an open reprint request']++;
                continue;
            }

            $eligible[] = $id;
        }

        $skipped = array_filter($skipped);

        if (empty($eligible)) {
            return response()->json([
                'success' => true,
                'deleted' => 0,
                'skipped' => $skipped,
                'photoBytesFreed' => 0,
                'cacheFilesRemoved' => 0,
                'message' => 'Nothing was deleted. None of the selected cards are eligible.',
            ]);
        }

        $photoBytes = (int) (DB::table('approved_cards')
            ->whereIn('card_id', $eligible)
            ->selectRaw('COALESCE(SUM(LENGTH(passport_photo)), 0) AS bytes')
            ->first()->bytes ?? 0);

        DB::transaction(function () use ($eligible) {
            DB::table('approved_cards')->whereIn('card_id', $eligible)->delete();
        });

        $cacheRemoved = $this->deleteCachedImages($eligible);

        ActivityLogger::log(
            $user['id'] ?? null,
            'CARD_ARCHIVE_DELETED',
            Str::limit('Deleted '.count($eligible).' printed card(s) from the server after backup. Card IDs: '.implode(',', $eligible), 900)
        );

        return response()->json([
            'success' => true,
            'deleted' => count($eligible),
            'skipped' => $skipped,
            'photoBytesFreed' => $photoBytes,
            'cacheFilesRemoved' => $cacheRemoved,
            'message' => 'Deleted '.count($eligible).' card(s) from the server.',
        ]);
    }

    private function iniBytes(string $value): int
    {
        $value = trim($value);
        if ($value === '') {
            return 0;
        }

        $number = (int) $value;
        switch (strtolower(substr($value, -1))) {
            case 'g':
                return $number * 1024 * 1024 * 1024;
            case 'm':
                return $number * 1024 * 1024;
            case 'k':
                return $number * 1024;
            default:
                return $number;
        }
    }

    /** Smallest of upload_max_filesize / post_max_size (0 = unknown / unlimited). */
    private function uploadLimitBytes(): int
    {
        $limits = array_filter([
            $this->iniBytes((string) ini_get('upload_max_filesize')),
            $this->iniBytes((string) ini_get('post_max_size')),
        ], fn ($v) => $v > 0);

        return $limits ? min($limits) : 0;
    }

    private function clip($value, int $max): string
    {
        return mb_substr(trim((string) $value), 0, $max);
    }

    private function nullableClip($value, int $max): ?string
    {
        $clipped = $this->clip($value, $max);

        return $clipped === '' ? null : $clipped;
    }

    private function parseDate($value): ?string
    {
        $value = trim((string) $value);
        if ($value === '') {
            return null;
        }
        $timestamp = strtotime($value);

        return $timestamp === false ? null : date('Y-m-d H:i:s', $timestamp);
    }

    /**
     * Reads manifest.csv from a backup ZIP (nothing is extracted to disk).
     *
     * @return array{0: array<int, array<string, mixed>>, 1: ?string} [rows, errorMessage]
     */
    private function readManifest(ZipArchive $zip): array
    {
        $stat = $zip->statName('manifest.csv');
        if ($stat === false) {
            return [[], 'manifest.csv was not found. This does not look like a backup made by the Printed Cards Archive.'];
        }
        if ($stat['size'] > self::MAX_MANIFEST_BYTES) {
            return [[], 'manifest.csv is too large.'];
        }

        $raw = $zip->getFromName('manifest.csv');
        if ($raw === false) {
            return [[], 'manifest.csv could not be read.'];
        }
        if (str_starts_with($raw, "\xEF\xBB\xBF")) {
            $raw = substr($raw, 3);
        }

        $handle = fopen('php://temp', 'r+');
        fwrite($handle, $raw);
        rewind($handle);

        $header = fgetcsv($handle, 0, ',', '"', '\\');
        $header = is_array($header) ? array_map(fn ($h) => trim((string) $h), $header) : [];
        if (! in_array('card_id', $header, true)) {
            fclose($handle);

            return [[], 'manifest.csv has no card_id column.'];
        }

        $rows = [];
        while (($line = fgetcsv($handle, 0, ',', '"', '\\')) !== false) {
            if ($line === [null]) {
                continue; // blank line
            }
            if (count($rows) >= self::MAX_RESTORE_ROWS) {
                fclose($handle);

                return [[], 'This ZIP lists more than '.self::MAX_RESTORE_ROWS.' cards. Restore smaller backups.'];
            }
            $line = array_pad(array_slice($line, 0, count($header)), count($header), null);
            $rows[] = array_combine($header, $line);
        }
        fclose($handle);

        return [$rows, null];
    }

    /**
     * Reads one passport photo out of the ZIP, with safety checks.
     *
     * @return array{0: ?string, 1: ?string} [binary or null, problem description or null]
     */
    private function readBackupPhoto(ZipArchive $zip, $name): array
    {
        $name = trim((string) $name);
        if ($name === '') {
            return [null, null]; // the card had no photo in the backup
        }
        if (! preg_match('#^passport_photos/[A-Za-z0-9_.-]+$#', $name) || str_contains($name, '..')) {
            return [null, 'unsafe photo file name'];
        }

        $stat = $zip->statName($name);
        if ($stat === false) {
            return [null, 'photo file is missing from the ZIP'];
        }
        if ($stat['size'] > self::MAX_PHOTO_BYTES) {
            return [null, 'photo file is too large'];
        }

        $binary = $zip->getFromName($name);
        if ($binary === false || $binary === '') {
            return [null, 'photo could not be read'];
        }
        if (! str_starts_with($binary, "\xFF\xD8") && ! str_starts_with($binary, "\x89PNG")) {
            return [null, 'photo is not a JPEG or PNG image'];
        }

        return [$binary, null];
    }

    // POST /api/card-archive/restore   (multipart: file = a backup ZIP made by this page)
    public function restore(Request $request)
    {
        if (! class_exists(ZipArchive::class)) {
            return response()->json(['message' => 'The PHP "zip" extension is not enabled on the server.'], 500);
        }

        $user = $request->attributes->get('authUser');
        $file = $request->file('file');

        if (! $file || ! $file->isValid()) {
            return response()->json([
                'message' => 'The ZIP file did not upload. It may be bigger than the server upload limit ('.ini_get('upload_max_filesize').').',
            ], 422);
        }

        @set_time_limit(0);

        $zip = new ZipArchive();
        if ($zip->open($file->getRealPath()) !== true) {
            return response()->json(['message' => 'This is not a valid ZIP file.'], 422);
        }

        [$rows, $error] = $this->readManifest($zip);
        if ($error !== null) {
            $zip->close();

            return response()->json(['message' => $error], 422);
        }
        if (empty($rows)) {
            $zip->close();

            return response()->json(['message' => 'The backup does not list any cards.'], 422);
        }

        $columns = array_flip(Schema::getColumnListing('approved_cards'));

        $cardIds = array_values(array_unique(array_filter(
            array_map(fn ($r) => (int) ($r['card_id'] ?? 0), $rows),
            fn ($v) => $v > 0
        )));

        // Duplicate check is against the DATABASE: a card_id already on the server is never overwritten.
        $existing = array_flip(
            DB::table('approved_cards')->whereIn('card_id', $cardIds)->pluck('card_id')->map(fn ($v) => (int) $v)->all()
        );

        $matrics = collect($rows)->pluck('matric_no')->filter()->unique()->values()->all();
        $matricSet = $matrics
            ? array_flip(DB::table('approved_cards')->whereIn('matric_no', $matrics)->pluck('matric_no')->all())
            : [];

        $now = now();
        $result = ['restored' => 0, 'skippedExisting' => 0, 'skippedInvalid' => 0, 'withoutPhoto' => 0, 'sameMatricOnServer' => 0];
        $problems = [];

        foreach ($rows as $index => $r) {
            $cardId = (int) ($r['card_id'] ?? 0);
            $line = $index + 2; // line number inside manifest.csv (line 1 is the header)

            if ($cardId <= 0) {
                $result['skippedInvalid']++;
                $problems[] = "Row {$line}: missing or invalid card_id";
                continue;
            }
            if (isset($existing[$cardId])) {
                $result['skippedExisting']++;
                continue;
            }

            [$photo, $photoProblem] = $this->readBackupPhoto($zip, $r['passport_photo_file'] ?? null);
            if ($photoProblem !== null) {
                $problems[] = "Card {$cardId}: {$photoProblem} (restored without a photo)";
            }

            $row = [
                'card_id' => $cardId,
                'surname' => $this->clip($r['surname'] ?? '', 255),
                'other_names' => $this->clip($r['other_names'] ?? '', 255),
                'matric_no' => $this->nullableClip($r['matric_no'] ?? null, 50),
                'staff_id' => $this->nullableClip($r['staff_id'] ?? null, 50),
                'faculty' => $this->nullableClip($r['faculty'] ?? null, 255),
                'department' => $this->nullableClip($r['department'] ?? null, 255),
                'level' => $this->nullableClip($r['level'] ?? null, 50),
                'card_number' => $this->nullableClip($r['card_number'] ?? null, 50),
                'session' => $this->nullableClip($r['session'] ?? null, 50),
                'hall' => $this->nullableClip($r['hall'] ?? null, 255),
                'passport_photo' => $photo,
                'approved_at' => $this->parseDate($r['approved_at'] ?? null) ?? $now,
                'created_at' => $now,
                'updated_at' => $now,
                // It came from a backup, so it counts as backed up (can be archived again without re-downloading).
                'archive_downloaded_at' => $now,
            ];
            $row = array_intersect_key($row, $columns);

            try {
                DB::table('approved_cards')->insert($row);
            } catch (\Throwable $e) {
                report($e);
                $result['skippedInvalid']++;
                $problems[] = "Card {$cardId}: could not be saved";
                continue;
            }

            $existing[$cardId] = true; // protects against the same card appearing twice in one manifest
            $result['restored']++;
            if ($photo === null) {
                $result['withoutPhoto']++;
            }
            if (! empty($row['matric_no']) && isset($matricSet[$row['matric_no']])) {
                $result['sameMatricOnServer']++;
            }
        }

        $zip->close();

        ActivityLogger::log(
            $user['id'] ?? null,
            'CARD_ARCHIVE_RESTORED',
            "Restored {$result['restored']} printed card(s) from a backup ZIP ({$result['skippedExisting']} already on server, {$result['skippedInvalid']} invalid)"
        );

        return response()->json($result + [
            'success' => true,
            'problems' => array_slice($problems, 0, 30),
            'message' => "Restored {$result['restored']} card(s).",
        ]);
    }

    /**
     * Remove cached PNGs named "{cardId}-....png" for exactly these card ids.
     */
    private function deleteCachedImages(array $cardIds): int
    {
        $wanted = array_flip(array_map('strval', $cardIds));
        $removed = 0;

        try {
            foreach (Storage::files('card-images') as $file) {
                if (preg_match('/^(\d+)-/', basename($file), $m) && isset($wanted[$m[1]])) {
                    Storage::delete($file);
                    $removed++;
                }
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return $removed;
    }
}
