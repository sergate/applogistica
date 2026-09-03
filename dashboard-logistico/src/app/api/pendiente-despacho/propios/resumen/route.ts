import { NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllPendienteDespachoPropios, parseCodigoCliente } from "@/lib/pendienteDespachoHelpers";
import { fetchClientesInfo } from "@/lib/resumenHelpers";
import { requireAuth, esErrorAuth } from "@/lib/auth";

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

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [rows, clientesInfo] = await Promise.all([fetchAllPendienteDespachoPropios(), fetchClientesInfo()]);

    // Si "Remito" tiene algún dato, no se considera.
    const pendientes = rows.filter((r) => vacio(r.remito));

    let updatedAt: string | null = null;

    const filasSinGrupo = pendientes.map((r) => {
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

    // Grupo de cada cliente (mismos grupos que se arman en Despacho -> Grupos
    // de Clientes, ver /api/admin/despacho-grupos).
    const codigos = [...new Set(filasSinGrupo.map((f) => f.codigoCliente).filter((c) => c !== "SIN CODIGO"))];
    const { data: miembros, error: errorMiembros } =
      codigos.length > 0
        ? await supabaseAdmin
            .from("despacho_grupos_clientes_miembros")
            .select("codigo_cliente, despacho_grupos_clientes(nombre)")
            .in("codigo_cliente", codigos)
        : { data: [], error: null };
    if (errorMiembros) throw new Error(`Supabase (despacho_grupos_clientes_miembros): ${errorMiembros.message}`);

    const grupoPorCodigo = new Map(
      (miembros || []).map((m) => {
        const grupo = Array.isArray(m.despacho_grupos_clientes) ? m.despacho_grupos_clientes[0] : m.despacho_grupos_clientes;
        return [m.codigo_cliente, (grupo as { nombre: string } | null)?.nombre || null];
      })
    );

    const filas = filasSinGrupo.map((f) => ({ ...f, grupo: grupoPorCodigo.get(f.codigoCliente) || null }));

    return NextResponse.json({ success: true, filas, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
