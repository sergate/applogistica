import { NextResponse } from "next/server";
import { auditCharacters } from "@/lib/audit";

export async function POST(request: Request) {
  let body: { realm?: string; names?: string[]; roles?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const realm = body.realm?.trim();
  const names = body.names?.map((n) => n.trim()).filter(Boolean);
  if (!realm || !names?.length) {
    return NextResponse.json(
      { error: "Se requiere 'realm' y 'names' (array no vacío)" },
      { status: 400 }
    );
  }

  try {
    const results = await auditCharacters(realm, names, body.roles);
    return NextResponse.json({ realm: realm.toLowerCase(), results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
