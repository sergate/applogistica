# Descarga automática de reportes WMS

Script que entra al WMS (wms-cheeky.azurewebsites.net), recorre una lista de
reportes y descarga cada uno en CSV, esperando a que termine cada descarga
antes de pasar al siguiente.

## Instalación (una sola vez)

```bash
cd wms-reportes
npm install
```

Necesita Google Chrome instalado en la PC (usa el Chrome del sistema, no
descarga uno aparte).

## Primer login

La primera vez hay que iniciar sesión a mano para que el script guarde la
sesión:

```bash
set LOGIN_MANUAL=1
node descargar-reportes.js
```

Se abre una ventana de Chrome. Iniciá sesión como siempre, esperá a que
cargue el Dashboard, y volvé a la consola y apretá Enter. La sesión queda
guardada en la carpeta `perfil-chrome` (no se sube al repo).

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

Igual que con el WMS: se abre Chrome, iniciá sesión, esperá que cargue el
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
