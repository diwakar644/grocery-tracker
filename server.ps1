<#
.SYNOPSIS
  FreshGuard - Lightweight Local HTTP Server for Windows & PowerShell Core
.DESCRIPTION
  Serves the FreshGuard Grocery Expiry Tracker application locally on http://localhost:8080/
#>

param (
    [int]$Port = 8080,
    [string]$Root = $PSScriptRoot
)

if ([string]::IsNullOrWhiteSpace($Root)) {
    $Root = (Get-Location).Path
}

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".webmanifest" = "application/manifest+json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Warning "Port $Port is busy, trying port 8888..."
    $Port = 8888
    $prefix = "http://localhost:$Port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  🥗 FreshGuard - Kitchen Grocery Expiry Tracker Server" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Server running at: $prefix" -ForegroundColor Cyan
Write-Host "  Serving files from: $Root" -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/" -or [string]::IsNullOrEmpty($urlPath)) {
            $urlPath = "/index.html"
        }

        # Safe relative path sanitization
        $relative = $urlPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        $filePath = [System.IO.Path]::GetFullPath([System.IO.Path]::Combine($Root, $relative))

        # Security check: prevent directory traversal outside root
        if (-not $filePath.StartsWith([System.IO.Path]::GetFullPath($Root))) {
            $response.StatusCode = 403
            $response.Close()
            continue
        }

        if (Test-Path -Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
            $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.StatusCode = 200
            $response.ContentType = $contentType
            $response.ContentLength64 = $bytes.Length
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Cache-Control", "no-cache")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $response.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
        }

        $response.Close()
    }
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
    $listener.Close()
    Write-Host "`nServer stopped." -ForegroundColor Gray
}
