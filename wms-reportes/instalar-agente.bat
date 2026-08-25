@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ================================================
echo   Instalador del Agente Local - Tablero WMS
echo ================================================
echo.

REM --- 1. Node.js ---
node -v >nul 2>&1
if errorlevel 1 (
  echo ERROR: no encontre Node.js instalado en esta PC.
  echo Instalalo desde https://nodejs.org/ ^(version LTS, opciones por defecto^)
  echo y volve a correr este instalador.
  echo.
  pause
  exit /b 1
)
echo [OK] Node.js encontrado.

REM --- 2. Dependencias ---
echo.
echo Instalando dependencias ^(puede tardar 1-2 minutos^)...
call npm install
if errorlevel 1 (
  echo ERROR instalando dependencias. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo [OK] Dependencias instaladas.

REM --- 3. Token personal ---
echo.
if exist agente-config.json (
  echo [OK] Ya existe agente-config.json, no lo piso.
  echo      Si queres cambiar el token, borralo y volve a correr este instalador.
) else (
  echo Necesitas tu token personal del Agente Local.
  echo Consigelo en el Tablero: cualquier pantalla "Importar Datos" -^>
  echo panel "Agente Local" -^> "Generar mi token".
  echo.
  set /p TOKEN="Pega tu token aca y apreta Enter: "
  if "!TOKEN!"=="" (
    echo No pegaste ningun token. Volve a correr el instalador cuando lo tengas.
    pause
    exit /b 1
  )
  (
    echo {
    echo   "token": "!TOKEN!"
    echo }
  ) > agente-config.json
  echo [OK] Token guardado en agente-config.json.
)

REM --- 4. Login WMS + Tablero ---
echo.
echo Ahora se van a abrir 2 ventanas de Chrome ^(WMS y Tablero^).
echo Inicia sesion en las DOS con tu usuario habitual, y cuando ambas
echo esten logueadas volve aca y apreta una tecla.
pause
node agente-local.js --login

REM --- 5. Tarea programada ---
echo.
echo Configurando la Tarea Programada de Windows...
schtasks /create /tn "Agente WMS" /tr "wscript.exe \"%~dp0agente-once-oculto.vbs\"" /sc minute /mo 1 /f
if errorlevel 1 (
  echo No pude crear la tarea programada automaticamente.
  echo Segui el "Paso 6" de INSTALACION-AGENTE.md para armarla a mano.
) else (
  echo [OK] Tarea programada "Agente WMS" creada -- corre cada 1 minuto en segundo plano.
)

echo.
echo ================================================
echo   Instalacion completa
echo ================================================
echo El boton "Actualizar esta seccion (WMS)" del Tablero ya te deberia
echo funcionar (puede tardar hasta 1 minuto en la primera corrida).
echo.
pause
