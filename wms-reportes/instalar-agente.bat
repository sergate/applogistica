@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo ================================================
echo   Instalador del Agente Local - Tablero WMS
echo ================================================
echo.

REM Si esta carpeta ya trae todo empaquetado (paquete portable: Node.js,
REM dependencias y el navegador de Playwright ya instalados adentro), no
REM hace falta descargar ni instalar nada -- se salta directo al login.
set "NODE_EXE=node"
set "PAQUETE_PORTABLE=0"
if exist "%~dp0node-portable\node.exe" (
  set "NODE_EXE=%~dp0node-portable\node.exe"
  set "PAQUETE_PORTABLE=1"
)
if exist "%~dp0node_modules\playwright-core\.local-browsers" set "PAQUETE_PORTABLE=1"

if "!PAQUETE_PORTABLE!"=="1" (
  echo [OK] Paquete portable detectado -- Node.js, dependencias y el
  echo      navegador ya estan incluidos en esta carpeta. Nada para descargar.
  goto token
)

REM --- 1. Node.js (se instala solo si falta) ---
node -v >nul 2>&1
if errorlevel 1 (
  echo Node.js no esta instalado. Bajandolo e instalandolo automaticamente...
  echo ^(esto puede pedirte permisos de administrador^)
  echo.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0instalar-node.ps1"
  if errorlevel 1 (
    echo.
    echo ERROR instalando Node.js automaticamente.
    echo Instalalo a mano desde https://nodejs.org/ ^(version LTS^) y volve a
    echo correr este instalador.
    pause
    exit /b 1
  )
  echo.
  echo Node.js se instalo correctamente. Cerra esta ventana y volve a correr
  echo instalar-agente.bat para que la terminal reconozca el cambio.
  pause
  exit /b 0
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

echo.
echo Descargando el navegador del Agente ^(Chromium de Playwright, ~150 MB,
echo puede tardar unos minutos^)...
call npx playwright install chromium
if errorlevel 1 (
  echo ERROR descargando el navegador. Revisa el mensaje de arriba.
  pause
  exit /b 1
)
echo [OK] Navegador instalado.

:token
REM --- 3. Token personal ---
echo.
if exist agente-config.json (
  echo [OK] Ya existe agente-config.json, no lo piso.
  echo      Si queres cambiar el token o las credenciales del WMS, borralo
  echo      y volve a correr este instalador.
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

  echo.
  echo Opcional pero recomendado: la sesion del WMS vence cada tanto. Si le
  echo pasas el usuario y la contrasena del WMS, el Agente se reloguea solo
  echo cuando haga falta -- si no, vas a tener que correr agente-login.bat
  echo a mano cada vez que la sesion venza. Queda guardada en texto plano
  echo en agente-config.json, en esta PC nomas ^(no se sube a ningun lado^).
  echo Dejala vacia y apreta Enter si preferis no guardarla.
  set /p WMSUSUARIO="Usuario del WMS (opcional): "
  set "WMSCLAVE="
  if not "!WMSUSUARIO!"=="" (
    set /p WMSCLAVE="Contrasena del WMS: "
  )

  if "!WMSUSUARIO!"=="" (
    (
      echo {
      echo   "token": "!TOKEN!"
      echo }
    ) > agente-config.json
  ) else (
    (
      echo {
      echo   "token": "!TOKEN!",
      echo   "wmsUsuario": "!WMSUSUARIO!",
      echo   "wmsClave": "!WMSCLAVE!"
      echo }
    ) > agente-config.json
  )
  echo [OK] Configuracion guardada en agente-config.json.
)

REM --- 4. Login WMS + Tablero ---
echo.
echo Ahora se van a abrir 2 ventanas del navegador ^(WMS y Tablero^).
echo Inicia sesion en las DOS con tu usuario habitual, y cuando ambas
echo esten logueadas volve aca y apreta una tecla.
pause
"%NODE_EXE%" agente-local.js --login

REM --- 5. Tarea programada ---
REM Nota: en PCs de dominio la politica de grupo suele bloquear triggers
REM "al iniciar sesion" (/sc onlogon), asi que usamos un "vigia" que se
REM dispara cada 1 minuto (el minimo permitido) y arranca el modo --loop
REM solo si todavia no esta corriendo -- si el Agente se cae por lo que
REM sea, este mismo mecanismo lo vuelve a levantar solo.
echo.
echo Configurando la Tarea Programada de Windows...
schtasks /create /tn "Agente WMS" /tr "wscript.exe \"%~dp0agente-vigia-oculto.vbs\"" /sc minute /mo 1 /f
if errorlevel 1 (
  echo No pude crear la tarea "Agente WMS" automaticamente.
  echo Segui el "Paso 6" de INSTALACION-AGENTE.md para armarla a mano.
) else (
  echo [OK] Tarea "Agente WMS" creada -- el Agente va a estar corriendo en segundo plano en menos de 1 minuto.
)

echo.
echo ================================================
echo   Instalacion completa
echo ================================================
echo El boton "Actualizar esta seccion (WMS)" del Tablero ya te deberia
echo funcionar en pocos segundos. Si por algun motivo no arranco todavia
echo (recien instalaste), cerra sesion de Windows y volve a entrar una vez.
echo.
pause
