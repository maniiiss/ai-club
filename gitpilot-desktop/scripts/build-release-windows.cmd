@echo off
setlocal
rem 业务意图：双击此文件即可调用发布脚本，结束后保留窗口让发布者看到错误或产物目录。
cd /d "%~dp0"

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-release-windows.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo Release build failed. Fix the issue above and retry.
) else (
  echo.
  echo Release artifacts are ready for the Desktop Releases admin page.
)

pause
exit /b %EXIT_CODE%
