# Descarga automática de reportes WMS

> **¿Solo querés usar el botón "Actualizar esta sección (WMS)" del Tablero?**
> Seguí [INSTALACION-AGENTE.md](./INSTALACION-AGENTE.md) en vez de esto --
> este README es para uso manual por consola (descargar/subir sin el botón
> de la web).

Script que entra al WMS (wms-cheeky.azurewebsites.net), recorre una lista de
reportes y descarga cada uno en CSV, esperando a que termine cada descarga
antes de pasar al siguiente.

## Instalación (una sola vez)

```bash
cd wms-reportes
npm install
npx playwright install chromium
```

No hace falta tener Chrome ni Edge instalados en la PC: usa el Chromium
propio de Playwright (versión fija, no se autoactualiza solo -- así una
actualización del navegador del sistema no puede cortar una descarga a
mitad de camino).

## Primer login

La primera vez hay que iniciar sesión a mano para que el script guarde la
sesión:

```bash
set LOGIN_MANUAL=1
node descargar-reportes.js
```

Se abre una ventana del navegador. Iniciá sesión como siempre, esperá a que
cargue el Dashboard, y volvé a la consola y apretá Enter. La sesión queda
guardada en la carpeta `perfil-chrome` (no se sube al repo).

Como este Chromium no guarda contraseñas, la sesión puede vencer seguido y
pedir loguearse a mano de nuevo. Para evitarlo, se puede configurar
`wmsUsuario`/`wmsClave` en `agente-config.json` (ver
`agente-config.example.json`) y `chequearSesion()` reloguea sola cuando
hace falta -- opcional, y ese archivo no se sube al repo.

## Uso normal

```bash
node descargar-reportes.js
```

Corre los 7 reportes configurados y los deja en la carpeta `descargas/`.

Para correr solo algunos:

```bash
node descargar-reportes.js grupo tienda
```

IDs disponibles: `grupo`, `tienda`, `listado_ecom`, `ci_chk`, `ci_awa`,
`ci_cqq`, `ci_rema`.

## Si la sesión expira

Si el script empieza a fallar porque ya no está logueado, repetí el paso de
"Primer login" para renovar la sesión guardada.

---

# Actualización automática del Tablero Logístico

`actualizar-tablero.js` toma los reportes ya descargados (usa
`descargas/manifiesto.json`, que genera `descargar-reportes.js`) y los sube al
Tablero Logístico (https://applogistica-alpha.vercel.app/), sección por
sección, con los mismos botones "Importar/Procesar" que se usan a mano.

**Importante:** cada import de estos ESCRIBE datos reales en Supabase
(reemplaza información existente). No tiene deshacer. Antes de dejarlo
correr solo, probá una sección a la vez y confirmá en el tablero que los
KPIs se actualizaron bien.

## Primer login (una sola vez, sesión propia del tablero)

```bash
set LOGIN_MANUAL=1
node actualizar-tablero.js
```

Igual que con el WMS: se abre el navegador, iniciá sesión, esperá que cargue el
tablero, volvé a la consola y apretá Enter. Queda guardada en
`perfil-chrome-tablero/` (carpeta separada del perfil del WMS).

## Uso

Primero hay que tener el manifiesto actualizado (corriendo
`descargar-reportes.js` o el `.bat`). Después:

```bash
node actualizar-tablero.js
```

Sube las 4 secciones: `no_ecom` (grupo + tienda), `ecom` (listado_ecom),
`carga_inicial` (ci_chk + ci_awa + ci_cqq) y `remanentes` (todos los ci_rema).

Para probar una sola sección primero (recomendado la primera vez):

```bash
node actualizar-tablero.js no_ecom
```

## Accesos directos

- `descargar-reportes.bat` / `descargar-reportes-sin-rema.bat`: solo bajan
  reportes del WMS.
- `actualizar-tablero.bat`: solo sube al tablero (usa el último manifiesto).
- `descargar-y-actualizar-todo.bat`: encadena las dos cosas -- baja todo del
  WMS y después lo sube al tablero, cortando si algo falla en el medio.

---

# Detalle de Despachos (contenedor/remito/unidades por guía)

La pantalla "Despacho" del WMS solo deja ver el detalle de UNA guía a la vez
(seleccionarla y apretar "Detalle" abre un modal con las cajas/remitos/
cantidades de esa guía sola). `reporte-despachos.js` junta el detalle de
TODAS las guías de un rango de fechas en un solo CSV, pegándole directo a
los mismos endpoints JSON que usa esa pantalla (no hace falta clickear guía
por guía).

```bash
node reporte-despachos.js                        # guías de hoy
node reporte-despachos.js 2026-08-27              # desde esa fecha hasta hoy
node reporte-despachos.js 2026-08-25 2026-08-28   # rango de fechas
```

Usa la misma sesión guardada que `descargar-reportes.js` (carpeta
`perfil-chrome`) -- si esa sesión está vigente, no hace falta loguearse de
nuevo. Genera `descargas/despachos_detalle_<fecha>.csv` con una fila por
caja/remito (guía, cliente, transporte, caja, remito, cantidad, etc.).

Acceso directo: `reporte-despachos.bat` (acepta los mismos argumentos de
fecha, ej. `reporte-despachos.bat 2026-08-25 2026-08-28`).

---

# Impresión de Guía + Remito de un despacho

`imprimir-despacho.js` automatiza lo que hoy se hace a mano en la pantalla
"Despacho" para un número de guía puntual: buscarla, seleccionarla, imprimir
la guía (botón "Imprimir guia" -> "Descargar PDF") y después el remito
(botón "Imprimir remito" -> "Descargar PDF"), mandando cada PDF descargado a
la impresora predeterminada de la PC.

```bash
node imprimir-despacho.js 105732
```

Deja los PDF descargados en `impresiones/` (no se suben al repo) y después
de cada uno espera el resultado real de la impresión antes de seguir con el
siguiente documento.

Acceso directo: `imprimir-despacho.bat 105732`.

## Por qué usa SumatraPDF en vez de imprimir con el visor de Windows

En las PCs del depósito, PowerShell está bloqueado por política de grupo
("La directiva de grupo bloquea a este programa"), que es el método más
simple para automatizar "abrir un PDF y mandarlo a imprimir". En su lugar se
usa [SumatraPDF](https://www.sumatrapdfreader.org/) portable (no requiere
instalación ni PowerShell) con sus flags de impresión silenciosa
(`-print-to-default -silent`), que además devuelve un código de salida claro
si algo falla (impresora no encontrada, sin papel del lado del driver, etc.
-- ver [Command-line arguments](https://www.sumatrapdfreader.org/docs/Command-line-arguments)).

**Instalación (una sola vez, por PC):** bajar la versión portable de 64 bits
desde https://www.sumatrapdfreader.org/download-free-pdf-viewer
(`SumatraPDF-<version>-64.zip`), descomprimirla, y dejar el `.exe` en
`wms-reportes/sumatra/`. Si cambia la versión, actualizar la constante
`SUMATRA_EXE` en `imprimir-despacho.js` con el nombre de archivo nuevo. La
carpeta `sumatra/` no se sube al repo (son ~20 MB de binario descargado, no
código).

> El filtro de contenidos de la red también puede bloquear la descarga por
> categoría "Freeware and Software Downloads" -- si pasa, conectate a otra
> red para bajar el .zip una vez, y después copiá `sumatra/` a las demás PCs
> (o repetí la descarga en cada una si tienen acceso).
