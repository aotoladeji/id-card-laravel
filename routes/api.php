<?php

use App\Http\Controllers\Api\Admin\DeveloperResetController;
use App\Http\Controllers\Api\ApprovedCardController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\CardController;
use App\Http\Controllers\Api\CardImageController;
use App\Http\Controllers\Api\CardPreviewController;
use App\Http\Controllers\Api\CardReportController;
use App\Http\Controllers\Api\CardSyncController;
use App\Http\Controllers\Api\CollectionController;
use App\Http\Controllers\Api\DailyReportController;
use App\Http\Controllers\Api\DiagnosticController;
use App\Http\Controllers\Api\HealthController;
use App\Http\Controllers\Api\InventoryController;
use App\Http\Controllers\Api\LogController;
use App\Http\Controllers\Api\MaterialController;
use App\Http\Controllers\Api\PrintHistoryController;
use App\Http\Controllers\Api\PrintQueueController;
use App\Http\Controllers\Api\PublicSchedulingController;
use App\Http\Controllers\Api\ReprintController;
use App\Http\Controllers\Api\SchedulingController;
use App\Http\Controllers\Api\CardArchiveController;
use App\Http\Controllers\Api\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
| Converted from backend/server.js + backend/routes/*.js. All routes are
| prefixed with /api automatically because this file is loaded as the
| "api" route group (see bootstrap/app.php).
*/

// ---- Health checks (backend/server.js) --------------------------------
Route::get('/ping', [HealthController::class, 'ping']);
Route::get('/health', [HealthController::class, 'health']);

// ---- Auth (backend/routes/auth.js) -------------------------------------
Route::post('/auth/login', [AuthController::class, 'login']);
Route::middleware('auth.jwt')->group(function () {
    Route::get('/auth/verify', function (\Illuminate\Http\Request $request) {
        return response()->json(['valid' => true, 'user' => $request->attributes->get('authUser')]);
    });
    Route::post('/auth/change-password', [AuthController::class, 'changePassword']);
    Route::post('/auth/register', [AuthController::class, 'register'])->middleware('role:admin,supervisor');
});

// ---- Public scheduling / student booking (backend/routes/publicScheduling.js) ----
Route::prefix('public/scheduling')->group(function () {
    Route::post('/login', [PublicSchedulingController::class, 'login']);
    Route::get('/{configId}/available-slots', [PublicSchedulingController::class, 'availableSlots']);
    Route::post('/book', [PublicSchedulingController::class, 'book']);
    Route::get('/capture-login-code/{matricNumber}', [PublicSchedulingController::class, 'captureLoginCode']);
    Route::post('/cancel', [PublicSchedulingController::class, 'cancel']);
});

// ---- Everything below requires a valid JWT (backend middleware: authenticateToken) ----
Route::middleware('auth.jwt')->group(function () {

    // Users (backend/routes/users.js)
    Route::get('/users', [UserController::class, 'index']);
    Route::get('/users/{id}', [UserController::class, 'show']);
    Route::put('/users/{id}/permissions', [UserController::class, 'updatePermissions']);
    Route::delete('/users/{id}', [UserController::class, 'destroy']);

    // Cards / id_cards (backend/routes/cards.js)
    Route::get('/cards', [CardController::class, 'index']);
    Route::post('/cards', [CardController::class, 'store']);
    Route::put('/cards/{id}/status', [CardController::class, 'updateStatus']);
    Route::put('/cards/{id}/details', [CardController::class, 'updateDetails'])
        ->middleware('role:supervisor');
    Route::delete('/cards/{id}', [CardController::class, 'destroy']);
    Route::post('/cards/sync', [CardSyncController::class, 'sync']);
    Route::post('/cards/resolve-duplicates', [CardSyncController::class, 'resolveDuplicates']);

    // Approved cards history (backend/routes/approvedCards.js)
    Route::get('/approved-cards', [ApprovedCardController::class, 'index']);
    Route::get('/approved-cards/stats', [ApprovedCardController::class, 'stats']);
    Route::get('/approved-cards/{id}', [ApprovedCardController::class, 'show']);
    Route::put('/approved-cards/{id}', [ApprovedCardController::class, 'update'])
        ->middleware('role:supervisor');

    // Activity logs (backend/routes/logs.js)
    Route::get('/logs', [LogController::class, 'index']);

    // Reprint requests (backend/routes/reprint.js)
    Route::get('/reprint', [ReprintController::class, 'index']);
    Route::post('/reprint', [ReprintController::class, 'store']);
    Route::put('/reprint/{id}/status', [ReprintController::class, 'update']);

    // Material requests (backend/routes/material.js)
    Route::get('/material', [MaterialController::class, 'index']);
    Route::post('/material', [MaterialController::class, 'store']);
    Route::put('/material/{id}/respond', [MaterialController::class, 'respond']);
    Route::put('/material/{id}/forward', [MaterialController::class, 'forward']);
    Route::put('/material/{id}/address', [MaterialController::class, 'address']);
    Route::put('/material/{id}/query', [MaterialController::class, 'query']);
    Route::put('/material/{id}/reply-query', [MaterialController::class, 'reply']);

    // Daily reports (backend/routes/dailyReports.js)
    Route::get('/daily-reports', [DailyReportController::class, 'index']);
    Route::post('/daily-reports', [DailyReportController::class, 'store']);
    Route::put('/daily-reports/{id}/verify', [DailyReportController::class, 'verify']);

    // Inventory (backend/routes/inventory.js)
    Route::get('/inventory', [InventoryController::class, 'index']);
    Route::post('/inventory', [InventoryController::class, 'store']);
    Route::post('/inventory/faulty', [InventoryController::class, 'logFaultyDelivery']);
    Route::get('/inventory/faulty', [InventoryController::class, 'getFaultyDeliveries']);
    Route::put('/inventory/faulty/{id}/attest', [InventoryController::class, 'attestFaultyDelivery']);
    Route::put('/inventory/{id}/approve', [InventoryController::class, 'approve']);

    // Collections (backend/routes/collections.js)
    Route::get('/collections', [CollectionController::class, 'index']);
    Route::get('/collections/stats', [CollectionController::class, 'stats']);
    Route::post('/collections/{id}/collect', [CollectionController::class, 'markAsCollected']);
    Route::post('/collections/{id}/verify-fingerprint', [CollectionController::class, 'verifyAndCollect']);

    // Print history (backend/routes/printHistory.js)
    Route::get('/print-history', [PrintHistoryController::class, 'index']);
    Route::get('/print-history/stats', [PrintHistoryController::class, 'stats']);

        // Printed cards archive - SUPERVISOR ONLY
     // Printed cards archive - SUPERVISOR ONLY
    Route::prefix('card-archive')->middleware('role:supervisor')->group(function () {
        Route::get('/', [CardArchiveController::class, 'index']);
        Route::get('/ids', [CardArchiveController::class, 'ids']);
        Route::get('/stats', [CardArchiveController::class, 'stats']);
        Route::post('/download', [CardArchiveController::class, 'download']);
        Route::post('/delete', [CardArchiveController::class, 'destroyMany']);
        Route::post('/restore', [CardArchiveController::class, 'restore']);
    });

    // Card printing reports
    Route::prefix('reports/cards')->middleware('printing.reports')->group(function () {
        Route::get('/daily', [CardReportController::class, 'daily']);
        Route::get('/weekly', [CardReportController::class, 'weekly']);
        Route::get('/monthly', [CardReportController::class, 'monthly']);
    });

    // Print queue (backend/routes/printQueue.js)
    Route::post('/print-queue/sync', [PrintQueueController::class, 'sync']);
    Route::post('/print-queue', [PrintQueueController::class, 'addCard']);
    Route::get('/print-queue', [PrintQueueController::class, 'index']);
    Route::post('/print-queue/{id}/printed', [PrintQueueController::class, 'markAsPrinted']);
    Route::post('/print-queue/{id}/failed', [PrintQueueController::class, 'markAsFailed']);
    Route::post('/print-queue/{id}/retry', [PrintQueueController::class, 'retry']);
    Route::post('/print-queue/{id}/generate-pdf', [PrintQueueController::class, 'generatePdf']);
    Route::post('/print-queue/{id}/print-direct', [PrintQueueController::class, 'printDirect']);
    Route::delete('/print-queue/clear', [PrintQueueController::class, 'clear']);
    Route::delete('/print-queue/{id}', [PrintQueueController::class, 'destroy']);

    // Card image / preview proxy (backend/routes/captureAppCardImage.js, cardPreview.js)
    Route::get('/card-images/{cardId}/svg', [CardImageController::class, 'svg']);
    Route::get('/card-images/{cardId}/image', [CardImageController::class, 'image']);
    Route::post('/card-images/{cardId}/regenerate', [CardImageController::class, 'regenerate']);
    Route::post('/card-preview/sync-approved', [CardPreviewController::class, 'syncApproved']);
    Route::get('/card-preview/approved-list', [CardPreviewController::class, 'approvedList']);
    Route::post('/card-preview/reprint', [CardPreviewController::class, 'reprint']);

    // Diagnostics (backend/routes/diagnostic.js)
    Route::get('/diagnostic/capture-app-status', [DiagnosticController::class, 'captureAppStatus']);
    Route::get('/diagnostic/config', [DiagnosticController::class, 'config']);

    // Scheduling admin (backend/routes/scheduling.js)
    Route::prefix('scheduling')->middleware('scheduling.manage')->group(function () {
        Route::post('/', [SchedulingController::class, 'store']);
        Route::get('/', [SchedulingController::class, 'index']);
        Route::get('/{id}', [SchedulingController::class, 'show']);
        Route::put('/{id}', [SchedulingController::class, 'update']);
        Route::put('/{id}/toggle', [SchedulingController::class, 'toggle']);
        Route::post('/{id}/reopen', [SchedulingController::class, 'reopenWithNewBatch']);
        Route::post('/{id}/reopen/resolve-duplicates', [SchedulingController::class, 'resolveReopenDuplicates']);
        Route::post('/{id}/students', [SchedulingController::class, 'uploadStudentList']);
        Route::post('/{id}/resolve-duplicates', [SchedulingController::class, 'resolveDuplicates']);
        Route::get('/{id}/students', [SchedulingController::class, 'students']);
        Route::get('/{id}/slots', [SchedulingController::class, 'slots']);
        Route::post('/{id}/send-emails', [SchedulingController::class, 'sendEmails']);
        Route::post('/{id}/manual-book', [SchedulingController::class, 'manualBookStudent']);
    });
    // Deletion is restricted to supervisor/admin only (canDeleteScheduling in the original app).
    Route::delete('/scheduling/{id}', [SchedulingController::class, 'destroy'])->middleware('role:admin,supervisor');
    Route::put('/scheduling/{id}/restore', [SchedulingController::class, 'restore'])->middleware('role:admin,supervisor');

    // Admin: developer/operational reset (backend/routes/admin/developerReset.js)
    Route::post('/admin/developer-reset', [DeveloperResetController::class, 'reset'])->middleware('role:admin');

    // NOTE: backend/routes/admin/migration.js (run-scheduling-migration) has
    // no equivalent route here — its job is done by `php artisan migrate`.
});
