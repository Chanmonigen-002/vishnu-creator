@echo off
REM ============================================
REM Vishnu Creator - Single-Window Development Startup
REM ============================================
REM Starts daemon + web in one command window using background processes
REM ============================================

cd /d "D:\Build App\Vishnu Creator"

echo.
echo ============================================
echo Vishnu Creator - Starting Development Stack
echo ============================================
echo.

REM Check if pnpm is available
where pnpm >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: pnpm not found in PATH
    echo Please install pnpm: npm install -g pnpm
    pause
    exit /b 1
)

node --version
echo.

echo Starting Daemon (backend API) in background...
start /b cmd /c "pnpm daemon:dev" >daemon.log 2>&1

REM Wait for daemon to be ready
echo Waiting for daemon to start...
timeout /t 5 /nobreak >nul

echo Starting Web (Vite dev server) in background...
start /b cmd /c "pnpm web:dev" >web.log 2>&1

echo.
echo ============================================
echo Development servers running in background
echo ============================================
echo.
echo Daemon:  http://127.0.0.1:18789
echo Web:     http://127.0.0.1:19861
echo.
echo Logs: daemon.log, web.log
echo.
echo Press Ctrl+C to stop all servers
echo.

REM Keep window open and wait for Ctrl+C
:wait_loop
timeout /t 5 /nobreak >nul
goto wait_loop