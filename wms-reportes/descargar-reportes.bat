@echo off
cd /d "%~dp0"
node descargar-reportes.js %*
echo.
pause
