<?php

namespace App\Providers;

use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Register card generation services as singletons
        $this->app->singleton(\App\Services\PhotoProcessingService::class);
        $this->app->singleton(\App\Services\TextRenderingService::class);
        $this->app->singleton(\App\Services\BarcodeService::class);
        $this->app->singleton(\App\Services\CardGenerationService::class);
    }

    public function boot(): void
    {
        //
    }
}
