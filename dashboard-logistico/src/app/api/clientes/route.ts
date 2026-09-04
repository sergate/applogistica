import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabaseEnvOk } from "@/lib/supabaseClient";
import { requireAuth, esErrorAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Búsqueda simple de clientes por código o nombre, para autocompletar los
// campos de local origen/destino en Interlocales (y cualquier otro lugar
// que necesite elegir un cliente por código). No expone toda la tabla:
// pide un mínimo de caracteres y limita el resultado.
export async function GET(request: NextRequest) {
  if (!supabaseEnvOk) {
    return NextResponse.json({ success: false, error: "Faltan configurar las variables de Supabase." }, { status: 500 });
  }

  const auth = await requireAuth();
  if (esErrorAuth(auth)) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });
  }

  try {
    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ success: true, clientes: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("codigo, nombre")
      .or(`codigo.ilike.%${q}%,nombre.ilike.%${q}%`)
      .order("codigo")
      .limit(20);

    if (error) throw new Error(`Supabase (clientes): ${error.message}`);

    return NextResponse.json({ success: true, clientes: data || [] });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Error inesperado en el servidor" },
      { status: 500 }
    );
  }
}
