# PS100 — one-command demo launcher.
# Starts the NVIDIA FastAPI backend and the React dashboard in their own windows,
# then opens the browser. Close the two windows to stop the demo.
#
# Usage:  right-click > Run with PowerShell   (or)   ./start-demo.ps1

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "Starting FastAPI backend (NVIDIA agent) on http://localhost:8000 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd `"$root`"; python -m uvicorn api.main:app --port 8000"

Start-Sleep -Seconds 3

Write-Host "Starting React loyalty dashboard on http://localhost:4173 ..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd `"$root\web`"; npm run preview -- --port 4173 --host"

Start-Sleep -Seconds 4
Start-Process "http://localhost:4173"

Write-Host ""
Write-Host "Demo launched:" -ForegroundColor Green
Write-Host "  Dashboard : http://localhost:4173"
Write-Host "  Backend   : http://localhost:8000  (docs at /docs)"
Write-Host "Close the two PowerShell windows to stop the demo."
