// Reintento puntual para el error intermitente de infraestructura de Supabase
// PGRST303 "JWT issued at future": el gateway que emite el token de la
// Service Role Key y el nodo de PostgREST que lo valida quedan desfasados en
// reloj, y la consulta falla aunque los datos y las credenciales sean
// correctos. Es transitorio por nodo -- un segundo intento normalmente pega
// en un nodo sano. No es un problema de nuestro código ni de las env vars.
const CODIGOS_REINTENTABLES = ["PGRST303"];

export async function conReintentoSiJwtFuturo<T>(
  consulta: () => PromiseLike<{ data: T; error: { code?: string } | null }>
): Promise<{ data: T; error: { code?: string } | null }> {
  const intento1 = await consulta();
  if (intento1.error && CODIGOS_REINTENTABLES.includes(intento1.error.code || "")) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return consulta();
  }
  return intento1;
}
