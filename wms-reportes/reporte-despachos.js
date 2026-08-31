// Detalle masivo de "Despacho" (contenedor/remito/unidades por guía).
//
// La pantalla del WMS solo deja ver el detalle de UNA guía a la vez (botón
// "Detalle" -> modal). Este script en cambio pega directo a los dos
// endpoints JSON que usa esa pantalla (find_by_cab para listar las guías del
// rango de fechas, find_by_det para el detalle de cada una) y junta todo en
// un solo CSV.
//
// Uso:
//   node reporte-despachos.js                        -> guías de hoy
//   node reporte-despachos.js 2026-08-27              -> desde esa fecha
//   node reporte-despachos.js 2026-08-25 2026-08-28   -> rango de fechas

const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { conLock } = require("./lock.js");
const { URL_BASE, PERFIL_DIR, DESCARGAS_DIR, chequearSesion } = require("./descargar-reportes.js");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function hoyISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function listarDespachos(page, fechaDesde, fechaHasta) {
  const url =
    `${URL_BASE}despacho/find_by_cab?_dc=${Date.now()}` +
    `&fecha_dd=${fechaDesde}&fecha_hh=${fechaHasta}` +
    `&estadoId=&caja=&numero_guia=&remito=&cliente_id=&page=1&start=0&limit=5000`;
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`find_by_cab: HTTP ${r.status}`);
    return r.json();
  }, url);
}

async function detalleDespacho(page, despachoId) {
  const url = `${URL_BASE}despacho/${despachoId}/find_by_det?_dc=${Date.now()}&page=1&start=0&limit=1000`;
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`find_by_det: HTTP ${r.status}`);
    return r.json();
  }, url);
}

function csvEscape(valor) {
  const s = valor === null || valor === undefined ? "" : String(valor);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function aCsv(filas, columnas) {
  const encabezado = columnas.join(",");
  const lineas = filas.map((fila) => columnas.map((c) => csvEscape(fila[c])).join(","));
  return [encabezado, ...lineas].join("\n");
}

const COLUMNAS = [
  "despacho_id",
  "guia",
  "fecha_creacion",
  "estado",
  "tipo",
  "cliente",
  "transporte",
  "caja",
  "remito",
  "cantidad",
];

async function generarFilas(page, fechaDesde, fechaHasta) {
  console.log(`Buscando despachos entre ${fechaDesde} y ${fechaHasta || fechaDesde}...`);
  const cabeceras = await listarDespachos(page, fechaDesde, fechaHasta);
  console.log(`  ${cabeceras.length} guías encontradas. Bajando el detalle de cada una...`);

  const filas = [];
  for (let i = 0; i < cabeceras.length; i++) {
    const cab = cabeceras[i];
    process.stdout.write(`  [${i + 1}/${cabeceras.length}] guía ${cab.guia}...\r`);
    const detalles = await detalleDespacho(page, cab.despacho_cab_id);
    for (const det of detalles) {
      filas.push({
        despacho_id: cab.despacho_cab_id,
        guia: cab.guia,
        fecha_creacion: cab.fecha_creacion,
        estado: cab.estado_nombre,
        tipo: cab.tipo,
        cliente: (cab.cliente_nombre || "").trim(),
        transporte: (cab.transporte_nombre || "").trim(),
        caja: det.caja,
        remito: det.remito,
        cantidad: det.cantidad,
      });
    }
  }
  console.log(`\n  ${filas.length} filas de detalle en total.`);
  return filas;
}

async function main() {
  const [fechaDesdeArg, fechaHastaArg] = process.argv.slice(2);
  const fechaDesde = fechaDesdeArg || hoyISO();
  const fechaHasta = fechaHastaArg || "";

  fs.mkdirSync(DESCARGAS_DIR, { recursive: true });

  await conLock(async () => {
    const context = await chromium.launchPersistentContext(PERFIL_DIR, {
      // Mismo perfil que descargar-reportes.js -- reutiliza la sesión ya
      // logueada, no pide credenciales de nuevo.
      headless: true,
    });
    const page = context.pages()[0] || (await context.newPage());
    try {
      await page.goto(URL_BASE, { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);
      await chequearSesion(page);

      const filas = await generarFilas(page, fechaDesde, fechaHasta);
      const csv = aCsv(filas, COLUMNAS);
      const destino = path.join(DESCARGAS_DIR, `despachos_detalle_${timestamp()}.csv`);
      // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos.
      fs.writeFileSync(destino, "﻿" + csv, "utf8");
      console.log(`\nListo: ${destino}`);
    } finally {
      await context.close().catch(() => {});
    }
  });
}

module.exports = { listarDespachos, detalleDespacho, URL_BASE, hoyISO };

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
