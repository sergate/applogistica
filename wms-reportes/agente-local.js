// Agente Local: corre en la PC de un usuario del depósito y atiende sus
// pedidos de actualización del Tablero Logístico. Pensado para correr "una
// vez" (--once) disparado por el Programador de tareas de Windows cada 1-2
// minutos, sin ninguna ventana visible -- así nadie tiene una ventana para
// cerrar por error. Ver INSTALACION-AGENTE.md para la configuración completa.
//
// Primer uso (una sola vez por PC): configurar el token y loguearse.
//   1. Copiá agente-config.example.json a agente-config.json y pegá tu token
//      (lo generás en el Tablero, pantalla "Importar Datos" -> "Agente Local").
//   2. node agente-local.js --login
//      Se abren dos ventanas de Chrome (WMS y Tablero) -- iniciá sesión en
//      cada una, volvé a la consola y apretá Enter.
//
// Uso (lo dispara el Programador de tareas, ver INSTALACION-AGENTE.md):
//   node agente-local.js --once
//     Se fija si hay UN pedido pendiente; si hay, lo corre y termina; si no
//     hay, termina al toque (no abre Chrome para nada).
//
// Uso alternativo (ventana siempre abierta, para pruebas manuales):
//   node agente-local.js --loop

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const descargador = require("./descargar-reportes.js");
const subidor = require("./actualizar-tablero.js");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");
// Mismo override que actualizar-tablero.js, para poder apuntar el agente a
// un deploy preview en vez de a producción sin tocar código.
const APP_BASE_URL = (process.env.TABLERO_URL || "https://applogistica-alpha.vercel.app").replace(/\/$/, "");
const INTERVALO_POLLING_MS = 8000; // solo se usa en --loop

// Qué reportes de descargar-reportes.js hay que bajar para poder subir cada
// sección con actualizar-tablero.js.
const REPORTES_POR_SECCION = {
  no_ecom: ["grupo", "tienda"],
  ecom: ["listado_ecom"],
  carga_inicial: ["ci_chk", "ci_awa", "ci_cqq"],
  remanentes: ["ci_rema"],
};

function leerConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `No encontré ${CONFIG_PATH}. Copiá agente-config.example.json a agente-config.json y pegá tu token ` +
        '(lo generás en el Tablero, pantalla "Importar Datos" -> "Agente Local").'
    );
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  if (!config.token) throw new Error(`Falta "token" en ${CONFIG_PATH}.`);
  return config;
}

function esperarEnter() {
  return new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolve();
    });
  });
}

async function abrirContextos({ headless }) {
  const contextoWms = await chromium.launchPersistentContext(descargador.PERFIL_DIR, {
    channel: "chrome",
    headless,
    acceptDownloads: true,
  });
  const paginaWms = contextoWms.pages()[0] || (await contextoWms.newPage());

  const contextoTablero = await chromium.launchPersistentContext(subidor.PERFIL_DIR, {
    channel: "chrome",
    headless,
    acceptDownloads: false,
  });
  // Ver nota en actualizar-tablero.js: limpiar sessionStorage en cada carga
  // para que el menú del tablero arranque siempre en el mismo estado.
  await contextoTablero.addInitScript(() => window.sessionStorage.clear());
  const paginaTablero = contextoTablero.pages()[0] || (await contextoTablero.newPage());

  return { contextoWms, paginaWms, contextoTablero, paginaTablero };
}

async function cerrarContextos({ contextoWms, contextoTablero }) {
  await contextoWms.close().catch(() => {});
  await contextoTablero.close().catch(() => {});
}

async function modoLogin() {
  const contextos = await abrirContextos({ headless: false });
  try {
    await contextos.paginaWms.goto(descargador.URL_BASE);
    await contextos.paginaTablero.goto(subidor.URL_BASE);
    console.log("Iniciá sesión en las DOS ventanas de Chrome que se abrieron (WMS y Tablero).");
    console.log("Cuando ambas estén logueadas, volvé acá y presioná Enter...");
    await esperarEnter();
    console.log("Listo, sesiones guardadas.");
  } finally {
    await cerrarContextos(contextos);
  }
}

// Nombres legibles para el texto de progreso que ve el usuario.
const NOMBRE_REPORTE = {
  grupo: "Pedidos por grupo",
  tienda: "Pedidos por tienda",
  listado_ecom: "Listado de pedidos Ecom",
  ci_chk: "Carga Inicial CHK",
  ci_awa: "Carga Inicial AWA",
  ci_cqq: "Carga Inicial CQQ",
  ci_rema: "Reportes REMA (puede tardar varios minutos)",
};

// Baja los reportes que necesita la sección y los sube al Tablero, avisando
// el progreso real (paso a paso) a medida que avanza. Devuelve la lista de
// archivos descargados (para poder borrarlos después si salió todo bien).
async function correrPedido(config, pedido, paginas) {
  const { paginaWms, paginaTablero } = paginas;
  const seccion = pedido.seccion;
  const idsReportes = REPORTES_POR_SECCION[seccion];
  if (!idsReportes) throw new Error(`Sección desconocida en el pedido: "${seccion}"`);

  const totalPasos = idsReportes.length + 1; // + 1 por la subida al final
  let pasosHechos = 0;

  const manifiesto = {};
  for (const idReporte of idsReportes) {
    await avisarProgreso(
      config.token,
      pedido.id,
      Math.round((pasosHechos / totalPasos) * 100),
      `Descargando: ${NOMBRE_REPORTE[idReporte] || idReporte}...`
    );
    manifiesto[idReporte] = await descargador.descargarUnReporte(paginaWms, idReporte);
    pasosHechos++;
  }

  await avisarProgreso(config.token, pedido.id, Math.round((pasosHechos / totalPasos) * 100), "Subiendo al Tablero...");
  await subidor.subirUnaSeccion(paginaTablero, seccion, manifiesto);

  return Object.values(manifiesto).flat();
}

// Borra del disco los CSV que se acaban de subir con éxito, para no
// acumular copias viejas en la carpeta descargas/.
function borrarArchivos(rutas) {
  for (const ruta of rutas) {
    fs.unlink(ruta, (err) => {
      if (err) console.error(`  (no pude borrar ${ruta}: ${err.message})`);
    });
  }
}

async function avisarProgreso(token, id, progreso, paso) {
  await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/progreso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, progreso, paso }),
  }).catch((err) => {
    console.error("No pude avisar el progreso al Tablero:", err.message);
  });
}

async function avisarResultado(token, id, exito, mensaje) {
  await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/resultado`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, exito, mensaje }),
  }).catch((err) => {
    console.error("No pude avisar el resultado al Tablero:", err.message);
  });
}

async function buscarProximoPedido(token) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/proximo`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Error consultando pedidos (HTTP ${res.status}).`);
  }
  return data.pedido || null;
}

// Ejecuta UN pedido de punta a punta: abre los navegadores (recién acá, no
// antes) sólo si hay algo para hacer, corre la sección, avisa el resultado,
// borra los archivos si salió bien, y cierra todo.
async function atenderPedido(config, pedido) {
  console.log(`[${new Date().toLocaleTimeString()}] Pedido #${pedido.id} (${pedido.seccion}) -- corriendo...`);
  const contextos = await abrirContextos({ headless: true });
  try {
    const archivos = await correrPedido(config, pedido, contextos);
    await avisarResultado(config.token, pedido.id, true, "OK");
    borrarArchivos(archivos);
    console.log(`  -> #${pedido.id} listo.`);
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : "Error inesperado";
    await avisarResultado(config.token, pedido.id, false, mensaje);
    console.error(`  -> #${pedido.id} falló: ${mensaje}`);
  } finally {
    await cerrarContextos(contextos);
  }
}

// Modo pensado para el Programador de tareas: una sola pasada. Si no hay
// pedido pendiente, ni siquiera abre Chrome -- entra y sale rápido.
async function modoUnaVez() {
  const config = leerConfig();
  const pedido = await buscarProximoPedido(config.token);
  if (!pedido) return;
  await atenderPedido(config, pedido);
}

// Modo con ventana siempre abierta, para pruebas manuales (Ctrl+C para
// parar). El uso real pensado es --once vía el Programador de tareas.
async function modoLoop() {
  const config = leerConfig();
  console.log("Agente Local corriendo (modo loop). Ctrl+C para detener.\n");
  for (;;) {
    try {
      const pedido = await buscarProximoPedido(config.token);
      if (pedido) await atenderPedido(config, pedido);
    } catch (err) {
      console.error("Error consultando pedidos pendientes:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_POLLING_MS));
  }
}

async function main() {
  if (process.argv.includes("--login")) return modoLogin();
  if (process.argv.includes("--loop")) return modoLoop();
  return modoUnaVez();
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
