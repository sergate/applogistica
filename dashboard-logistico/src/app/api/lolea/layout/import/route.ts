import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { normalizarPosicionLol, UBICACION_STAGE, ZONA_LOLEA } from "@/lib/lolea";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHUNK = 500;

const lista = (valores: string[]) => valores.slice(0, 10).join(", ") + (valores.length > 10 ? "..." : "");

// Carga el layout de Lolea: deja la zona LOLEA exactamente como el archivo. Las
// posiciones nuevas se agregan; las que ya no figuran se borran, salvo que
// tengan stock (no se puede sacar una posición con mercadería adentro). Una
// posición que ya existe en el layout del almacén de Altatex se rechaza.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("LOL-Layout");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    if (!Array.isArray(body?.filas)) {
      return NextResponse.json({ success: false, error: '"filas" debe ser un array.' }, { status: 400 });
    }

    const nuevas = new Map<string, string | null>();
    for (const f of body.filas as Record<string, unknown>[]) {
      const ubicacion = typeof f?.ubicacion === "string" ? normalizarPosicionLol(f.ubicacion) : "";
      if (!ubicacion || ubicacion === UBICACION_STAGE) continue;
      const nave = typeof f?.nave === "string" ? f.nave.trim() || null : null;
      if (!nuevas.has(ubicacion)) nuevas.set(ubicacion, nave);
    }
    if (nuevas.size === 0) {
      return NextResponse.json({ success: false, error: "El archivo no tiene posiciones." }, { status: 400 });
    }

    const [layoutTodo, stock] = await Promise.all([
      fetchAllPaginated<{ ubicacion: string; zona: string }>("almacen_layout", "ubicacion, zona"),
      fetchAllPaginated<{ ubicacion: string; cantidad: number }>("lol_stock", "ubicacion, cantidad"),
    ]);

    const actuales = new Set<string>();
    const deAltatex = new Set<string>();
    for (const f of layoutTodo) {
      if ((f.zona || "").trim().toUpperCase() === ZONA_LOLEA) actuales.add(f.ubicacion);
      else deAltatex.add(normalizarPosicionLol(f.ubicacion));
    }

    const choques = [...nuevas.keys()].filter((u) => deAltatex.has(u));
    if (choques.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `${choques.length} posición(es) ya existen en el layout del almacén de Altatex y no pueden ser de Lolea: ${lista(choques)}`,
        },
        { status: 409 }
      );
    }

    const aAgregar = [...nuevas.keys()].filter((u) => !actuales.has(u));
    const aSacar = [...actuales].filter((u) => !nuevas.has(u));

    const conStock = new Set(stock.filter((s) => s.cantidad > 0 && s.ubicacion !== UBICACION_STAGE).map((s) => s.ubicacion));
    const sacarConStock = aSacar.filter((u) => conStock.has(u));
    if (sacarConStock.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `No se pueden sacar ${sacarConStock.length} posición(es) porque tienen stock: ${lista(sacarConStock)}. Vaciálas o dejalas en el archivo.`,
        },
        { status: 409 }
      );
    }

    for (let i = 0; i < aSacar.length; i += CHUNK) {
      const { error } = await supabaseAdmin
        .from("almacen_layout")
        .delete()
        .eq("zona", ZONA_LOLEA)
        .in("ubicacion", aSacar.slice(i, i + CHUNK));
      if (error) throw new Error(`Supabase (almacen_layout - borrado): ${error.message}`);
    }
    for (let i = 0; i < aAgregar.length; i += CHUNK) {
      const filas = aAgregar.slice(i, i + CHUNK).map((ubicacion) => ({
        ubicacion,
        nave: nuevas.get(ubicacion) ?? null,
        zona: ZONA_LOLEA,
      }));
      const { error } = await supabaseAdmin.from("almacen_layout").insert(filas);
      if (error) throw new Error(`Supabase (almacen_layout - insert): ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      agregadas: aAgregar.length,
      eliminadas: aSacar.length,
      total: nuevas.size,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
