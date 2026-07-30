@echo off
chcp 65001 >nul
echo [*] === 停止 W11 ERP 全套 ===
echo.

echo [*] 停止 erp-admin-backend...
taskkill /F /FI "WINDOWTITLE eq erp-admin-backend*" 2>nul

echo [*] 停止 ai-cs-demo...
taskkill /F /FI "WINDOWTITLE eq ai-cs-demo*" 2>nul

echo [*] 停止 Chroma...
taskkill /F /FI "WINDOWTITLE eq Chroma*" 2>nul

echo.
echo [+] 停止完成
echo [*] 用 tasklist | findstr "node.exe python.exe" 确认无残留
pause
