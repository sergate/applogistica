import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import {
  fetchAlmacenLayout,
  fetchAlmacenOcupacion,
  fetchAlmacenIndicadoresDeshabilitados,
  clasificarZonaAlmacen,
} from "@/lib/almacenHelpers";

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
    const [layout, ocupacion, deshabilitados] = await Promise.all([
      fetchAlmacenLayout(),
      fetchAlmacenOcupacion(),
      fetchAlmacenIndicadoresDeshabilitados(),
    ]);

    // Agrupamos por (grupo, subzona). "Capacidad" depende del tipo de
    // sub-fila: MZN (Calzado/Indumentaria) admite hasta 6 contenedores por
    // posición -> cuenta 6 por posición; PALLET F01 admite hasta 10 -> cuenta
    // 10 por posición; el resto (NAVE 2/3, PERCHEROS, PICKING) cuenta 1 por
    // posición. "Ocupadas": en las sub-filas "por contenedor" (MZN y
    // PALLET F01) se suman los contenedores únicos con stock>0 (la capacidad
    // ya está en esa unidad); en el resto (tipo pallet -- una posición
    // entera, no por contenedor) una posición cuenta como ocupada si tiene 1
    // o más contenedores con stock>0, y como vacía si no tiene ninguno.
    const porGrupoSubzona = new Map<string, Fila>();
    for (const row of layout) {
      const { grupo, subzona } = clasificarZonaAlmacen(row.zona);
      const key = `${grupo}__${subzona}`;
      // Grupo/subzona apagado desde Configuración -- se excluye por completo,
      // no solo de la vista sino también de los subtotales y el total general.
      if (deshabilitados.has(key)) continue;
      if (!porGrupoSubzona.has(key)) porGrupoSubzona.set(key, { capacidad: 0, ocupadas: 0 });
      const acc = porGrupoSubzona.get(key)!;
      const esPorContenedor = subzona.startsWith("MZN") || subzona === "PALLET F01";
      acc.capacidad += subzona.startsWith("MZN") ? 6 : subzona === "PALLET F01" ? 10 : 1;

      const contenedores = ocupacion.contenedoresPorUbicacion.get(row.ubicacion) ?? 0;
      acc.ocupadas += esPorContenedor ? contenedores : contenedores > 0 ? 1 : 0;
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
