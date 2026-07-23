import { NextResponse } from "next/server";
import { supabaseEnvOk } from "@/lib/supabaseClient";
import { fetchAllInbound, esStatusCD } from "@/lib/inboundHelpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  if (!supabaseEnvOk) {
    return NextResponse.json(
      { success: false, error: "Faltan configurar SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY." },
      { status: 500 }
    );
  }

  try {
    const rows = await fetchAllInbound();

    const pendientes = rows.filter((r) => !esStatusCD(r.status)).sort((a, b) => a.legajo - b.legajo);
    const enCd = rows.filter((r) => esStatusCD(r.status)).sort((a, b) => a.legajo - b.legajo);

    let updatedAt: string | null = null;
    for (const r of rows) {
      if (r.updated_at && (!updatedAt || r.updated_at > updatedAt)) updatedAt = r.updated_at;
    }

    return NextResponse.json({ success: true, pendientes, enCd, updatedAt });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
