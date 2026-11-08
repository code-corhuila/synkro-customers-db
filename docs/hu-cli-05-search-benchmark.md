# HU-CLI-05 — Rendimiento de la búsqueda por nombre/documento (medición sintética)

Refs [code-corhuila/synkro-docs#304](https://github.com/code-corhuila/synkro-docs/issues/304). Reproducible con
`node scripts/benchmark-search.mjs [tamaños…]` (PostgreSQL desechable y etiquetado, datos 100 % sintéticos, se elimina al
terminar).

## Contra qué se mide

- Requisito vigente: `NFR-001` (synkro-docs `04-requirements/non-functional.md`): **P95 < 300 ms en endpoints críticos
  «bajo carga normal»**, valor por defecto *propuesto*; no hay medición oficial, ni rendimiento mínimo, ni estimación de
  tráfico (proyecto académico). Esta medición no es un P95 bajo carga: es la latencia de **una consulta sin concurrencia**,
  y por eso se compara con 300 ms con margen amplio.
- Los **200 ms de espera (debounce) del Portal no son un límite de respuesta del servidor**: solo evitan una petición por
  pulsación. El servidor debe responder por sí mismo dentro del presupuesto; la API acota la respuesta (≤ 5 filas), no el
  trabajo de la base de datos.
- Volumen real: dev tiene 4 clientes; qa/main no se consultaron. Los tamaños 20 000 y 100 000 son escenarios sintéticos para
  acotar el crecimiento, no una estimación de la carga real.

## Entorno y método

PostgreSQL 16.6 (`postgres:16.6-alpine`) en Docker Desktop sobre Windows 11, datos en `tmpfs`, `fsync=off`,
`shared_buffers=256MB`, JIT apagado, sin otras cargas del contenedor. Una sola conexión. `EXPLAIN (ANALYZE)` de la misma
consulta que ejecuta la API (`JdbcCustomerRepository.SEARCH`), **mediana de cinco ejecuciones**, en modo de plan
personalizado y genérico (el driver JDBC pasa a planes genéricos tras cinco ejecuciones). Nombres con tildes y eñes
generados, documentos numéricos de 10 dígitos, correos `@example.test`. Son órdenes de magnitud en una máquina de
desarrollo, no un SLA.

## Resultado (milisegundos, mediana)

«Primer diseño» = `fold_search_text` evaluada en cada fila (V001–V011). «Almacenado» = el diseño entregado (columnas
generadas V012 + índice V013).

| Escenario | 20 000: primer diseño | 20 000: almacenado | 100 000: primer diseño | 100 000: almacenado (plan personalizado / genérico) |
|---|---:|---:|---:|---:|
| nombre, dos términos | 317 | 7 / 8 | 1 611 | 36 / 39 |
| nombre, un término | 348 | 7 / 8 | 1 750 | 38 / 42 |
| nombre, sin coincidencias | 306 | 6 / 8 | 1 537 | 32 / 37 |
| nombre, ≈ 50 % coincide (peor caso) | 613 | 13 / 14 | 2 739 | 54 / 57 |
| documento exacto | 305 | 7 / 8 | 1 533 | 32 / 35 |
| documento por prefijo (todos coinciden) | 462 | 8 / 11 | 2 345 | 28 / 51 |

- **Primer diseño**: ≈ 16 µs por fila; cualquier búsqueda recorre todas las filas del estado pedido (`Seq Scan` + `Sort`),
  por lo que con 20 000 clientes ya está en el límite de 300 ms y con 100 000 lo supera varias veces. Se probaron atajos
  (camino rápido ASCII, plegar una vez por fila): −10 % y −27 % respectivamente, sin cambiar el orden de magnitud.
- **Almacenado**: documento exacto y por prefijo usan `idx_customer_document_search` (`Index Scan`); la búsqueda por
  nombre sigue siendo un recorrido lineal, pero sobre texto ya plegado y con `strpos` (≈ 0,3 µs por fila). Margen de ≈ 5×
  hasta 100 000 clientes en el peor caso medido. Extrapolación **no medida**: 1 M de clientes estaría en cientos de ms;
  si el volumen llegara allí, la salida es una búsqueda por trigramas (requiere la extensión `pg_trgm`, que este esquema
  no crea y exigiría decisión de infraestructura).
- No se añadió un índice sobre `name_search`: una coincidencia por subcadena no puede usar un btree y el recorrido ya
  cumple con holgura; sería costo de escritura y almacenamiento sin beneficio medido.
- Ambos modos de plan (personalizado y genérico) usan el índice y cumplen; el diseño no depende de constantes en tiempo de
  planificación.

## Costo del diseño almacenado

| | 20 000 clientes | 100 000 clientes |
|---|---:|---:|
| INSERT masivo, primer diseño → almacenado | 551 → 874 ms | 1 443 → 2 950 ms |
| UPDATE del nombre de la décima parte, primer → almacenado | 300 → 298 ms | 354 → 472 ms |
| Tamaño de tabla + índices | 3,2 MB + 1,6 MB → 4,0 MB + 2,3 MB | 17 MB + 7,9 MB → 20 MB + 11 MB |
| V012 (reescritura de la tabla, bloqueo exclusivo) | 529 ms | 1 621 ms |
| V013 (construcción del índice) | 252 ms | 306 ms |

El costo de escritura es de ≈ 15–16 µs adicionales por fila insertada (dos plegados y una entrada de índice); las altas
son individuales, así que es despreciable. El almacenamiento crece ≈ 30 % y la reescritura de V012 es el único bloqueo
relevante (ventana tranquila). Las columnas se recalculan solo cuando cambia `name` o `identity_document`.

## Qué significa y qué queda por medir

- Con el diseño entregado, la latencia de consulta a 100 000 clientes queda ≈ 5× por debajo de 300 ms en el peor caso medido (57 ms).
- **No medido**: P95 bajo carga concurrente, latencia de extremo a extremo (red, JSON, autenticación) y volumen real de
  qa/main. Esas mediciones, y la confirmación de que 300 ms es el objetivo aplicable a la búsqueda de Ventas, siguen siendo
  pendientes con el responsable de Ventas y el dueño de datos.
- Si `fold_search_text` se redefine algún día, las columnas generadas y el índice deben reconstruirse en una migración nueva.
