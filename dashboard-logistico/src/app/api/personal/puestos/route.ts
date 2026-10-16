import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Operario" y "operario " son el mismo puesto.
const clave = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const limpiar = (s: string) => s.trim().replace(/\s+/g, " ");

// Lista maestra de puestos, solo Admin (misma pantalla que Sectores). Devuelve
// los puestos creados con cuántos empleados los tienen, y los puestos que ya
// aparecen en Dotación pero todavía no se crearon ("sinCrear").
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [{ data: puestos, error: errorPuestos }, dotacion] = await Promise.all([
      supabaseAdmin.from("personal_cd_puestos").select("id, nombre, activo, created_at").order("nombre"),
      fetchAllPaginated<{ puesto: string | null }>("personal_cd_dotacion", "puesto"),
    ]);
    if (errorPuestos) throw new Error(`Supabase (personal_cd_puestos): ${errorPuestos.message}`);

    const empleadosPorClave = new Map<string, number>();
    const nombrePorClave = new Map<string, string>();
    for (const d of dotacion) {
      if (!d.puesto || !d.puesto.trim()) continue;
      const k = clave(d.puesto);
      empleadosPorClave.set(k, (empleadosPorClave.get(k) ?? 0) + 1);
      if (!nombrePorClave.has(k)) nombrePorClave.set(k, limpiar(d.puesto));
    }

    const creados = new Set((puestos || []).map((p) => clave(p.nombre)));
    const sinCrear = [...nombrePorClave.entries()]
      .filter(([k]) => !creados.has(k))
      .map(([k, nombre]) => ({ nombre, empleados: empleadosPorClave.get(k) ?? 0 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    return NextResponse.json({
      success: true,
      puestos: (puestos || []).map((p) => ({ ...p, empleados: empleadosPorClave.get(clave(p.nombre)) ?? 0 })),
      sinCrear,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Crea un puesto ({ nombre }) o varios de una vez ({ nombres: [...] }), este
// último para el botón "Crear todos" de los que ya están en uso en Dotación.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PCD-Sectores");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const unico = typeof body?.nombre === "string";
    const candidatos: string[] = unico
      ? [body.nombre]
      : Array.isArray(body?.nombres)
        ? (body.nombres as unknown[]).filter((n): n is string => typeof n === "string")
        : [];

    const nuevos = new Map<string, string>();
    for (const n of candidatos) {
      const nombre = limpiar(n);
      if (nombre && !nuevos.has(clave(nombre))) nuevos.set(clave(nombre), nombre);
    }
    if (nuevos.size === 0) {
      return NextResponse.json({ success: false, error: "Falta el nombre del puesto." }, { status: 400 });
    }

    const { data: existentes, error: errorExistentes } = await supabaseAdmin.from("personal_cd_puestos").select("nombre");
    if (errorExistentes) throw new Error(`Supabase (personal_cd_puestos): ${errorExistentes.message}`);
    const yaCreados = new Set((existentes || []).map((p) => clave(p.nombre)));

    const aCrear = [...nuevos.entries()].filter(([k]) => !yaCreados.has(k)).map(([, nombre]) => ({ nombre }));
    if (unico && aCrear.length === 0) {
      return NextResponse.json({ success: false, error: "Ya existe un puesto con ese nombre." }, { status: 409 });
    }

    if (aCrear.length > 0) {
      const { error } = await supabaseAdmin.from("personal_cd_puestos").insert(aCrear);
      if (error) {
        throw new Error(
          error.code === "23505" ? "Ya existe un puesto con ese nombre." : `Supabase (personal_cd_puestos): ${error.message}`
        );
      }
    }

    return NextResponse.json({ success: true, creados: aCrear.length, yaExistian: nuevos.size - aCrear.length });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
