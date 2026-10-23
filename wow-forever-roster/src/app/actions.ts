"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auditCharacters } from "@/lib/audit";
import { parseRoster, registerAttendance } from "@/lib/attendance";

const MAX_NAMES = 100;

// Los mensajes viajan por query string para mostrarlos sin JS de cliente.
function done(kind: "ok" | "err", message: string): never {
  revalidatePath("/");
  redirect(`/?${kind}=${encodeURIComponent(message)}`);
}

export async function addAndAudit(formData: FormData) {
  const names = parseRoster(String(formData.get("names") ?? ""));
  const realm = process.env.BLIZZARD_REALM;

  if (!names.length) done("err", "Escribe al menos un nombre de personaje.");
  if (names.length > MAX_NAMES) done("err", `Máximo ${MAX_NAMES} personajes por vez.`);
  if (!realm) done("err", "Falta BLIZZARD_REALM en las variables de entorno.");

  let results;
  try {
    results = await auditCharacters(realm, names);
  } catch (error) {
    done("err", error instanceof Error ? error.message : "Error al auditar");
  }

  const failed = results.filter((r) => !r.ok);
  const message =
    `${results.length - failed.length} auditados` +
    (failed.length ? `, ${failed.length} fallaron (${failed.map((f) => f.name).join(", ")})` : "");
  done(failed.length === results.length ? "err" : "ok", message);
}

export async function processAttendance(formData: FormData) {
  const names = parseRoster(String(formData.get("dump") ?? ""));
  if (!names.length) done("err", "No se encontraron nombres en el texto.");
  if (names.length > 500) done("err", "Máximo 500 nombres por vez.");

  let summary;
  try {
    summary = await registerAttendance(names);
  } catch (error) {
    done("err", error instanceof Error ? error.message : "Error al registrar");
  }
  done(
    "ok",
    `Asistencia registrada: ${summary.processed} (${summary.created.length} nuevos)`
  );
}
