import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Character from "@/models/Character";

export const runtime = "nodejs";

const MAX_NAMES = 500;

/**
 * Convierte un dump crudo ("Roster: Arthas, Thrall-Realm, |cffff0000Jaina|r")
 * en una lista única de nombres de personaje normalizados.
 */
function parseRoster(dump: string): string[] {
  const names = dump
    .replace(/\|c[0-9a-f]{8}/gi, "") // códigos de color de WoW
    .replace(/\|r/gi, "")
    .replace(/^\s*[^,:]*:/, "") // prefijo tipo "Roster:"
    .split(",")
    .map((raw) =>
      raw
        .replace(/-.*$/, "") // sufijo de reino: "Thrall-Area52"
        .replace(/[^\p{L}]/gu, "") // los nombres solo tienen letras
    )
    .filter(Boolean)
    // Formato oficial: primera mayúscula, resto minúsculas.
    .map((n) => n.charAt(0).toLocaleUpperCase() + n.slice(1).toLocaleLowerCase());

  return [...new Set(names)];
}

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
    await connectDB();

    // attendanceCount no va en $setOnInsert: $inc ya lo crea en 1 al insertar.
    const result = await Character.bulkWrite(
      names.map((name) => ({
        updateOne: {
          filter: { name },
          update: {
            $inc: { attendanceCount: 1 },
            $setOnInsert: {
              class: "Unknown",
              role: "Unknown",
              ilvl: 0,
              missingEnchants: [],
              missingGems: [],
              lastUpdated: new Date(),
            },
          },
          upsert: true,
        },
      }))
    );

    const created = Object.keys(result.upsertedIds).map((i) => names[Number(i)]);

    return NextResponse.json({
      processed: names.length,
      updated: names.length - created.length,
      created,
      names,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno" },
      { status: 500 }
    );
  }
}
