@echo off
cd /d "%~dp0"
node scripts\deploy_prod_web.mjs
if errorlevel 1 pause
