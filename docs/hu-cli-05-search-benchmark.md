# HU-CLI-05 — Costo de la búsqueda por nombre/documento (medición sintética)

Refs [code-corhuila/synkro-docs#304](https://github.com/code-corhuila/synkro-docs/issues/304).

La API busca con `fold_search_text` (V008) aplicada a nombre y documento, filtra por estado, ordena por
coincidencia y devuelve como máximo 6 filas (`LIMIT`). No hay índice funcional: PostgreSQL recorre las filas del
estado pedido y evalúa la función en cada una. Esta medición acota hasta qué volumen eso es razonable.

## Método

- PostgreSQL 16.6 desechable en Docker (tmpfs, sin otras cargas), con las migraciones V001–V013 aplicadas.
- Datos 100 % sintéticos (nombres con tildes/eñes generados, documentos numéricos, correos `@example.test`).
- Misma consulta que ejecuta la API (`JdbcCustomerRepository.SEARCH`), con `EXPLAIN (ANALYZE)`; consulta de dos
  términos (`maria sofia`), que obliga a evaluar todos los nombres activos.
- Una sola ejecución por escenario, en una máquina de desarrollo: los números son un orden de magnitud, no un SLA.

## Resultado

| Filas activas | Coincidencias | Plan | Tiempo de ejecución |
|---:|---:|---|---:|
| 20 000 | 500 | `Seq Scan` + `Sort` + `Limit` | ≈ 255 ms |
| 100 000 | 2 500 | `Seq Scan` + `Sort` + `Limit` | ≈ 1 400 ms |
| 100 000 | 80 000 (peor caso: casi todo coincide) | `Seq Scan` + `Sort` + `Limit` | ≈ 3 600 ms |

El costo crece de forma lineal con el número de clientes y lo domina la función de plegado (se evalúa varias veces por
fila). Probé dos atajos y no cambian el orden de magnitud: un camino rápido para texto ASCII (≈ −10 %) y calcular el
plegado una sola vez por fila (≈ −27 % adicional). No los incorporé: añaden complejidad para una ganancia pequeña.

## Qué significa

- Hasta unas decenas de miles de clientes el tiempo es compatible con un autocompletado con espera (*debounce*) y
  cancelación de la petición anterior, como hace el portal. La API acota la respuesta, pero **no** acota el trabajo de
  la base de datos.
- Por encima de ≈ 50 000 clientes la búsqueda deja de sentirse inmediata. La salida prevista es una migración nueva (sin
  editar V008–V013) que añada columnas generadas almacenadas `fold_search_text(name)` / `fold_search_text(identity_document)`
  (la función es `IMMUTABLE`) más un índice `text_pattern_ops` para documento exacto/prefijo; la búsqueda por tokens en el
  nombre seguiría siendo un recorrido barato sobre texto ya plegado (sin extensiones, que este esquema no crea).
- La cantidad actual de clientes en qa/main **no** se consultó; el dueño de datos debe contrastarla con la tabla.
