@echo off
setlocal
rem One-click release build for GitPilot Desktop.
rem Double-click to run, or call with a version and required API address:
rem build-release-oneclick.cmd 0.2.0 -ApiBaseUrl https://your-platform.example.com
rem HTTP is also supported for localhost or intranet release servers.
rem Prefers PowerShell 7 (pwsh) for correct UTF-8 output; falls back to Windows PowerShell.
rem Keep this .cmd file ASCII-only - cmd.exe cannot parse UTF-8 Chinese bytes.
cd /d "%~dp0"

where pwsh >nul 2>nul
if "%ERRORLEVEL%"=="0" (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-oneclick.ps1" %*
) else (
  echo [warn] PowerShell 7 not found, falling back to Windows PowerShell; output may be garbled.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-oneclick.ps1" %*
)
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Build FAILED. See the error above and retry.
) else (
  echo Build OK. Artifacts are in the release-artifacts folder, ready for the Desktop Releases admin page.
)

pause
exit /b %EXIT_CODE%
