@echo off
chcp 65001 >nul
echo [*] === 启动 W11 ERP 全套 ===
echo.

echo [1/3] 启动 Chroma (port 8100)...
start "Chroma" /B cmd /c "call %~dp0start_chroma.bat"
timeout /t 8 >nul

echo [2/3] 启动 erp-admin-backend (port 3001)...
start "erp-admin-backend" /B cmd /c "call %~dp0start_erp-admin-backend.bat"
timeout /t 8 >nul

echo [3/3] 启动 ai-cs-demo (port 9529)...
start "ai-cs-demo" /B cmd /c "call %~dp0start_ai-cs-demo.bat"
timeout /t 5 >nul

echo.
echo [+] === 全部启动完成 ===
echo.
echo 验证命令(新开一个 cmd 跑):
echo   curl http://127.0.0.1:8100/api/v1/heartbeat
echo   curl http://127.0.0.1:3001/api/health
echo   curl http://127.0.0.1:9529
echo.
echo 浏览器访问(经 Nginx):
echo   https://suhhai.cn/erp/   ^<== 后台(默认 admin / Admin@123)
echo   https://suhhai.cn/cs/    ^<== AI 智能客服
echo.
pause
