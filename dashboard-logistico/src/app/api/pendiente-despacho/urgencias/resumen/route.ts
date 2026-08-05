import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAllPendienteDespacho,
  fetchAllPendienteDespachoPropios,
  parseCodigoCliente,
  PendienteDespachoRow,
  PendienteDespachoPropiosRow,
} from "@/lib/pendienteDespachoHelpers";
import { fetchClientesInfo } from "@/lib/resumenHelpers";
import { fetchPosicionesPorContenedor } from "@/lib/almacenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const vacio = (v: string | null): boolean => !v || v.trim() === "";

interface UrgenciaContenedorRow {
  contenedor: string;
  nota: string | null;
  created_at: string;
}

// Supabase pagina de a 1000 filas por default -> traemos todo en tandas
// (si se carga más de 1000 contenedores, un .select() sin .range() los corta
// en silencio y los más viejos dejan de aparecer).
async function fetchTodosLosContenedores(): Promise<UrgenciaContenedorRow[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const all: UrgenciaContenedorRow[] = [];

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("urgencias_contenedores")
      .select("contenedor, nota, created_at")
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
    if (!data || data.length === 0) break;

    all.push(...(data as UrgenciaContenedorRow[]));

    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return all;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const [contenedores, lineasClientes, lineasPropios, clientesInfo, posicionesPorContenedor] = await Promise.all([
      fetchTodosLosContenedores(),
      fetchAllPendienteDespacho("pendiente_despacho_clientes"),
      fetchAllPendienteDespachoPropios(),
      fetchClientesInfo(),
      fetchPosicionesPorContenedor(),
    ]);

    // El código de contenedor cargado ES el "numero" de pedido en Pendiente
    // de Despacho -- 1 contenedor = 1 línea siempre. Se busca primero en
    // Clientes y, si no está, en Propios.
    const clientesPorNumero = new Map<string, PendienteDespachoRow>();
    for (const r of lineasClientes) clientesPorNumero.set(r.numero, r);
    const propiosPorNumero = new Map<string, PendienteDespachoPropiosRow>();
    for (const r of lineasPropios) propiosPorNumero.set(r.numero, r);

    let updatedAt: string | null = null;

    const filas = ((contenedores ?? []) as UrgenciaContenedorRow[]).map((c) => {
      if (!updatedAt || c.created_at > updatedAt) updatedAt = c.created_at;

      const lineaClientes = clientesPorNumero.get(c.contenedor);
      const lineaPropios = !lineaClientes ? propiosPorNumero.get(c.contenedor) : undefined;
      const linea = lineaClientes ?? lineaPropios ?? null;

      const codigo = linea ? parseCodigoCliente(linea.cliente) : null;
      const info = codigo ? clientesInfo.get(codigo) : undefined;

      // "Con remito": para líneas de Clientes hace falta Pedido Gaci Y Remito
      // cargados; para líneas de Propios (no tienen concepto de Gaci) alcanza
      // con Remito. Si el contenedor no matchea ninguna línea, no tiene remito.
      const conRemito = lineaClientes
        ? !vacio(lineaClientes.pedido_gaci) && !vacio(lineaClientes.remito)
        : lineaPropios
          ? !vacio(lineaPropios.remito)
          : false;

      // Si el contenedor no matchea ninguna línea de Pendiente de Despacho, lo
      // más probable es que ya haya sido despachado (salió y ya no figura en
      // esas tablas) -- se muestra como "DESPACHADO" en vez de "SIN CLIENTE".
      const noEncontrado = !linea;

      return {
        contenedor: c.contenedor,
        nota: c.nota,
        cargadoEn: c.created_at,
        codigoCliente: noEncontrado ? "DESPACHADO" : codigo || "SIN CODIGO",
        cliente: noEncontrado ? "DESPACHADO" : info?.nombre || (linea?.cliente || "SIN CLIENTE").trim(),
        canal: noEncontrado ? "DESPACHADO" : info?.canal || "SIN CANAL",
        tipo: linea?.tipo || "SIN TIPO",
        curva: linea?.curva || "SIN CURVA",
        posicion: posicionesPorContenedor.get(c.contenedor) || null,
        conRemito,
      };
    });

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
