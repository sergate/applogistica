// Agente Local: corre en la PC de un usuario del depósito y atiende sus
// pedidos de actualización del Tablero Logístico. Modo recomendado: --loop,
// mantenido vivo por un "vigía" (agente-vigia-oculto.vbs) que el Programador
// de tareas dispara cada 1 minuto -- las PCs de dominio bloquean el
// disparador "al iniciar sesión" por política de grupo, así que el vigía se
// fija si el --loop ya está corriendo y lo levanta si no. Sin ninguna
// ventana visible -- consulta cada pocos segundos si hay algo para hacer, y
// solo ahí abre el navegador. Ver INSTALACION-AGENTE.md para la
// configuración completa.
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

require("./entorno-portable.js");
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const { chromium } = require("playwright");
const { createClient } = require("@supabase/supabase-js");

const descargador = require("./descargar-reportes.js");
const subidor = require("./actualizar-tablero.js");
const reporteDespachos = require("./reporte-despachos.js");
const { imprimirGuia } = require("./imprimir-despacho.js");
const { imprimirEtiquetas } = require("./imprimir-etiquetas.js");
const { conLock } = require("./lock.js");

const CONFIG_PATH = path.join(__dirname, "agente-config.json");
// Mismo override que actualizar-tablero.js, para poder apuntar el agente a
// un deploy preview en vez de a producción sin tocar código.
const APP_BASE_URL = (process.env.TABLERO_URL || "https://panellogistico.com.ar").replace(/\/$/, "");
// Desde que se agregó Despacho (Para Imprimir/Reimprimir), los pedidos son
// mucho más frecuentes durante el día (cada guía que se imprime genera uno)
// -- eso hacía que el Agente nunca llegara a los 5 minutos ociosos y se
// quedara todo el día en el polling rápido de 2.5s, disparando Function
// Invocations/Edge Requests de Vercel. Se espació el polling activo y se
// acortó la ventana para caer a modo ocioso, sin impacto perceptible para
// el usuario (el trabajo del Agente ya tarda varios segundos por el
// automatismo de Playwright).
const INTERVALO_POLLING_MS = 5000; // solo se usa en --loop, y solo si no hay Realtime conectado
// Backoff de modoLoop() cuando no hay pedidos Y no hay Realtime -- ver comentario ahí.
const MINUTOS_ANTES_DE_ESPACIAR_POLLING = 2;
const INTERVALO_POLLING_OCIOSO_MS = 90_000;
// Con Realtime conectado, esto pasa a ser solo la red de seguridad por si
// se pierde algún aviso (conexión cortada un rato, etc) -- el aviso real
// llega mucho antes que esto, así que 10 min es seguro.
const INTERVALO_POLLING_SEGURIDAD_MS = 10 * 60 * 1000;

// Cada cuánto se refresca solo (sin que nadie apriete el botón) el
// estado_wms de las guías -- lo necesita el bloqueo de Modificar/Anular
// Hoja de Ruta por DP_COT_OK (ver src/lib/despachoBloqueo.ts del Tablero),
// que si no se queda con el último estado importado manualmente. Solo se
// dispara cuando el Agente está ocioso (sin pedido pendiente), y solo trae
// cabeceras (estado_wms incluido) -- NO vuelve a bajar bultos/packing list
// de cada guía (eso es pesado y no hace falta para este chequeo).
const INTERVALO_REFRESCO_ESTADOS_MS = 20 * 60 * 1000;
const VENTANA_DIAS_ATRAS_REFRESCO_ESTADOS = 14;
const VENTANA_DIAS_ADELANTE_REFRESCO_ESTADOS = 3;

// Cada cuánto se revisan guías Propio cuyo packing list quedó pendiente
// (bultos_insumos sigue NULL en el Tablero) -- ver completarPackingListsFaltantes().
// Más seguido que el refresco de estados porque mientras esto no se resuelve
// la vista de impresión de la Hoja de Ruta bloquea imprimir esas guías.
const INTERVALO_COMPLETAR_PACKING_MS = 5 * 60 * 1000;

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
  productividad: ["productividad"],
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

// Refresco automático y liviano del estado_wms de las guías -- se dispara
// solo desde modoLoop() cada INTERVALO_REFRESCO_ESTADOS_MS, sin que nadie
// apriete el botón. Reusa la misma ruta que ya usa el pedido manual
// "despacho_importar" (upsert por despacho_cab_id: solo pisa las columnas
// de cabecera, entre ellas estado_wms, sin tocar nada más de la guía).
async function refrescarEstadosDespachoAutomatico(config) {
  await conLock(
    async () => {
      const contextos = await abrirContextos({ headless: true });
      try {
        const { paginaWms } = contextos;
        await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
        await paginaWms.waitForTimeout(1000);
        await descargador.chequearSesion(paginaWms);

        const fechaDesde = new Date(Date.now() - VENTANA_DIAS_ATRAS_REFRESCO_ESTADOS * 86400000)
          .toISOString()
          .slice(0, 10);
        const fechaHasta = new Date(Date.now() + VENTANA_DIAS_ADELANTE_REFRESCO_ESTADOS * 86400000)
          .toISOString()
          .slice(0, 10);
        const filas = await reporteDespachos.listarDespachos(paginaWms, fechaDesde, fechaHasta);

        const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/importar`, {
          method: "POST",
          headers: headersAgente(config.token, { "Content-Type": "application/json" }),
          body: JSON.stringify({ filas }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          throw new Error(data?.error || `HTTP ${res.status}`);
        }
        console.log(
          `[${new Date().toLocaleTimeString()}] Refresco automático de estados WMS: ${filas.length} guías (${fechaDesde} a ${fechaHasta}).`
        );
      } finally {
        await cerrarContextos(contextos);
      }
    },
    { maxEsperaMs: 5_000, silencioso: true }
  );
}

// Completa el packing list de guías Propio que se quedaron a mitad de
// camino de un import (bultos_insumos sigue NULL): el import de despacho
// sube la cabecera de todas las guías de golpe, pero el desglose por
// caja/SKU se consulta al WMS guía por guía dentro del mismo job -- si el
// Agente se reinicia, o la consulta puntual de una guía falla, esa guía
// queda sin packing list para siempre a menos que algo la reintente. Se
// dispara solo desde modoLoop(), sin que nadie apriete ningún botón.
async function completarPackingListsFaltantes(config) {
  await conLock(
    async () => {
      const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/pendientes-packing`, {
        headers: headersAgente(config.token),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
      const pendientes = data.pendientes || [];
      if (pendientes.length === 0) return;

      const contextos = await abrirContextos({ headless: true });
      try {
        const { paginaWms } = contextos;
        await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
        await paginaWms.waitForTimeout(1000);
        await descargador.chequearSesion(paginaWms);

        let packingList = [];
        let completadas = 0;
        const GUIAS_POR_LOTE = 25;
        let msPackingTotal = 0;
        const inicioLoop = Date.now();

        const subirLote = async () => {
          if (packingList.length === 0) return;
          const resSubida = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/bultos`, {
            method: "POST",
            headers: headersAgente(config.token, { "Content-Type": "application/json" }),
            body: JSON.stringify({ bultos: [], packingList }),
          });
          const dataSubida = await resSubida.json().catch(() => null);
          if (!resSubida.ok || !dataSubida?.success) {
            throw new Error(dataSubida?.error || `Error subiendo packing list (HTTP ${resSubida.status}).`);
          }
          packingList = [];
        };

        for (let i = 0; i < pendientes.length; i++) {
          const pendiente = pendientes[i];
          try {
            const inicioPacking = Date.now();
            const filasPacking = await reporteDespachos.obtenerPackingList(paginaWms, pendiente.despacho_cab_id);
            msPackingTotal += Date.now() - inicioPacking;
            for (const fp of filasPacking) {
              packingList.push({
                despacho_cab_id: pendiente.despacho_cab_id,
                caja: fp.caja,
                sku: fp.sku,
                cantidad: fp.cantidad,
              });
            }
            completadas++;
          } catch (err) {
            console.error(
              `  (no pude completar el packing list de la guía ${pendiente.guia || pendiente.numero_guia}: ${err.message})`
            );
          }
          if ((i + 1) % GUIAS_POR_LOTE === 0) await subirLote();
        }
        await subirLote();

        console.log(
          `[${new Date().toLocaleTimeString()}] Packing list pendiente completado: ${completadas}/${pendientes.length} guías.`
        );
        console.log(
          `  -> Timing: loop completo ${Date.now() - inicioLoop}ms | ${completadas} consultas, ` +
            `${msPackingTotal}ms total, ${completadas ? Math.round(msPackingTotal / completadas) : 0}ms promedio.`
        );
      } finally {
        await cerrarContextos(contextos);
      }
    },
    { maxEsperaMs: 5_000, silencioso: true }
  );
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
  contenedores_ci: "Contenedores CI",
};

// Nombres de archivo de remanentes cargados a mano en el Tablero (Status
// Remanentes -> Carga Datos) -- se bajan además de las opciones con REMA.
async function traerArchivosRemaManuales(token) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/remanentes-manuales`, {
    headers: headersAgente(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return Array.isArray(data.archivos) ? data.archivos : [];
}

// Baja el reporte de Contenedores (Tipo = CI) del WMS y sube contenedor ->
// marca al Tablero (POST directo con el token del agente, sin pasar por la UI
// del Tablero). Devuelve la ruta del CSV (para borrarlo después) y cuántos
// contenedores se subieron.
const LOTE_CONTENEDORES = 2000;
async function descargarYSubirContenedores(config, paginaWms) {
  const [archivo] = await descargador.descargarUnReporte(paginaWms, "contenedores_ci");
  const filas = descargador.parsearContenedoresCsv(archivo);
  if (filas.length === 0) throw new Error("El reporte de Contenedores del WMS vino vacío.");

  for (let i = 0; i < filas.length; i += LOTE_CONTENEDORES) {
    const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/contenedores/importar`, {
      method: "POST",
      headers: headersAgente(config.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ filas: filas.slice(i, i + LOTE_CONTENEDORES) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || `Error subiendo contenedores al Tablero (HTTP ${res.status}).`);
    }
  }
  return { archivo, cantidad: filas.length };
}

// Pedido manual "Actualizar contenedores desde WMS" (botón en Pendiente de
// Despacho -> Importar Datos).
async function correrPedidoContenedores(config, pedido, paginas) {
  const { paginaWms } = paginas;
  await avisarProgreso(config.token, pedido.id, 10, "Descargando: Contenedores CI del WMS...");
  const { archivo, cantidad } = await descargarYSubirContenedores(config, paginaWms);
  console.log(`  -> ${cantidad} contenedores subidos al Tablero.`);
  return [archivo];
}

// --- Seguimiento Urgencias: estado real de cada contenedor en el WMS ---
// Consulta (JSON, sin descargar ningún archivo) el estado de cada contenedor
// cargado en los bloques y lo guarda en el Tablero; la pantalla marca como
// "Despachado" los que están en PA_CARGA_CAMION.
const LOTE_ESTADOS_URGENCIAS = 500;

async function traerContenedoresUrgencias(config) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/urgencias/contenedores`, {
    headers: headersAgente(config.token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);
  return Array.isArray(data.contenedores) ? data.contenedores : [];
}

async function actualizarEstadosUrgencias(config, paginaWms, contenedores, onProgreso) {
  await paginaWms.goto(descargador.URL_BASE, { waitUntil: "networkidle" });
  await paginaWms.waitForTimeout(1000);
  await descargador.chequearSesion(paginaWms);

  const estados = await descargador.consultarEstadosContenedores(paginaWms, contenedores, onProgreso);

  for (let i = 0; i < estados.length; i += LOTE_ESTADOS_URGENCIAS) {
    const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/urgencias/estados`, {
      method: "POST",
      headers: headersAgente(config.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ estados: estados.slice(i, i + LOTE_ESTADOS_URGENCIAS) }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || `Error subiendo estados de contenedores al Tablero (HTTP ${res.status}).`);
    }
  }
  return estados;
}

// Pedido manual "Actualizar estados desde WMS" (botón en Seguimiento Urgencias).
async function correrPedidoUrgenciasEstados(config, pedido, paginas) {
  const { paginaWms } = paginas;
  await avisarProgreso(config.token, pedido.id, 5, "Leyendo los contenedores cargados...");
  const contenedores = await traerContenedoresUrgencias(config);
  if (contenedores.length === 0) {
    pedido.avisoResultado = "No hay contenedores cargados en Seguimiento Urgencias.";
    return [];
  }

  const estados = await actualizarEstadosUrgencias(config, paginaWms, contenedores, (hechos, total) =>
    avisarProgreso(
      config.token,
      pedido.id,
      10 + Math.round((hechos / total) * 80),
      `Consultando el WMS: contenedor ${hechos}/${total}...`
    )
  );
  const noEncontrados = estados.filter((e) => !e.estado).length;
  console.log(`  -> ${estados.length} contenedores consultados (${noEncontrados} sin respuesta del WMS).`);
  if (noEncontrados > 0) {
    pedido.avisoResultado = `${noEncontrados} contenedor(es) no figuran en el WMS (quedan como "sin dato").`;
  }
  return [];
}

// Refresco automático y liviano (sin que nadie apriete el botón), solo desde
// modoLoop() cuando el Agente está ocioso: si no hay contenedores cargados,
// ni siquiera abre el navegador.
const INTERVALO_REFRESCO_URGENCIAS_MS = 15 * 60 * 1000;

async function refrescarEstadosUrgenciasAutomatico(config) {
  const contenedores = await traerContenedoresUrgencias(config);
  if (contenedores.length === 0) return;

  await conLock(
    async () => {
      const contextos = await abrirContextos({ headless: true });
      try {
        const estados = await actualizarEstadosUrgencias(config, contextos.paginaWms, contenedores);
        console.log(
          `[${new Date().toLocaleTimeString()}] Refresco automático de estados de urgencias: ${estados.length} contenedores.`
        );
      } finally {
        await cerrarContextos(contextos);
      }
    },
    { maxEsperaMs: 5_000, silencioso: true }
  );
}

// --- Pack and Hold: importar las guías de franquicias pendientes de despacho ---
// Solo LEE del WMS (listado de guías + detalle de contenedores + packing list de
// cada una) y lo sube al Tablero; nunca escribe nada en el WMS. Se queda con las
// guías tipo FRANQUICIA en estado DP_INICIADO.
const TIPO_GUIA_PACK_HOLD = "FRANQUICIA";
const ESTADO_GUIA_PACK_HOLD = "DP_INICIADO";
const DIAS_ATRAS_PACK_HOLD = 60;
const DIAS_ADELANTE_PACK_HOLD = 3;
const GUIAS_POR_LOTE_PACK_HOLD = 8;
const INTERVALO_REFRESCO_PACK_HOLD_MS = 20 * 60 * 1000;

function fechaISOConDesfase(dias) {
  const f = new Date(Date.now() + dias * 86400000);
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
}

async function postPackHold(config, cuerpo) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/pack-hold/importar`, {
    method: "POST",
    headers: headersAgente(config.token, { "Content-Type": "application/json" }),
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Error subiendo guías de Pack and Hold al Tablero (HTTP ${res.status}).`);
  }
  return data;
}

// Devuelve { guias, contenedores, omitidas, despachadas }. "omitidas" son guías
// cuyo detalle no se pudo leer (se reintentan en la próxima corrida).
async function importarGuiasPackHold(config, paginaWms, onProgreso) {
  await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
  await paginaWms.waitForTimeout(1000);
  await descargador.chequearSesion(paginaWms);

  const cabeceras = await reporteDespachos.listarDespachos(
    paginaWms,
    fechaISOConDesfase(-DIAS_ATRAS_PACK_HOLD),
    fechaISOConDesfase(DIAS_ADELANTE_PACK_HOLD)
  );
  const guias = cabeceras.filter(
    (c) =>
      (c.tipo || "").trim().toUpperCase() === TIPO_GUIA_PACK_HOLD &&
      (c.estado_nombre || "").trim().toUpperCase() === ESTADO_GUIA_PACK_HOLD
  );
  if (guias.length === 0) return { guias: 0, contenedores: 0, omitidas: 0, despachadas: null };

  let contenedoresTotal = 0;
  let omitidas = 0;
  for (let i = 0; i < guias.length; i += GUIAS_POR_LOTE_PACK_HOLD) {
    const armadas = [];
    for (const cab of guias.slice(i, i + GUIAS_POR_LOTE_PACK_HOLD)) {
      try {
        const detalle = await reporteDespachos.detalleDespacho(paginaWms, cab.despacho_cab_id);
        const packing = await reporteDespachos.obtenerPackingList(paginaWms, cab.despacho_cab_id);
        const nombreCliente = String(cab.cliente_nombre || "").trim();
        armadas.push({
          despacho_cab_id: cab.despacho_cab_id,
          guia: cab.guia ?? cab.numero_guia,
          cliente_codigo: (nombreCliente.match(/^(\d+)\b/) || [])[1] || null,
          cliente_nombre: nombreCliente,
          estado_wms: cab.estado_nombre,
          fecha_creacion: cab.fecha_creacion,
          contenedores: detalle.map((d) => ({ contenedor: d.caja, unidades: d.cantidad, remito: d.remito })),
          packing: packing.map((p) => ({ contenedor: p.caja, sku: p.sku, cantidad: p.cantidad })),
        });
      } catch (err) {
        omitidas++;
        console.error(`  (no pude leer el detalle de la guía ${cab.guia}: ${err instanceof Error ? err.message : err})`);
      }
    }
    if (armadas.length > 0) {
      const r = await postPackHold(config, { fase: "lote", guias: armadas });
      contenedoresTotal += r.contenedores || 0;
    }
    if (onProgreso) await onProgreso(Math.min(i + GUIAS_POR_LOTE_PACK_HOLD, guias.length), guias.length);
  }

  // Cierre: las guías que ya no están en DP_INICIADO se marcan despachadas y
  // liberan sus posiciones. Se mandan TODAS las vigentes, también las omitidas.
  const cierre = await postPackHold(config, { fase: "cierre", ids: guias.map((g) => g.despacho_cab_id) });
  return { guias: guias.length, contenedores: contenedoresTotal, omitidas, despachadas: cierre.despachadas ?? 0 };
}

// Pedido manual: botón "Importar guías pendientes (WMS)" de Pack and Hold.
async function correrPedidoPackHold(config, pedido, paginas) {
  await avisarProgreso(config.token, pedido.id, 5, "Leyendo guías de franquicias en el WMS...");
  const r = await importarGuiasPackHold(config, paginas.paginaWms, (hechas, total) =>
    avisarProgreso(config.token, pedido.id, 10 + Math.round((hechas / total) * 85), `Guías ${hechas}/${total}: contenedores y packing list...`)
  );
  console.log(
    `  -> Pack and Hold: ${r.guias} guías, ${r.contenedores} contenedores` +
      (r.despachadas ? `, ${r.despachadas} guías ya despachadas (posiciones liberadas)` : "") +
      (r.omitidas ? `, ${r.omitidas} omitidas` : "") +
      "."
  );
  const avisos = [];
  if (r.guias === 0) avisos.push("El WMS no devolvió guías de franquicias en DP_INICIADO: no se liberó ninguna posición.");
  if (r.omitidas > 0) avisos.push(`${r.omitidas} guía(s) no se pudieron leer y se reintentan en la próxima importación.`);
  if (r.despachadas) avisos.push(`${r.despachadas} guía(s) ya estaban despachadas en el WMS: se liberaron sus posiciones.`);
  if (avisos.length > 0) pedido.avisoResultado = avisos.join(" ");
  return [];
}

// Refresco automático (modoLoop, con el Agente ocioso): mantiene las guías al
// día y libera las posiciones de las que se despacharon en el WMS. No hace nada
// si todavía no se corrió el SQL o si nadie importó guías nunca.
async function refrescarPackHoldAutomatico(config) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/pack-hold/importar`, {
    headers: headersAgente(config.token),
  });
  const estado = await res.json().catch(() => null);
  if (!res.ok || !estado?.success || !estado.listo || !estado.hayGuias) return;

  await conLock(
    async () => {
      const contextos = await abrirContextos({ headless: true });
      try {
        const r = await importarGuiasPackHold(config, contextos.paginaWms);
        console.log(
          `[${new Date().toLocaleTimeString()}] Refresco automático de Pack and Hold: ${r.guias} guías` +
            (r.despachadas ? `, ${r.despachadas} despachadas` : "") +
            "."
        );
      } finally {
        await cerrarContextos(contextos);
      }
    },
    { maxEsperaMs: 5_000, silencioso: true }
  );
}

// Cuánto esperar como mínimo entre dos descargas del reporte de Contenedores
// cuando el motivo es "faltan marcas": si faltan contenedores que el WMS no
// trae como CI, igual no se vuelve a bajar en cada import.
const MINUTOS_ENTRE_ACTUALIZACIONES_CONTENEDORES = 60;

// Después de importar Pendiente de Despacho (Clientes o Propios): si en esas
// tablas hay contenedores CI sin marca en el Tablero, baja el reporte de
// Contenedores y completa el mapeo. Si no falta ninguno, no descarga nada.
// Nunca hace fallar el import: ante un error devuelve un aviso.
async function completarMarcasSiFaltan(config, pedido, paginaWms) {
  try {
    const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/contenedores/faltantes`, {
      headers: headersAgente(config.token),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || `HTTP ${res.status}`);

    if (data.faltantes === 0) return { archivos: [], aviso: null };

    const minutos = data.ultimaActualizacion
      ? (Date.now() - new Date(data.ultimaActualizacion).getTime()) / 60_000
      : Infinity;
    if (minutos < MINUTOS_ENTRE_ACTUALIZACIONES_CONTENEDORES) {
      console.log(
        `  (${data.faltantes} contenedores sin marca, pero el mapeo se actualizó hace ${Math.round(minutos)} min -- no vuelvo a bajarlo.)`
      );
      return { archivos: [], aviso: null };
    }

    await avisarProgreso(config.token, pedido.id, 90, `Actualizando marcas: ${data.faltantes} contenedores nuevos...`);
    const { archivo, cantidad } = await descargarYSubirContenedores(config, paginaWms);
    console.log(`  -> ${data.faltantes} contenedores sin marca: mapeo actualizado (${cantidad} contenedores).`);
    return { archivos: [archivo], aviso: null };
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    console.error(`  (no pude actualizar las marcas de los contenedores: ${motivo})`);
    return { archivos: [], aviso: `No pude actualizar las marcas de los contenedores (${motivo}).` };
  }
}

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
  const avisos = [];
  for (const idReporte of idsReportes) {
    await avisarProgreso(
      config.token,
      pedido.id,
      Math.round((pasosHechos / totalPasos) * 100),
      `Descargando: ${NOMBRE_REPORTE[idReporte] || idReporte}...`
    );
    if (idReporte === "ci_rema") {
      // Además de los REMA de siempre, baja los nombres cargados a mano en
      // Status Remanentes -> Carga Datos.
      try {
        descargador.setArchivosRemaManuales(await traerArchivosRemaManuales(config.token));
      } catch (err) {
        descargador.setArchivosRemaManuales([]);
        const motivo = err instanceof Error ? err.message : String(err);
        console.error(`  (no pude traer la lista de archivos manuales: ${motivo})`);
        avisos.push(`No pude traer la lista de archivos cargados a mano (${motivo}); se bajaron solo los REMA.`);
      }
    }
    manifiesto[idReporte] = await descargador.descargarUnReporte(paginaWms, idReporte);
    if (idReporte === "ci_rema") {
      const noEncontrados = descargador.getRemaManualesNoEncontrados();
      if (noEncontrados.length > 0) {
        avisos.push(`No se encontraron en el WMS: ${noEncontrados.join(" | ")}.`);
      }
    }
    pasosHechos++;
  }
  pedido.avisoResultado = avisos.length > 0 ? avisos.join(" ") : null;

  await avisarProgreso(config.token, pedido.id, Math.round((pasosHechos / totalPasos) * 100), "Subiendo al Tablero...");
  await subidor.subirUnaSeccion(paginaTablero, seccion, manifiesto);

  const archivos = Object.values(manifiesto).flat();

  // Pendiente de Despacho: completa la marca de los contenedores nuevos (solo
  // baja el reporte de Contenedores si hace falta).
  if (seccion === "pd_clientes" || seccion === "pd_propios") {
    const marcas = await completarMarcasSiFaltan(config, pedido, paginaWms);
    archivos.push(...marcas.archivos);
    if (marcas.aviso) {
      avisos.push(marcas.aviso);
      pedido.avisoResultado = avisos.join(" ");
    }
  }

  return archivos;
}

// Trae las guías de despacho de HOY directo del WMS (JSON, sin descargar
// ningún archivo) y las manda al Tablero -- no usa paginaTablero porque no
// hay nada que subir por su UI, es un POST directo con el token del agente.
async function correrPedidoDespachoImportar(config, pedido, paginas) {
  const { paginaWms } = paginas;

  await avisarProgreso(config.token, pedido.id, 10, "Consultando guías en el WMS...");
  await paginaWms.goto(reporteDespachos.URL_BASE, { waitUntil: "networkidle" });
  await paginaWms.waitForTimeout(1000);
  await descargador.chequearSesion(paginaWms);

  const hoy = reporteDespachos.hoyISO();
  const fechaDesde = pedido.payload?.fechaDesde || hoy;
  const fechaHasta = pedido.payload?.fechaHasta || hoy;
  const filas = await reporteDespachos.listarDespachos(paginaWms, fechaDesde, fechaHasta);

  await avisarProgreso(config.token, pedido.id, 40, `Subiendo ${filas.length} guías al Tablero...`);
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/importar`, {
    method: "POST",
    headers: headersAgente(config.token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ trabajoId: pedido.id, filas }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Error subiendo guías al Tablero (HTTP ${res.status}).`);
  }

  // Detalle de bultos (contenedor/caja) por guía + packing list (caja/SKU)
  // para las guías tipo PROPIO -- una o dos consultas JSON por guía, cada
  // una en su propio try/catch para que una falla puntual no aborte el
  // resto. Se sube en lotes de GUIAS_POR_LOTE guías (no todo junto al
  // final) -- con rangos de varias semanas el body de una sola subida podía
  // superar el límite del servidor (HTTP 413).
  const GUIAS_POR_LOTE = 25;
  let bultos = [];
  let packingList = [];
  let bultosSubidos = 0;
  let packingSubido = 0;

  // Timing para medir cuánto tarda cada consulta al WMS -- datos crudos para
  // decidir si conviene paralelizar estas consultas (hoy son secuenciales,
  // una guía atrás de la otra). Se loguea un resumen al final del pedido.
  let msDetalleTotal = 0;
  let cantDetalle = 0;
  let msPackingTotal = 0;
  let cantPacking = 0;
  const inicioLoop = Date.now();

  const subirLote = async () => {
    if (bultos.length === 0 && packingList.length === 0) return;
    const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/despacho/bultos`, {
      method: "POST",
      headers: headersAgente(config.token, { "Content-Type": "application/json" }),
      body: JSON.stringify({ bultos, packingList }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      throw new Error(data?.error || `Error subiendo el detalle de bultos al Tablero (HTTP ${res.status}).`);
    }
    bultosSubidos += bultos.length;
    packingSubido += packingList.length;
    bultos = [];
    packingList = [];
  };

  for (let i = 0; i < filas.length; i++) {
    const cab = filas[i];
    await avisarProgreso(
      config.token,
      pedido.id,
      40 + Math.round((i / Math.max(filas.length, 1)) * 50),
      `Detalle de bultos: guía ${i + 1}/${filas.length}...`
    );
    try {
      const inicioDetalle = Date.now();
      const detalles = await reporteDespachos.detalleDespacho(paginaWms, cab.despacho_cab_id);
      msDetalleTotal += Date.now() - inicioDetalle;
      cantDetalle++;
      for (const det of detalles) {
        bultos.push({
          despacho_cab_id: cab.despacho_cab_id,
          caja: det.caja,
          remito: det.remito,
          cantidad: det.cantidad,
        });
      }
    } catch (err) {
      console.error(`  (no pude traer el detalle de la guía ${cab.guia}: ${err.message})`);
    }

    if ((cab.tipo || "").trim().toUpperCase() === "PROPIO") {
      try {
        const inicioPacking = Date.now();
        const filasPacking = await reporteDespachos.obtenerPackingList(paginaWms, cab.despacho_cab_id);
        msPackingTotal += Date.now() - inicioPacking;
        cantPacking++;
        for (const fp of filasPacking) {
          packingList.push({ despacho_cab_id: cab.despacho_cab_id, caja: fp.caja, sku: fp.sku, cantidad: fp.cantidad });
        }
      } catch (err) {
        console.error(`  (no pude traer el packing list de la guía ${cab.guia}: ${err.message})`);
      }
    }

    if ((i + 1) % GUIAS_POR_LOTE === 0) {
      await avisarProgreso(config.token, pedido.id, 90, `Subiendo lote de guías al Tablero (${i + 1}/${filas.length})...`);
      await subirLote();
    }
  }

  await avisarProgreso(config.token, pedido.id, 95, "Subiendo el último lote al Tablero...");
  await subirLote();
  console.log(`  -> Subidos ${bultosSubidos} bultos y ${packingSubido} filas de packing list.`);
  console.log(
    `  -> Timing: loop completo ${Date.now() - inicioLoop}ms | detalle: ${cantDetalle} consultas, ` +
      `${msDetalleTotal}ms total, ${cantDetalle ? Math.round(msDetalleTotal / cantDetalle) : 0}ms promedio | ` +
      `packing: ${cantPacking} consultas, ${msPackingTotal}ms total, ` +
      `${cantPacking ? Math.round(msPackingTotal / cantPacking) : 0}ms promedio.`
  );

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
  // "documentos": "ambos" (default) | "guia" | "remito" -- qué imprimir de
  // cada guía del lote. Pensado sobre todo para reimpresión puntual (ej.
  // se perdió solo el remito, no hace falta reimprimir la guía de nuevo).
  const documentos = pedido.payload?.documentos || "ambos";
  const incluirGuia = documentos !== "remito";
  const incluirRemito = documentos !== "guia";

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
        incluirGuia,
        incluirRemito,
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
      // falló en lo primero que se intentó (guía, o remito si no se pidió
      // guía en este lote).
      const pasoFallido = ultimoPasoOk === "guia" ? "remito" : incluirGuia ? "guia" : "remito";
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

// Manda el lote de etiquetas directo a la Zebra por red -- no toca el
// navegador para nada, así que atenderPedido() la corre por afuera de
// conLock/abrirContextos (ver más abajo).
async function correrPedidoEtiquetas(config, pedido) {
  const textos = pedido.payload?.textos;
  if (!Array.isArray(textos) || textos.length === 0) {
    throw new Error("El pedido no tiene etiquetas para imprimir (payload vacío).");
  }
  await avisarProgreso(config.token, pedido.id, 30, `Mandando ${textos.length} etiqueta(s) a la impresora...`);
  await imprimirEtiquetas(textos);
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

// El Agente solo conoce su token -- esto le dice su propio usuarioId, para
// poder suscribirse al canal Realtime que le corresponde (ver
// src/lib/realtimeBroadcast.ts del Tablero).
async function obtenerUsuarioId(token) {
  const res = await fetch(`${APP_BASE_URL}/api/actualizaciones/agente/quien-soy`, {
    headers: headersAgente(token),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Error consultando quien-soy (HTTP ${res.status}).`);
  }
  return data.usuarioId;
}

// Reemplaza el polling fijo por una conexión Realtime: en vez de preguntar
// "¿hay pedido?" cada pocos segundos para siempre, el Agente se queda
// escuchando y el Tablero le avisa apenas se crea uno (ver "solicitar"
// -> emitirNuevoPedido en el Tablero). Devuelve un EventEmitter que dispara
// "pedido" con cada aviso, o null si no se pudo conectar -- en ese caso
// modoLoop() sigue con el polling de siempre (comportamiento sin cambios,
// pensado para no romper las PCs que todavía no tengan supabaseUrl/
// supabaseAnonKey configurados en agente-config.json).
async function conectarRealtime(config) {
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  try {
    const usuarioId = await obtenerUsuarioId(config.token);
    const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
    const eventos = new EventEmitter();
    supabase
      .channel(`actualizaciones:agente:${usuarioId}`)
      .on("broadcast", { event: "nuevo_pedido" }, () => eventos.emit("pedido"))
      .subscribe((estado) => {
        if (estado === "SUBSCRIBED") {
          console.log("Realtime conectado -- escuchando pedidos nuevos (sin poleaer).");
        } else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
          console.error(
            `Realtime: estado "${estado}" -- mientras tanto, sigo con el chequeo de seguridad cada ` +
              `${INTERVALO_POLLING_SEGURIDAD_MS / 60_000} min (el cliente de Supabase reconecta solo).`
          );
        }
      });
    return eventos;
  } catch (err) {
    console.error("No se pudo conectar a Realtime, sigo con el polling de siempre:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Duerme hasta "ms", o menos si llega un evento "pedido" antes (cuando hay
// Realtime conectado) -- así el Agente reacciona al toque sin necesidad de
// acortar el intervalo de polling.
function esperar(ms, eventos) {
  return new Promise((resolve) => {
    const terminar = () => {
      clearTimeout(timer);
      if (eventos) eventos.removeListener("pedido", terminar);
      resolve();
    };
    const timer = setTimeout(terminar, ms);
    if (eventos) eventos.once("pedido", terminar);
  });
}

// Ejecuta UN pedido de punta a punta: abre los navegadores (recién acá, no
// antes) sólo si hay algo para hacer, corre la sección, avisa el resultado,
// borra los archivos si salió bien, y cierra todo.
async function atenderPedido(config, pedido) {
  console.log(`[${new Date().toLocaleTimeString()}] Pedido #${pedido.id} (${pedido.seccion}) -- corriendo...`);

  // Las etiquetas van directo por red a la Zebra -- no usan el navegador
  // para nada, así que no hace falta pasar por conLock/abrirContextos (eso
  // es solo para serializar el uso compartido del Chrome de Playwright).
  if (pedido.seccion === "exp_etiquetas") {
    try {
      await correrPedidoEtiquetas(config, pedido);
      await avisarResultado(config.token, pedido.id, true, "OK");
      console.log(`  -> #${pedido.id} listo.`);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : "Error inesperado";
      await avisarResultado(config.token, pedido.id, false, mensaje);
      console.error(`  -> #${pedido.id} falló: ${mensaje}`);
    }
    return;
  }

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
                : pedido.seccion === "contenedores_wms"
                ? await correrPedidoContenedores(config, pedido, contextos)
                : pedido.seccion === "urgencias_estados_wms"
                ? await correrPedidoUrgenciasEstados(config, pedido, contextos)
                : pedido.seccion === "pack_hold_importar"
                ? await correrPedidoPackHold(config, pedido, contextos)
                : await correrPedido(config, pedido, contextos);
            await avisarResultado(config.token, pedido.id, true, pedido.avisoResultado || "OK");
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

  // Si agente-config.json tiene supabaseUrl/supabaseAnonKey, el Agente se
  // queda escuchando por Realtime en vez de preguntar todo el tiempo --
  // "eventosRealtime" dispara "pedido" apenas el Tablero avisa uno nuevo.
  // Si no está configurado (o falla la conexión), conectarRealtime()
  // devuelve null y se sigue con el polling de siempre (ver esperaMs más
  // abajo) -- así una PC que todavía no migró sigue funcionando igual.
  const eventosRealtime = await conectarRealtime(config);

  // Arranca corriendo uno apenas se levanta el Agente, después cada
  // INTERVALO_REFRESCO_ESTADOS_MS -- ver refrescarEstadosDespachoAutomatico.
  let proximoRefrescoEstados = Date.now();
  let proximoCompletarPacking = Date.now();
  let proximoRefrescoUrgencias = Date.now();
  // Pack and Hold arranca 5 min después de levantar el Agente, para no sumar una
  // consulta pesada al WMS justo en el arranque.
  let proximoRefrescoPackHold = Date.now() + 5 * 60 * 1000;
  // Backoff (SOLO se usa sin Realtime): recién arrancado (o apenas terminó
  // un pedido) consulta rápido por si hay otro pedido encolado enseguida;
  // si se queda sin nada por un rato, va espaciando las consultas -- el
  // Agente corre 24/7 en cada PC del depósito aunque de noche/fin de
  // semana no haya nadie cargando nada, y el polling fijo cada 2.5s (~1M
  // requests/mes por Agente, solo uno) venía comiéndose el plan gratuito
  // de Vercel (Function Invocations/Edge Requests) sin necesidad.
  let ociosoDesde = null;
  for (;;) {
    try {
      const pedido = await buscarProximoPedido(config.token);
      if (pedido) {
        await atenderPedido(config, pedido);
        ociosoDesde = null;
      } else {
        if (ociosoDesde === null) ociosoDesde = Date.now();
        if (Date.now() >= proximoRefrescoEstados) {
          proximoRefrescoEstados = Date.now() + INTERVALO_REFRESCO_ESTADOS_MS;
          try {
            await refrescarEstadosDespachoAutomatico(config);
          } catch (err) {
            console.error("Error en el refresco automático de estados WMS:", err instanceof Error ? err.message : err);
          }
        }
        if (Date.now() >= proximoRefrescoUrgencias) {
          proximoRefrescoUrgencias = Date.now() + INTERVALO_REFRESCO_URGENCIAS_MS;
          try {
            await refrescarEstadosUrgenciasAutomatico(config);
          } catch (err) {
            console.error("Error en el refresco automático de estados de urgencias:", err instanceof Error ? err.message : err);
          }
        }
        if (Date.now() >= proximoRefrescoPackHold) {
          proximoRefrescoPackHold = Date.now() + INTERVALO_REFRESCO_PACK_HOLD_MS;
          try {
            await refrescarPackHoldAutomatico(config);
          } catch (err) {
            console.error("Error en el refresco automático de Pack and Hold:", err instanceof Error ? err.message : err);
          }
        }
        if (Date.now() >= proximoCompletarPacking) {
          proximoCompletarPacking = Date.now() + INTERVALO_COMPLETAR_PACKING_MS;
          try {
            await completarPackingListsFaltantes(config);
          } catch (err) {
            console.error("Error completando packing lists pendientes:", err instanceof Error ? err.message : err);
          }
        }
      }
    } catch (err) {
      console.error("Error consultando pedidos pendientes:", err instanceof Error ? err.message : err);
      if (ociosoDesde === null) ociosoDesde = Date.now();
    }

    const esperaMs = eventosRealtime
      ? INTERVALO_POLLING_SEGURIDAD_MS
      : (() => {
          if (ociosoDesde === null) return INTERVALO_POLLING_MS;
          const ociosoMs = Date.now() - ociosoDesde;
          if (ociosoMs < MINUTOS_ANTES_DE_ESPACIAR_POLLING * 60_000) return INTERVALO_POLLING_MS;
          return INTERVALO_POLLING_OCIOSO_MS;
        })();
    await esperar(esperaMs, eventosRealtime);
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
