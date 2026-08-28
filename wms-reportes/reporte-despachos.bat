@echo off
cd /d "%~dp0"
node reporte-despachos.js %*
echo.
pause
