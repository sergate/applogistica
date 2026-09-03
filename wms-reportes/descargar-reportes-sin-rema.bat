@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%~dp0node-portable\node.exe" set "NODE_EXE=%~dp0node-portable\node.exe"
"%NODE_EXE%" descargar-reportes.js grupo tienda listado_ecom ci_chk ci_awa ci_cqq
echo.
pause
