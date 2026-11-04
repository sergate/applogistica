# Registro de decisiones (borrador para copiar al repo `wms-saas`)

| # | Tema | Decisión | Estado |
|---|---|---|---|
| A1 | Lotes / vencimientos | Opcional por artículo (`items.tracking = 'none' \| 'lot'`); `lot_id` nullable. Series fuera del MVP. | Spec |
| A2 | Ubicaciones | Fijas por tipo; slotting automático fuera del MVP. | Spec |
| A3 | Multi-depósito | En el modelo; una sede en la UI del MVP. | Spec |
| A4 | Dueño de mercadería | **Revertida:** `owner_id` desde la primera migración, con un owner `own` por defecto por tenant. Motivo: se apunta a stock propio y 3PL; agregarlo después obligaría a reescribir claves, índices y RLS. | Aprobada |
| A5 | Ingreso de pedidos | CSV/Excel + API REST. | Spec |
| A6 | Etiquetas | PDF con Code 128; se agrega QR Digital Link y ZPL. Etiquetas de ubicación se adelantan a la fase 1. | Ajustada |
| A7 | Stock negativo | No permitido (constraint). | Spec |
| D1 | LPN / SSCC | `wms.lpns` y `lpn_id` nullable desde el inicio, apagado por bandera `features.lpn_enabled`. Mismo patrón que `lot_id`. | Aprobada |
| D2 | Stack | Se mantiene el del spec (Fastify + Drizzle + Vite PWA + Next). Dos apps al inicio (`api`, `web`); `floor` en la fase 2. | Aprobada |
| D3 | Funciones de stock | Migraciones SQL versionadas (no Drizzle). | Aprobada |
| D4 | Escaneos | `ops.scan_events` separado de `stock_movements`. | Aprobada |
| D5 | GS1 por tenant | `core.tenant_gs1` con prefijo y serial de SSCC con bloqueo transaccional. Modo sin prefijo con identificadores internos marcados no interoperables. | Aprobada |
| D6 | País | `country` y `timezone` en tenants y depósitos; lo fiscal fuera del núcleo. Argentina primero. | Aprobada |
| D7 | Pooling | Probar `set_config` por transacción con el pooler de Supabase desde la fase 0. | Aprobada |
