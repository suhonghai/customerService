@echo off
REM === W11 ERP 部署共享路径(其他 .bat 用 call "%~dp0env.bat" 引入)===
REM DEPLOY_DIR = 当前脚本所在目录(C:\...\agents\W11-erp-admin\deploy\)
set DEPLOY_DIR=%~dp0
set W11_DIR=%DEPLOY_DIR%..
set AGENTS_DIR=%W11_DIR%..

set BACKEND_DIR=%W11_DIR%\erp-admin-backend
set FRONTEND_DIR=%W11_DIR%\erp-admin-frontend
set CS_DEMO_DIR=%W11_DIR%\ai-cs-demo

set NGINX_DIR=C:\Users\Administrator\Desktop\nginx-1.28.0
set NGINX_CONF=%NGINX_DIR%\nginxConfig.conf
set FRONTEND_DIST_TARGET=%NGINX_DIR%\html\oss\erp-admin-frontend\dist

set CHROMA_VENV=%DEPLOY_DIR%\chroma-venv
set CHROMA_DATA=%DEPLOY_DIR%\chroma-data
set LOGS_DIR=%DEPLOY_DIR%\logs
