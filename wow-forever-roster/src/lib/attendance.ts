import { connectDB } from "@/lib/db";
import Character from "@/models/Character";

/**
 * Convierte un dump crudo ("Roster: Arthas, Thrall-Realm, |cffff0000Jaina|r")
 * en una lista única de nombres de personaje normalizados.
 */
export function parseRoster(dump: string): string[] {
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

export async function registerAttendance(names: string[]) {
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
  return { processed: names.length, updated: names.length - created.length, created };
}
