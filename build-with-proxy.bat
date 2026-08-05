@echo off
REM Double-click to build via local proxy.
REM Env vars below apply to THIS window only and do NOT change system settings.
REM Requires Node 24+ (NODE_USE_ENV_PROXY support).
cd /d "%~dp0"

set NODE_USE_ENV_PROXY=1
set HTTPS_PROXY=http://127.0.0.1:7897
set HTTP_PROXY=http://127.0.0.1:7897

echo === Building with proxy %HTTPS_PROXY% ===
call npm run build
set EXITCODE=%ERRORLEVEL%

echo.
echo === Build finished (exit code %EXITCODE%) ===
pause
