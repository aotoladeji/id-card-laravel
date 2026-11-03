<?php

use App\Http\Middleware\AuthorizeRole;
use App\Http\Middleware\CanManageScheduling;
use App\Http\Middleware\ForceJsonResponse;
use App\Http\Middleware\JwtAuthenticate;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // All API routes should always return JSON, mirroring the Express app.
        $middleware->api(prepend: [
            ForceJsonResponse::class,
        ]);

        // Route middleware aliases used across routes/api.php
        $middleware->alias([
            'auth.jwt' => JwtAuthenticate::class,
            'role' => AuthorizeRole::class,
            'scheduling.manage' => CanManageScheduling::class,
            'printing.reports' => \App\Http\Middleware\CanViewPrintingReports::class,
        ]);

        // The SPA authenticates with JWT, so web requests don't need sessions
        // (avoids failures on hosts without a writable storage/ or sessions table).
        $middleware->web(remove: [
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
        ]);

        $middleware->validateCsrfTokens(except: ['api/*']);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Match the Express error-handling middleware / 404 handler behaviour.
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            return $request->is('api/*') || $request->expectsJson();
        });

        $exceptions->render(function (\Illuminate\Validation\ValidationException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json([
                    'message' => $e->getMessage(),
                    'errors' => $e->errors(),
                ], 422);
            }
        });

        $exceptions->render(function (\Symfony\Component\HttpKernel\Exception\NotFoundHttpException $e, Request $request) {
            if ($request->is('api/*')) {
                return response()->json(['message' => 'Route not found'], 404);
            }
        });

        $exceptions->render(function (\Throwable $e, Request $request) {
            if ($request->is('api/*')) {
                $status = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : 500;

                return response()->json([
                    'message' => $status === 500 ? 'Internal server error' : $e->getMessage(),
                    'error' => config('app.debug') ? $e->getMessage() : null,
                ], $status);
            }
        });
    })->create();
