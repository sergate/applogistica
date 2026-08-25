@echo off
REM Modo con ventana visible, para pruebas manuales -- el uso real pensado
REM es la tarea programada + agente-once-oculto.vbs (ver INSTALACION-AGENTE.md).
cd /d "C:\Users\jsilva\Documents\GitHub\applogistica\wms-reportes"
echo Agente Local corriendo (modo prueba). No cierres esta ventana.
node agente-local.js --loop
pause
