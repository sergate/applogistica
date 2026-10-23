import { NextResponse } from "next/server";
import { parseRoster, registerAttendance } from "@/lib/attendance";

const MAX_NAMES = 500;

export async function POST(request: Request) {
  let dump: unknown;
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      dump = (await request.json())?.dump;
    } else {
      dump = await request.text();
    }
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (typeof dump !== "string" || !dump.trim()) {
    return NextResponse.json(
      { error: "Se requiere el texto del roster (JSON { dump } o texto plano)" },
      { status: 400 }
    );
  }

  const names = parseRoster(dump);
  if (!names.length) {
    return NextResponse.json(
      { error: "No se encontraron nombres en el texto" },
      { status: 400 }
    );
  }
  if (names.length > MAX_NAMES) {
    return NextResponse.json(
      { error: `Máximo ${MAX_NAMES} nombres por solicitud` },
      { status: 413 }
    );
  }

  try {
    const summary = await registerAttendance(names);
    return NextResponse.json({ ...summary, names });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
