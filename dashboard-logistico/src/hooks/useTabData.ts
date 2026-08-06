import useSWR, { SWRConfiguration, KeyedMutator } from "swr";

// Hook fino sobre SWR que estandariza el patrón "fetch atado a una pestaña +
// filtros" que hoy repiten ~30 useEffect en page.tsx. La diferencia clave
// contra un simple fetch en useEffect: SWR cachea por clave, así que volver
// a una pestaña ya visitada (mismo tab + mismos filtros + mismo dataVersion)
// no vuelve a pegarle a Supabase mientras el cache siga vigente -- solo
// revalida en segundo plano si pasó el "dedupingInterval".
//
// "dataVersion" es el mismo contador global que ya usa el resto de la app
// para forzar un refetch después de un import/mutación: se incluye como
// parte de la clave, así que bumpearlo invalida el cache de esa pestaña.

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error(`El servidor respondió con un error inesperado (status ${res.status}).`);
  }
  const body = data as { success?: boolean; error?: string };
  if (!res.ok || body?.success === false) {
    throw new Error(body?.error || "No se pudo cargar la información.");
  }
  return data as T;
}

export interface UseTabDataResult<T> {
  data: T | undefined;
  error: string | null;
  isLoading: boolean;
  mutate: KeyedMutator<T>;
}

/**
 * @param activeTab pestaña actualmente activa (viene del estado global de page.tsx)
 * @param tab clave de la pestaña que este hook representa -- solo pide datos cuando activeTab === tab
 * @param url endpoint a pedir, o null para no pedir nada (ej. filtros incompletos)
 * @param dataVersion contador global de "refetch todo"
 */
export function useTabData<T>(
  activeTab: string,
  tab: string,
  url: string | null,
  dataVersion: number,
  options?: SWRConfiguration
): UseTabDataResult<T> {
  type Key = readonly [string, string, number];
  const key: Key | null = activeTab === tab && url ? (["tab-data", url, dataVersion] as const) : null;

  const { data, error, isLoading, mutate } = useSWR<T, Error, Key | null>(
    key,
    (k: Key) => fetchJson<T>(k[1]),
    {
      revalidateOnFocus: false,
      dedupingInterval: 15_000,
      ...options,
    }
  );

  return {
    data,
    error: error instanceof Error ? error.message : error ? String(error) : null,
    isLoading,
    mutate,
  };
}
