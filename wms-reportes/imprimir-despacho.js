// Automatiza el circuito "Imprimir guía" + "Imprimir remito" de una guía de
// Despacho: busca la guía por número, descarga el PDF de la guía y el del
// remito (con los mismos botones "Descargar PDF" que se usan a mano -- no
// hay un endpoint que devuelva esto directo) y manda cada uno a la impresora
// predeterminada de esta PC con SumatraPDF portable (ver SUMATRA_EXE abajo).
//
// Uso:
//   node imprimir-despacho.js 105732

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

async function clickMenuItem(page, texto) {
  await page.getByText(texto, { exact: true }).first().click();
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

async function descargarPdf(page, textoBotonImprimir, tituloModal, nombreArchivo) {
  await clickBotonExt(page, textoBotonImprimir);
  await page.locator(".x-window:visible", { hasText: tituloModal }).first().waitFor({ state: "visible", timeout: 25000 });

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

// onPaso(paso, resultado, mensaje?) se llama después de CADA paso (no solo
// al final) para que quien llama (agente-local.js) pueda registrar "guía
// impresa" apenas pasa, sin esperar a que el remito también termine -- si el
// remito falla después, la guía ya quedó marcada.
async function imprimirGuia(page, numeroGuia, { onPaso, impresora } = {}) {
  const impresoraConfigurada = impresora !== undefined ? impresora : leerImpresoraConfigurada();

  // Defensivo: si la guía anterior del lote quedó a mitad de camino (falló
  // con una máscara de carga todavía tapando la pantalla), esperar a que se
  // despeje antes de intentar clickear "Despacho" de nuevo.
  await page.locator(".x-mask").first().waitFor({ state: "hidden", timeout: 20000 }).catch(() => {});
  await clickMenuItem(page, "Despacho");
  await page.waitForTimeout(800);

  const campoGuia = page.locator('input[placeholder="Guia"]').first();
  await campoGuia.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type(String(numeroGuia));

  await clickBotonExt(page, "Buscar");
  await esperarGridCargado(page);

  const filas = page.locator(".x-grid-row:visible");
  const cantidad = await filas.count();
  if (cantidad === 0) throw new Error(`No se encontró ninguna guía con número ${numeroGuia}.`);
  if (cantidad > 1) throw new Error(`Se encontraron ${cantidad} guías para el número ${numeroGuia}; revisar a mano.`);

  await filas.first().locator("td.x-selmodel-column").first().click();

  console.log(`> Descargando guía ${numeroGuia}...`);
  const guiaPdf = await descargarPdf(page, "Imprimir guia", "Imprimir guias", `guia_${numeroGuia}_${timestamp()}.pdf`);
  console.log(`  -> ${guiaPdf}`);
  console.log("  Enviando guía a la impresora predeterminada...");
  await imprimirPdf(guiaPdf, impresoraConfigurada);
  await onPaso?.("guia", "ok");

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
