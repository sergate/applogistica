import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_BLOQUE = "Sin bloque";
const CHUNK_IN = 200;

interface ContenedorRow {
  id: string;
  contenedor: string;
  nota: string | null;
  bloque: string | null;
  fecha: string | null;
  created_at: string;
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    // Paginado -- Supabase corta en 1000 filas por default si no se pagina
    // explícitamente, y podría haber más de 1000 contenedores cargados. Se
    // desempata por "id" además de "created_at" (un insert de muchas filas
    // de una vez les asigna el mismo timestamp) para que .range() no repita
    // filas entre páginas.
    const PAGE_SIZE = 1000;
    let from = 0;
    const contenedores: ContenedorRow[] = [];

    while (true) {
      const { data, error } = await supabaseAdmin
        .from("urgencias_contenedores")
        .select("id, contenedor, nota, bloque, fecha, created_at")
        .order("created_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
      if (!data || data.length === 0) break;

      contenedores.push(...(data as ContenedorRow[]));

      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    const vistos = new Set<string>();
    const sinDuplicados = contenedores
      .filter((r) => (vistos.has(r.id) ? false : (vistos.add(r.id), true)))
      .map((r) => ({ ...r, bloque: r.bloque || SIN_BLOQUE }));

    return NextResponse.json({ success: true, contenedores: sinDuplicados });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Agrega uno o varios contenedores a un BLOQUE (mismo formato que las
// colecciones de Carga Inicial): si el bloque ya existe (sin distinguir
// mayúsculas), se suman a ese; si no, se crea. Un contenedor solo puede estar
// en un bloque -- los que ya estaban cargados no se duplican ni se mueven.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const contenedoresRaw: unknown = body?.contenedores;
    const bloqueIngresado = typeof body?.bloque === "string" ? body.bloque.trim() : "";
    const fecha = typeof body?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : null;

    if (!Array.isArray(contenedoresRaw)) {
      return NextResponse.json({ success: false, error: '"contenedores" debe ser un array.' }, { status: 400 });
    }
    if (!bloqueIngresado) {
      return NextResponse.json({ success: false, error: "Falta el nombre del bloque." }, { status: 400 });
    }
    if (!fecha) {
      return NextResponse.json({ success: false, error: "Falta la fecha (formato AAAA-MM-DD)." }, { status: 400 });
    }

    const contenedores = Array.from(
      new Set(
        contenedoresRaw
          .map((c) => (typeof c === "string" ? c.trim() : ""))
          .filter((c) => c.length > 0)
      )
    );

    if (contenedores.length === 0) {
      return NextResponse.json({ success: false, error: "No se recibió ningún contenedor válido." }, { status: 400 });
    }

    // Si el bloque ya existe con otra capitalización, se reutiliza esa
    // grafía (evita "Urgentes" y "URGENTES" como dos bloques distintos).
    const { data: bloquesExistentes, error: errorBloques } = await supabaseAdmin
      .from("urgencias_contenedores")
      .select("bloque")
      .not("bloque", "is", null);
    if (errorBloques) throw new Error(`Supabase (urgencias_contenedores): ${errorBloques.message}`);
    const bloque =
      (bloquesExistentes || []).find((b) => (b.bloque as string).trim().toLowerCase() === bloqueIngresado.toLowerCase())
        ?.bloque ?? bloqueIngresado;

    // Contenedores que ya estaban cargados (en este u otro bloque).
    const yaCargados: { contenedor: string; bloque: string }[] = [];
    for (let i = 0; i < contenedores.length; i += CHUNK_IN) {
      const { data, error } = await supabaseAdmin
        .from("urgencias_contenedores")
        .select("contenedor, bloque")
        .in("contenedor", contenedores.slice(i, i + CHUNK_IN));
      if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
      for (const r of data || []) yaCargados.push({ contenedor: r.contenedor, bloque: r.bloque || SIN_BLOQUE });
    }
    const yaCargadosSet = new Set(yaCargados.map((c) => c.contenedor));
    const nuevos = contenedores.filter((c) => !yaCargadosSet.has(c));

    if (nuevos.length > 0) {
      const { error } = await supabaseAdmin
        .from("urgencias_contenedores")
        .insert(nuevos.map((contenedor) => ({ contenedor, bloque, fecha })));
      if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
    }

    return NextResponse.json({
      success: true,
      bloque,
      agregados: nuevos.length,
      yaCargados: yaCargados.length,
      enOtroBloque: yaCargados.filter((c) => c.bloque !== bloque),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}

// Con { bloque }: elimina ese bloque completo con todos sus contenedores. Sin
// body: limpieza masiva de TODOS los contenedores cargados.
export async function DELETE(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PD-CargaDatos");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const bloque = typeof body?.bloque === "string" ? body.bloque : null;

    if (bloque !== null) {
      // Los contenedores migrados sin bloque se muestran como "Sin bloque".
      const { error } =
        bloque === SIN_BLOQUE
          ? await supabaseAdmin.from("urgencias_contenedores").delete().or(`bloque.eq."${SIN_BLOQUE}",bloque.is.null`)
          : await supabaseAdmin.from("urgencias_contenedores").delete().eq("bloque", bloque);
      if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);
      return NextResponse.json({ success: true });
    }

    const { error } = await supabaseAdmin.from("urgencias_contenedores").delete().not("id", "is", null);
    if (error) throw new Error(`Supabase (urgencias_contenedores): ${error.message}`);

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
