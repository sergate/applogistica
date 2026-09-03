@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%~dp0node-portable\node.exe" set "NODE_EXE=%~dp0node-portable\node.exe"
"%NODE_EXE%" reporte-picking.js %*
echo.
pause
