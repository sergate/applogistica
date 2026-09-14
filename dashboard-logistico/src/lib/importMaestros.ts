export type ImportKey = "clientes" | "grupos" | "tiendas" | "ecom";

export interface ImportFileResult {
  archivo: ImportKey;
  filasLeidas: number;
  filasInsertadas: number;
  error: string | null;
}

const CHUNK_SIZE = 500; // registros por request, para no chocar con el límite de 4.5MB de Vercel

export async function enviarArchivoEnLotes(
  archivo: ImportKey,
  records: Record<string, unknown>[],
  onProgresoRegistros: (cantidad: number) => void
): Promise<{ filasInsertadas: number }> {
  let totalInsertadas = 0;

  if (records.length === 0) {
    // igual mandamos un "lote vacío" para que corra el borrado total en full_replace
    const res = await fetch("/api/import-maestros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archivo, batch: [], esPrimerLote: true }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) throw new Error(data?.error || `Error procesando ${archivo}.`);
    return { filasInsertadas: 0 };
  }

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const batch = records.slice(i, i + CHUNK_SIZE);
    const res = await fetch("/api/import-maestros", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archivo, batch, esPrimerLote: i === 0 }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error(`El servidor respondió con un error inesperado (status ${res.status}) procesando ${archivo}.`);
    }
    if (!res.ok || !data.success) {
      throw new Error(data.error || `Error al procesar ${archivo}.`);
    }
    totalInsertadas += data.filasInsertadas ?? batch.length;
    onProgresoRegistros(batch.length);
  }

  return { filasInsertadas: totalInsertadas };
}
