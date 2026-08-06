import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAlmacenResumenAgregado } from "@/lib/almacenHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ORDEN_GRUPOS = ["Pallet", "Calzado", "Indumentaria", "AWADA"];

interface Fila {
  capacidad: number;
  ocupadas: number;
}

function conVacantesYPct(f: Fila) {
  return {
    capacidad: f.capacidad,
    ocupadas: f.ocupadas,
    // Nunca negativas -- puede pasar si una zona de tipo "contenedores por
    // posición" (MZN) trae más contenedores cargados que el máximo esperado.
    vacias: Math.max(0, f.capacidad - f.ocupadas),
    pct: f.capacidad > 0 ? (f.ocupadas / f.capacidad) * 100 : 0,
  };
}

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    // La agregación por (grupo, subzona) -- incluyendo el filtro de
    // grupos/sub-filas deshabilitados desde Configuración -- se hace en
    // Postgres (ver fetchAlmacenResumenAgregado / sql/almacen_resumen_agrupado.sql)
    // en vez de traer almacen_layout + almacen_ocupacion completas a memoria.
    const { filas, updatedAt } = await fetchAlmacenResumenAgregado();

    const porGrupo = new Map<string, { subzona: string; fila: Fila }[]>();
    for (const f of filas) {
      if (!porGrupo.has(f.grupo)) porGrupo.set(f.grupo, []);
      porGrupo.get(f.grupo)!.push({ subzona: f.subzona, fila: { capacidad: f.capacidad, ocupadas: f.ocupadas } });
    }

    const gruposOrdenados = Array.from(porGrupo.keys()).sort((a, b) => {
      const ia = ORDEN_GRUPOS.indexOf(a);
      const ib = ORDEN_GRUPOS.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const grupos = gruposOrdenados.map((grupo) => {
      const subrowsOrdenadas = (porGrupo.get(grupo) ?? []).sort((a, b) => a.subzona.localeCompare(b.subzona));
      const subtotal = subrowsOrdenadas.reduce(
        (acc, s) => ({ capacidad: acc.capacidad + s.fila.capacidad, ocupadas: acc.ocupadas + s.fila.ocupadas }),
        { capacidad: 0, ocupadas: 0 }
      );
      return {
        grupo,
        subrows: subrowsOrdenadas.map((s) => ({ subzona: s.subzona, ...conVacantesYPct(s.fila) })),
        subtotal: conVacantesYPct(subtotal),
      };
    });

    const total = grupos.reduce(
      (acc, g) => ({ capacidad: acc.capacidad + g.subtotal.capacidad, ocupadas: acc.ocupadas + g.subtotal.ocupadas }),
      { capacidad: 0, ocupadas: 0 }
    );

    return NextResponse.json({
      success: true,
      grupos,
      total: conVacantesYPct(total),
      updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
