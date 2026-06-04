@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "scripts\deploy_prod_gui.ps1"
if errorlevel 1 pause
