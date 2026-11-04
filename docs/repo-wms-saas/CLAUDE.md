# CLAUDE.md – wms-saas

WMS SaaS multi-cliente, nativo GS1, primer módulo de una suite (WMS → TMS → ERP).
Mercado inicial: Argentina (stock propio y 3PL). Luego otros países de Sudamérica.

## Antes de escribir código

1. Leé `docs/spec-inicial.md`, `docs/hoja-de-ruta-integrada.md` y `docs/decisiones.md`.
2. Ante contradicción manda el spec, salvo los cambios aprobados en la hoja de
   ruta integrada (`owner_id` desde el inicio, `lpn_id` nullable).
3. Trabajá por fases. No avances a la siguiente sin cumplir la definición de
   terminado de la actual. Al terminar cada bloque de tareas, detenete y
   mostrá el resultado.
4. Las decisiones **ABIERTAS** no se inventan: usá el valor por defecto de
   `docs/decisiones.md` y anotá el punto ahí.
5. Si algo del dominio logístico no está claro, **preguntá antes de asumir**.
   El autor tiene 15 años de operación con WMS.

## Stack

- Monorepo pnpm + Turborepo.
- `apps/web`: Next.js + TypeScript + Tailwind + shadcn/ui + TanStack Query/Table + React Hook Form + Zod.
- `apps/floor`: PWA React + Vite (entra en la fase 2).
- `apps/api`: Fastify + TypeScript, en Docker.
- `packages/db`: Drizzle (tablas) + migraciones SQL a mano (funciones PL/pgSQL).
- `packages/contracts`: esquemas Zod compartidos. `packages/domain`: lógica pura.
- Postgres (Supabase: solo Postgres estándar + Auth + Realtime), pg-boss, Vitest, Playwright, Sentry, GitHub Actions.

## Reglas de arquitectura (no negociables)

- `domain` no importa Fastify, Next ni React. Las apps dependen de `packages/*`, nunca entre sí.
- Todo cambio de stock es un asiento en `wms.stock_movements`: inmutable, sin
  UPDATE ni DELETE; se corrige con asientos compensatorios.
- `wms.stock_balances` se actualiza en la **misma transacción** que el asiento,
  mediante funciones SQL. Nunca por UPDATE directo desde la aplicación.
- Operaciones críticas (recibir, mover, reservar, picking, despachar, ajustar)
  son funciones transaccionales en Postgres. El front no orquesta varias
  llamadas para una operación de stock.
- Escrituras de stock con `Idempotency-Key` obligatoria (único por tenant).
- Bloqueos con `SELECT ... FOR UPDATE` en orden determinístico.
- Multi-tenant: `tenant_id` en toda tabla, RLS habilitada y forzada. Cada
  request corre en una transacción con los claims seteados por `set_config(..., true)`.
  La clave service-role solo para tareas administrativas acotadas.
- `owner_id` obligatorio en las tablas de negocio (ver hoja de ruta integrada).
  `lpn_id` y `lot_id` nullable; LPN apagado por `features.lpn_enabled`.
- Los escaneos se registran en `ops.scan_events`; no mueven stock por sí solos.
- Paginación obligatoria en toda lista. Agregaciones en la base.
- Auditoría de toda escritura: usuario, momento, origen (`web`, `floor`, `api`, `import`).
- Eventos de dominio vía `ops.outbox_events`.
- Cantidades `numeric(18,3)`. Códigos de negocio (SKU, GTIN, SSCC, GLN) siempre `text`.
- Stock negativo no permitido (constraint en la base).

## Convenciones

- Código e identificadores de base en **inglés**; interfaz en **español (es-AR)** con i18n.
- Cada ruta de la API declara el permiso que exige; sin rutas de datos sin sesión y permiso.
- Errores uniformes (`code`, `message`, `details`) con códigos de negocio estables.
- Variables de entorno solo por `.env`, validadas con Zod al arrancar. Nada de
  URLs ni claves en el código.
- Todo cambio de esquema va en una migración versionada. Nunca se toca la base a mano.
- Lógica GS1 (parser, validación, generación de SSCC) en `packages/domain/gs1`.
- Nada fiscal ni específico de país dentro del núcleo.

## Flujo de trabajo

- Entorno del autor: **Windows**. Scripts multiplataforma (Node/pnpm), sin depender de bash.
- Entregá **archivos completos**, no parches ni diffs, cuando el código es para revisar.
- Commits chicos y descriptivos. `main` = producción, `test` = integración/preview.
  El trabajo va a `test` y se mergea a `main` cuando está verificado.
- No hagas push a `main`. No crees pull requests salvo que se pida.

## Pruebas obligatorias por fase

Invariantes del libro (sin saldo negativo, `allocated <= on_hand`, asientos
inmutables, conciliación en cero), concurrencia, idempotencia, aislamiento por
tenant y por owner en todas las tablas, permisos por ruta, E2E con Playwright
y rendimiento básico. Detalle en la hoja de ruta integrada, sección 6.

## Seguridad

- Nunca cargues datos de clientes reales en planes gratuitos.
- No commitees claves, `.env` ni credenciales. La `service_role` no sale del servidor.
- No copies pantallas, código, documentación ni terminología protegida de WMS
  comerciales, ni datos o configuraciones confidenciales de empleadores o
  clientes. Los estándares GS1 sí se pueden usar.

## Fuera del MVP (no implementar)

Slotting inteligente, olas avanzadas, cross-docking, kitting, automatización,
facturación 3PL, series, TMS y ERP.
