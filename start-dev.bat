@echo off
setlocal EnableExtensions
REM ============================================
REM Vishnu Creator - Development Startup
REM ============================================
REM Starts the Web dev server. The Web server starts and manages the daemon
REM (backend API) itself, so the daemon must NOT be started separately:
REM two daemons cannot share one data folder (RUNTIME_DATA_IN_USE).
REM ============================================

cd /d "%~dp0"

set "WEB_PORT=19861"
REM Fixed daemon port, away from other local tools (OpenClaw uses 18789).
if not defined VISHNUCREATOR_DAEMON_PORT set "VISHNUCREATOR_DAEMON_PORT=19862"
set "WEB_URL=http://127.0.0.1:%WEB_PORT%"
set "DAEMON_URL=http://127.0.0.1:%VISHNUCREATOR_DAEMON_PORT%"

echo.
echo ============================================
echo Vishnu Creator - Starting Development Stack
echo ============================================
echo.

where pnpm >nul 2>&1
if errorlevel 1 (
    echo ERROR: pnpm not found in PATH
    echo Please install pnpm: npm install -g pnpm
    pause
    exit /b 1
)
node --version
echo.

REM Already running? Reuse it instead of starting a duplicate.
netstat -ano | findstr /r /c:":%WEB_PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo Vishnu Creator is already running.
    goto ready
)

REM Something else on the daemon port would make the daemon fail to start.
netstat -ano | findstr /r /c:":%VISHNUCREATOR_DAEMON_PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo ERROR: Port %VISHNUCREATOR_DAEMON_PORT% is already used by another program.
    echo Set VISHNUCREATOR_DAEMON_PORT to a free port and run this script again.
    pause
    exit /b 1
)

REM A new log file per run, so a still-running old server cannot lock it.
if not exist logs mkdir logs
for /f %%t in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "STAMP=%%t"
set "WEB_LOG=logs\web-%STAMP%.log"

echo Starting Web dev server (it starts the daemon too)...
start /b cmd /c "pnpm web:dev > "%WEB_LOG%" 2>&1"

echo Waiting for the Web server...
set /a TRIES=0
:wait_web
set /a TRIES+=1
if %TRIES% gtr 90 (
    echo ERROR: Web server did not start within 3 minutes. See %WEB_LOG%
    pause
    exit /b 1
)
timeout /t 2 /nobreak >nul
curl -s -o nul "%WEB_URL%/" || goto wait_web

REM The first runtime request makes the Web server start the daemon.
echo Starting daemon...
curl -s -o nul -m 120 "%WEB_URL%/.vishnucreator/runtime-config"

:ready
set "DAEMON_STATUS=not responding"
curl -s -m 5 "%DAEMON_URL%/healthz" | findstr /c:"\"ok\":true" >nul && set "DAEMON_STATUS=ok"

echo.
echo ============================================
echo Vishnu Creator is running
echo ============================================
echo.
echo   Open the app:  %WEB_URL%
echo   Daemon API:    %DAEMON_URL%   (health: %DAEMON_STATUS%)
echo                  This is the backend API, not a web page.
echo                  Check it at %DAEMON_URL%/healthz
echo.
if defined WEB_LOG echo   Log: %WEB_LOG%
echo.
start "" "%WEB_URL%/"

if not defined WEB_LOG (
    echo This window started nothing new. You can close it.
    pause
    exit /b 0
)
echo Press Ctrl+C to stop the servers.
:keep_open
timeout /t 5 /nobreak >nul
goto keep_open
