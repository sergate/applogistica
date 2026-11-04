# Prompt para la primera sesión en el repo kodex-wms

Pegar como primer mensaje:

---

Leé `CLAUDE.md`, `docs/spec-inicial.md`, `docs/hoja-de-ruta-integrada.md` y `docs/decisiones.md` completos antes de escribir código.

Objetivo de esta sesión: **Fase 0, tareas 1 a 3** del spec (sección 12), con los ajustes de la hoja de ruta integrada:

1. Monorepo según la sección 3 del spec (pnpm + Turborepo + configuración compartida). Empezá solo con `apps/api`, `apps/web` y los `packages/*`; `apps/floor` queda para la fase 2.
2. CI en GitHub Actions: lint, typecheck, test y build.
3. En `packages/db`: Drizzle, migración inicial con los esquemas `core`, `wms` y `ops`, `owner_id` y `lpn_id` nullable según la hoja de ruta integrada, `core.current_tenant_id()` y la plantilla de RLS. Las funciones PL/pgSQL van como migraciones SQL.

Reglas de la sesión:
- Trabajá en la rama `test`. No hagas push a `main` ni abras pull requests.
- No inventes decisiones abiertas: usá los valores por defecto y anotalos en `docs/decisiones.md`.
- Credenciales solo desde variables de entorno; nunca en el repo.
- Si algo del dominio no está claro, preguntá.
- Al terminar la tarea 3, detenete y mostrame el resultado, incluyendo qué tests corriste y su resultado. No sigas con la API.
