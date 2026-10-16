import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Ids de los empleados cuyo puesto coincide con este nombre (sin distinguir mayúsculas). */
async function empleadosConPuesto(nombre: string): Promise<number[]> {
  const dotacion = await fetchAllPaginated<{ id: number; puesto: string | null }>("personal_cd_dotacion", "id, puesto");
  const k = clave(nombre);
  return dotacion.filter((d) => d.puesto && clave(d.puesto) === k).map((d) => d.id);
}

// Renombrar o activar/desactivar un puesto. Al renombrar, los empleados que lo
// tienen pasan al nombre nuevo (el puesto de cada empleado se guarda como texto).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;
    const body = await request.json().catch(() => null);

    const updates: Record<string, unknown> = {};
    let nombreNuevo: string | null = null;
    if (typeof body?.nombre === "string") {
      nombreNuevo = body.nombre.trim().replace(/\s+/g, " ");
      if (!nombreNuevo) {
        return NextResponse.json({ success: false, error: "El nombre no puede quedar vacío." }, { status: 400 });
      }
      updates.nombre = nombreNuevo;
    }
    if (typeof body?.activo === "boolean") updates.activo = body.activo;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para actualizar." }, { status: 400 });
    }

    const { data: previo, error: errorPrevio } = await supabaseAdmin
      .from("personal_cd_puestos")
      .select("nombre")
      .eq("id", id)
      .maybeSingle();
    if (errorPrevio) throw new Error(`Supabase (personal_cd_puestos): ${errorPrevio.message}`);
    if (!previo) return NextResponse.json({ success: false, error: "El puesto no existe." }, { status: 404 });

    const { data, error } = await supabaseAdmin
      .from("personal_cd_puestos")
      .update(updates)
      .eq("id", id)
      .select("id, nombre, activo, created_at")
      .single();
    if (error) {
      throw new Error(
        error.code === "23505" ? "Ya existe un puesto con ese nombre." : `Supabase (personal_cd_puestos): ${error.message}`
      );
    }

    // Los empleados siguen al puesto: se les cambia el texto al nombre nuevo.
    if (nombreNuevo && nombreNuevo !== previo.nombre) {
      const ids = await empleadosConPuesto(previo.nombre);
      for (let i = 0; i < ids.length; i += 500) {
        const { error: errorEmpleados } = await supabaseAdmin
          .from("personal_cd_dotacion")
          .update({ puesto: nombreNuevo, updated_at: new Date().toISOString() })
          .in("id", ids.slice(i, i + 500));
        if (errorEmpleados) throw new Error(`Supabase (personal_cd_dotacion): ${errorEmpleados.message}`);
      }
    }

    return NextResponse.json({ success: true, puesto: data });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Borrar un puesto: no se puede si algún empleado lo tiene.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const { id } = await params;

    const { data: puesto, error: errorPuesto } = await supabaseAdmin
      .from("personal_cd_puestos")
      .select("nombre")
      .eq("id", id)
      .maybeSingle();
    if (errorPuesto) throw new Error(`Supabase (personal_cd_puestos): ${errorPuesto.message}`);
    if (!puesto) return NextResponse.json({ success: false, error: "El puesto no existe." }, { status: 404 });

    const ocupantes = await empleadosConPuesto(puesto.nombre);
    if (ocupantes.length > 0) {
      return NextResponse.json(
        { success: false, error: `No se puede borrar: tiene ${ocupantes.length} empleado(s) asignado(s).` },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("personal_cd_puestos").delete().eq("id", id);
    if (error) throw new Error(`Supabase (personal_cd_puestos): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
