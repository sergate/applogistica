# Arquitectura base – WMS SaaS nativo GS1

> **Nota:** este borrador queda subordinado a `hoja-de-ruta-integrada.md`. Donde difieran (stack, nombres de tablas, `owner_id`, LPN, orden de fases), manda ese documento y el spec inicial.

Borrador v0.1. Alcance: empresas con stock propio y operadores 3PL, mercado
inicial Argentina, expansión posterior a otros países de Sudamérica.

## 1. Principios

1. **Nativo GS1:** GTIN, SSCC, GLN y GRAI son claves del modelo, no campos extra.
2. **Event sourcing liviano:** todo movimiento es un evento inmutable; el stock
   es una proyección de esos eventos.
3. **Multi-tenant desde el día uno:** `tenant_id` en todas las tablas + RLS.
4. **Configuración como datos:** reglas de negocio por tenant, no código.
5. **Dueño del stock explícito:** soporta stock propio y 3PL con el mismo modelo.
6. **Localización desacoplada:** país, moneda, impuestos y documentos fiscales
   son módulos por país, no parte del núcleo.
7. **Offline-first en el dispositivo:** el escaneo no depende de la conexión.

## 2. Jerarquía de entidades

```
tenant (empresa que contrata el SaaS)
 ├─ owner (dueño del stock: el propio tenant o un cliente del 3PL)
 ├─ warehouse (depósito)
 │    └─ zone → location (GLN + extensión)
 ├─ item (artículo, GTIN)
 ├─ lpn (SSCC: pallet / unidad logística)
 └─ users / roles
```

- En empresa con stock propio: un único `owner` (el mismo tenant).
- En 3PL: un `owner` por cliente del operador; todo el stock, las reglas y la
  facturación se segmentan por `owner_id`.

## 3. Esquema de datos (núcleo)

Todas las tablas llevan `tenant_id uuid not null` y políticas RLS por tenant.

| Tabla | Campos clave |
|---|---|
| `tenants` | id, nombre, país, prefijo_gs1, plan, config jsonb |
| `owners` | id, tenant_id, nombre, tipo (`propio`/`cliente_3pl`), config jsonb |
| `warehouses` | id, tenant_id, nombre, gln, país, zona_horaria |
| `locations` | id, warehouse_id, gln, extension, tipo (muelle/rack/piso/staging), capacidad, bloqueada |
| `items` | id, tenant_id, owner_id, gtin, sku, descripcion, uom, unidades_por_caja, cajas_por_pallet, requiere_lote, requiere_vencimiento, dias_min_vida |
| `lpns` | id, tenant_id, owner_id, sscc, tipo, estado, location_id, creada_en |
| `lpn_lines` | id, lpn_id, item_id, lote, vencimiento, cantidad |
| `events` | id, tenant_id, tipo, ts, usuario_id, device_id, location_id, lpn_id, item_id, lote, cantidad, contexto (orden/tarea), payload jsonb, idem_key |
| `stock` | (proyección) tenant_id, owner_id, item_id, lote, vencimiento, location_id, lpn_id, cantidad, reservada |
| `orders` / `order_lines` | pedido de salida, owner_id, prioridad, destino, estado |
| `tasks` | recepción / put-away / picking / reposición / conteo; asignación y tiempos |
| `receipts` | recepción esperada vs. real (ASN) |
| `shipments` | despacho, transporte, verificación de carga, packing list |
| `label_templates` | plantilla ZPL/QR por tenant |
| `rules` | reglas por tenant/owner (FEFO, FIFO, prioridades, umbrales) |
| `usage_metrics` | eventos y tareas por tenant/owner/día (base de facturación) |

### Reglas de integridad

- `events` es append-only; se corrige con evento compensatorio, nunca con UPDATE.
- Todo movimiento de stock se hace en **una función SQL transaccional** que
  inserta el evento y actualiza `stock` atómicamente.
- `idem_key` único por tenant: el offline puede reenviar sin duplicar.
- `sscc` único por tenant (y por prefijo GS1); `gtin` único por owner.

## 4. Identificadores GS1

- **Generación de SSCC:** extension digit + prefijo de empresa + serial +
  dígito verificador (módulo 10). Un contador por prefijo, con bloqueo
  transaccional para no repetir.
- **GLN de ubicación:** GLN del depósito + extensión (AI 254) para
  posición/nivel, para no consumir un GLN por rack.
- **Validación de GTIN/SSCC/GLN:** dígito verificador GS1 en todo ingreso.
- **Modo sin prefijo:** identificadores internos con el mismo formato y un
  rango reservado, marcados como `no_interoperable`; migrables al obtener el
  prefijo.
- **Prefijo:** cada tenant carga el suyo (GS1 Argentina). En 3PL, cada owner
  puede traer el suyo para sus GTIN; los SSCC los emite el tenant que arma
  el pallet.

## 5. QR Digital Link y resolver

- **Parser:** URL → pares AI/valor → GS1 Element String; valida dígitos
  verificadores y combinaciones permitidas.
- **Formato de URL:** `https://{dominio-tenant}/{ai}/{valor}/...?{ai}={valor}`
  (ej. `/00/{sscc}`, `/01/{gtin}/10/{lote}?17={vto}`), con dominio propio o
  subdominio por tenant (marca blanca).
- **Resolver `/id/...` con tres respuestas:**
  - Sesión interna del tenant: detalle completo y acciones según contexto.
  - Cliente estándar (`Accept: application/json` o `linkType`): Element String
    / JSON GS1.
  - Visitante anónimo: página pública mínima configurable por tenant.
- **Registro de cada lectura** como evento (`tipo = lectura`).
- **Etiquetas:** plantillas ZPL con `^BQ` (QR); impresión por socket TCP 9100
  como ya se hace hoy, o vía agente local / cola de impresión.

## 6. Flujos del MVP

1. **Recepción:** ASN opcional → escaneo de SSCC/GTIN+lote+vto → alta de LPN →
   tarea de almacenaje.
2. **Almacenaje:** sugerencia de ubicación según reglas → confirmación por
   escaneo de GLN.
3. **Pedido y picking:** reserva por FEFO/FIFO → tarea con ruta → confirmación
   por escaneo.
4. **Packing y despacho:** pallets virtuales, verificación de carga escaneada
   contra el pedido, packing list y remito.
5. **Conteo cíclico:** QR de ubicación → conteo → ajuste con aprobación.

Fuera del MVP: TMS/YMS, ruteo dinámico, carga 3D, layout 3D, agentes.

## 7. Multi-tenant y 3PL

- **Aislamiento:** RLS por `tenant_id`; el rol de servicio nunca se expone al
  cliente. Pruebas automatizadas de fuga entre tenants.
- **Acceso por owner:** en 3PL, los usuarios del cliente final ven solo su
  `owner_id` (portal de cliente con stock, movimientos y pedidos).
- **Facturación 3PL:** métricas por owner (posiciones-día, pallets
  recibidos/despachados, líneas pickeadas, bultos) a partir de `events` y
  `tasks`. Tarifas configurables por owner.
- **Configuración jerárquica:** defecto de plataforma → tenant → owner →
  depósito, el más específico gana.

## 8. Localización por país

El núcleo es agnóstico; cada país es un módulo:

| Aspecto | Argentina (inicial) | A futuro |
|---|---|---|
| Organismo GS1 y prefijos | GS1 Argentina | GS1 Chile, Uruguay, Paraguay, Brasil, etc. |
| Documentos fiscales / logísticos | Remito, CPE/carta de porte, CTG según rubro | Equivalentes locales |
| Moneda e impuestos | ARS, IVA | Parametrizable |
| Formatos de dirección y CUIT/RUT | CUIT | RUT, RUC, CNPJ… |
| Idioma | es-AR | es, pt-BR |
| Zona horaria | America/Argentina/Buenos_Aires | Por depósito |

Reglas: textos e idioma desde el día uno en archivos de traducción, zona
horaria y moneda por depósito/tenant, y nada fiscal dentro del núcleo.
Brasil (portugués, NF-e) es un salto mayor que el resto y conviene tratarlo
como un proyecto aparte.

## 9. Plataforma técnica propuesta

- **Base de datos:** Postgres (Supabase) con RLS, funciones transaccionales y
  particionado de `events` por fecha/tenant a medida que crece.
- **Backend:** API REST + webhooks (Next.js route handlers o servicio aparte
  si crece); colas para impresión, notificaciones y agentes.
- **Cliente operativo:** PWA con cámara para escaneo y cola local de eventos
  (IndexedDB) con sincronización idempotente; luego soporte de handhelds.
- **Backoffice:** Next.js (como el dashboard actual).
- **Integraciones:** API pública versionada, webhooks, importación CSV/Excel,
  conectores a ERP más adelante.
- **Observabilidad:** logs estructurados, métricas por tenant, alertas, backups
  con pruebas de restauración.

## 10. Agentes (fase 2)

- Consumen `events` y `stock`, y escriben **propuestas**, no acciones.
- Ejemplos: vencimientos próximos, reposición, priorización de pedidos,
  desvíos de productividad, anomalías de conteo.
- Reglas del cliente en lenguaje natural (master prompt) guardadas en `rules`,
  con los límites definidos por tenant; todo con auditoría de qué propuso el
  agente y qué decidió la persona.

## 11. Hoja de ruta sugerida

| Fase | Contenido |
|---|---|
| 0 | Esquema multi-tenant, RLS, generación/validación GS1, parser Digital Link, event log, pruebas de aislamiento |
| 1 | Etiquetado QR/ZPL, recepción por LPN, almacenaje con GLN |
| 2 | Pedidos, picking FEFO, packing, despacho verificado, importación CSV, API |
| 3 | Conteo cíclico, offline, portal 3PL, métricas de uso y facturación |
| 4 | Piloto con la operación propia, endurecimiento, onboarding autoservicio |
| 5 | Agentes y analítica; luego localización a otro país |

## 12. Decisiones abiertas

- Hardware soportado oficialmente (impresoras, handhelds, lectores).
- Modelo de precios (por usuario, por depósito, por volumen de eventos, o mixto).
- Dominios de resolver: subdominio por tenant vs. dominio propio del cliente.
- Soporte offline: alcance (solo escaneo vs. operación completa).
- Si los GTIN de un 3PL se comparten entre owners o son siempre por owner.
- Retención de eventos y política de datos por país.
