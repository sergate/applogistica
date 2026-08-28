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
// PowerShell está bloqueado por política de grupo en las PCs del depósito
// (y el instalador normal de SumatraPDF cae en la categoría "Freeware" del
// filtro de contenidos) -- por eso se usa la versión portable, bajada una
// sola vez a esta carpeta, en vez de -Verb Print de PowerShell.
const SUMATRA_EXE = path.join(__dirname, "sumatra", "SumatraPDF-3.6.1-64.exe");

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
  await page.locator(".x-mask").first().waitFor({ state: "hidden", timeout: 15000 }).catch(() => {});
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
  await page.locator(".x-window:visible", { hasText: tituloModal }).first().waitFor({ state: "visible", timeout: 15000 });

  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60000 }),
    clickBotonExt(page, "Descargar PDF"),
  ]);
  const destino = path.join(IMPRESIONES_DIR, nombreArchivo);
  await download.saveAs(destino);
  await cerrarCartelWms(page);
  return destino;
}

function imprimirPdf(pdfPath) {
  // SumatraPDF imprime y sale de inmediato (sin abrir ventana visible gracias
  // a -silent) -- el código de salida ya indica si la impresión funcionó, no
  // hace falta ninguna espera fija después.
  return new Promise((resolve, reject) => {
    const sp = spawn(SUMATRA_EXE, ["-print-to-default", "-silent", pdfPath], { windowsHide: true });
    sp.on("error", reject);
    sp.on("exit", (code) => {
      if (code === 0) return resolve();
      const motivo = CODIGOS_SALIDA_SUMATRA[code] || `código de salida ${code} sin documentar`;
      reject(new Error(`SumatraPDF no pudo imprimir "${pdfPath}": ${motivo}.`));
    });
  });
}

async function imprimirGuia(page, numeroGuia) {
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
  await imprimirPdf(guiaPdf);

  console.log(`> Descargando remito de la guía ${numeroGuia}...`);
  const remitoPdf = await descargarPdf(page, "Imprimir remito", "Imprimir remitos", `remito_${numeroGuia}_${timestamp()}.pdf`);
  console.log(`  -> ${remitoPdf}`);
  console.log("  Enviando remito a la impresora predeterminada...");
  await imprimirPdf(remitoPdf);

  console.log(`\nListo: remito y guía de ${numeroGuia} enviados a imprimir.`);
}

async function main() {
  const numeroGuia = process.argv[2];
  if (!numeroGuia) {
    console.error("Uso: node imprimir-despacho.js <numero_de_guia>");
    process.exit(1);
  }

  fs.mkdirSync(IMPRESIONES_DIR, { recursive: true });

  await conLock(async () => {
    const context = await chromium.launchPersistentContext(PERFIL_DIR, {
      channel: "msedge",
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

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
