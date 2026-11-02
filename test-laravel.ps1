# Test script to diagnose Laravel serve issue
Write-Host "Testing Laravel serve..." -ForegroundColor Green

cd "c:\xampp\htdocs\id-card-unit\backend"

Write-Host "`nAttempting to start Laravel on port 8000..." -ForegroundColor Yellow
$process = Start-Process -FilePath "php" -ArgumentList "artisan", "serve", "--host=127.0.0.1", "--port=8000" -PassThru -WindowStyle Normal

Write-Host "Process started with PID: $($process.Id)" -ForegroundColor Cyan

Start-Sleep -Seconds 5

Write-Host "`nChecking if port 8000 is listening..." -ForegroundColor Yellow
$connection = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue

if ($connection) {
    Write-Host "✓ Laravel is running on port 8000!" -ForegroundColor Green
} else {
    Write-Host "✗ Port 8000 is not listening" -ForegroundColor Red
    Write-Host "`nChecking process status..." -ForegroundColor Yellow
    $status = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
    if ($status) {
        Write-Host "Process is still running" -ForegroundColor Yellow
    } else {
        Write-Host "Process has exited" -ForegroundColor Red
    }
}

Write-Host "`nPress any key to stop the server and exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    Write-Host "Server stopped." -ForegroundColor Green
}
