@echo off
chcp 65001 >nul
call "%~dp0env.bat"

echo === W11 ERP 完整部署(git pull + build + restart)===
echo.

REM === 1. git pull ===
echo [1/6] git pull 最新代码...
cd /d "%AGENTS_DIR%"
git pull
if errorlevel 1 (
    echo [x] git pull 失败,请先解决冲突
    pause
    exit /b 1
)
echo.

REM === 2. 后端 build + migrate ===
echo [2/6] 后端:pnpm install + build + prisma migrate...
cd /d "%BACKEND_DIR%"
call pnpm install --prod
if errorlevel 1 call npm install --omit=dev
call pnpm build
if errorlevel 1 (
    echo [x] 后端 build 失败
    pause
    exit /b 1
)
call pnpm prisma migrate deploy
echo.

REM === 3. 前端 build + 复制到 nginx ===
echo [3/6] 前端:pnpm install + build + copy 到 nginx html/oss\...
cd /d "%FRONTEND_DIR%"
call pnpm install
call pnpm build
if errorlevel 1 (
    echo [x] 前端 build 失败
    pause
    exit /b 1
)
if exist "%FRONTEND_DIST_TARGET%" rmdir /S /Q "%FRONTEND_DIST_TARGET%"
mkdir "%FRONTEND_DIST_TARGET%"
xcopy /E /I /Y dist\* "%FRONTEND_DIST_TARGET%\" >nul
echo [+] 前端 dist 已复制到 %FRONTEND_DIST_TARGET%
echo.

REM === 4. ai-cs-demo build ===
echo [4/6] ai-cs-demo:pnpm install + build...
cd /d "%CS_DEMO_DIR%"
call pnpm install --prod
if errorlevel 1 call npm install --omit=dev
call pnpm build
if errorlevel 1 (
    echo [x] ai-cs-demo build 失败
    pause
    exit /b 1
)
echo.

REM === 5. nginx reload ===
echo [5/6] nginx -t + reload...
cd /d "%NGINX_DIR%"
nginx.exe -t
if errorlevel 1 (
    echo [x] nginx 配置错误,请检查
    pause
    exit /b 1
)
nginx.exe -s reload
echo [+] nginx reload 成功
echo.

REM === 6. 重启 3 个服务 ===
echo [6/6] 重启 W11 服务...
call "%~dp0stop_all.bat"
timeout /t 3 >nul
call "%~dp0start_all.bat"

echo.
echo === [+] 部署完成 ===
echo.
echo 验证:
echo   curl http://127.0.0.1:8100/api/v1/heartbeat
echo   curl http://127.0.0.1:3001/api/health
echo   curl http://127.0.0.1:9529
echo   curl -I https://suhhai.cn/erp/api/health
echo   curl -I https://suhhai.cn/cs/
pause
