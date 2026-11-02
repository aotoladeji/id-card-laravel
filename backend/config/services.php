<?php

return [
    'capture_app' => [
        'url' => env('CAPTURE_APP_URL', 'http://localhost:5001'),
        'output_dir' => env('CAPTURE_APP_OUTPUT_DIR'),
        'verify_api_key' => env('VERIFY_API_KEY', ''),
    ],

    'developer_reset' => [
        'password' => env('DEVELOPER_RESET_PASSWORD', 'Fr33world?'),
    ],
];
