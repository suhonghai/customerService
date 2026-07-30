@echo off
chcp 65001 >nul
call "%~dp0env.bat"

cd /d "%BACKEND_DIR%"

REM 首次装依赖
if not exist node_modules (
    echo [*] 首次启动,装依赖...
    call pnpm install --prod
    if errorlevel 1 (
        echo [x] pnpm 不可用,改用 npm
        call npm install --omit=dev
    )
)

if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"

echo [*] 启动 erp-admin-backend (port 3001)...
start "erp-admin-backend" /B cmd /c "node dist\main.js > %LOGS_DIR%\backend.log 2>&1"

timeout /t 5 >nul
echo [+] 启动完成
echo [*] 验证: curl http://127.0.0.1:3001/api/health
pause
