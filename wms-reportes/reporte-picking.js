// Descarga masiva de "Picking" (pantalla WMS: Pedidos -> Picking).
//
// Esa pantalla solo deja ver, plan por plan, el botón "Detalle" (pedido
// incluido, SKUs, unidades a pickear vs. pickeadas, ubicación, etc). Este
// script pega directo a los dos endpoints JSON que usa esa pantalla
// (picking/find_by para listar los planes del rango de fechas,
// picking/{id}/find_detalle para el detalle de cada uno) y arma DOS CSV:
// uno con la vista de búsqueda (un plan por fila) y otro con el detalle
// completo de todos los planes (un SKU/paquete por fila).
//
// Uso:
//   node reporte-picking.js                        -> planes de hoy
//   node reporte-picking.js 2026-08-27              -> desde esa fecha
//   node reporte-picking.js 2026-08-25 2026-08-28   -> rango de fechas
//   node reporte-picking.js --excluir=meli,intra    -> saltea esos planes
//   node reporte-picking.js --solo-agrupados         -> solo planes con agrupación
//     (los flags se pueden combinar entre sí y con las fechas, en cualquier orden)

require("./entorno-portable.js");
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

async function listarPlanesPicking(page, fechaDesde, fechaHasta) {
  const url =
    `${URL_BASE}picking/find_by?_dc=${Date.now()}` +
    `&fecha_dd=${fechaDesde}&fecha_hh=${fechaHasta}` +
    `&finishing=false&estadoId=&pedido=&page=1&start=0&limit=5000`;
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`picking/find_by: HTTP ${r.status}`);
    return r.json();
  }, url);
}

async function detallePlanPicking(page, pickingId) {
  const url = `${URL_BASE}picking/${pickingId}/find_detalle?_dc=${Date.now()}&page=1&start=0&limit=1000`;
  return page.evaluate(async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`find_detalle: HTTP ${r.status}`);
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

const COLUMNAS_BUSQUEDA = [
  "picking_id",
  "nombre",
  "tipo",
  "tipo_orden",
  "fecha",
  "estado",
  "usuario",
  "usuario_asignado",
  "usuario_finish_asignado",
  "paquetes",
  "unidades_requeridas",
  "unidades_pickeadas",
  "unidades_separadas",
  "numero_carro",
  "agrupacion_nombre",
  "finishing",
];

const COLUMNAS_DETALLE = [
  "picking_id",
  "picking_nombre",
  "nro_pedido",
  "nombre_pedido",
  "codigo_sku",
  "descripcion_sku",
  "seller",
  "unidades_requeridas",
  "unidades_pickeadas",
  "unidades_separadas",
  "codigo_ubicacion",
  "piso",
  "nro_pallet",
  "tracking_number_colecta",
  "tracking_number_colecta_pedido",
  "paquete_estado",
  "paquete_fecha",
  "paquete_usuario",
  "sin_stock",
];

// Filtra por nombre de plan (ej. "116842-MELI/FLEX", "116841-INTRA 3/9") --
// no hay un campo estructurado que distinga estos tipos, el WMS los separa
// solo por convención de nombre.
function excluirPorNombre(planes, terminos) {
  if (!terminos.length) return planes;
  const excluidos = planes.filter((p) => terminos.some((t) => (p.nombre || "").toUpperCase().includes(t)));
  console.log(`  Excluyendo ${excluidos.length} planes por nombre (${terminos.join(", ")}).`);
  return planes.filter((p) => !terminos.some((t) => (p.nombre || "").toUpperCase().includes(t)));
}

// Se queda solo con los planes que tienen una agrupación cargada
// (agrupacionId / agrupacion_nombre) -- en la mayoría de los planes viene
// null, así que esto recorta bastante el volumen antes de bajar detalle.
function soloAgrupados(planes) {
  const descartados = planes.filter((p) => !p.agrupacionId && !p.agrupacion_nombre);
  console.log(`  Descartando ${descartados.length} planes sin agrupación.`);
  return planes.filter((p) => p.agrupacionId || p.agrupacion_nombre);
}

async function generarFilas(page, fechaDesde, fechaHasta, excluirTerminos = [], filtrarAgrupados = false) {
  console.log(`Buscando planes de picking entre ${fechaDesde} y ${fechaHasta || fechaDesde}...`);
  const planesSinFiltrar = await listarPlanesPicking(page, fechaDesde, fechaHasta);
  console.log(`  ${planesSinFiltrar.length} planes encontrados.`);
  let planes = excluirPorNombre(planesSinFiltrar, excluirTerminos);
  if (filtrarAgrupados) planes = soloAgrupados(planes);
  console.log(`  Bajando el detalle de ${planes.length}...`);

  const filasBusqueda = planes.map((p) => ({
    picking_id: p.pickingId,
    nombre: p.nombre,
    tipo: p.tipo,
    tipo_orden: p.tipo_orden,
    fecha: p.fecha,
    estado: p.estado,
    usuario: p.usuario,
    usuario_asignado: p.usuario_asignado,
    usuario_finish_asignado: p.usuario_finish_asignado,
    paquetes: p.paquetes,
    unidades_requeridas: p.unidades_requeridas,
    unidades_pickeadas: p.unidades_pickeadas,
    unidades_separadas: p.unidades_separadas,
    numero_carro: p.numero_carro,
    agrupacion_nombre: p.agrupacion_nombre,
    finishing: p.finishing,
  }));

  const filasDetalle = [];
  for (let i = 0; i < planes.length; i++) {
    const plan = planes[i];
    process.stdout.write(`  [${i + 1}/${planes.length}] plan ${plan.nombre}...\r`);
    const detalles = await detallePlanPicking(page, plan.pickingId);
    for (const det of detalles) {
      filasDetalle.push({
        picking_id: plan.pickingId,
        picking_nombre: plan.nombre,
        nro_pedido: det.nro_pedido,
        nombre_pedido: det.nombre_pedido,
        codigo_sku: det.codigo_sku,
        descripcion_sku: det.descripcion_sku,
        seller: det.seller,
        unidades_requeridas: det.unidadesRequeridas,
        unidades_pickeadas: det.unidadesPickeadas,
        unidades_separadas: det.unidadesSeparadas,
        codigo_ubicacion: det.codigo_ubicacion,
        piso: det.piso,
        nro_pallet: det.nro_pallet,
        tracking_number_colecta: det.tracking_number_colecta,
        tracking_number_colecta_pedido: det.tracking_number_colecta_pedido,
        paquete_estado: det.paqueteEstado,
        paquete_fecha: det.paqueteFecha,
        paquete_usuario: det.paqueteUsuario,
        sin_stock: det.sin_stock,
      });
    }
  }
  console.log(`\n  ${filasDetalle.length} filas de detalle en total.`);
  return { filasBusqueda, filasDetalle };
}

async function main() {
  const argsCli = process.argv.slice(2);
  const argExcluir = argsCli.find((a) => a.startsWith("--excluir="));
  const excluirTerminos = argExcluir
    ? argExcluir
        .slice("--excluir=".length)
        .split(",")
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean)
    : [];
  const soloAgrupadosFlag = argsCli.includes("--solo-agrupados");
  const [fechaDesdeArg, fechaHastaArg] = argsCli.filter((a) => !a.startsWith("--"));
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

      const { filasBusqueda, filasDetalle } = await generarFilas(
        page,
        fechaDesde,
        fechaHasta,
        excluirTerminos,
        soloAgrupadosFlag
      );

      const marca = timestamp();
      const destinoBusqueda = path.join(DESCARGAS_DIR, `picking_busqueda_${marca}.csv`);
      const destinoDetalle = path.join(DESCARGAS_DIR, `picking_detalle_${marca}.csv`);
      // BOM al inicio para que Excel detecte UTF-8 y no rompa los acentos.
      fs.writeFileSync(destinoBusqueda, "﻿" + aCsv(filasBusqueda, COLUMNAS_BUSQUEDA), "utf8");
      fs.writeFileSync(destinoDetalle, "﻿" + aCsv(filasDetalle, COLUMNAS_DETALLE), "utf8");
      console.log(`\nListo:\n  ${destinoBusqueda}\n  ${destinoDetalle}`);
    } finally {
      await context.close().catch(() => {});
    }
  });
}

module.exports = { listarPlanesPicking, detallePlanPicking, URL_BASE, hoyISO };

if (require.main === module) {
  main().catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
}
