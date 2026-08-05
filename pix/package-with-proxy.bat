@echo off
REM Double-click to package the Electron app via local proxy.
REM Runs "npm run package" (which builds pi workspace + pix + electron-builder).
REM Env vars below apply to THIS window only and do NOT change system settings.
REM Requires Node 24+ (NODE_USE_ENV_PROXY support).
cd /d "%~dp0"

set NODE_USE_ENV_PROXY=1
set HTTPS_PROXY=http://127.0.0.1:7897
set HTTP_PROXY=http://127.0.0.1:7897

echo === Packaging with proxy %HTTPS_PROXY% ===
call npm run package
set EXITCODE=%ERRORLEVEL%

echo.
echo === Package finished (exit code %EXITCODE%) ===
pause
