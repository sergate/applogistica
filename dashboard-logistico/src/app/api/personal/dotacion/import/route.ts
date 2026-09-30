import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TURNOS_VALIDOS = new Set(["Mañana", "Tarde", "Noche", "Central"]);
const CONTRATOS_VALIDOS = new Set(["Efectivo", "Eventual", "Pasantía"]);

interface RegistroImport {
  legajo?: unknown;
  apellidoNombre?: unknown;
  dni?: unknown;
  fechaNacimiento?: unknown;
  fechaIngreso?: unknown;
  sector?: unknown;
  puesto?: unknown;
  turno?: unknown;
  tipoContrato?: unknown;
  telefono?: unknown;
  email?: unknown;
}

// Import masivo de Dotación (altas y actualizaciones por ingreso masivo de
// personal). Hace upsert por legajo -- si el legajo ya existe, actualiza
// sus datos en vez de duplicarlo. El Sector se matchea por nombre contra
// la lista maestra (case-insensitive); el que no matchea queda sin
// sector asignado y se informa en la respuesta para corregir a mano.
export async function POST(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const body = await request.json();
    const registros: RegistroImport[] = Array.isArray(body?.registros) ? body.registros : [];
    if (registros.length === 0) {
      return NextResponse.json({ success: false, error: "No hay filas para importar." }, { status: 400 });
    }

    const { data: sectores, error: errorSectores } = await supabaseAdmin.from("personal_cd_sectores").select("id, nombre");
    if (errorSectores) throw new Error(`Supabase (personal_cd_sectores): ${errorSectores.message}`);
    const sectorIdPorNombre = new Map((sectores || []).map((s) => [s.nombre.trim().toLowerCase(), s.id]));

    const filasError: { fila: number; motivo: string }[] = [];
    const sectoresNoEncontrados = new Set<string>();
    const filasValidas: Record<string, unknown>[] = [];

    registros.forEach((r, idx) => {
      const legajo = r.legajo != null ? String(r.legajo).trim() : "";
      const apellidoNombre = r.apellidoNombre != null ? String(r.apellidoNombre).trim() : "";
      const fechaIngreso = r.fechaIngreso != null ? String(r.fechaIngreso).trim() : "";

      if (!legajo || !apellidoNombre || !fechaIngreso) {
        filasError.push({ fila: idx + 2, motivo: "Falta Legajo, Apellido y Nombre, o Fecha de Ingreso." });
        return;
      }

      let sectorId: number | null = null;
      const sectorNombre = r.sector != null ? String(r.sector).trim() : "";
      if (sectorNombre) {
        const encontrado = sectorIdPorNombre.get(sectorNombre.toLowerCase());
        if (encontrado) sectorId = encontrado;
        else sectoresNoEncontrados.add(sectorNombre);
      }

      const turno = r.turno != null ? String(r.turno).trim() : "";
      const tipoContrato = r.tipoContrato != null ? String(r.tipoContrato).trim() : "";

      filasValidas.push({
        legajo,
        apellido_nombre: apellidoNombre,
        dni: r.dni != null ? String(r.dni).trim() || null : null,
        fecha_nacimiento: r.fechaNacimiento || null,
        fecha_ingreso: fechaIngreso,
        sector_id: sectorId,
        puesto: r.puesto != null ? String(r.puesto).trim() || null : null,
        turno: TURNOS_VALIDOS.has(turno) ? turno : null,
        tipo_contrato: CONTRATOS_VALIDOS.has(tipoContrato) ? tipoContrato : null,
        telefono: r.telefono != null ? String(r.telefono).trim() || null : null,
        email: r.email != null ? String(r.email).trim() || null : null,
        updated_at: new Date().toISOString(),
      });
    });

    if (filasValidas.length === 0) {
      return NextResponse.json({ success: false, error: "Ninguna fila tiene los datos mínimos (Legajo, Apellido y Nombre, Fecha de Ingreso)." }, { status: 400 });
    }

    const { error: errorUpsert } = await supabaseAdmin
      .from("personal_cd_dotacion")
      .upsert(filasValidas, { onConflict: "legajo" });
    if (errorUpsert) throw new Error(`Supabase (personal_cd_dotacion): ${errorUpsert.message}`);

    return NextResponse.json({
      success: true,
      procesados: filasValidas.length,
      filasConError: filasError,
      sectoresNoEncontrados: [...sectoresNoEncontrados],
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado" },
      { status: 500 }
    );
  }
}
