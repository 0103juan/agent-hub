#!/usr/bin/env pwsh
# AgentHub - compila y deja la extensión lista en VS Code.
# La carpeta instalada es un enlace (junction) a este repo: después de la primera vez,
# cada `npm run build` actualiza la extensión al instante y VS Code avisa para recargar.

param([switch]$SkipBuild)

$src = $PSScriptRoot
$dst = "$HOME\.vscode\extensions\personal.agent-hub-0.1.0"

if (-not $SkipBuild) {
    Write-Host "🔨 Building AgentHub..." -ForegroundColor Cyan
    Set-Location $src
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Build failed. Aborting." -ForegroundColor Red
        exit 1
    }
}

$item = Get-Item $dst -Force -ErrorAction SilentlyContinue
if ($item -and $item.LinkType -eq 'Junction' -and ($item.Target -contains $src -or $item.Target -eq $src)) {
    Write-Host "🔗 La extensión ya apunta a $src" -ForegroundColor Cyan
} else {
    if ($item) {
        # Una copia vieja se guarda fuera de la carpeta de extensiones: VS Code cargaría cualquier carpeta vecina.
        $backupRoot = "$HOME\.agent-hub\backup"
        New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
        $backup = Join-Path $backupRoot ("personal.agent-hub-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Write-Host "📦 Guardando la copia anterior en $backup" -ForegroundColor Cyan
        try {
            Move-Item -Path $dst -Destination $backup -ErrorAction Stop
        } catch {
            Write-Host "❌ No se pudo mover la copia anterior (¿VS Code la tiene abierta?). Cierra VS Code y repite." -ForegroundColor Red
            exit 1
        }
    }
    New-Item -ItemType Junction -Path $dst -Target $src | Out-Null
    Write-Host "🔗 $dst -> $src" -ForegroundColor Cyan
}

$skillTargets = @("$HOME\.claude\skills", "$HOME\.gemini\config\skills")
foreach ($target in $skillTargets) {
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    Copy-Item -Path "$src\resources\skills\*" -Destination $target -Recurse -Force
}

Write-Host ""
Write-Host "✅ AgentHub instalado." -ForegroundColor Green
Write-Host "   Recarga VS Code: Ctrl+Shift+P → Developer: Reload Window" -ForegroundColor Yellow
