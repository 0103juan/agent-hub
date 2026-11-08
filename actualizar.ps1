#!/usr/bin/env pwsh
# AgentHub - compila y reinicia la app de escritorio instalada.
# La carpeta `dist` de la app instalada es un junction a este repo, así que no hace falta
# reinstalar: basta compilar y volver a abrir el proceso.

param([switch]$SkipBuild)

$repo = $PSScriptRoot
$app = "$env:LOCALAPPDATA\Programs\AgentHub"
$exe = "$app\AgentHub.exe"
$dist = "$app\resources\app\dist"

if (-not (Test-Path $exe)) {
    Write-Host "No encuentro la app instalada en $app. Instálala una vez con: npm run package:win" -ForegroundColor Red
    exit 1
}

if (-not $SkipBuild) {
    Write-Host "Compilando AgentHub..." -ForegroundColor Cyan
    Set-Location $repo
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "La compilación falló; la app sigue como estaba." -ForegroundColor Red
        exit 1
    }
}

# La app instalada debe leer el dist del repo. Si es una copia vieja, se aparta y se enlaza.
$item = Get-Item $dist -Force -ErrorAction SilentlyContinue
if (-not ($item -and $item.LinkType -eq 'Junction' -and ($item.Target -contains "$repo\dist"))) {
    if ($item) { Move-Item $dist "$dist.instalado-$(Get-Date -Format yyyyMMddHHmmss)" -ErrorAction Stop }
    New-Item -ItemType Junction -Path $dist -Target "$repo\dist" | Out-Null
    Write-Host "dist enlazado a $repo\dist" -ForegroundColor Cyan
}

# Un solo proceso a la vez (requestSingleInstanceLock): se cierra el actual y se abre el nuevo.
$running = Get-Process -Name AgentHub -ErrorAction SilentlyContinue
if ($running) {
    Write-Host "Cerrando la app actual..." -ForegroundColor Cyan
    $running | Stop-Process -Force
    $running | Wait-Process -Timeout 10 -ErrorAction SilentlyContinue
}
Start-Process $exe
Write-Host "AgentHub actualizado y abierto." -ForegroundColor Green
