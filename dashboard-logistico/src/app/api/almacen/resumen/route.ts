import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAlmacenLayout, fetchAlmacenOcupacion, clasificarZonaAlmacen } from "@/lib/almacenHelpers";

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
    vacias: f.capacidad - f.ocupadas,
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
    const [layout, ocupacion] = await Promise.all([fetchAlmacenLayout(), fetchAlmacenOcupacion()]);

    // Agrupamos por (grupo, subzona); cada ubicación del layout aporta 1 a
    // "capacidad" de su grupo/subzona, y 1 a "ocupadas" si está en el set de
    // ubicaciones ocupadas (viene de la última importación del archivo grande).
    const porGrupoSubzona = new Map<string, Fila>();
    for (const row of layout) {
      const { grupo, subzona } = clasificarZonaAlmacen(row.zona);
      const key = `${grupo}__${subzona}`;
      if (!porGrupoSubzona.has(key)) porGrupoSubzona.set(key, { capacidad: 0, ocupadas: 0 });
      const acc = porGrupoSubzona.get(key)!;
      acc.capacidad += 1;
      if (ocupacion.ubicacionesOcupadas.has(row.ubicacion)) acc.ocupadas += 1;
    }

    const porGrupo = new Map<string, { subzona: string; fila: Fila }[]>();
    for (const [key, fila] of porGrupoSubzona) {
      const [grupo, subzona] = key.split("__");
      if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
      porGrupo.get(grupo)!.push({ subzona, fila });
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
      updatedAt: ocupacion.updatedAt,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
