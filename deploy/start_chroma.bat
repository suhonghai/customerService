@echo off
chcp 65001 >nul
call "%~dp0env.bat"

REM 首次装依赖
if not exist "%CHROMA_VENV%\Lib\site-packages\chromadb" (
    echo [*] 首次启动,创建 venv + 装 Chroma...
    python -m venv "%CHROMA_VENV%"
    call "%CHROMA_VENV%\Scripts\activate"
    pip install chromadb onnxruntime
    deactivate
)

if not exist "%LOGS_DIR%" mkdir "%LOGS_DIR%"
if not exist "%CHROMA_DATA%" mkdir "%CHROMA_DATA%"

echo [*] 启动 Chroma (port 8100)...
start "Chroma" /B cmd /c "call %CHROMA_VENV%\Scripts\activate && python -m chromadb.cli.cli run --host 127.0.0.1 --port 8100 --path %CHROMA_DATA% > %LOGS_DIR%\chroma.log 2>&1"

timeout /t 5 >nul
echo [+] Chroma 启动完成
echo [*] 验证: curl http://127.0.0.1:8100/api/v1/heartbeat
pause
