# Hoja de ruta integrada – Kodex WMS (spec inicial + capa GS1)

Versión 1.0. Integra `spec-inicial.md` (v0.1, J. Manuel) con la capa
GS1 / multi-país descripta en `arquitectura-kodex-wms.md`.

**Producto: Kodex WMS (repo `kodex-wms`).**

**Regla de precedencia:** ante una contradicción gana el spec inicial, salvo
en los cambios listados en la sección 2, que están aprobados.

Mercado: stock propio y 3PL, Argentina primero; luego otros países de
Sudamérica.

---

## 1. Stack (confirmado)

Se mantiene el stack del spec: monorepo pnpm + Turborepo; `apps/web`
(Next.js + TypeScript + Tailwind + shadcn/ui + TanStack Query/Table + React
Hook Form + Zod), `apps/floor` (PWA React + Vite), `apps/api` (Fastify),
Drizzle, Postgres/Supabase (Auth + Realtime), pg-boss, Vitest, Playwright,
Sentry, GitHub Actions.

Ajustes de ejecución:

1. **Dos apps al inicio.** Fases 0 y 1 con `api` + `web`; `floor` entra en la
   fase 2.
2. **Funciones de stock como migraciones SQL versionadas.** Drizzle modela
   tablas; el PL/pgSQL va en archivos `.sql` dentro de `packages/db`.
3. **Pooling de conexiones probado en la fase 0.** RLS con claims por
   request usa `set_config(..., true)` dentro de la transacción; debe haber
   un test que verifique que funciona con el pooler de Supabase en modo
   transacción.
4. **Realtime solo para tableros del supervisor.** La coordinación de tareas
   vive en la base.

---

## 2. Cambios aprobados sobre el spec inicial

### 2.1 Dueño de mercadería (revierte A4)

`owner_id` entra al modelo desde la primera migración.

- `core.owners (id, tenant_id, code, name, kind check in ('own','third_party'), active)`.
- Cada tenant se crea con un owner `own` por defecto; la UI no lo muestra
  mientras haya un solo owner.
- `owner_id not null` en: `items`, `lots`, `stock_movements`,
  `stock_balances`, `inbound_orders`, `outbound_orders`, `allocations`,
  `count_lines` y `lpns`.
- Entra en la clave única de `stock_balances` y en los índices de consulta.
- RLS sigue por `tenant_id`; los usuarios de un cliente 3PL se restringen
  además por `owner_id` mediante `core.user_owner_scopes (tenant_id, user_id, owner_id)`.
- Unicidad: `items (tenant_id, owner_id, sku)` y `item_barcodes (tenant_id, barcode)`
  se mantiene por tenant para que un escaneo resuelva sin ambigüedad.

### 2.2 LPN / SSCC opcional

Se trata igual que `lot_id`: presente en el esquema, apagado en el MVP.

- `wms.lpns (id, tenant_id, owner_id, warehouse_id, sscc text, status, location_id null, created_at, unique (tenant_id, sscc))`.
- `lpn_id uuid null` en `stock_movements`, `stock_balances` y `pick_tasks`.
- Índice único de `stock_balances` incluye
  `coalesce(lpn_id, '00000000-0000-0000-0000-000000000000')`.
- Bandera por tenant `features.lpn_enabled` (default `false`). Con la bandera
  apagada, `lpn_id` queda siempre `null`.
- `wms.packages.label_code` almacena el SSCC del bulto cuando el tenant tiene
  prefijo GS1.

---

## 3. Cambios menores al modelo

| Tema | Cambio |
|---|---|
| Lecturas de escaneo | Nueva tabla `ops.scan_events (id, tenant_id, ts, user_id, device_id, raw_value, parsed jsonb, context, location_id null, result)`. Un escaneo no mueve stock; los movimientos siguen solo en `stock_movements`. |
| GS1 por tenant | `core.tenant_gs1 (tenant_id, company_prefix, prefix_length, next_sscc_serial bigint)`; el serial se incrementa con bloqueo transaccional. |
| GTIN | `item_barcodes` suma `symbology text` (`ean13`, `gs1_128`, `qr_dl`, `code128`, ...) y `is_gtin bool`; validación de dígito verificador en el dominio y con `check`. |
| GLN | `wms.warehouses.gln text null`; `wms.locations.gln_extension text null`. |
| País y hora | `core.tenants.country text`, `wms.warehouses.country`, `wms.warehouses.timezone`. |
| Dominios | `core.tenant_domains (tenant_id, host unique, purpose)` para el resolver público (fase 5). |
| Lotes por escaneo | La recepción puede crear `wms.lots` a partir del AI (10) y (17); el lote sigue siendo único por `(tenant_id, owner_id, item_id, lot_code)`. |

---

## 4. Módulos nuevos de código

- `packages/domain/gs1/`: parser GS1 Element String, parser Digital Link,
  validación de GTIN/SSCC/GLN (módulo 10), generador de SSCC. Lógica pura,
  sin framework, con tests exhaustivos.
- `packages/contracts/`: esquemas Zod de los identificadores GS1 y de las
  respuestas del resolver.
- `apps/api/modules/resolver/`: ruta pública `/id/...` (fase 5).

---

## 5. Hoja de ruta por fases

Cada fase conserva la definición de terminado del spec; se agrega lo indicado.

### Fase 0 – Cimientos
- Todo lo del spec (monorepo, CI, Supabase test/prod, auth, tenants, roles,
  RLS, panel mínimo).
- Esquema con `owner_id`, `lpn_id` nullable, `tenant_gs1`, `country`, `timezone`.
- Parser GS1 y generador de SSCC con tests.
- Test de pooling con claims por transacción.
- **Terminado cuando:** además de lo del spec, la matriz RLS cubre `owner_id`
  y el parser GS1 pasa su suite contra casos de la especificación GS1.

### Fase 1 – Maestros e importación
- Todo lo del spec, con owners, validación de GTIN, GLN en depósitos y
  ubicaciones.
- Etiquetas de ubicación (se adelantan desde la fase 5): PDF con Code 128 y QR.
- **Terminado cuando:** además, se importan 50.000 artículos con GTIN válidos
  e inválidos y el reporte de errores identifica cada fila.

### Fase 2 – Stock: recepción, putaway, transferencias
- Todo lo del spec.
- Recepción por escaneo GS1 (GTIN + lote + vencimiento sin tipear) y registro
  en `ops.scan_events`.
- LPN opcional detrás de la bandera.
- **Terminado cuando:** además, un ingreso por escaneo de caja con lote y
  vencimiento crea el lote y el asiento sin tipear datos.

### Fase 3 – Salidas
- Todo lo del spec.
- Verificación de carga por escaneo contra el pedido.
- SSCC en bultos; etiqueta de bulto con QR.
- **Terminado cuando:** además, un despacho con un bulto no escaneado queda
  bloqueado hasta resolverse.

### Fase 4 – Conteo, ajustes y tableros
- Todo lo del spec.
- Conteo cíclico por QR de ubicación desde la PWA.

### Fase 5 – Eventos, integraciones y resolver
- Todo lo del spec.
- Resolver público `/id/...` con las tres respuestas (interna, estándar,
  pública) y dominios por tenant.
- Impresión ZPL.

### Fase 6 – Después del MVP
- Agentes (consumen `ops.outbox_events`; solo proponen).
- Facturación 3PL a partir de movimientos y tareas por owner; portal de cliente.
- Localización al segundo país.

---

## 6. Pruebas adicionales

1. **Aislamiento por owner:** un usuario con alcance a un owner no lee ni
   escribe datos de otro owner del mismo tenant.
2. **GS1:** vectores de prueba de dígito verificador, parseo de Element
   String con y sin separadores, y Digital Link con parámetros de consulta.
3. **SSCC:** generación concurrente sin duplicados.
4. **LPN apagado:** con la bandera en `false`, ninguna operación escribe
   `lpn_id`.
5. **Idempotencia de escaneos:** reenviar el mismo lote offline no duplica
   `scan_events` ni asientos.

---

## 7. Fuera del MVP (sin cambios)

Slotting inteligente, olas avanzadas, cross-docking, kitting, automatización,
facturación 3PL, series, TMS y ERP. La facturación 3PL queda posible gracias a
`owner_id` y al libro de movimientos.
