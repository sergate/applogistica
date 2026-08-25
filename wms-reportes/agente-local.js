// Agente Local: corre en segundo plano en la PC de un usuario del depósito y
// hace polling a la cola de actualizaciones del Tablero Logístico. Cuando
// alguien aprieta "Actualizar esta sección (WMS)" en la web, este proceso
// toma el pedido, baja los reportes del WMS y los sube al tablero -- todo
// local, con la sesión de ESTA PC.
//
// Primer uso (una sola vez por PC): configurar el token y loguearse.
//   1. Copiá agente-config.example.json a agente-config.json y pegá tu token
//      (lo generás en el Tablero, pantalla "Importar Datos" -> "Agente Local").
//   2. node agente-local.js --login
//      Se abren dos ventanas de Chrome (WMS y Tablero) -- iniciá sesión en
//      cada una, volvé a la consola y apretá Enter.
//
// Uso normal (queda corriendo, Ctrl+C para parar):
//   node agente-local.js

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const descargador = require("./descargar-reportes.js");
const subidor = require("./actualizar-tablero.js");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");
const APP_BASE_URL = "https://applogistica-alpha.vercel.app";
const INTERVALO_POLLING_MS = 8000;

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

async function modoLogin() {
  const { contextoWms, paginaWms, contextoTablero, paginaTablero } = await abrirContextos({ headless: false });
  try {
    await paginaWms.goto(descargador.URL_BASE);
    await paginaTablero.goto(subidor.URL_BASE);
    console.log("Iniciá sesión en las DOS ventanas de Chrome que se abrieron (WMS y Tablero).");
    console.log("Cuando ambas estén logueadas, volvé acá y presioná Enter...");
    await esperarEnter();
    console.log("Listo, sesiones guardadas.");
  } finally {
    await contextoWms.close();
    await contextoTablero.close();
  }
}

async function correrPedido(pedido, paginas) {
  const { paginaWms, paginaTablero } = paginas;
  const seccion = pedido.seccion;
  const idsReportes = REPORTES_POR_SECCION[seccion];
  if (!idsReportes) throw new Error(`Sección desconocida en el pedido: "${seccion}"`);

  const manifiesto = {};
  for (const idReporte of idsReportes) {
    manifiesto[idReporte] = await descargador.descargarUnReporte(paginaWms, idReporte);
  }

  await subidor.subirUnaSeccion(paginaTablero, seccion, manifiesto);
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

async function main() {
  if (process.argv.includes("--login")) {
    await modoLogin();
    return;
  }

  const config = leerConfig();
  console.log("Agente Local corriendo. Ctrl+C para detener.\n");

  const { contextoWms, contextoTablero, paginaWms, paginaTablero } = await abrirContextos({ headless: true });

  process.on("SIGINT", async () => {
    console.log("\nCerrando Agente Local...");
    await contextoWms.close().catch(() => {});
    await contextoTablero.close().catch(() => {});
    process.exit(0);
  });

  // Loop infinito de polling -- se corta con Ctrl+C (ver SIGINT arriba).
  for (;;) {
    try {
      const pedido = await buscarProximoPedido(config.token);
      if (pedido) {
        console.log(`[${new Date().toLocaleTimeString()}] Pedido #${pedido.id} (${pedido.seccion}) -- corriendo...`);
        try {
          await correrPedido(pedido, { paginaWms, paginaTablero });
          await avisarResultado(config.token, pedido.id, true, "OK");
          console.log(`  -> #${pedido.id} listo.`);
        } catch (err) {
          const mensaje = err instanceof Error ? err.message : "Error inesperado";
          await avisarResultado(config.token, pedido.id, false, mensaje);
          console.error(`  -> #${pedido.id} falló: ${mensaje}`);
        }
      }
    } catch (err) {
      console.error("Error consultando pedidos pendientes:", err instanceof Error ? err.message : err);
    }
    await new Promise((r) => setTimeout(r, INTERVALO_POLLING_MS));
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
