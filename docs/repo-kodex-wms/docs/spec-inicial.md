# Kodex WMS — Especificación inicial para desarrollo

> Documento para Claude Code. Producto: **Kodex WMS** (repo `kodex-wms`).
> Autor: José Manuel. Fecha: 2026-10-05. Estado: v0.1, alcance del MVP en definición.

---

## 0. Cómo usar este documento (instrucciones para Claude Code)

1. Leé el documento completo antes de escribir código.
2. Trabajá **por fases** (sección 9). No avances a la fase siguiente sin cumplir la "definición de terminado" de la actual.
3. Las decisiones marcadas como **ABIERTA** (sección 2) no las inventes: usá el valor por defecto indicado y dejá el punto anotado en `docs/decisiones.md`.
4. Si algo del dominio logístico no está claro, **preguntá antes de asumir**. El dominio lo conoce el autor (15 años de operación con WMS).
5. Todo cambio de esquema va en una migración versionada. Nunca modifiques la base a mano.
6. Cada fase termina con pruebas automatizadas en verde (sección 10).
7. El autor desarrolla en **Windows**: scripts del repo multiplataforma (Node/pnpm), sin depender de bash.
8. El autor prefiere recibir **archivos completos** y no parches o diffs cuando entregues código para revisar.
9. Commits chicos y descriptivos. Ramas: `main` = producción, `test` = integración/preview. El trabajo va a `test` y se mergea a `main` cuando está verificado.
10. No copies pantallas, código, documentación ni terminología protegida de WMS comerciales. Inspirate en procesos y buenas ideas, con diseño propio. No incluyas datos ni configuraciones confidenciales de ningún empleador o cliente.

---

## 1. Contexto y objetivo

Construir un **WMS en formato SaaS multi-cliente**, primer módulo de una suite (WMS → TMS → ERP).

- **Diferencial buscado:** combinar lo mejor de dos mundos que el autor usó durante años: un WMS tradicional sobre base de datos relacional de escritorio/servidor (11 años) y un WMS web de nivel enterprise (4 años). Objetivo: la potencia operativa del primero con la modernidad y la menor fricción del segundo, **con implementación rápida y pocas decisiones de configuración** (valores por defecto sensatos).
- **Cliente objetivo inicial:** a definir (3PL, ecommerce, distribución). El diseño admite *dueño de mercadería* por cliente para soportar 3PL más adelante.
- **Etapa actual:** desarrollo y demo con **servicios gratuitos**. Se migra a planes pagos al conseguir el primer cliente o tener una demo vendible.
- **Principio de producto:** menos clics por tarea del operario, visibilidad en tiempo real para el supervisor, correcciones sin necesidad de soporte técnico.

### Matriz de referencia (a completar por el autor — NO la rellenes vos)

| Proceso | Lo mejor del WMS tradicional | Lo mejor del WMS web enterprise | Qué frustra de ambos | Qué se hace por fuera del sistema |
|---|---|---|---|---|
| Recepción | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Putaway | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Reabastecimiento | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Picking | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Packing | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Despacho | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Inventario / ajustes | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |
| Reportes | _pendiente_ | _pendiente_ | _pendiente_ | _pendiente_ |

---

## 2. Decisiones

### 2.1 Tomadas

| Tema | Decisión |
|---|---|
| Orden de módulos | WMS → TMS → ERP (el ERP puede integrarse con sistemas existentes en vez de reemplazarlos) |
| Frontend | Next.js + TypeScript + Tailwind (stack ya conocido por el autor), con shadcn/ui, TanStack Query, TanStack Table, React Hook Form + Zod |
| PWA de piso | App separada, liviana (React + Vite), pensada para escaneo continuo y conexión inestable |
| API | Fastify (Node + TypeScript), organizada en módulos |
| ORM / migraciones | Drizzle |
| Validación | Zod compartido entre front y back (paquete `contracts`) |
| Base de datos | Postgres (Supabase). Solo Postgres estándar + Supabase Auth y Realtime; evitar otras dependencias propietarias |
| Jobs | pg-boss sobre la misma Postgres |
| Multi-tenant | Una base, `tenant_id` en cada tabla, Row Level Security |
| Monorepo | pnpm workspaces + Turborepo |
| Calidad | Vitest, Playwright, Sentry, CI en GitHub Actions |
| Idioma | Identificadores de código y base de datos en **inglés**; interfaz en **español (es-AR)** con i18n preparado |
| Infra de la etapa gratuita | Supabase Free, Vercel Hobby (solo desarrollo), Cloudflare Pages (PWA), Render free (API, se duerme por inactividad) |

### 2.2 Abiertas (usar el valor por defecto y registrar en `docs/decisiones.md`)

| # | Tema | Valor por defecto para el MVP |
|---|---|---|
| A1 | Lotes / vencimientos | **Opcional por artículo** (`items.tracking = 'none' \| 'lot'`). Tablas con `lot_id` nullable desde el día 1. Series: fuera del MVP |
| A2 | Ubicaciones | Ubicaciones fijas por tipo; stock en cualquier ubicación de almacenamiento. Slotting automático fuera del MVP |
| A3 | Multi-depósito | Soportado en el modelo (`warehouses`), una sola sede en la UI del MVP |
| A4 | Dueño de mercadería (3PL) | Columna `owner_id` **no** incluida en el MVP; se agregará en una migración posterior si se confirma 3PL |
| A5 | Ingreso de pedidos | Importación por CSV/Excel + API REST simple |
| A6 | Etiquetas | Generación de PDF con códigos de barras y etiquetas de ubicación (Code 128) |
| A7 | Stock negativo | **No permitido** (constraint en la base) |

---

## 3. Estructura del monorepo

```
kodex-wms/
├─ apps/
│  ├─ web/                  # Next.js — supervisión y administración (escritorio)
│  ├─ floor/                # React + Vite — PWA del operario (escaneo, tareas)
│  └─ api/                  # Fastify — API, jobs, integraciones
├─ packages/
│  ├─ contracts/            # Esquemas Zod + tipos compartidos (fuente única del contrato)
│  ├─ db/                   # Drizzle: esquema, migraciones, funciones SQL, seeds
│  ├─ domain/               # Lógica de negocio pura (sin framework web), testeable
│  ├─ ui/                   # Componentes compartidos (shadcn/ui personalizados)
│  └─ config/               # tsconfig, eslint, prettier, tailwind compartidos
├─ docs/
│  ├─ decisiones.md         # Registro de decisiones (ADR corto)
│  ├─ dominio.md            # Glosario y procesos logísticos
│  └─ operacion.md          # Cómo correr, desplegar, migrar
├─ .github/workflows/       # CI: lint, typecheck, test, build
├─ turbo.json
├─ pnpm-workspace.yaml
└─ package.json
```

Reglas:
- `domain` no importa nada de Fastify, Next ni React.
- `apps/*` dependen de `packages/*`, nunca entre sí.
- Variables de entorno **solo** vía `.env` validadas con Zod al arrancar. Sin URLs ni claves fijas en el código.
- La API se empaqueta con un **Dockerfile** (debe correr igual en Render, Railway o cualquier host).

---

## 4. Principios de arquitectura

1. **Libro de movimientos inmutable.** Todo cambio de stock es un asiento en `wms.stock_movements`. Nunca se hace `UPDATE` directo sobre saldos desde la aplicación. Los asientos no se editan ni se borran: se corrigen con asientos compensatorios.
2. **Saldos derivados y transaccionales.** `wms.stock_balances` se actualiza **en la misma transacción** que el asiento, mediante funciones SQL. Hay un job de conciliación que verifica `saldo == suma de asientos`.
3. **Operaciones críticas = funciones transaccionales en Postgres** (recibir, mover, reservar, confirmar picking, despachar, ajustar). El frontend nunca orquesta varias llamadas para una operación de stock.
4. **Idempotencia.** Cada operación de escritura de stock recibe un `idempotency_key` (único por tenant). Reintentos por mala conexión no duplican movimientos.
5. **Concurrencia segura.** Bloqueos a nivel de fila (`SELECT ... FOR UPDATE`) sobre los saldos afectados, siempre en orden determinístico para evitar deadlocks.
6. **Multi-tenant con RLS como defensa en profundidad.** La API ejecuta cada request dentro de una transacción donde se setean los claims del JWT del usuario; las políticas RLS filtran por `tenant_id`. La **clave service-role queda solo para tareas administrativas acotadas** (crear usuarios, jobs de sistema), nunca para consultas de datos comunes.
7. **Esquemas Postgres por módulo:** `core`, `wms` (luego `tms`, `erp`) y `ops` (outbox, auditoría).
8. **Eventos entre módulos vía outbox.** El WMS registra hechos de dominio en `ops.outbox_events`; un job los publica a consumidores (TMS futuro, webhooks).
9. **Paginación obligatoria** en toda lista. Prohibido depender de límites implícitos del cliente de la base (hubo truncamientos silenciosos de 1000 filas en un proyecto anterior). Agregaciones se calculan en la base.
10. **Auditoría:** toda acción de escritura registra usuario, momento y origen (`web`, `floor`, `api`, `import`).

---

## 5. Modelo de datos — núcleo (`core`)

Convenciones: `id uuid primary key default gen_random_uuid()`, `tenant_id uuid not null`, `created_at timestamptz default now()`, `created_by uuid`, `updated_at timestamptz`. Cantidades `numeric(18,3)`. Códigos de negocio `text` (nunca numéricos, para no perder ceros a la izquierda).

```sql
-- Organizaciones (clientes del SaaS)
core.tenants (id, name, slug unique, plan text default 'trial', active bool default true, created_at)

-- Usuarios: la identidad vive en Supabase Auth (auth.users). Esta tabla es el perfil.
core.user_profiles (user_id uuid pk references auth.users, full_name, locale default 'es-AR')

-- Pertenencia usuario <-> organización, con rol
core.tenant_members (tenant_id, user_id, role_id, active bool, primary key (tenant_id, user_id))

-- Roles y permisos (reemplaza el registro central de secciones: cada permiso es una clave)
core.roles (id, tenant_id, name, is_system bool)
core.role_permissions (role_id, permission_key text, primary key (role_id, permission_key))
-- permission_key ejemplos: 'wms.receiving.read', 'wms.receiving.write', 'wms.picking.execute', 'admin.users.manage'

-- Socios comerciales: clientes, proveedores y (a futuro) transportistas
core.partners (id, tenant_id, code, name, tax_id, kinds text[] check (kinds <@ array['customer','supplier','carrier']), active bool)
core.partner_addresses (id, tenant_id, partner_id, label, street, city, state, postal_code, country, is_default bool)

-- Unidades de medida
core.uoms (id, tenant_id, code, name)

-- Artículos
core.items (
  id, tenant_id, sku text, name, description,
  base_uom_id, tracking text default 'none' check (tracking in ('none','lot')),
  weight_kg numeric(12,3), volume_m3 numeric(12,6),
  active bool default true,
  unique (tenant_id, sku)
)
-- Códigos de barras (un artículo puede tener varios; cada uno con su factor de embalaje)
core.item_barcodes (id, tenant_id, item_id, barcode text, uom_id, units_per_pack numeric(18,3) default 1,
  unique (tenant_id, barcode))

-- Auditoría de acciones de escritura
ops.audit_log (id, tenant_id, user_id, action text, entity text, entity_id uuid, origin text, payload jsonb, at timestamptz default now())

-- Outbox de eventos de dominio
ops.outbox_events (id, tenant_id, aggregate text, aggregate_id uuid, event_type text, payload jsonb,
  created_at, published_at timestamptz null)
```

### Patrón de RLS (aplicar a TODA tabla con `tenant_id`)

```sql
alter table <tabla> enable row level security;
alter table <tabla> force row level security;

create policy tenant_isolation on <tabla>
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());
```

`core.current_tenant_id()` lee `tenant_id` de los claims del JWT de la sesión (o de una configuración local de la transacción que setea la API tras validar la membresía del usuario). Debe haber un test automatizado que pruebe que un usuario del tenant A **no puede leer ni escribir** datos del tenant B en **todas** las tablas.

---

## 6. Modelo de datos — WMS (`wms`)

### 6.1 Estructura física

```sql
wms.warehouses (id, tenant_id, code, name, address, active bool, unique (tenant_id, code))

wms.locations (
  id, tenant_id, warehouse_id, code text, name,
  type text check (type in ('receiving','storage','picking','packing','shipping','quarantine','adjustment')),
  zone text, aisle text, bay text, level text, position text,   -- estructura opcional
  pickable bool default false,
  active bool default true,
  max_weight_kg numeric(12,3), max_volume_m3 numeric(12,6),
  unique (tenant_id, warehouse_id, code)
)
```

### 6.2 Lotes

```sql
wms.lots (id, tenant_id, item_id, lot_code text, expiry_date date null, created_at,
  unique (tenant_id, item_id, lot_code))
```

### 6.3 Libro de movimientos y saldos (PIEZA CENTRAL)

```sql
create type wms.movement_type as enum (
  'receipt',        -- ingreso a ubicación de recepción (from null -> to)
  'putaway',        -- recepción -> almacenamiento
  'transfer',       -- entre ubicaciones
  'pick',           -- almacenamiento/picking -> ubicación de packing
  'ship',           -- salida del depósito (from -> null)
  'adjust_in',      -- ajuste positivo (from null -> to)
  'adjust_out',     -- ajuste negativo (from -> null)
  'count_adjust'    -- ajuste originado en inventario cíclico
);

wms.stock_movements (
  id uuid pk,
  tenant_id, warehouse_id,
  item_id, lot_id null,
  from_location_id null, to_location_id null,
  qty numeric(18,3) not null check (qty > 0),
  movement_type wms.movement_type not null,
  reason_code text null,                       -- obligatorio en ajustes
  ref_type text null, ref_id uuid null,        -- documento origen (inbound_order, pick_task, etc.)
  idempotency_key text not null,
  created_by uuid, created_at timestamptz default now(),
  unique (tenant_id, idempotency_key),
  check (from_location_id is not null or to_location_id is not null),
  check (from_location_id is distinct from to_location_id)
)
-- Inmutabilidad: revoke update, delete + trigger que lanza excepción ante UPDATE/DELETE.

wms.stock_balances (
  tenant_id, warehouse_id, location_id, item_id,
  lot_id null,
  on_hand   numeric(18,3) not null default 0 check (on_hand >= 0),
  allocated numeric(18,3) not null default 0 check (allocated >= 0 and allocated <= on_hand),
  updated_at timestamptz
)
-- Unicidad con lote nullable:
-- create unique index on wms.stock_balances
--   (tenant_id, warehouse_id, location_id, item_id, coalesce(lot_id, '00000000-0000-0000-0000-000000000000'));
```

Vista `wms.v_stock_available` = `on_hand - allocated` por artículo/ubicación/lote.

### 6.4 Ingresos

```sql
wms.inbound_orders (
  id, tenant_id, warehouse_id, number text, supplier_id null,
  status text check (status in ('draft','open','receiving','received','closed','cancelled')),
  expected_date date, notes, created_by, created_at,
  unique (tenant_id, number)
)
wms.inbound_order_lines (
  id, tenant_id, inbound_order_id, line_no int, item_id,
  expected_qty numeric(18,3), received_qty numeric(18,3) default 0,
  unique (inbound_order_id, line_no)
)
wms.putaway_tasks (
  id, tenant_id, warehouse_id, item_id, lot_id null, qty,
  from_location_id, suggested_location_id null, to_location_id null,
  status text check (status in ('pending','in_progress','done','cancelled')),
  assigned_to null, completed_at null
)
```

### 6.5 Salidas

```sql
wms.outbound_orders (
  id, tenant_id, warehouse_id, number text, customer_id null, ship_to_address_id null,
  status text check (status in ('draft','released','allocated','picking','picked','packing','packed','shipped','cancelled')),
  priority int default 5, due_date date null, carrier_hint text null,
  created_by, created_at,
  unique (tenant_id, number)
)
wms.outbound_order_lines (
  id, tenant_id, outbound_order_id, line_no int, item_id,
  ordered_qty, allocated_qty default 0, picked_qty default 0, shipped_qty default 0,
  unique (outbound_order_id, line_no)
)
-- Reservas de stock (alimentan stock_balances.allocated)
wms.allocations (
  id, tenant_id, outbound_order_line_id, item_id, lot_id null, location_id, qty,
  status text check (status in ('active','picked','released'))
)
wms.pick_tasks (
  id, tenant_id, warehouse_id, outbound_order_id, outbound_order_line_id, allocation_id,
  item_id, lot_id null, from_location_id, to_location_id,   -- to = ubicación de packing
  qty, picked_qty default 0,
  status text check (status in ('pending','in_progress','done','short','cancelled')),
  assigned_to null, started_at, completed_at
)
wms.packages (id, tenant_id, outbound_order_id, package_no int, weight_kg null, label_code text)
wms.package_lines (id, tenant_id, package_id, item_id, lot_id null, qty)
wms.shipments (
  id, tenant_id, warehouse_id, number text, status text check (status in ('open','shipped')),
  carrier_name text null, tracking_ref text null, shipped_at null, shipped_by null,
  unique (tenant_id, number)
)
wms.shipment_orders (shipment_id, outbound_order_id, primary key (shipment_id, outbound_order_id))
```

### 6.6 Inventario cíclico

```sql
wms.count_sessions (id, tenant_id, warehouse_id, name, scope jsonb,   -- zona / ubicaciones / artículos
  status text check (status in ('open','counting','review','closed')), created_by, created_at)
wms.count_lines (id, tenant_id, session_id, location_id, item_id, lot_id null,
  system_qty numeric(18,3), counted_qty numeric(18,3) null, counted_by null, counted_at null,
  status text check (status in ('pending','counted','approved','rejected')))
```

---

## 7. Funciones transaccionales críticas (SQL / PL/pgSQL en `packages/db`)

Todas: reciben `p_tenant_id`, `p_user_id`, `p_idempotency_key`; son idempotentes; escriben asiento + saldos + outbox + auditoría en una sola transacción; bloquean saldos en orden determinístico; devuelven el resultado.

| Función | Qué hace | Evento de outbox |
|---|---|---|
| `wms.fn_receive(inbound_line_id, qty, lot, to_location_id, key)` | Asiento `receipt`; actualiza `received_qty`; crea tarea de putaway | `wms.goods_received` |
| `wms.fn_putaway(task_id, to_location_id, key)` | Asiento `putaway`; cierra tarea | `wms.putaway_completed` |
| `wms.fn_transfer(item, lot, from, to, qty, key)` | Asiento `transfer` | `wms.stock_transferred` |
| `wms.fn_allocate_order(outbound_order_id)` | Reserva stock (estrategia por defecto: FEFO si hay lotes con vencimiento, si no FIFO por fecha de ingreso); incrementa `allocated`; genera `pick_tasks` | `wms.order_allocated` |
| `wms.fn_confirm_pick(task_id, picked_qty, key)` | Asiento `pick`; libera `allocated`; maneja faltante (`short`) | `wms.pick_confirmed` |
| `wms.fn_pack(...)` / `wms.fn_close_package(...)` | Arma bultos; valida cantidades vs. picking | `wms.order_packed` |
| `wms.fn_ship_shipment(shipment_id, key)` | Asientos `ship`; cierra pedidos; arma datos de remito | `wms.order_shipped` |
| `wms.fn_adjust(item, lot, location, delta, reason, key)` | `adjust_in` / `adjust_out`; **motivo obligatorio** | `wms.stock_adjusted` |
| `wms.fn_close_count_session(session_id)` | Genera `count_adjust` por diferencias aprobadas | `wms.count_closed` |
| `wms.fn_reconcile_balances(tenant_id)` | Verifica `saldo == suma de asientos`; reporta diferencias | — |

---

## 8. API (Fastify) — lineamientos

- REST bajo `/v1`, JSON, validación con Zod en entrada y salida (esquemas de `packages/contracts`).
- Autenticación: JWT de Supabase Auth. Middleware resuelve el tenant activo y los permisos (`permission_key`) del usuario; **cada ruta declara el permiso que exige**. No debe haber rutas de datos sin chequeo de sesión y permiso.
- Errores con formato uniforme (`code`, `message`, `details`), códigos de negocio estables (ej. `INSUFFICIENT_STOCK`, `LOCATION_TYPE_INVALID`).
- Todas las listas: `limit`, `cursor` o `page`, orden explícito, total opcional.
- Escrituras de stock: header `Idempotency-Key` obligatorio.
- Documentación OpenAPI generada desde los esquemas Zod.
- Realtime: tableros del supervisor suscriptos a Supabase Realtime; el operario recibe tareas por polling corto o Realtime.

---

## 9. Hoja de ruta por fases (con definición de terminado)

### Fase 0 — Cimientos
- Monorepo, linters, TS estricto, CI (lint + typecheck + test + build).
- Proyectos Supabase `test` y `prod`; migraciones corren contra ambos por pipeline.
- Auth, `tenants`, `tenant_members`, roles y permisos, helper `core.current_tenant_id()`, plantilla de RLS.
- Panel de administración mínimo: usuarios, roles, permisos.
- **Terminado cuando:** existe test automatizado de aislamiento entre dos tenants, y un usuario sin permiso recibe 403 en cada ruta protegida.

### Fase 1 — Maestros e importación
- ABM de artículos, códigos de barras, ubicaciones, depósitos, socios comerciales.
- Importación CSV/Excel de maestros con validación fila a fila, reporte de errores descargable y modo "reemplazar por clave" que **solo** afecta las filas del archivo.
- Códigos como texto (sin pérdida de ceros).
- **Terminado cuando:** se importan 50.000 artículos de prueba sin errores de tipo y con paginación correcta en pantalla.

### Fase 2 — Stock: recepción, putaway, transferencias
- Libro de movimientos inmutable, saldos, funciones de la sección 7 (receive, putaway, transfer, adjust).
- PWA de piso: login, lista de tareas, escaneo (lector tipo teclado y cámara), confirmación.
- Consulta de stock por artículo / ubicación / lote.
- **Terminado cuando:** pruebas de invariantes y de concurrencia en verde (sección 10) y un ingreso completo se puede ejecutar de punta a punta desde el celular.

### Fase 3 — Salidas: pedidos, reserva, picking, packing, despacho
- Importación y alta de pedidos; asignación; generación de tareas de picking; confirmación en PWA con manejo de faltantes; packing con bultos y etiquetas; despacho y datos para remito.
- **Terminado cuando:** un pedido recorre `released → shipped` con stock consistente, y dos operarios compitiendo por el mismo stock no generan sobreventa.

### Fase 4 — Inventario cíclico, ajustes y tableros
- Sesiones de conteo, aprobación de diferencias, ajustes con motivo.
- Tableros del supervisor: estado de pedidos, avance de picking, productividad por operario, stock por zona, ajustes.
- **Terminado cuando:** un conteo genera ajustes trazables hasta el usuario que los aprobó.

### Fase 5 — Eventos, integraciones y etiquetas
- Publicación de `outbox_events` (webhooks configurables), API de integración para pedidos y stock, job de conciliación, impresión de etiquetas PDF.
- **Terminado cuando:** un sistema externo de prueba recibe `order_shipped` y puede crear pedidos por API con idempotencia.

> Fuera del MVP (no implementar): slotting inteligente, olas de picking avanzadas, cross-docking, kitting, automatización (carruseles/sorters), facturación 3PL, series, TMS y ERP.

---

## 10. Pruebas obligatorias

1. **Invariantes del libro:** nunca saldo negativo; `allocated <= on_hand`; un asiento no se puede editar ni borrar; `fn_reconcile_balances` devuelve cero diferencias tras cada suite.
2. **Concurrencia:** N picks simultáneos sobre el mismo saldo; N reservas simultáneas; resultado correcto y sin deadlocks.
3. **Idempotencia:** repetir la misma operación con la misma clave no duplica asientos.
4. **Aislamiento multi-tenant (RLS):** matriz que recorre **todas** las tablas con `tenant_id`.
5. **Permisos:** cada ruta de la API rechaza a un usuario sin el permiso requerido.
6. **E2E (Playwright):** flujo de ingreso, flujo de salida, importación de maestros.
7. **Rendimiento básico:** consultas de stock y de tareas con 1.000.000 de movimientos de prueba bajo un umbral definido en `docs/operacion.md`.

---

## 11. Infraestructura por etapa

### Etapa actual (gratuita, solo datos de prueba)
- Base/Auth/Realtime: Supabase Free (se pausa por inactividad: activarlo antes de cada demo).
- `apps/web`: Vercel Hobby (uso no comercial, solo desarrollo).
- `apps/floor`: Cloudflare Pages.
- `apps/api`: Render (plan gratuito; se duerme, la primera llamada tarda: despertarlo antes de una demo).
- Jobs: pg-boss sobre la misma Postgres.

### Al conseguir el primer cliente o tener una demo vendible
1. Supabase **Pro** (backups diarios, sin pausa) — antes de cargar datos reales de cualquier cliente.
2. API a un plan pago de entrada (Render Starter o Railway).
3. Vercel **Pro** para `apps/web`.

**Regla:** datos de clientes reales nunca en planes gratuitos.

### Portabilidad
Todo por variables de entorno; API en Docker; solo Postgres estándar; migraciones versionadas.

---

## 12. Primeras tareas concretas para Claude Code

1. Crear el monorepo según la sección 3 con pnpm + Turborepo y la configuración compartida.
2. Configurar CI en GitHub Actions (lint, typecheck, test, build).
3. En `packages/db`: Drizzle, migración inicial con esquemas `core`, `wms`, `ops`, tablas de la sección 5 y helper `core.current_tenant_id()` + plantilla de RLS.
4. En `apps/api`: Fastify con validación de entorno (Zod), health check, middleware de autenticación y permisos, un endpoint de ejemplo protegido.
5. Test de aislamiento entre dos tenants (sección 10, punto 4) corriendo en CI.
6. Crear `docs/decisiones.md` con las decisiones abiertas A1–A7 y sus valores por defecto.
7. Detenerse y mostrar el resultado antes de empezar la Fase 1.
