// Automatiza el circuito "Imprimir guía" + "Imprimir remito" de una guía de
// Despacho: busca la guía por número, descarga el PDF de la guía y el del
// remito (con los mismos botones "Descargar PDF" que se usan a mano -- no
// hay un endpoint que devuelva esto directo) y manda cada uno a la impresora
// predeterminada de esta PC con SumatraPDF portable (ver SUMATRA_EXE abajo).
//
// Uso:
//   node imprimir-despacho.js 105732

require("./entorno-portable.js");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const { chromium } = require("playwright");
const { conLock } = require("./lock.js");
const { URL_BASE, PERFIL_DIR, chequearSesion } = require("./descargar-reportes.js");

const IMPRESIONES_DIR = path.join(__dirname, "impresiones");
// Se crea al cargar el módulo (no solo al correr el CLI) -- agente-local.js
// llama a imprimirGuia() directo, sin pasar por main(), y una PC que nunca
// corrió este script a mano igual necesita la carpeta creada.
fs.mkdirSync(IMPRESIONES_DIR, { recursive: true });

// PowerShell está bloqueado por política de grupo en las PCs del depósito
// (y el instalador normal de SumatraPDF cae en la categoría "Freeware" del
// filtro de contenidos) -- por eso se usa la versión portable, bajada una
// sola vez a esta carpeta, en vez de -Verb Print de PowerShell.
const SUMATRA_EXE = path.join(__dirname, "sumatra", "SumatraPDF-3.6.1-64.exe");
const CONFIG_PATH = path.join(__dirname, "agente-config.json");

// Nombre de impresora configurado en agente-config.json ("impresora": "..."),
// si existe -- más robusto que -print-to-default, que depende de cuál sea la
// predeterminada de la PC en el momento (puede cambiar sin que nadie note).
function leerImpresoraConfigurada() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return config.impresora || null;
  } catch {
    return null;
  }
}

const CODIGOS_SALIDA_SUMATRA = {
  2: "no se pudo abrir el archivo (no encontrado o formato no soportado)",
  3: "el documento no permite imprimir",
  4: "la impresora (predeterminada) no existe",
  5: "falló el driver/dispositivo de la impresora",
  6: "la impresión está deshabilitada por una política de restricción",
};

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function clickMenuItem(page, texto, options) {
  await page.getByText(texto, { exact: true }).first().click(options);
}

async function clickBotonExt(page, texto, { exact = true } = {}) {
  const boton = exact
    ? page.locator("a.x-btn:visible").filter({ hasText: new RegExp(`^${escapeRegex(texto)}$`) }).first()
    : page.locator("a.x-btn:visible", { hasText: texto }).first();
  await boton.click();
}

async function esperarGridCargado(page) {
  await page.waitForTimeout(300);
  await page.locator(".x-mask").first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
}

// Después de "Descargar PDF" el WMS tapa la pantalla con su propio cartel
// ("Generando etiquetas, aguarde a ver la descarga del PDF y luego cliqueé
// este cartel") que hay que cerrar con su botón OK antes de poder seguir.
async function cerrarCartelWms(page) {
  await page
    .locator(".x-message-box:visible a.x-btn:visible", { hasText: "OK" })
    .first()
    .click({ timeout: 15000 });
}

async function descargarPdf(page, textoBotonImprimir, tituloModal, nombreArchivo, cantidadCopias) {
  await clickBotonExt(page, textoBotonImprimir);

  // Para ciertos casos (ej. "los remitos de clientes se deben imprimir
  // desde GACI") el WMS no abre el modal de impresión -- muestra un cartel
  // de confirmación en su lugar. Antes esto quedaba trabado bloqueando el
  // resto del lote; ahora se detecta apenas aparece, se cierra, y se avisa
  // como "no aplica" en vez de como error de automatización.
  const modalLoc = page.locator(".x-window:visible", { hasText: tituloModal }).first();
  const cartelLoc = page.locator(".x-message-box:visible").filter({ hasText: /gaci/i }).first();
  let apareceModal = false;
  for (let i = 0; i < 50; i++) {
    if (await modalLoc.isVisible().catch(() => false)) {
      apareceModal = true;
      break;
    }
    if (await cartelLoc.isVisible().catch(() => false)) {
      const texto = ((await cartelLoc.textContent().catch(() => "")) || "").trim();
      const cerrado = await cartelLoc
        .locator("a.x-btn:visible", { hasText: /^No$/ })
        .first()
        .click({ timeout: 5000 })
        .then(() => true)
        .catch(() => false);
      if (!cerrado) {
        await cartelLoc.locator("a.x-btn:visible", { hasText: /^Cancel$/ }).first().click({ timeout: 5000 }).catch(() => {});
      }
      await esperarGridCargado(page);
      const err = new Error(texto.replace(/\s+/g, " ").slice(0, 300) || "El WMS no permite imprimir esto desde acá.");
      err.noAplica = true;
      throw err;
    }
    await page.waitForTimeout(500);
  }

  if (!apareceModal) {
    // Diagnóstico: qué ventanas/carteles quedaron visibles cuando el modal
    // esperado nunca apareció (y tampoco era el cartel de GACI conocido).
    const info = await page.evaluate(() => ({
      ventanas: Array.from(document.querySelectorAll(".x-window"))
        .filter((w) => w.offsetParent !== null)
        .map((w) => (w.querySelector(".x-window-header-title, .x-title-text")?.textContent || "").trim()),
      mensajes: Array.from(document.querySelectorAll(".x-message-box"))
        .filter((w) => w.offsetParent !== null)
        .map((w) => (w.textContent || "").trim().slice(0, 200)),
      hayMascara: !!document.querySelector(".x-mask"),
    })).catch(() => null);
    const captura = path.join(IMPRESIONES_DIR, `diagnostico_${timestamp()}.png`);
    await page.screenshot({ path: captura }).catch(() => {});
    console.log(`  DIAGNÓSTICO (modal "${tituloModal}" no apareció): ${JSON.stringify(info)} -- captura: ${captura}`);
    throw new Error(`El modal "${tituloModal}" no apareció después de 25s.`);
  }

  // El modal trae un campo "Cantidad de impresiones" que el WMS autocompleta
  // según el tipo de despacho (CLIENTE 3, FRANQUICIA 4, PROPIO 2) -- pero
  // dentro de una misma corrida (varias guías con el mismo navegador) ese
  // campo queda "pegado" al valor de la guía anterior en vez de resetear
  // solo al default de la guía nueva. Si nos pasan el valor correcto, lo
  // fijamos a mano antes de descargar para no depender de ese default.
  if (cantidadCopias != null) {
    const campoCantidad = modalLoc.locator('input[name="cantidad"]:visible').first();
    if (await campoCantidad.count()) {
      await campoCantidad.click();
      await page.keyboard.press("Control+A");
      await page.keyboard.type(String(cantidadCopias));
      await page.keyboard.press("Tab");
    }
  }

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    clickBotonExt(page, "Descargar PDF"),
  ]);
  const destino = path.join(IMPRESIONES_DIR, nombreArchivo);
  await download.saveAs(destino);
  await cerrarCartelWms(page);
  // El WMS puede dejar la pantalla tapada con una máscara de carga después
  // de cerrar el cartel -- si el que llama pasa directo a la próxima guía
  // sin esperar a que se despeje, el click en "Despacho" de esa guía queda
  // bloqueado (visto en producción al imprimir varias guías seguidas).
  await esperarGridCargado(page);
  return destino;
}

function correrSumatra(pdfPath, impresora) {
  const argsImpresora = impresora ? ["-print-to", impresora] : ["-print-to-default"];
  return new Promise((resolve, reject) => {
    const sp = spawn(SUMATRA_EXE, [...argsImpresora, "-silent", pdfPath], { windowsHide: true });
    sp.on("error", reject);
    sp.on("exit", (code) => {
      if (code === 0) return resolve();
      const motivo = CODIGOS_SALIDA_SUMATRA[code] || `código de salida ${code} sin documentar`;
      reject(new Error(`SumatraPDF no pudo imprimir "${pdfPath}": ${motivo}.`));
    });
  });
}

// SumatraPDF sale apenas termina de MANDAR el documento a la cola de
// Windows, no cuando la impresora física termina de sacarlo. Se intentó
// esperar la cola real vía wmic filtrando por nombre de impresora, pero
// "Facturacion" es una impresora compartida con uso normal del depósito --
// casi siempre hay ALGÚN trabajo en cola (de otra guía, de otro proceso),
// así que ese chequeo esperaba 5 minutos por guía sin sentido. Se sacó: por
// ahora se confía en que SumatraPDF ya espera a que el documento esté
// completamente encolado antes de salir (documentado así), que es lo mismo
// que ya veníamos usando cuando las impresiones funcionaron bien.
async function imprimirPdf(pdfPath, impresora) {
  await correrSumatra(pdfPath, impresora);
}

// Cantidad de impresiones de la GUÍA que hay que dejar cargada en el modal
// del WMS ("Cantidad de impresiones") según el tipo de despacho -- el WMS ya
// las autocompleta así al abrir el modal a mano, pero dentro de una misma
// corrida automatizada (varias guías con el mismo navegador) el campo queda
// pegado al valor de la guía anterior en vez de resetear solo. Se fija a
// mano en descargarPdf() para no depender de ese default. El PDF descargado
// ya sale con esa cantidad de páginas/copias adentro -- no hay que repetir
// la impresión por fuera.
const CANTIDAD_IMPRESIONES_POR_TIPO = { CLIENTE: 3, FRANQUICIA: 4, PROPIO: 2 };
function cantidadImpresionesParaTipo(tipoDespacho) {
  const t = (tipoDespacho || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(CANTIDAD_IMPRESIONES_POR_TIPO, t)
    ? CANTIDAD_IMPRESIONES_POR_TIPO[t]
    : null;
}

// Una vez que la máscara de carga del WMS queda trabada, NO se despeja sola
// (se probó esperar hasta 20s, sigue tapada) -- arrastra a todas las guías
// que vengan después en el mismo lote. En vez de solo esperar, si el click
// en "Despacho" no entra en unos segundos se recarga la página del WMS
// entera (con re-login si hizo falta) para forzar un estado limpio.
async function irADespacho(page) {
  await page.locator(".x-mask").first().waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  try {
    await clickMenuItem(page, "Despacho", { timeout: 8000 });
    return;
  } catch {
    console.log("  (la pantalla del WMS quedó trabada -- recargando...)");
  }
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await chequearSesion(page);
  await clickMenuItem(page, "Despacho");
}

// onPaso(paso, resultado, mensaje?) se llama después de CADA paso (no solo
// al final) para que quien llama (agente-local.js) pueda registrar "guía
// impresa" apenas pasa, sin esperar a que el remito también termine -- si el
// remito falla después, la guía ya quedó marcada.
// Busca la guía y selecciona su fila -- se llama de nuevo antes del remito
// (no solo una vez al principio) porque el WMS parece refrescar la grilla
// después de imprimir la guía y perder la selección: el botón "Imprimir
// remito" quedaba sin efecto (nunca aparecía su modal) si no se reseleccionaba.
async function buscarYSeleccionarFila(page, numeroGuia) {
  const campoGuia = page.locator('input[placeholder="Guia"]:visible').first();
  await campoGuia.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(String(numeroGuia));

  // Si el WMS llegó a dejar un campo duplicado/oculto en el DOM (visto en
  // producción: se tipeaba en un campo que no era el visible, y la
  // búsqueda seguía mostrando resultados de la guía anterior sin ningún
  // error de Playwright), este chequeo lo detecta acá en vez de fallar
  // recién 25s después con un mensaje genérico de "el modal no apareció".
  const valorEscrito = await campoGuia.inputValue().catch(() => null);
  if (valorEscrito !== String(numeroGuia)) {
    throw new Error(
      `El campo de búsqueda de guía quedó con "${valorEscrito}" después de tipear "${numeroGuia}" -- probablemente hay más de un campo "Guia" en la pantalla.`
    );
  }

  await clickBotonExt(page, "Buscar");
  await esperarGridCargado(page);

  const filas = page.locator(".x-grid-row:visible");
  const cantidad = await filas.count();
  if (cantidad === 0) throw new Error(`No se encontró ninguna guía con número ${numeroGuia}.`);
  if (cantidad > 1) throw new Error(`Se encontraron ${cantidad} guías para el número ${numeroGuia}; revisar a mano.`);

  const textoFila = await filas.first().innerText().catch(() => "");
  const regexGuia = new RegExp(`(^|\\D)${escapeRegex(String(numeroGuia))}(\\D|$)`);
  if (textoFila && !regexGuia.test(textoFila)) {
    throw new Error(`Se buscó la guía ${numeroGuia} pero la fila encontrada no la menciona: "${textoFila.replace(/\s+/g, " ").slice(0, 200)}".`);
  }

  await filas.first().locator("td.x-selmodel-column").first().click();
}

// Los despachos tipo CLIENTE no llevan remito por este circuito -- el WMS
// lo rechaza con el cartel de GACI (ver descargarPdf). Se evita ni
// intentarlo para ese tipo en vez de depender de que el cartel aparezca.
function esTipoSinRemito(tipoDespacho) {
  return (tipoDespacho || "").trim().toUpperCase() === "CLIENTE";
}

async function imprimirGuia(page, numeroGuia, { onPaso, impresora, tipoDespacho } = {}) {
  const impresoraConfigurada = impresora !== undefined ? impresora : leerImpresoraConfigurada();

  await irADespacho(page);
  await page.waitForTimeout(800);
  await buscarYSeleccionarFila(page, numeroGuia);

  console.log(`> Descargando guía ${numeroGuia}...`);
  const cantidadImpresiones = cantidadImpresionesParaTipo(tipoDespacho);
  const guiaPdf = await descargarPdf(
    page,
    "Imprimir guia",
    "Imprimir guias",
    `guia_${numeroGuia}_${timestamp()}.pdf`,
    cantidadImpresiones
  );
  console.log(`  -> ${guiaPdf}`);
  console.log(
    `  Enviando guía a la impresora predeterminada${cantidadImpresiones ? ` (${cantidadImpresiones} impresiones, tipo ${tipoDespacho})` : ""}...`
  );
  await imprimirPdf(guiaPdf, impresoraConfigurada);
  await onPaso?.("guia", "ok");

  if (esTipoSinRemito(tipoDespacho)) {
    console.log(`  (tipo ${tipoDespacho}: no lleva remito por acá, se imprime desde GACI -- salteado)`);
    await onPaso?.("remito", "ok", "No aplica: tipo CLIENTE, el remito se imprime desde GACI.");
    console.log(`\nListo: guía de ${numeroGuia} enviada a imprimir (sin remito, tipo CLIENTE).`);
    return;
  }

  // Reseleccionar antes del remito (ver nota en buscarYSeleccionarFila).
  await buscarYSeleccionarFila(page, numeroGuia);

  console.log(`> Descargando remito de la guía ${numeroGuia}...`);
  const remitoPdf = await descargarPdf(page, "Imprimir remito", "Imprimir remitos", `remito_${numeroGuia}_${timestamp()}.pdf`);
  console.log(`  -> ${remitoPdf}`);
  console.log("  Enviando remito a la impresora predeterminada...");
  await imprimirPdf(remitoPdf, impresoraConfigurada);
  await onPaso?.("remito", "ok");

  console.log(`\nListo: remito y guía de ${numeroGuia} enviados a imprimir.`);
}

async function main() {
  const numeroGuia = process.argv[2];
  if (!numeroGuia) {
    console.error("Uso: node imprimir-despacho.js <numero_de_guia>");
    process.exit(1);
  }

  await conLock(async () => {
    const context = await chromium.launchPersistentContext(PERFIL_DIR, {
      headless: true,
      acceptDownloads: true,
    });
    const page = context.pages()[0] || (await context.newPage());
    try {
      await page.goto(URL_BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await chequearSesion(page);
      await imprimirGuia(page, numeroGuia);
    } finally {
      await context.close().catch(() => {});
    }
  });
}

module.exports = { imprimirGuia, IMPRESIONES_DIR };

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
