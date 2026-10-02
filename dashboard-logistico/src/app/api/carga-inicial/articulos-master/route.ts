import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_SUPABASE = { success: false, error: "Faltan configurar las variables de Supabase." };

interface FilaArticuloMaster {
  articulo: string;
  observacion: string;
  fecha: string;
}

// Artículos master registrados en Carga Inicial -> Carga Datos, con su
// observación (colección) y fecha -- ver sql/carga_inicial_articulos_master.sql.
// Devuelve una entrada por observación, con sus artículos.
export async function GET() {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("CI-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const filas = await fetchAllPaginated<FilaArticuloMaster>(
      "carga_inicial_articulos_master",
      "articulo, observacion, fecha"
    );

    const porObservacion = new Map<string, { observacion: string; fecha: string; articulos: string[] }>();
    for (const f of filas) {
      let grupo = porObservacion.get(f.observacion);
      if (!grupo) {
        grupo = { observacion: f.observacion, fecha: f.fecha, articulos: [] };
        porObservacion.set(f.observacion, grupo);
      }
      if (f.fecha < grupo.fecha) grupo.fecha = f.fecha;
      grupo.articulos.push(f.articulo);
    }

    const observaciones = Array.from(porObservacion.values())
      .map((g) => ({ ...g, articulos: g.articulos.sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => a.observacion.localeCompare(b.observacion));

    return NextResponse.json({ success: true, observaciones });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Agrega uno o varios artículos a una observación. Si la observación ya
// existe (sin distinguir mayúsculas), los artículos se suman a esa y se
// respeta su escritura original.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("CI-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const articulosRaw: unknown = body?.articulos;
    const observacionRaw = typeof body?.observacion === "string" ? body.observacion.trim().replace(/\s+/g, " ") : "";
    const fecha = typeof body?.fecha === "string" ? body.fecha.trim() : "";

    if (!Array.isArray(articulosRaw)) {
      return NextResponse.json({ success: false, error: '"articulos" debe ser un array.' }, { status: 400 });
    }
    if (!observacionRaw) {
      return NextResponse.json({ success: false, error: "La observación es obligatoria." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return NextResponse.json({ success: false, error: "La fecha es obligatoria (aaaa-mm-dd)." }, { status: 400 });
    }

    const articulos = Array.from(
      new Set(
        articulosRaw
          .map((a) => (typeof a === "string" ? a.trim() : ""))
          .filter((a) => a.length > 0)
      )
    );
    if (articulos.length === 0) {
      return NextResponse.json({ success: false, error: "No se recibió ningún artículo válido." }, { status: 400 });
    }

    // Reusa la escritura de una observación existente (case-insensitive).
    const { data: existentes, error: errorExistentes } = await supabaseAdmin
      .from("carga_inicial_articulos_master")
      .select("observacion");
    if (errorExistentes) throw new Error(`Supabase (carga_inicial_articulos_master): ${errorExistentes.message}`);
    const igual = (existentes || []).find((e) => e.observacion.toLowerCase() === observacionRaw.toLowerCase());
    const observacion = igual ? igual.observacion : observacionRaw;

    const { data, error } = await supabaseAdmin
      .from("carga_inicial_articulos_master")
      .upsert(
        articulos.map((articulo) => ({ articulo, observacion, fecha, usuario_id: auth.userId })),
        { onConflict: "observacion,articulo", ignoreDuplicates: true }
      )
      .select("id");
    if (error) throw new Error(`Supabase (carga_inicial_articulos_master): ${error.message}`);

    return NextResponse.json({ success: true, observacion, agregados: data?.length ?? 0 });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Elimina por completo una observación: todos sus artículos.
export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) return NextResponse.json(SIN_SUPABASE, { status: 500 });

  const auth = await requireAdminPermission("CI-Carga");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const observacion = typeof body?.observacion === "string" ? body.observacion : "";
    if (!observacion) return NextResponse.json({ success: false, error: "Observación inválida." }, { status: 400 });

    const { error } = await supabaseAdmin.from("carga_inicial_articulos_master").delete().eq("observacion", observacion);
    if (error) throw new Error(`Supabase (carga_inicial_articulos_master): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
