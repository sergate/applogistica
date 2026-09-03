@echo off
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%~dp0node-portable\node.exe" set "NODE_EXE=%~dp0node-portable\node.exe"

echo === Descargando reportes del WMS ===
"%NODE_EXE%" descargar-reportes.js
if errorlevel 1 goto error

echo.
echo === Subiendo datos al Tablero Logistico ===
"%NODE_EXE%" actualizar-tablero.js
if errorlevel 1 goto error

echo.
echo Listo: reportes bajados y tablero actualizado.
goto fin

:error
echo.
echo Se corto por un error -- mira el mensaje de arriba.

:fin
echo.
pause
