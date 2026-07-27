import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllPendienteDespachoPropios, parseCodigoCliente } from "@/lib/pendienteDespachoHelpers";
import { fetchClientesInfo } from "@/lib/resumenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const num = (v: number | null): number => Number(v) || 0;
const vacio = (v: string | null): boolean => !v || v.trim() === "";

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const [rows, clientesInfo] = await Promise.all([fetchAllPendienteDespachoPropios(), fetchClientesInfo()]);

    // Si "Remito" tiene algún dato, no se considera.
    const pendientes = rows.filter((r) => vacio(r.remito));

    let updatedAt: string | null = null;

    const filas = pendientes.map((r) => {
      const codigo = parseCodigoCliente(r.cliente);
      const info = codigo ? clientesInfo.get(codigo) : undefined;

      if (r.created_at && (!updatedAt || r.created_at > updatedAt)) updatedAt = r.created_at;

      return {
        numero: r.numero,
        codigoCliente: codigo || "SIN CODIGO",
        cliente: info?.nombre || (r.cliente || "SIN CLIENTE").trim(),
        canal: info?.canal || "SIN CANAL",
        tipo: r.tipo || "SIN TIPO",
        curva: r.curva || "SIN CURVA",
        unidades: num(r.unidades),
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
