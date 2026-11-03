<?php

$compiled = env('VIEW_COMPILED_PATH', realpath(storage_path('framework/views')) ?: storage_path('framework/views'));

// Read-only hosts (e.g. Wasmer) cannot compile views into storage/.
if (! is_writable($compiled)) {
    $compiled = sys_get_temp_dir();
}

return [
    'paths' => [
        resource_path('views'),
    ],
    'compiled' => $compiled,
];
