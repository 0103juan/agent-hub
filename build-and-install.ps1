#!/usr/bin/env pwsh
# AgentHub - Build and Install Script
# Run this after any code change to rebuild + deploy to VS Code extensions folder

$src = $PSScriptRoot
$dst = "$HOME\.vscode\extensions\personal.agent-hub-0.1.0"

Write-Host "🔨 Building AgentHub..." -ForegroundColor Cyan
Set-Location $src
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed. Aborting sync." -ForegroundColor Red
    exit 1
}

Write-Host "📦 Syncing to VS Code extensions..." -ForegroundColor Cyan
Copy-Item -Path "$src\dist\*"       -Destination "$dst\dist\"    -Recurse -Force
Copy-Item -Path "$src\package.json" -Destination "$dst\package.json" -Force

Write-Host ""
Write-Host "✅ AgentHub instalado correctamente." -ForegroundColor Green
Write-Host "   Recarga VS Code: Ctrl+Shift+P → Developer: Reload Window" -ForegroundColor Yellow

