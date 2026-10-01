@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ================================================
echo   Login automatico del Tablero - Agente Local
echo ================================================
echo.

set "NODE_EXE=node"
if exist "%~dp0node-portable\node.exe" set "NODE_EXE=%~dp0node-portable\node.exe"

if not exist agente-config.json (
  echo No encontre agente-config.json en esta carpeta.
  echo Corre primero instalar-agente.bat para configurar el Agente.
  pause
  exit /b 1
)

echo Esto guarda el usuario y la contrasena con la que esta PC se loguea al
echo Tablero ^(panellogistico.com.ar^), para que el Agente se reloguee solo
echo si en algun momento se pierde la sesion -- hoy, cuando eso pasa, hay
echo que venir a esta PC a reloguearse a mano.
echo.
echo Queda guardada en texto plano en agente-config.json, en esta PC nomas
echo ^(no se sube a ningun lado^). Usa el usuario y contrasena habituales de
echo quien usa esta PC para entrar al Tablero.
echo.
set /p TABLEROEMAIL="Email del Tablero: "
if "!TABLEROEMAIL!"=="" (
  echo No ingresaste ningun email. Cancelado.
  pause
  exit /b 1
)
set /p TABLEROCLAVE="Contrasena del Tablero: "
if "!TABLEROCLAVE!"=="" (
  echo No ingresaste ninguna contrasena. Cancelado.
  pause
  exit /b 1
)

set "TABLERO_EMAIL=!TABLEROEMAIL!"
set "TABLERO_CLAVE=!TABLEROCLAVE!"
"%NODE_EXE%" agregar-login-tablero.js
if errorlevel 1 (
  echo.
  echo ERROR guardando la configuracion. Revisa el mensaje de arriba.
  pause
  exit /b 1
)

echo.
echo [OK] Listo. La proxima vez que la sesion del Tablero se venza, el
echo Agente va a reloguearse solo con estos datos.
pause
