// Descarga automática de reportes del WMS (wms-cheeky.azurewebsites.net).
//
// Primer uso: corre "node descargar-reportes.js" con LOGIN_MANUAL=1 la primera vez
// (ver README) para iniciar sesión a mano una sola vez; el perfil de Chrome queda
// guardado en ./perfil-chrome y las corridas siguientes ya entran logueadas.
//
// Uso normal:
//   node descargar-reportes.js                -> corre todos los reportes de REPORTES
//   node descargar-reportes.js grupo tienda    -> corre solo esos ids

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { conLock } = require("./lock.js");

const URL_BASE = "https://wms-cheeky.azurewebsites.net/";
const PERFIL_DIR = path.join(__dirname, "perfil-chrome");
const DESCARGAS_DIR = path.join(__dirname, "descargas");
const CONFIG_PATH = path.join(__dirname, "agente-config.json");

// Usuario/clave del WMS, opcionales, en agente-config.json ("wmsUsuario" /
// "wmsClave") -- solo hace falta configurarlos si NO se usa el Chrome/Edge
// del sistema (que guarda la contraseña solo y la autocompleta), como pasa
// con el Chromium propio de Playwright. Si no están, el comportamiento es
// el de siempre: hay que re-loguearse a mano con "--login" cuando vence la
// sesión.
function leerCredencialesWms() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    if (config.wmsUsuario && config.wmsClave) return { usuario: config.wmsUsuario, clave: config.wmsClave };
  } catch {}
  return null;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function clickMenuItem(page, texto) {
  // El menú lateral (ExtJS treelist) renderiza las etiquetas como
  // div.x-treelist-item-text, no como <a>/<span> -- getByText ubica el
  // elemento más específico con ese texto exacto sin depender del tag.
  await page.getByText(texto, { exact: true }).first().click();
}

// El menú lateral arranca colapsado en cada carga de página: hay que abrir
// primero el grupo ("Pedidos", "Carga inicial") para que aparezca el link
// puntual de la pantalla.
async function abrirPantalla(page, grupoMenu, itemMenu) {
  await clickMenuItem(page, grupoMenu);
  await page.waitForTimeout(400);
  await clickMenuItem(page, itemMenu);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickBotonExt(page, texto, { exact = true } = {}) {
  // El WMS deja varias pestañas abiertas en el DOM (Dashboard, Dashboard
  // pedidos, etc.) aunque no estén visibles -- ":visible" evita que el
  // locator agarre un botón con el mismo texto en una pestaña oculta.
  const boton = exact
    ? page.locator("a.x-btn:visible").filter({ hasText: new RegExp(`^${escapeRegex(texto)}$`) }).first()
    : page.locator("a.x-btn:visible", { hasText: texto }).first();
  await boton.click();
}

async function esperarGridCargado(page) {
  // Espera a que desaparezca la máscara de carga de ExtJS, si aparece.
  await page.waitForTimeout(300);
  await page
    .locator(".x-mask")
    .first()
    .waitFor({ state: "hidden", timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

async function descargarConBoton(page, textoBoton, nombreArchivo) {
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    clickBotonExt(page, textoBoton),
  ]);
  const destino = path.join(DESCARGAS_DIR, nombreArchivo);
  await download.saveAs(destino);
  console.log(`  -> descargado: ${destino}`);
  return destino;
}

async function tildarCheckbox(page, labelTexto, valorDeseado) {
  // Busca el checkbox de ExtJS por el texto de su label ("Pendientes:", etc.)
  // recorriendo los ancestros en el DOM -- el layout real no usa una
  // estructura fija (a veces es una tabla, a veces divs), así que no
  // conviene depender de un tag puntual.
  const encontrado = await page.evaluate(
    ({ labelTexto, valorDeseado }) => {
      const checkboxes = Array.from(document.querySelectorAll('input[type=checkbox]')).filter(
        (el) => el.offsetParent !== null
      );
      for (const cb of checkboxes) {
        let el = cb;
        for (let i = 0; i < 8 && el; i++) {
          el = el.parentElement;
          if (el && el.innerText && el.innerText.includes(labelTexto)) {
            if (cb.checked !== valorDeseado) cb.click();
            return true;
          }
        }
      }
      return false;
    },
    { labelTexto, valorDeseado }
  );
  if (!encontrado) {
    throw new Error(`No se encontró el checkbox "${labelTexto}" en la pantalla.`);
  }
}

// --- Reportes tipo "Resumen pedidos por grupo / por tienda" ---
async function reportePedidosResumen(page, { menuTexto, idBuscar, nombreBase }) {
  console.log(`> ${nombreBase}`);
  await abrirPantalla(page, "Pedidos", menuTexto);
  await page.waitForTimeout(800);
  await tildarCheckbox(page, "Pendientes", false);
  await page.locator(`#${idBuscar}`).click();
  await esperarGridCargado(page);
  return descargarConBoton(page, "CSV Completo", `${nombreBase}_${timestamp()}.csv`);
}

// --- Reporte "Listado de pedidos" (Tipo = ECOM) ---
async function reporteListadoPedidosEcom(page) {
  console.log("> listado_pedidos_ecom");
  await abrirPantalla(page, "Pedidos", "Listado de pedidos");
  await page.waitForTimeout(800);
  await tildarCheckbox(page, "Pendientes", false);

  const tipoCombo = page.locator('input[placeholder="Tipo"]').first();
  await tipoCombo.click();
  await tipoCombo.fill("ECOM");
  await page.waitForTimeout(400);
  await page.keyboard.press("Enter");

  await page.locator("#buscar_od").click();
  await esperarGridCargado(page);

  // "Exportar" es un splitbutton de ExtJS: hay que clickear la flechita
  // (.x-btn-arrow-el), no el centro del botón, para que abra el desplegable
  // con las opciones "Excel OD" / "CSV" / "Excel".
  const botonExportar = page.locator("a.x-btn:visible").filter({ hasText: "Exportar" }).first();
  // El wrapper del splitbutton tapa la flecha para el chequeo de
  // "actionability" de Playwright aunque visualmente esté encima -- force
  // evita ese falso bloqueo.
  await botonExportar.locator(".x-btn-arrow-el").click({ force: true });
  await page.waitForTimeout(300);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    page.getByText("CSV", { exact: true }).last().click(),
  ]);
  const destino = path.join(DESCARGAS_DIR, `listado_pedidos_ecom_${timestamp()}.csv`);
  await download.saveAs(destino);
  console.log("  -> descargado listado_pedidos_ecom");
  return destino;
}

// --- Reporte "Resumen carga inicial" con un valor puntual de Pedido ---
async function reporteCargaInicial(page, { valorPedido, nombreBase }) {
  console.log(`> ${nombreBase} (Pedido=${valorPedido})`);
  await abrirPantalla(page, "Carga inicial", "Resumen CI");
  await page.waitForTimeout(800);

  const pedidoCombo = page.locator('input[placeholder="Pedido"]').first();
  await pedidoCombo.click();
  await pedidoCombo.fill(valorPedido);
  await page.waitForTimeout(600);
  // Elige la opción exacta de la lista desplegable de ExtJS.
  await page.locator(".x-boundlist-item:visible", { hasText: valorPedido }).first().click();

  await clickBotonExt(page, "Buscar");
  await esperarGridCargado(page);
  return descargarConBoton(page, "CSV Completo", `${nombreBase}_${timestamp()}.csv`);
}

// "Fecha desde" de Bandeja comercial / Pre despacho se pone siempre en "hoy
// menos 2 años" para traer todo el historial relevante sin tener que tocar
// el script cuando pasa el tiempo.
function fechaDosAniosAtras() {
  const hoy = new Date();
  const fecha = new Date(hoy.getFullYear() - 2, hoy.getMonth(), hoy.getDate());
  const dd = String(fecha.getDate()).padStart(2, "0");
  const mm = String(fecha.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${fecha.getFullYear()}`;
}

async function completarCampoTexto(page, placeholder, valor) {
  const campo = page.locator(`input[placeholder="${placeholder}"]`).first();
  await campo.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(valor);
}

async function vaciarCampoTexto(page, placeholder) {
  const campo = page.locator(`input[placeholder="${placeholder}"]`).first();
  await campo.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
}

// --- Reporte "Bandeja comercial" (Pendiente de Despacho - Clientes) ---
async function reporteBandejaComercial(page) {
  console.log("> bandeja_comercial");
  // "Bandeja comercial" es un ítem directo del menú lateral, no está anidado
  // en un grupo -- un solo click alcanza.
  await clickMenuItem(page, "Bandeja comercial");
  await page.waitForTimeout(800);
  await completarCampoTexto(page, "Fecha desde", fechaDosAniosAtras());
  await clickBotonExt(page, "Buscar");
  await esperarGridCargado(page);
  return descargarConBoton(page, "Excel", `bandeja_comercial_${timestamp()}.xlsx`);
}

// --- Reporte "Pre despacho" (Pendiente de Despacho - Propios) ---
async function reportePreDespacho(page) {
  console.log("> pre_despacho");
  await clickMenuItem(page, "Pre despacho");
  await page.waitForTimeout(800);
  await completarCampoTexto(page, "Fecha desde", fechaDosAniosAtras());
  // El campo "Estado remito" trae "Pendiente" tildado por defecto -- hay que
  // vaciarlo para traer todos los estados.
  await vaciarCampoTexto(page, "Estado remito");
  await clickBotonExt(page, "Buscar");
  await esperarGridCargado(page);
  return descargarConBoton(page, "Excel", `pre_despacho_${timestamp()}.xlsx`);
}

// --- Reporte "Resumen carga inicial" para TODAS las opciones que contengan REMA ---
async function reporteCargaInicialRema(page) {
  console.log("> carga_inicial_rema (todas las opciones que contengan REMA)");
  await abrirPantalla(page, "Carga inicial", "Resumen CI");
  await page.waitForTimeout(800);

  const pedidoCombo = page.locator('input[placeholder="Pedido"]').first();

  // Lee las opciones del combo (vía el store de ExtJS) para encontrar todas
  // las que contengan "REMA", en vez de una lista fija -- así sigue andando
  // si en el futuro aparecen más casos.
  const opciones = await page.evaluate(() => {
    const cmp = Ext.ComponentQuery.query('combobox[emptyText=Pedido]')[0];
    return cmp.getStore().getRange().map((r) => r.get(cmp.displayField));
  });
  const opcionesRema = opciones.filter((o) => /rema/i.test(o));
  console.log(`  encontradas ${opcionesRema.length} opciones con REMA`);

  const archivos = [];
  for (const opcion of opcionesRema) {
    await pedidoCombo.click();
    await pedidoCombo.fill(opcion);
    await page.waitForTimeout(600);
    await page.locator(".x-boundlist-item:visible", { hasText: opcion }).first().click();

    await clickBotonExt(page, "Buscar");
    await esperarGridCargado(page);

    const nombreSeguro = opcion.replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
    const destino = await descargarConBoton(
      page,
      "CSV Completo",
      `carga_inicial_rema_${nombreSeguro}_${timestamp()}.csv`
    );
    archivos.push(destino);
  }
  return archivos;
}

// --- Reporte "Existencia por ubicación" -> Excel Contenedor (Ocupación Almacén) ---
// Archivo grande (100+ MB): sin filtros, un solo click en "Excel Contenedor".
// Le damos más tiempo que al resto para que Playwright no lo corte a mitad
// de la descarga.
async function reporteOcupacionAlmacen(page) {
  console.log("> ocupacion_almacen (archivo grande, puede tardar varios minutos)");
  await abrirPantalla(page, "Stock", "Existencia");
  await page.waitForTimeout(800);

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 600000 }),
    clickBotonExt(page, "Excel Contenedor"),
  ]);
  // Guardamos con la extensión real que manda el servidor (el botón dice
  // "Excel" pero el archivo que baja es el que espera la pantalla de
  // Importar Ocupación en el Tablero, sea cual sea su formato real).
  const extension = path.extname(download.suggestedFilename()) || ".csv";
  const destino = path.join(DESCARGAS_DIR, `ocupacion_almacen_${timestamp()}${extension}`);
  await download.saveAs(destino);
  console.log(`  -> descargado: ${destino}`);
  return destino;
}

const REPORTES = {
  grupo: (page) =>
    reportePedidosResumen(page, {
      menuTexto: "Pedidos por grupo",
      idBuscar: "buscar_od_res_grupo",
      nombreBase: "pedidos_por_grupo",
    }),
  tienda: (page) =>
    reportePedidosResumen(page, {
      menuTexto: "Pedidos por tienda",
      idBuscar: "buscar_od_res_tienda",
      nombreBase: "pedidos_por_tienda",
    }),
  listado_ecom: reporteListadoPedidosEcom,
  ci_chk: (page) => reporteCargaInicial(page, { valorPedido: "CI_CHK_VER", nombreBase: "carga_inicial_chk" }),
  ci_awa: (page) => reporteCargaInicial(page, { valorPedido: "CI_AWA_VER", nombreBase: "carga_inicial_awa" }),
  ci_cqq: (page) => reporteCargaInicial(page, { valorPedido: "CI_CQQ_VER", nombreBase: "carga_inicial_cqq" }),
  ci_rema: reporteCargaInicialRema,
  bandeja_comercial: reporteBandejaComercial,
  pre_despacho: reportePreDespacho,
  ocupacion_almacen: reporteOcupacionAlmacen,
};

// Corre UN reporte por su id (navega, chequea sesión, ejecuta, devuelve el
// path o array de paths descargados). La usa tanto el CLI (main, abajo) como
// el Agente Local (agente-local.js), que la llama a demanda sobre un browser
// ya abierto en vez de lanzar uno nuevo por corrida.
async function descargarUnReporte(page, id) {
  if (!REPORTES[id]) {
    throw new Error(`Reporte desconocido: "${id}". Válidos: ${Object.keys(REPORTES).join(", ")}`);
  }
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await chequearSesion(page);
  const resultado = await REPORTES[id](page);
  return Array.isArray(resultado) ? resultado : [resultado];
}

async function main() {
  const idsPedidos = process.argv.slice(2);
  const idsACorrer = idsPedidos.length > 0 ? idsPedidos : Object.keys(REPORTES);

  for (const id of idsACorrer) {
    if (!REPORTES[id]) {
      console.error(`Reporte desconocido: "${id}". Válidos: ${Object.keys(REPORTES).join(", ")}`);
      process.exit(1);
    }
  }

  fs.mkdirSync(DESCARGAS_DIR, { recursive: true });

  await conLock(() => correrDescargas(idsACorrer));
}

// Todo lo que necesita el navegador abierto -- separado de main() para que
// pueda correr adentro de conLock() sin competir con otra corrida (el .bat
// manual, u otro pedido que la Tarea Programada del Agente esté atendiendo
// en simultáneo) por el mismo perfil de Chrome.
function esCierreInesperado(err) {
  return /has been closed|Target closed|Target page/i.test(String(err?.message || err));
}

async function correrDescargas(idsACorrer) {
  const loginManual = process.env.LOGIN_MANUAL === "1";

  async function abrirNavegador() {
    const context = await chromium.launchPersistentContext(PERFIL_DIR, {
      // Chromium propio de Playwright (npx playwright install chromium), NO
      // el Edge del sistema: Edge (y Chrome) se autoactualizan solos y eso
      // puede cortar una descarga a mitad de camino sin aviso -- el binario
      // de Playwright queda fijo en la versión que se instaló, no cambia
      // solo. Requiere "npx playwright install chromium" una vez por PC.
      headless: !loginManual,
      acceptDownloads: true,
    });
    const page = context.pages()[0] || (await context.newPage());
    return { context, page };
  }

  let { context, page } = await abrirNavegador();

  try {
    if (loginManual) {
      await page.goto(URL_BASE);
      console.log("Iniciá sesión manualmente en la ventana de Edge que se abrió.");
      console.log("Cuando veas el Dashboard cargado, volvé acá y presioná Enter...");
      await esperarEnter();
    }

    // Manifiesto: qué archivo(s) corresponde a cada reporte en ESTA corrida,
    // para que el script de actualización del tablero sepa exactamente qué
    // subir sin tener que adivinar por nombre/fecha de archivo. Si la corrida
    // fue parcial (ej. solo "grupo"), se mergea sobre el manifiesto anterior
    // en vez de pisarlo entero.
    const manifiestoPath = path.join(DESCARGAS_DIR, "manifiesto.json");
    let manifiesto = { generadoEn: new Date().toISOString(), reportes: {} };
    try {
      const anterior = JSON.parse(fs.readFileSync(manifiestoPath, "utf8"));
      manifiesto.reportes = anterior.reportes || {};
    } catch {}

    for (const id of idsACorrer) {
      // Por las dudas (crash puntual, sin memoria, etc.) -- si el navegador
      // se cierra solo a mitad de una descarga, reabrimos y reintentamos ESE
      // reporte una sola vez antes de darnos por vencidos.
      let reintentado = false;
      for (;;) {
        try {
          manifiesto.reportes[id] = await descargarUnReporte(page, id);
          break;
        } catch (err) {
          if (!esCierreInesperado(err) || reintentado) throw err;
          reintentado = true;
          console.log(`  (el navegador se cerró inesperadamente -- reabriendo y reintentando "${id}"...)`);
          await context.close().catch(() => {});
          ({ context, page } = await abrirNavegador());
        }
      }
    }

    manifiesto.generadoEn = new Date().toISOString();
    fs.writeFileSync(manifiestoPath, JSON.stringify(manifiesto, null, 2));
    console.log("\nListo. Todo descargado en:", DESCARGAS_DIR);
    console.log("Manifiesto:", manifiestoPath);
  } finally {
    await context.close().catch(() => {});
  }
}

async function chequearSesion(page) {
  // En un arranque en frío (primer job de la corrida) el menú puede tardar
  // más que el "networkidle" en aparecer -- esperamos de verdad en vez de
  // chequear una sola vez, para no confundir "todavía está cargando" con
  // "la sesión se venció".
  let haySesion = await page
    .getByText("Pedidos", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!haySesion) {
    // La sesión del WMS parece vencerse seguido. Si el navegador ya
    // autocompletó usuario/contraseña guardados (gestor de contraseñas del
    // navegador, no algo que este script escriba por su cuenta), alcanza
    // con apretar "Ingresar". Si no hay nada autocompletado (como pasa con
    // el Chromium propio de Playwright, que no guarda contraseñas) pero el
    // usuario configuró wmsUsuario/wmsClave en agente-config.json, se
    // tipean acá -- ver leerCredencialesWms() más arriba.
    const usuario = page.locator('input[type="text"], input:not([type])').first();
    const clave = page.locator('input[type="password"]').first();
    const hayLogin = await clave.isVisible().catch(() => false);

    if (hayLogin) {
      let usuarioLleno = ((await usuario.inputValue().catch(() => "")) || "").length > 0;
      let claveLlena = ((await clave.inputValue().catch(() => "")) || "").length > 0;

      // Si no hay nada autocompletado pero hay credenciales configuradas
      // (agente-config.json), las tipeamos acá -- es la única parte del
      // código que llega a ver la contraseña del WMS, y solo si el usuario
      // decidió guardarla explícitamente para poder correr sin Edge.
      if (!(usuarioLleno && claveLlena)) {
        const credenciales = leerCredencialesWms();
        if (credenciales) {
          await usuario.fill(credenciales.usuario);
          await clave.fill(credenciales.clave);
          usuarioLleno = true;
          claveLlena = true;
        }
      }

      if (usuarioLleno && claveLlena) {
        await page.getByText("Ingresar", { exact: true }).first().click();
        haySesion = await page
          .getByText("Pedidos", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => true)
          .catch(() => false);
      }
    }
  }

  if (!haySesion) {
    const captura = path.join(__dirname, "error-sesion.png");
    await page.screenshot({ path: captura }).catch(() => {});
    throw new Error(
      "Parece que la sesión no está activa y no se pudo reloguear solo (los campos de usuario/contraseña no estaban " +
        "autocompletados, o el login no funcionó). " +
        `Guardé una captura en ${captura} para revisar. ` +
        'Corré "node agente-local.js --login" en tu terminal para volver a iniciar sesión a mano (WMS + Tablero).'
    );
  }
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

module.exports = {
  URL_BASE,
  PERFIL_DIR,
  DESCARGAS_DIR,
  REPORTES,
  descargarUnReporte,
  chequearSesion,
  esCierreInesperado,
};

// Solo corre el CLI si el archivo se ejecuta directamente (node
// descargar-reportes.js); si otro script hace require() de este archivo (el
// Agente Local), no se dispara nada solo.
if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
