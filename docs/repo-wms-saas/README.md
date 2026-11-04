# wms-saas

WMS SaaS multi-cliente, nativo GS1 (GTIN, SSCC, GLN, QR Digital Link), pensado
para empresas con stock propio y operadores 3PL. Mercado inicial: Argentina.

> Nombre de trabajo, renombrable. Estado: etapa de desarrollo, **solo datos de prueba**.

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/spec-inicial.md`](docs/spec-inicial.md) | Especificación inicial: modelo de datos, funciones, API, fases |
| [`docs/hoja-de-ruta-integrada.md`](docs/hoja-de-ruta-integrada.md) | Spec + capa GS1, `owner_id`, LPN, fases ajustadas |
| [`docs/decisiones.md`](docs/decisiones.md) | Registro de decisiones |
| [`docs/dominio.md`](docs/dominio.md) | Glosario y procesos logísticos (a completar) |
| [`docs/operacion.md`](docs/operacion.md) | Cómo correr, desplegar y migrar (a completar) |
| [`CLAUDE.md`](CLAUDE.md) | Reglas para sesiones de Claude Code |

## Estructura

```
apps/
  web/     Next.js: supervisión y administración
  floor/   PWA React + Vite: operario (fase 2)
  api/     Fastify: API, jobs, integraciones
packages/
  contracts/  Esquemas Zod y tipos compartidos
  db/         Drizzle, migraciones SQL, funciones, seeds
  domain/     Lógica de negocio pura (incluye GS1)
  ui/         Componentes compartidos
  config/     tsconfig, eslint, prettier, tailwind
docs/
```

## Requisitos

- Node LTS y pnpm
- Git
- Docker Desktop (para la API y pruebas locales)
- Cuenta de Supabase (dos proyectos: `test` y `prod`)
- Opcional: CLI de Supabase

## Puesta en marcha (cuando exista el código de la fase 0)

```bash
pnpm install
cp .env.example .env      # completar con las claves del proyecto `test`
pnpm db:migrate           # aplica migraciones
pnpm dev                  # api + web en paralelo
```

Comandos de calidad previstos: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`. Los scripts son multiplataforma (Windows incluido).

## Entornos

| Entorno | Rama | Base | Hosting (etapa gratuita) |
|---|---|---|---|
| Producción | `main` | Supabase `prod` | Vercel (web), Cloudflare Pages (floor), Render (api) |
| Integración | `test` | Supabase `test` | Previews de los mismos proveedores |

Planes gratuitos: Supabase se pausa por inactividad y Render duerme la API;
actívalos antes de cada demo. Vercel Hobby es solo para desarrollo, no uso
comercial.

**Regla:** datos de clientes reales nunca en planes gratuitos. Antes del primer
cliente: Supabase Pro; con el primer cliente pago: Vercel Pro y plan pago de API.

## Flujo de trabajo

1. El trabajo va a la rama `test`; se mergea a `main` cuando está verificado.
2. Commits chicos y descriptivos.
3. Todo cambio de esquema va en una migración versionada.
4. Cada fase termina con sus pruebas en verde (ver la hoja de ruta integrada).

## Hoja de ruta resumida

| Fase | Contenido |
|---|---|
| 0 | Cimientos: monorepo, CI, auth, RLS, `owner_id`, parser GS1 |
| 1 | Maestros e importación, etiquetas de ubicación |
| 2 | Recepción, putaway, transferencias, PWA de piso |
| 3 | Pedidos, picking, packing y despacho |
| 4 | Conteo cíclico, ajustes y tableros |
| 5 | Outbox, API de integración, resolver `/id/...`, ZPL |
| 6 | Agentes, facturación 3PL, segundo país |

## Primeras tareas

Ver la sección 12 del spec, con los ajustes de la hoja de ruta integrada
(sección 5, fase 0). Después de cada bloque de tareas se detiene el trabajo y
se revisa el resultado antes de seguir.

## Licencia

Privado. Todos los derechos reservados.
