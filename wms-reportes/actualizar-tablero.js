// Sube los reportes ya descargados (ver descargar-reportes.js) al Tablero
// Logístico (https://applogistica-alpha.vercel.app/), sección por sección,
// usando el manifiesto que genera esa descarga (descargas/manifiesto.json).
//
// IMPORTANTE: esto ESCRIBE datos reales en Supabase (cada import reemplaza
// información existente). Antes de correrlo sin mirar, probá una sección a
// la vez y confirmá en el tablero que los KPIs quedaron bien.
//
// Primer uso: con LOGIN_MANUAL=1 para iniciar sesión a mano una vez (igual
// que en descargar-reportes.js).
//
// Uso normal:
//   node actualizar-tablero.js                        -> las 4 secciones
//   node actualizar-tablero.js no_ecom ecom            -> solo esas

require("./entorno-portable.js");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { conLock } = require("./lock.js");

// TABLERO_URL permite apuntar a un deploy preview (ej. de la rama test) en
// vez de al de producción, sin tocar el código -- útil para probar cambios
// antes de que lleguen a producción.
const URL_BASE = process.env.TABLERO_URL || "https://applogistica-alpha.vercel.app/";
const PERFIL_DIR = path.join(__dirname, "perfil-chrome-tablero");
const DESCARGAS_DIR = path.join(__dirname, "descargas");
const MANIFIESTO_PATH = path.join(DESCARGAS_DIR, "manifiesto.json");

function leerManifiesto() {
  if (!fs.existsSync(MANIFIESTO_PATH)) {
    throw new Error(
      `No encontré ${MANIFIESTO_PATH}. Corré primero descargar-reportes.js (o descargar-reportes.bat) para generarlo.`
    );
  }
  const data = JSON.parse(fs.readFileSync(MANIFIESTO_PATH, "utf8"));
  return data.reportes || {};
}

function primerArchivo(reportes, id) {
  const arr = reportes[id];
  if (!arr || arr.length === 0) {
    throw new Error(`El manifiesto no tiene ningún archivo para "${id}". Volvé a correr descargar-reportes.js ${id}.`);
  }
  return arr[0];
}

async function abrirMenu(page, ...textos) {
  // El estado de qué acordeón del menú queda abierto se guarda en
  // sessionStorage entre reloads (para volver a la sección que se acaba de
  // importar) -- lo limpiamos en cada goto (ver context.addInitScript en
  // main), así "Status de preparación" y "No Ecom" SIEMPRE arrancan ya
  // abiertos por defecto y el resto SIEMPRE cerrado. Por eso: solo clickeamos
  // un toggle si su hijo todavía no está visible (si ya está abierto por
  // defecto, clickearlo de nuevo lo cerraría).
  for (let i = 0; i < textos.length - 1; i++) {
    const siguiente = textos[i + 1];
    const yaVisible = await page
      .getByRole("button", { name: siguiente, exact: true })
      .first()
      .isVisible()
      .catch(() => false);
    if (!yaVisible) {
      await page.getByRole("button", { name: textos[i], exact: true }).click();
      await page.waitForTimeout(400);
    }
  }
  await page
    .getByRole("button", { name: textos[textos.length - 1], exact: true })
    .first()
    .click();
  await page.waitForTimeout(300);
}

// Espera a que aparezca el resultado del import (éxito o error) leyendo el
// texto de la página entera -- la app renderiza "... filas cargadas
// correctamente" en verde, o un cartel rojo con el error.
async function esperarResultadoImport(page, timeout = 180000) {
  // OJO: la firma es waitForFunction(pageFunction, arg, options) -- el
  // segundo parámetro es el argumento que recibe la función, no las
  // opciones. Hay que pasar explícitamente "undefined" en el medio para que
  // el timeout se aplique de verdad (si no, usa el default de 30s).
  await page.waitForFunction(
    () => {
      const texto = document.body.innerText;
      return /cargadas correctamente/.test(texto) || /rror al procesar|rror inesperado|no tiene filas de datos/.test(texto);
    },
    undefined,
    { timeout }
  );
  const textoCompleto = await page.evaluate(() => document.body.innerText);
  const exito = /cargadas correctamente/.test(textoCompleto);
  return { exito, textoCompleto };
}

// Igual que esperarResultadoImport, pero con el texto de éxito propio de
// esta pantalla ("... actualizadas correctamente") y un timeout más largo:
// el archivo es grande (100+ MB) y se procesa entero en el navegador
// (leer + pivotear) antes de subir, lo que puede tardar varios minutos.
async function esperarResultadoOcupacion(page, timeout = 600000) {
  await page.waitForFunction(
    () => {
      const texto = document.body.innerText;
      return /actualizadas correctamente/.test(texto) || /rror al procesar|rror inesperado|No se encontraron posiciones/.test(texto);
    },
    undefined,
    { timeout }
  );
  const textoCompleto = await page.evaluate(() => document.body.innerText);
  const exito = /actualizadas correctamente/.test(textoCompleto);
  return { exito, textoCompleto };
}

async function chequearSesion(page) {
  let haySesion = await page
    .getByText("Status de preparación", { exact: true })
    .first()
    .waitFor({ state: "visible", timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!haySesion) {
    // Igual que en descargar-reportes.js: si Edge ya autocompletó el
    // login guardado, alcanza con apretar "Ingresar" -- nunca leemos ni
    // tipeamos la contraseña acá.
    const email = page.locator('input[type="email"]').first();
    const clave = page.locator('input[type="password"]').first();
    const hayLogin = await clave.isVisible().catch(() => false);

    if (hayLogin) {
      const emailLleno = ((await email.inputValue().catch(() => "")) || "").length > 0;
      const claveLlena = ((await clave.inputValue().catch(() => "")) || "").length > 0;

      if (emailLleno && claveLlena) {
        await page.getByRole("button", { name: "Ingresar", exact: true }).click();
        haySesion = await page
          .getByText("Status de preparación", { exact: true })
          .first()
          .waitFor({ state: "visible", timeout: 15000 })
          .then(() => true)
          .catch(() => false);
      }
    }
  }

  if (!haySesion) {
    const captura = path.join(__dirname, "error-sesion-tablero.png");
    await page.screenshot({ path: captura }).catch(() => {});
    throw new Error(
      "Parece que la sesión del tablero no está activa y no se pudo reloguear solo. " +
        `Guardé una captura en ${captura}. ` +
        'Corré "node agente-local.js --login" en tu terminal para volver a iniciar sesión a mano (WMS + Tablero).'
    );
  }
}

async function irYLoguear(page) {
  await page.goto(URL_BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await chequearSesion(page);
}

// --- NO ECOM: Grupos + Tiendas juntos ---
async function subirNoEcom(page, reportes) {
  console.log("> no_ecom (Status de preparación - NO ECOM)");
  const archivoGrupo = primerArchivo(reportes, "grupo");
  const archivoTienda = primerArchivo(reportes, "tienda");

  await irYLoguear(page);
  // El texto real en el DOM es "No Ecom" -- el CSS lo muestra en mayúsculas
  // ("NO ECOM") con text-transform, pero eso no cambia el contenido real.
  await abrirMenu(page, "Status de preparación", "No Ecom", "Importar datos");

  const inputs = page.locator('input[type=file]');
  // Orden en la pantalla: Clientes (opcional, no se toca), Grupos, Tiendas.
  await inputs.nth(1).setInputFiles(archivoGrupo);
  await inputs.nth(2).setInputFiles(archivoTienda);

  await page.getByRole("button", { name: "Procesar datos", exact: true }).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.textoCompleto.match(/.{0,20}cargadas correctamente\.?/g)?.join(" | ") || r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando NO ECOM. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- ECOM: listado_ecom ---
async function subirEcom(page, reportes) {
  console.log("> ecom (Status de preparación - ECOM)");
  const archivo = primerArchivo(reportes, "listado_ecom");

  await irYLoguear(page);
  await abrirMenu(page, "Status de preparación", "Ecom", "Importar Datos");

  await page.locator('input[type=file]').first().setInputFiles(archivo);
  await page.getByRole("button", { name: "Procesar datos", exact: true }).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando ECOM. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- Carga Inicial: ci_chk + ci_awa + ci_cqq juntos ---
async function subirCargaInicial(page, reportes) {
  console.log("> carga_inicial (Status carga inicial)");
  const archivos = [
    primerArchivo(reportes, "ci_chk"),
    primerArchivo(reportes, "ci_awa"),
    primerArchivo(reportes, "ci_cqq"),
  ];

  await irYLoguear(page);
  await abrirMenu(page, "Status carga inicial", "Importar Datos");

  await page.locator('input[type=file]').first().setInputFiles(archivos);
  await page.getByRole("button", { name: "Procesar", exact: true }).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando Carga Inicial. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- Remanentes: todos los ci_rema juntos ---
async function subirRemanentes(page, reportes) {
  console.log("> remanentes (Status remanentes)");
  const archivos = reportes.ci_rema;
  if (!archivos || archivos.length === 0) {
    throw new Error('El manifiesto no tiene archivos de "ci_rema". Volvé a correr descargar-reportes.js ci_rema.');
  }

  await irYLoguear(page);
  await abrirMenu(page, "Status remanentes", "Importar Datos");

  await page.locator('input[type=file]').first().setInputFiles(archivos);
  await page.getByRole("button", { name: "Procesar", exact: true }).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando Remanentes. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- Pendiente de Despacho - Clientes: bandeja_comercial ---
async function subirPDClientes(page, reportes) {
  console.log("> pd_clientes (Pendiente de Despacho - Importar Datos - Clientes)");
  const archivo = primerArchivo(reportes, "bandeja_comercial");

  await irYLoguear(page);
  await abrirMenu(page, "Pendiente de Despacho", "Importar Datos");

  // La pantalla tiene dos formularios (Clientes arriba, Propios abajo), cada
  // uno con su propio input de archivo y botón "Procesar" -- el de Clientes
  // es el primero de cada uno.
  await page.locator("input[type=file]").nth(0).setInputFiles(archivo);
  await page.getByRole("button", { name: "Procesar", exact: true }).nth(0).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando Pendiente de Despacho - Clientes. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- Pendiente de Despacho - Propios: pre_despacho ---
async function subirPDPropios(page, reportes) {
  console.log("> pd_propios (Pendiente de Despacho - Importar Datos - Propios)");
  const archivo = primerArchivo(reportes, "pre_despacho");

  await irYLoguear(page);
  await abrirMenu(page, "Pendiente de Despacho", "Importar Datos");

  await page.locator("input[type=file]").nth(1).setInputFiles(archivo);
  await page.getByRole("button", { name: "Procesar", exact: true }).nth(1).click();
  const r = await esperarResultadoImport(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando Pendiente de Despacho - Propios. Detalle: ${r.textoCompleto.slice(-500)}`);
}

// --- Ocupación Almacén: Existencia por ubicación (Excel Contenedor) ---
async function subirOcupacionAlmacen(page, reportes) {
  console.log("> ocupacion_almacen (Ocupación Almacén - Importar Datos - Importar Ocupación)");
  const archivo = primerArchivo(reportes, "ocupacion_almacen");

  await irYLoguear(page);
  await abrirMenu(page, "Ocupación Almacén", "Importar Datos");

  // "Importar Layout del Almacén" (opcional, no se toca) puede estar arriba
  // de "Importar Ocupación" -- el input de archivo de Importar Ocupación es
  // siempre el último de la pantalla.
  const inputs = page.locator("input[type=file]");
  await inputs.last().setInputFiles(archivo);
  await page.getByRole("button", { name: "Procesar archivo", exact: true }).click();

  const r = await esperarResultadoOcupacion(page);
  console.log(`  -> ${r.exito ? "OK" : "ERROR"}: ${r.textoCompleto.slice(-200)}`);
  if (!r.exito) throw new Error(`Fallo importando Ocupación Almacén. Detalle: ${r.textoCompleto.slice(-500)}`);
}

const SECCIONES = {
  no_ecom: subirNoEcom,
  ecom: subirEcom,
  carga_inicial: subirCargaInicial,
  remanentes: subirRemanentes,
  pd_clientes: subirPDClientes,
  pd_propios: subirPDPropios,
  ocupacion_almacen: subirOcupacionAlmacen,
};

// Corre UNA sección por su id sobre un browser ya abierto (usa el manifiesto
// pasado como parámetro en vez de leerlo de disco -- así el Agente Local
// puede pasarle el manifiesto recién generado por descargar-reportes sin
// pasar por el archivo). La usa tanto el CLI (main, abajo) como
// agente-local.js.
async function subirUnaSeccion(page, id, reportes) {
  if (!SECCIONES[id]) {
    throw new Error(`Sección desconocida: "${id}". Válidas: ${Object.keys(SECCIONES).join(", ")}`);
  }
  await SECCIONES[id](page, reportes);
}

async function main() {
  const idsPedidos = process.argv.slice(2);
  const idsACorrer = idsPedidos.length > 0 ? idsPedidos : Object.keys(SECCIONES);

  for (const id of idsACorrer) {
    if (!SECCIONES[id]) {
      console.error(`Sección desconocida: "${id}". Válidas: ${Object.keys(SECCIONES).join(", ")}`);
      process.exit(1);
    }
  }

  const reportes = leerManifiesto();

  await conLock(() => correrSubidas(idsACorrer, reportes));
}

// Todo lo que necesita el navegador abierto -- separado de main() para que
// pueda correr adentro de conLock() sin competir con otra corrida (el .bat
// manual, u otro pedido que la Tarea Programada del Agente esté atendiendo
// en simultáneo) por el mismo perfil de Chrome.
function esCierreInesperado(err) {
  return /has been closed|Target closed|Target page/i.test(String(err?.message || err));
}

async function correrSubidas(idsACorrer, reportes) {
  const loginManual = process.env.LOGIN_MANUAL === "1";

  async function abrirNavegador() {
    const context = await chromium.launchPersistentContext(PERFIL_DIR, {
      // Ver nota en descargar-reportes.js: Chromium propio de Playwright,
      // no el navegador del sistema.
      headless: !loginManual,
      acceptDownloads: false,
    });
    // La app guarda en sessionStorage qué sección quedó abierta tras el
    // último import (para volver ahí después del reload). Lo limpiamos ANTES
    // de que cargue cualquier página, así el menú arranca siempre en el
    // mismo estado conocido (Status de preparación + No Ecom abiertos, el
    // resto cerrado) y nunca quedan dos secciones abiertas a la vez por una
    // corrida anterior.
    await context.addInitScript(() => window.sessionStorage.clear());
    const page = context.pages()[0] || (await context.newPage());
    return { context, page };
  }

  let { context, page } = await abrirNavegador();

  try {
    if (loginManual) {
      await page.goto(URL_BASE);
      console.log("Iniciá sesión manualmente en la ventana de Edge que se abrió.");
      console.log("Cuando veas el tablero cargado, volvé acá y presioná Enter...");
      await esperarEnter();
    }

    for (const id of idsACorrer) {
      // Igual que en descargar-reportes.js: por las dudas, si el navegador
      // se cierra solo a mitad de camino, reabrimos y reintentamos esa
      // sección una sola vez antes de darnos por vencidos.
      let reintentado = false;
      for (;;) {
        try {
          await SECCIONES[id](page, reportes);
          break;
        } catch (err) {
          if (esCierreInesperado(err) && !reintentado) {
            reintentado = true;
            console.log(`  (el navegador se cerró inesperadamente -- reabriendo y reintentando "${id}"...)`);
            await context.close().catch(() => {});
            ({ context, page } = await abrirNavegador());
            continue;
          }
          const captura = path.join(__dirname, `error-${id}.png`);
          await page.screenshot({ path: captura, fullPage: true }).catch(() => {});
          console.error(`Guardé una captura del momento del error en: ${captura}`);
          throw err;
        }
      }
    }

    console.log("\nListo. Tablero actualizado.");
  } finally {
    await context.close().catch(() => {});
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
  SECCIONES,
  subirUnaSeccion,
  chequearSesion,
  leerManifiesto,
};

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
