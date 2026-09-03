@echo off
REM Modo con ventana visible, para pruebas manuales -- el uso real pensado
REM es la tarea programada + agente-vigia-oculto.vbs (ver INSTALACION-AGENTE.md).
cd /d "%~dp0"
set "NODE_EXE=node"
if exist "%~dp0node-portable\node.exe" set "NODE_EXE=%~dp0node-portable\node.exe"
echo Agente Local corriendo (modo prueba). No cierres esta ventana.
"%NODE_EXE%" agente-local.js --loop
pause
