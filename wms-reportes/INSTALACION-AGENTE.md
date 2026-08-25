# Instalar el Agente Local (actualización automática del Tablero)

Esta guía es para cualquier persona del depósito que quiera usar el botón
**"Actualizar esta sección (WMS)"** en el Tablero Logístico. Se instala **una
sola vez por PC**, después queda funcionando solo.

Qué hace: cuando vos apretás ese botón en la web, tu PC (no un servidor
central) baja los reportes del WMS y los sube al Tablero. Por eso el Agente
tiene que estar corriendo en TU máquina para que el botón te funcione a vos.

---

## Requisitos (una vez por PC)

1. **Google Chrome** instalado (el que ya usás normalmente).
2. **Node.js** instalado. Para chequear si ya lo tenés, abrí una consola
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
```

Esto baja lo necesario para que el Agente funcione (usa tu Chrome ya
instalado, no descarga uno aparte). Puede tardar uno o dos minutos.

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

Se abren **dos ventanas de Chrome**: una del WMS y otra del Tablero. Iniciá
sesión en las dos con tu usuario habitual (en cada una tenés que llegar a
ver la pantalla normal, no quedarte en el login). Cuando las dos estén
logueadas, volvé a la consola y apretá **Enter**.

Esto se hace **una sola vez** — las sesiones quedan guardadas en esa PC.

## Paso 6: Dejar el Agente corriendo

Doble clic en **`agente-local.bat`** (está en la misma carpeta). Se abre una
ventanita de consola que dice "Agente Local corriendo" — dejala abierta (se
puede minimizar, pero no cerrar). Mientras esté abierta, el botón
"Actualizar esta sección (WMS)" te va a funcionar en el Tablero.

### Opcional: que arranque solo con Windows

Para no tener que abrirlo a mano cada vez que prendés la PC:

1. Apretá `Win + R`, escribí `shell:startup` y Enter (se abre una carpeta).
2. Copiá ahí un acceso directo a `agente-local.bat`.

Así, cada vez que inicies sesión en Windows, el Agente arranca solo en
segundo plano.

---

## Probarlo

1. Con el Agente corriendo, entrá al Tablero y andá a cualquier pantalla
   "Importar Datos".
2. Apretá **"Actualizar esta sección (WMS)"**.
3. Debería pasar a "Esperando al Agente Local..." y después "Actualizando...".
   Puede tardar varios minutos (baja y sube datos reales). Al terminar, ves
   "Actualizado correctamente." (o el error, si algo falló).

## Problemas comunes

- **"No detectamos que tu Agente Local esté corriendo"** (después de 30
  segundos): fijate que la ventana de `agente-local.bat` siga abierta. Si la
  cerraste sin querer, volvé a abrirla.
- **El Agente tira error de sesión** (WMS o Tablero): la sesión guardada
  venció. Repetí el Paso 5 (`node agente-local.js --login`) para renovarla.
- **Token inválido**: alguien generó un token nuevo desde el Tablero (eso
  invalida el anterior). Repetí el Paso 3 y el Paso 4 con el token nuevo.
