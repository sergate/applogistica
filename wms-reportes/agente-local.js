// Agente Local: corre en la PC de un usuario del depósito y atiende sus
// pedidos de actualización del Tablero Logístico. Modo recomendado: --loop,
// disparado UNA vez al iniciar sesión de Windows (con reinicio automático si
// se cae), sin ninguna ventana visible -- consulta cada pocos segundos si hay
// algo para hacer, y solo ahí abre el navegador. Ver INSTALACION-AGENTE.md
// para la configuración completa.
//
// Primer uso (una sola vez por PC): configurar el token y loguearse.
//   1. Copiá agente-config.example.json a agente-config.json y pegá tu token
//      (lo generás en el Tablero, pantalla "Importar Datos" -> "Agente Local").
//   2. node agente-local.js --login
//      Se abren dos ventanas de Edge (WMS y Tablero) -- iniciá sesión en
//      cada una, volvé a la consola y apretá Enter.
//
// Uso recomendado (lo dispara el Programador de tareas, ver
// INSTALACION-AGENTE.md): ventana invisible que queda corriendo y consulta
// cada INTERVALO_POLLING_MS si hay un pedido pendiente; si no hay nada, no
// abre el navegador para nada.
//   node agente-local.js --loop
//
// Uso alternativo (una sola pasada y termina; queda por compatibilidad con
// instalaciones viejas que todavía disparan la tarea cada 1 minuto):
//   node agente-local.js --once

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const descargador = require("./descargar-reportes.js");
const subidor = require("./actualizar-tablero.js");
const reporteDespachos = require("./reporte-despachos.js");
const { imprimirGuia } = require("./imprimir-despacho.js");
const { conLock } = require("./lock.js");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");
// Mismo override que actualizar-tablero.js, para poder apuntar el agente a
// un deploy preview en vez de a producción sin tocar código.
const APP_BASE_URL = (process.env.TABLERO_URL || "https://applogistica-alpha.vercel.app").replace(/\/$/, "");
const INTERVALO_POLLING_MS = 2500; // solo se usa en --loop

// Deploys de preview de Vercel (ej. el de la rama "test") pueden tener
// activada la protección SSO, que redirige cualquier request sin sesión de
// Vercel a una pantalla de login -- rompe las llamadas del agente aunque el
// Bearer token de la app sea válido. Este secret ("Protection Bypass for
// Automation", Project Settings -> Deployment Protection en Vercel) lo
// esquiva; no hace falta en producción si ahí no está activada.
const VERCEL_PROTECTION_BYPASS = process.env.VERCEL_PROTECTION_BYPASS || "";

function headersAgente(token, extra) {
  const headers = Object.assign({ Authorization: `Bearer ${token}` }, extra || {});
  if (VERCEL_PROTECTION_BYPASS) headers["x-vercel-protection-bypass"] = VERCEL_PROTECTION_BYPASS;
  return headers;
}

// Qué reportes de descargar-reportes.js hay que bajar para poder subir cada
// sección con actualizar-tablero.js.
const REPORTES_POR_SECCION = {
  no_ecom: ["grupo", "tienda"],
  ecom: ["listado_ecom"],
  carga_inicial: ["ci_chk", "ci_awa", "ci_cqq"],
  remanentes: ["ci_rema"],
  pd_clientes: ["bandeja_comercial"],
  pd_propios: ["pre_despacho"],
  ocupacion_almacen: ["ocupacion_almacen"],
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
  // Chromium propio de Playwright (ver nota en descargar-reportes.js), no el
  // navegador del sistema.
  const contextoWms = await chromium.launchPersistentContext(descargador.PERFIL_DIR, {
    headless,
    acceptDownloads: true,
  });
  const paginaWms = contextoWms.pages()[0] || (await contextoWms.newPage());

  const contextoTablero = await chromium.launchPersistentContext(subidor.PERFIL_DIR, {
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
  await conLock(async () => {
    const contextos = await abrirContextos({ headless: false });
    try {
      await contextos.paginaWms.goto(descargador.URL_BASE);
      await contextos.paginaTablero.goto(subidor.URL_BASE);
      console.log("Iniciá sesión en las DOS ventanas de Edge que se abrieron (WMS y Tablero).");
      console.log("Cuando ambas estén logueadas, volvé acá y presioná Enter...");
      await esperarEnter();
      console.log("Listo, sesiones guardadas.");
    } finally {
      await cerrarContextos(contextos);
    }
  });
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
  bandeja_comercial: "Bandeja comercial",
  pre_despacho: "Pre despacho",
  ocupacion_almacen: "Existencia por ubicación (archivo grande, puede tardar varios minutos)",
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

// Trae las guías de despacho de HOY directo del WMS (JSON, sin descargar
// ningún archivo) y las manda al Tablero -- no usa paginaTablero porque no
// hay nada que subir por su UI, es un POST directo con el token del agente.
async function correrPedidoDespachoImportar(config, pedido, paginas) {
  const { paginaWms } = paginas;

  await avisarProgreso(config.token, pedido.id, 10, "Consultando guías de hoy en el WMS...");
  await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
  await paginaWms.waitForTimeout(1000);
  await descargador.chequearSesion(paginaWms);

  const hoy = reporteDespachos.hoyISO();
  const filas = await reporteDespachos.listarDespachos(paginaWms, hoy, hoy);

  await avisarProgreso(config.token, pedido.id, 70, `Subiendo ${filas.length} guías al Tablero...`);
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/importar`, {
    method: "POST",
    headers: headersAgente(config.token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ trabajoId: pedido.id, filas }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Error subiendo guías al Tablero (HTTP ${res.status}).`);
  }

  return []; // no hay archivos locales que borrar en este tipo de pedido
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
    headers: headersAgente(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id, progreso, paso }),
  }).catch((err) => {
    console.error("No pude avisar el progreso al Tablero:", err.message);
  });
}

async function avisarResultado(token, id, exito, mensaje) {
  await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/resultado`, {
    method: "POST",
    headers: headersAgente(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id, exito, mensaje }),
  }).catch((err) => {
    console.error("No pude avisar el resultado al Tablero:", err.message);
  });
}

// Avisa el resultado de UN paso (guía o remito) de UNA guía dentro de un
// pedido de impresión/reimpresión -- el Tablero lo usa para el log de
// auditoría y, si salió bien, para actualizar en vivo la columna Sí/No de
// esa guía en la grilla (no hace falta esperar a que termine el lote).
async function avisarEventoDespacho(token, { trabajoId, despachoCabId, guia, tipo, paso, resultado, mensaje }) {
  await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/evento`, {
    method: "POST",
    headers: headersAgente(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ trabajoId, despachoCabId, guia, tipo, paso, resultado, mensaje }),
  }).catch((err) => {
    console.error("No pude avisar un evento de impresión al Tablero:", err.message);
  });
}

// Imprime (o reimprime) la guía + remito de cada guía del payload, una por
// una -- cada guía en su propio try/catch para que una falla PUNTUAL (ej. un
// timeout de un modal) no aborte el resto del lote. Un cierre real del
// navegador SÍ se propaga (ver más abajo), para que el reintento de
// atenderPedido() se encargue en vez de marcar cada guía restante como
// error una por una. "tipo" es solo para el log de auditoría (impresion vs
// reimpresion); el circuito de impresión en sí es idéntico.
async function correrPedidoDespachoImprimir(config, pedido, paginas, tipo) {
  const { paginaWms } = paginas;
  const guias = pedido.payload?.guias;
  if (!Array.isArray(guias) || guias.length === 0) {
    throw new Error("El pedido no tiene guías para imprimir (payload vacío).");
  }

  await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
  await paginaWms.waitForTimeout(1000);
  await descargador.chequearSesion(paginaWms);

  let hechas = 0;
  let conError = 0;
  for (const { despachoCabId, guia, tipo: tipoDespacho } of guias) {
    await avisarProgreso(
      config.token,
      pedido.id,
      Math.round((hechas / guias.length) * 100),
      `Imprimiendo guía ${guia} (${hechas + 1}/${guias.length})...`
    );
    let ultimoPasoOk = null;
    try {
      await imprimirGuia(paginaWms, guia, {
        tipoDespacho,
        onPaso: (paso, resultado, mensaje) => {
          ultimoPasoOk = paso;
          return avisarEventoDespacho(config.token, { trabajoId: pedido.id, despachoCabId, guia, tipo, paso, resultado, mensaje });
        },
      });
    } catch (err) {
      // Si lo que falló fue el navegador en sí (se cerró solo a mitad de
      // camino) no tiene sentido seguir con la próxima guía -- todas las
      // que queden van a fallar igual. Se propaga para que atenderPedido()
      // reabra el navegador y reintente el pedido COMPLETO una vez, en vez
      // de que cada guía restante quede marcada como error una por una.
      if (descargador.esCierreInesperado(err)) throw err;

      conError++;
      const mensaje = err instanceof Error ? err.message : "Error inesperado";
      console.error(`  (falló la guía ${guia}: ${mensaje})`);
      // imprimirGuia va guía -> remito en orden: si el último onPaso avisado
      // fue "guia", el que falló fue el remito; si no llegó a avisar nada,
      // falló en la guía misma.
      const pasoFallido = ultimoPasoOk === "guia" ? "remito" : "guia";
      await avisarEventoDespacho(config.token, {
        trabajoId: pedido.id,
        despachoCabId,
        guia,
        tipo,
        paso: pasoFallido,
        resultado: "error",
        mensaje,
      });
    }
    hechas++;
    // Pausa corta entre guías: en un lote de varias, encadenarlas sin
    // respiro le da menos margen al WMS para asentar la pantalla entre una
    // y la próxima (visto en producción: una máscara de carga que no llega
    // a despejarse a tiempo).
    await paginaWms.waitForTimeout(800);
  }

  if (conError > 0) {
    throw new Error(`${conError} de ${guias.length} guías fallaron -- revisar el log de eventos.`);
  }

  return []; // no hay archivos locales que borrar en este tipo de pedido
}

async function buscarProximoPedido(token) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/proximo`, {
    headers: headersAgente(token),
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

  // Si el navegador ya está ocupado (el .bat manual corriendo, u otro
  // pedido) esperamos hasta 1 minuto -- lo normal es que la otra corrida
  // libere el lock antes de eso. Si no, se marca como error (en vez de
  // quedar "corriendo" colgado sin avisar) para que el usuario pueda
  // simplemente volver a apretar el botón.
  const corrio = await conLock(
    async () => {
      let contextos = await abrirContextos({ headless: true });
      try {
        // El Chrome real a veces se cierra solo a mitad de camino (crash,
        // auto-update, etc.) -- si pasa, reabrimos los dos navegadores y
        // reintentamos el pedido completo una sola vez antes de avisar error.
        let reintentado = false;
        for (;;) {
          try {
            const archivos =
              pedido.seccion === "despacho_importar"
                ? await correrPedidoDespachoImportar(config, pedido, contextos)
                : pedido.seccion === "despacho_imprimir"
                ? await correrPedidoDespachoImprimir(config, pedido, contextos, "impresion")
                : pedido.seccion === "despacho_reimprimir"
                ? await correrPedidoDespachoImprimir(config, pedido, contextos, "reimpresion")
                : await correrPedido(config, pedido, contextos);
            await avisarResultado(config.token, pedido.id, true, "OK");
            borrarArchivos(archivos);
            console.log(`  -> #${pedido.id} listo.`);
            break;
          } catch (err) {
            if (descargador.esCierreInesperado(err) && !reintentado) {
              reintentado = true;
              console.log(`  (el navegador se cerró inesperadamente -- reabriendo y reintentando pedido #${pedido.id}...)`);
              await cerrarContextos(contextos);
              contextos = await abrirContextos({ headless: true });
              continue;
            }
            const mensaje = err instanceof Error ? err.message : "Error inesperado";
            await avisarResultado(config.token, pedido.id, false, mensaje);
            console.error(`  -> #${pedido.id} falló: ${mensaje}`);
            break;
          }
        }
      } finally {
        await cerrarContextos(contextos);
      }
      return true;
    },
    { maxEsperaMs: 60_000, silencioso: true }
  );

  if (!corrio) {
    const mensaje = "El navegador del Agente estaba ocupado en otra corrida. Volvé a apretar el botón.";
    await avisarResultado(config.token, pedido.id, false, mensaje);
    console.error(`  -> #${pedido.id} pospuesto: ${mensaje}`);
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

// Modo recomendado: proceso único, invisible, que queda corriendo y
// consulta cada INTERVALO_POLLING_MS. Se dispara una vez al iniciar sesión
// de Windows (ver INSTALACION-AGENTE.md), con "Reiniciar si falla" tildado
// en el Programador de tareas para que se recupere solo ante un error.
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
