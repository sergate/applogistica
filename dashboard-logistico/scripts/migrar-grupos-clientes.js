// Migra la tabla "Grupos de Clientes" (despacho_grupos_clientes +
// despacho_grupos_clientes_miembros) de producción a test. Solo AGREGA/
// ACTUALIZA (upsert) -- nunca borra grupos ni miembros que ya existan en
// test y no estén en producción.
//
// despacho_grupos_clientes.id es "generated always as identity" en ambas
// bases, así que los ids de producción y test pueden no coincidir -- por
// eso el cruce entre bases se hace por "nombre" (columna unique), no por id.
//
// Uso (correr en tu PC, con tus propias credenciales -- nunca las pegues
// en el chat ni las commitees):
//   set PROD_SUPABASE_URL=https://<proyecto-prod>.supabase.co
//   set PROD_SUPABASE_SERVICE_ROLE_KEY=<service role key de producción>
//   set TEST_SUPABASE_URL=https://<proyecto-test>.supabase.co
//   set TEST_SUPABASE_SERVICE_ROLE_KEY=<service role key de test>
//   node scripts/migrar-grupos-clientes.js
//
// Requiere @supabase/supabase-js (ya es dependencia de dashboard-logistico).

const { createClient } = require("@supabase/supabase-js");

function requireEnv(nombre) {
  const valor = process.env[nombre];
  if (!valor) {
    console.error(`Falta la variable de entorno ${nombre}.`);
    process.exit(1);
  }
  return valor;
}

const prod = createClient(requireEnv("PROD_SUPABASE_URL"), requireEnv("PROD_SUPABASE_SERVICE_ROLE_KEY"));
const test = createClient(requireEnv("TEST_SUPABASE_URL"), requireEnv("TEST_SUPABASE_SERVICE_ROLE_KEY"));

async function main() {
  console.log("Leyendo grupos de clientes de producción...");
  const { data: gruposProd, error: errorGrupos } = await prod.from("despacho_grupos_clientes").select("id, nombre");
  if (errorGrupos) throw new Error(`Prod (despacho_grupos_clientes): ${errorGrupos.message}`);

  const { data: miembrosProd, error: errorMiembros } = await prod
    .from("despacho_grupos_clientes_miembros")
    .select("grupo_id, codigo_cliente");
  if (errorMiembros) throw new Error(`Prod (despacho_grupos_clientes_miembros): ${errorMiembros.message}`);

  console.log(`  ${gruposProd.length} grupos, ${miembrosProd.length} miembros en producción.`);

  console.log("Creando/actualizando los grupos en test (por nombre)...");
  const nombreAIdTest = new Map();
  for (const g of gruposProd) {
    const { data: upserted, error } = await test
      .from("despacho_grupos_clientes")
      .upsert({ nombre: g.nombre }, { onConflict: "nombre" })
      .select("id, nombre")
      .single();
    if (error) throw new Error(`Test (despacho_grupos_clientes, "${g.nombre}"): ${error.message}`);
    nombreAIdTest.set(g.nombre, upserted.id);
  }

  const idProdANombre = new Map(gruposProd.map((g) => [g.id, g.nombre]));

  console.log("Migrando miembros...");
  const miembrosParaTest = miembrosProd
    .map((m) => {
      const nombre = idProdANombre.get(m.grupo_id);
      const idTest = nombre ? nombreAIdTest.get(nombre) : null;
      if (!idTest) return null;
      return { grupo_id: idTest, codigo_cliente: m.codigo_cliente };
    })
    .filter(Boolean);

  const CHUNK = 500;
  let migrados = 0;
  for (let i = 0; i < miembrosParaTest.length; i += CHUNK) {
    const lote = miembrosParaTest.slice(i, i + CHUNK);
    const { error } = await test
      .from("despacho_grupos_clientes_miembros")
      .upsert(lote, { onConflict: "grupo_id,codigo_cliente" });
    if (error) throw new Error(`Test (despacho_grupos_clientes_miembros): ${error.message}`);
    migrados += lote.length;
  }

  console.log(`Listo: ${nombreAIdTest.size} grupos y ${migrados} miembros migrados/actualizados en test.`);
  console.log("No se borró nada existente en test -- solo se agregó/actualizó.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
