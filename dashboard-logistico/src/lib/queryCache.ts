// Cache corto en memoria (por instancia de función serverless) para datos
// "maestro" que varias rutas piden completos y sin filtrar en cada request
// (clientes, grupo_pedidos, tiendas_destino). No reemplaza la base de datos:
// solo evita traer la tabla entera de vuelta si otra ruta ya la trajo hace
// pocos segundos. Se invalida a mano después de un import (ver
// invalidateCache) para no mostrar datos viejos apenas alguien importa.
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export async function getCached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as T;
  }

  const value = await fetcher();
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Sin argumentos, borra todo. Con prefijo, borra solo las claves que empiezan así. */
export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
