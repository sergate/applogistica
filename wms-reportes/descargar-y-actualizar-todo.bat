@echo off
cd /d "C:\Users\jsilva\Documents\GitHub\applogistica\wms-reportes"
echo === Descargando reportes del WMS ===
node descargar-reportes.js
if errorlevel 1 goto error

echo.
echo === Subiendo datos al Tablero Logistico ===
node actualizar-tablero.js
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
