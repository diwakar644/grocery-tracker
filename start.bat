@echo off
title FreshGuard - Kitchen Grocery Expiry Tracker
echo Starting FreshGuard Server...

:: Start browser after 1 second delay in background
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080/"

:: Run PowerShell HTTP Server
pwsh -ExecutionPolicy Bypass -File "%~dp0server.ps1"

pause
