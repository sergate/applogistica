# Instalar el Agente Local (actualización automática del Tablero)

Esta guía es para cualquier persona del depósito que quiera usar el botón
**"Actualizar esta sección (WMS)"** en el Tablero Logístico. Se instala **una
sola vez por PC**, después queda funcionando solo.

Qué hace: cuando vos apretás ese botón en la web, tu PC (no un servidor
central) baja los reportes del WMS y los sube al Tablero. Por eso el Agente
tiene que estar corriendo en TU máquina para que el botón te funcione a vos.

---

## Instalación rápida (recomendado)

1. Copiá la carpeta `wms-reportes` completa a tu PC (ver Paso 1 más abajo si
   necesitás detalle).
2. Doble clic en **`instalar-agente.bat`**.
3. Seguí lo que te va pidiendo: pegar tu token, loguearte en las dos
   ventanas del navegador que se abren. El resto (dependencias, navegador
   de Playwright, Tarea Programada) lo hace solo.

Si no tenés **Node.js** instalado, el instalador lo baja e instala solo
(puede pedirte permisos de administrador la primera vez) y te avisa que
tenés que cerrar la ventana y volver a correr `instalar-agente.bat` una vez
más, para que la terminal reconozca el cambio. No hace falta tener Chrome
ni Edge instalados -- el Agente usa su propio navegador (Chromium de
Playwright), que el instalador baja solo.

Si el instalador falla en algo puntual, seguí la guía manual paso a paso de
abajo desde ese punto.

---

## Instalación manual (paso a paso, o si el instalador falla en algo)

## Requisitos (una vez por PC)

1. **Node.js** instalado. Para chequear si ya lo tenés, abrí una consola
   (`cmd`) y corré:
   ```bash
   node -v
   ```
   Si te tira un número de versión (ej. `v22.x.x`), ya lo tenés. Si dice que
   no reconoce el comando, hay que instalarlo: bajalo de
   [nodejs.org](https://nodejs.org/) (versión "LTS") e instalalo con las
   opciones por defecto.

## Paso 1: Copiar la carpeta del Agente

Pedile a quien administra el proyecto que te pase la carpeta `wms-reportes`
completa (por ejemplo, por un pendrive, una carpeta compartida, o clonando el
repositorio). Copiala a algún lugar fijo de tu PC, por ejemplo:

```
C:\Agente-WMS\wms-reportes
```

## Paso 2: Instalar las dependencias

Abrí `cmd`, entrá a esa carpeta y corré:

```bash
cd C:\Agente-WMS\wms-reportes
```
```bash
npm install
npx playwright install chromium
```

`npm install` baja las dependencias de Node (uno o dos minutos). `npx
playwright install chromium` baja el navegador propio que usa el Agente
(~150 MB, no hace falta tener Chrome ni Edge instalados).

## Paso 3: Generar tu token personal

1. Entrá al Tablero Logístico con tu usuario de siempre.
2. Andá a cualquiera de las pantallas "Importar Datos" (por ejemplo, Status
   de Preparación → NO ECOM → Importar datos).
3. Abrí el panel **"Agente Local (actualización automática desde tu PC)"**.
4. Apretá **"Generar mi token"**.
5. Copiá el token que aparece (es largo, tipo
   `s2wcJQLU3wR2-6uRf0CHtGw5gBsgjWuCay7kX-7Ifh4`) — **se muestra una sola
   vez**, así que copialo antes de cerrar esa pantalla.

Si perdés el token, volvés a esta misma pantalla y generás uno nuevo (el
viejo deja de funcionar automáticamente).

## Paso 4: Configurar el token en tu PC

1. En la carpeta `wms-reportes`, copiá el archivo `agente-config.example.json`
   y renombrá la copia a `agente-config.json`.
2. Abrilo con el Bloc de notas y pegá tu token, así:
   ```json
   {
     "token": "PEGÁ_ACÁ_TU_TOKEN"
   }
   ```
3. Guardalo.

## Paso 5: Primer login (WMS + Tablero)

Todavía en `cmd`, en la carpeta `wms-reportes`:

```bash
node agente-local.js --login
```

Se abren **dos ventanas del navegador**: una del WMS y otra del Tablero.
Iniciá sesión en las dos con tu usuario habitual (en cada una tenés que
llegar a ver la pantalla normal, no quedarte en el login). Cuando las dos
estén logueadas, volvé a la consola y apretá **Enter**.

Esto se hace **una sola vez** — las sesiones quedan guardadas en esa PC. La
sesión del WMS puede vencer cada tanto y pedir un nuevo `--login` -- para
evitarlo, agregá `wmsUsuario`/`wmsClave` a `agente-config.json` (ver
`agente-config.example.json`) y el Agente va a reloguearse solo.

## Paso 6: Programar que el Agente responda en segundos, no en minutos

El Agente queda invisible, corriendo en segundo plano desde que iniciás
sesión en Windows: se fija cada pocos segundos si hay algo para hacer, y si
no hay nada no abre el navegador para nada (no consume recursos de más). Se
arma con **dos** tareas, para que la experiencia sea fluida pero también
robusta si algo llegara a fallar:

- **"Agente WMS"** (la que hace el trabajo pesado): arranca una vez al
  iniciar sesión y queda corriendo, consultando cada ~2-3 segundos.
- **"Agente WMS (respaldo)"**: corre cada 5 minutos, una pasada corta. Es
  una red de seguridad -- si por lo que sea la tarea de arriba se cayó, esta
  igual va a atrapar cualquier pedido pendiente en, como mucho, 5 minutos.

Si usaste `instalar-agente.bat`, las dos tareas ya quedaron creadas solas y
podés saltear el resto de este paso. Para armarlas a mano:

1. Apretá `Win + R`, escribí `taskschd.msc` y Enter (se abre el **Programador
   de tareas** de Windows).
2. En el panel de la derecha, click en **"Crear tarea básica..."**.
3. **Nombre**: `Agente WMS`. Siguiente.
4. **Desencadenador**: elegí **"Al iniciar sesión"**. Siguiente.
5. **Acción**: "Iniciar un programa". Siguiente.
6. En **"Programa o script"** poné:
   ```
   wscript.exe
   ```
   En **"Agregar argumentos"** poné la ruta completa al archivo `.vbs`, entre
   comillas, por ejemplo:
   ```
   "C:\Agente-WMS\wms-reportes\agente-loop-oculto.vbs"
   ```
   Siguiente, y **Finalizar**.
7. Repetí los pasos 2-6 para la tarea de respaldo: **Nombre** `Agente WMS
   (respaldo)`, **Desencadenador** "Diariamente" (dejá la hora que proponga),
   y en Propiedades → Desencadenadores → Editar, marcá **"Repetir la tarea
   cada:"** → **5 minutos**, duración **"Indefinidamente"**. El script esta
   vez es:
   ```
   "C:\Agente-WMS\wms-reportes\agente-once-oculto.vbs"
   ```
8. En **ambas** tareas, pestaña **General**: dejá tildado "Ejecutar solo
   cuando el usuario haya iniciado sesión".

Listo — a partir de ahora, mientras tu usuario esté logueado en Windows, el
botón "Actualizar esta sección (WMS)" te va a responder en pocos segundos,
sin ninguna ventana visible.

### Alternativa manual (para probar sin configurar las tareas)

Si por ahora solo querés probarlo sin armar las tareas programadas, podés
dejar esto corriendo en una consola (`cmd`) mientras trabajás:

```bash
node agente-local.js --loop
```

o, para una sola pasada puntual:

```bash
node agente-local.js --once
```

---

## Probarlo

1. Con las tareas programadas ya configuradas (o corriendo `--loop` a mano),
   entrá al Tablero y andá a cualquier pantalla "Importar Datos".
2. Apretá **"Actualizar esta sección (WMS)"**.
3. Debería pasar a "Esperando al Agente Local..." en pocos segundos y después
   "Actualizando...". La actualización en sí puede tardar (baja y sube datos
   reales), pero la respuesta inicial del Agente ya no depende de esperar
   hasta 1-2 minutos como antes. Al terminar, ves "Actualizado
   correctamente." (o el error, si algo falló).

Los reportes bajados se borran solos de `wms-reportes/descargas/` apenas se
suben con éxito, así esa carpeta no acumula copias viejas.

## Problemas comunes

- **"No detectamos que tu Agente Local esté corriendo"** (después de 30
  segundos): revisá que las tareas "Agente WMS" y "Agente WMS (respaldo)"
  existan en el Programador de tareas y estén habilitadas (click derecho →
  no debería decir "Deshabilitada"). Si "Agente WMS" figura como
  "Preparada" en vez de "En ejecución", probá cerrar sesión de Windows y
  volver a entrar -- esa tarea arranca al iniciar sesión.
- **El Agente tira error de sesión** (WMS o Tablero): la sesión guardada
  venció. Repetí el Paso 5 (`node agente-local.js --login`) para renovarla.
- **Token inválido**: alguien generó un token nuevo desde el Tablero (eso
  invalida el anterior). Repetí el Paso 3 y el Paso 4 con el token nuevo.
