# Construit CharlesSetup.exe sur votre PC Windows.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
# (fichier volontairement sans accents : compatible Windows PowerShell 5.1)
$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

function Need($cmd, $help) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "[manquant] $cmd - $help" -ForegroundColor Yellow
    exit 1
  }
}
Need "node.exe"  "installez Node.js LTS : winget install OpenJS.NodeJS.LTS"
Need "cargo.exe" "installez Rust : winget install Rustlang.Rustup, puis rouvrez PowerShell"

Write-Host "1/3 Installation des dependances..." -ForegroundColor Cyan
npm.cmd ci
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "2/3 Tests..." -ForegroundColor Cyan
npm.cmd test
if ($LASTEXITCODE -ne 0) { exit 1 }
Write-Host "3/3 Construction (5 a 10 min la premiere fois)..." -ForegroundColor Cyan
npm.cmd run tauri build
if ($LASTEXITCODE -ne 0) { exit 1 }

$exe = Get-ChildItem "src-tauri\target\release\bundle\nsis\*.exe" | Select-Object -First 1
Copy-Item $exe.FullName ".\CharlesSetup.exe" -Force
Write-Host "Termine : $(Resolve-Path .\CharlesSetup.exe)" -ForegroundColor Green
