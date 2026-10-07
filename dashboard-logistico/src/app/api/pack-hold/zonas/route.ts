import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAdminPermission } from "@/lib/adminAuth";
import { fetchAllPaginated } from "@/lib/fetchAllPaginated";
import { fetchZonaPorPosicion, registrarEvento } from "@/lib/packHold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Zonas del layout del almacén y cuáles están habilitadas para Pack and Hold.
// Las zonas salen del layout (Ocupación Almacén -> Importar Layout): si se
// importa un layout con una zona nueva, aparece acá apagada.
export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Zonas");
  if (!auth.autorizado) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const [zonaPorPosicion, habilitadasRows, ocupadas] = await Promise.all([
      fetchZonaPorPosicion(),
      fetchAllPaginated<{ zona: string; habilitada: boolean }>("ph_zonas_habilitadas", "zona, habilitada"),
      fetchAllPaginated<{ posicion: string }>("ph_posiciones", "posicion"),
    ]);

    const posicionesPorZona = new Map<string, number>();
    for (const zona of zonaPorPosicion.values()) {
      posicionesPorZona.set(zona, (posicionesPorZona.get(zona) ?? 0) + 1);
    }

    const ocupadasPorZona = new Map<string, number>();
    for (const o of ocupadas) {
      const zona = zonaPorPosicion.get(o.posicion.toUpperCase());
      if (zona !== undefined) ocupadasPorZona.set(zona, (ocupadasPorZona.get(zona) ?? 0) + 1);
    }

    const habilitada = new Map(habilitadasRows.map((z) => [z.zona.trim().toUpperCase(), z.habilitada]));

    const zonas = Array.from(posicionesPorZona.entries())
      .map(([zona, posiciones]) => ({
        zona: zona || "SIN ZONA",
        posiciones,
        ocupadas: ocupadasPorZona.get(zona) ?? 0,
        habilitada: habilitada.get(zona) === true,
      }))
      .sort((a, b) => Number(b.habilitada) - Number(a.habilitada) || a.zona.localeCompare(b.zona));

    return NextResponse.json({ success: true, zonas });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}

// Habilita o deshabilita una zona. No mueve ni libera nada: las posiciones ya
// ocupadas siguen vigentes, solo se pueden registrar guías nuevas en zonas
// habilitadas.
export async function PATCH(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Falta configurar Supabase." }, { status: 500 });
  }

  const auth = await requireAdminPermission("PH-Zonas");
  if (!auth.autorizado || !auth.userId) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json().catch(() => null);
    const zona = typeof body?.zona === "string" ? body.zona.trim().toUpperCase() : "";
    const habilitada = body?.habilitada;
    if (!zona || typeof habilitada !== "boolean") {
      return NextResponse.json({ success: false, error: 'Faltan "zona" y "habilitada".' }, { status: 400 });
    }

    const zonaGuardada = zona === "SIN ZONA" ? "" : zona;
    const zonaPorPosicion = await fetchZonaPorPosicion();
    if (!Array.from(zonaPorPosicion.values()).includes(zonaGuardada)) {
      return NextResponse.json({ success: false, error: `La zona "${zona}" no existe en el layout.` }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("ph_zonas_habilitadas").upsert(
      {
        zona: zonaGuardada,
        habilitada,
        actualizado_por: auth.userId,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: "zona" }
    );
    if (error) throw new Error(`Supabase (ph_zonas_habilitadas): ${error.message}`);

    await registrarEvento({
      tipo: habilitada ? "zona_habilitada" : "zona_deshabilitada",
      mensaje: zona,
      resultado: "ok",
      usuarioId: auth.userId,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
