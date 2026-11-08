# HU-CLI-05 — Contactos obligatorios, búsqueda y reactivación: política de migración

Refs [code-corhuila/synkro-docs#304](https://github.com/code-corhuila/synkro-docs/issues/304). Alcance de este
repositorio: migraciones **aditivas** V008–V014 (con sus U), el script **preparado y pendiente de activación** de la
restricción de contactos, el inventario agregado y esta política. No se modifica ninguna migración V001–V007 ni sus
checksums.

## 0. Decisión de diseño: expandir ahora, restringir después

**Estado: la restricción CHECK de contactos NO está aplicada en la base de datos.** Está preparada y probada en
`scripts/pending-activation/` (fuera de toda ubicación de Flyway) y se activará en un PR posterior.

Motivo, medido (`tests/compat-matrix.mjs` de `synkro-customers-api`): con el CHECK aplicado, la **API anterior** responde
`500 INTERNAL_ERROR` a cualquier alta sin contactos o con un teléfono que no sean diez dígitos (sobre el esquema solo
expandido responde `201`). Con el CHECK, el orden de despliegue sería rígido y la API anterior dejaría de ser un destino de
reversa. La primera versión de esta HU incluía el CHECK como V011; se retiró **antes** de que cualquier migración
V008–V013 se aplicara en un entorno compartido (rama sin publicar; `develop`, `qa` y `main` no las contienen; en la base
compartida de dev la versión más alta aplicada es V007), por lo que renumerar las nuevas es seguro.

Costo aceptado: hasta la activación, **la API es el único punto de cumplimiento** de los contactos. La API nueva exige
email, teléfono (10 dígitos ASCII, texto) y dirección en todo `POST` y `PUT` y rechaza sin escrituras parciales.
Escritores autorizados de `customers_schema`: `customers_app` (solo `synkro-customers-api`) y el login administrativo de
Flyway para migraciones y reparaciones aprobadas; ningún otro dominio tiene privilegios (Workflow, Auth y Products
verifican la denegación) y Ventas guarda solo el UUID.

## 1. Qué agrega cada migración

| Versión | Archivo | Efecto y necesidad |
|---|---|---|
| V008 | `01_ddl/06_functions/V008__create_search_fold_function.sql` | `customers_schema.fold_search_text(text)`: minúsculas y sin diacríticos (precompuestos y combinados). `IMMUTABLE`, `STRICT`, `search_path` fijo; **sin extensiones**. Necesaria: una sola definición de «igual» para búsqueda y columnas generadas. |
| V009 | `01_ddl/03_tables/V009__create_customer_audit.sql` | `customer_audit`: registro de transiciones controladas (`REACTIVATED`), con operador, correlación y fecha. Necesaria: la reactivación debe auditarse en la misma transacción. |
| V010 | `01_ddl/04_alter/V010__add_customer_audit_foreign_key.sql` | FK de la auditoría al cliente (`ON DELETE RESTRICT`). Necesaria: integridad (no hay auditoría huérfana ni cliente auditado borrable). |
| V011 | `01_ddl/10_indexes/V011__create_customer_audit_index.sql` | Índice por `customer_id` de la auditoría (soporte de la FK y de la consulta por cliente). |
| V012 | `01_ddl/04_alter/V012__add_customer_search_columns.sql` | Columnas **generadas almacenadas** `name_search` y `document_search` (`fold_search_text`). Necesaria por rendimiento (ver §5). Reescribe la tabla bajo bloqueo exclusivo. |
| V013 | `01_ddl/10_indexes/V013__create_customer_document_search_index.sql` | Índice btree sobre `document_search` (colación `C`) para documento exacto y por prefijo. |
| V014 | `03_dcl/01_grants/V014__grant_audit_and_search_permissions.sql` | Auditoría **solo SELECT/INSERT** (nunca UPDATE/DELETE/TRUNCATE); `EXECUTE` de la función solo para reader/writer. Debe ir al final: las columnas generadas necesitan que el escritor pueda ejecutar la función. |

Cada V tiene su U en `05_rollbacks/` (misma familia). Las U destruyen datos y se prueban solo en instancias
desechables; en qa/main se prefiere una V correctiva y respaldo verificado. La secuencia es contigua (V008–V014): no se
reserva ningún número para la restricción futura, y no se habilita `outOfOrder`.

Compatibilidad: todas son aditivas (no quitan columnas, no cambian tipos, no agregan restricciones sobre datos nuevos). La
API anterior las ignora (no las nombra) y sigue funcionando; las columnas generadas no admiten escritura, de modo que
ninguna aplicación puede dejarlas desalineadas.

## 2. Datos históricos

Las filas existentes pueden tener email, teléfono o dirección vacíos o inválidos. **No se reparan, no se inventan y no se
borran**; conservan UUID, documento, fecha de registro y referencias de Ventas (que guardan solo el UUID).

La API valida completitud en **todo** `POST` y `PUT` de reemplazo, sin importar la antigüedad de la fila: un cliente
histórico incompleto se completa en el momento en que alguien lo edita. Desactivar y reactivar no exigen contactos.

Por qué el script pendiente exime lo anterior a su aplicación: un `CHECK ... NOT VALID` común **también se evalúa en cada
UPDATE**, de modo que impediría desactivar o reactivar a un cliente histórico incompleto. Por eso la restricción solo
exigirá completitud a las filas con `registration_date` posterior al instante de su aplicación.

## 3. Reparación y activación de la restricción (decisión del dueño de datos)

1. Ejecutar `scripts/contact-inventory.sql` en cada ambiente (devuelve solo contadores, sin datos personales).
2. El dueño de negocio decide, por categoría, entre completar con información **real**, aceptar excepciones o dejar inactivos.
3. Cualquier reparación masiva usa una migración o script **revisado**, aprobado y con respaldo previo; nunca valores
   fabricados que parezcan reales.
4. La activación exige **todas** estas condiciones: API nueva en todas las instancias, inventario completo sin contactos
   inválidos, reparación de históricos con información real y decisión explícita sobre la compatibilidad de reversa
   (tras activar, la API anterior ya no puede crear clientes sin contactos).
5. Al activar, se copia `scripts/pending-activation/require-contacts-check.sql` al **siguiente número disponible** en
   `01_ddl/04_alter/` (con su U) en un PR posterior (excepción autorizada a «un PR por repositorio»: es una fase de despliegue
   posterior) y se vuelve a verificar. Ver `scripts/pending-activation/README.md`.

Estado actual del inventario: en **dev** se consultó, solo en lectura y con agregados, el inventario previo: 4 clientes
(3 activos, 1 inactivo) y 0 con contactos faltantes o inválidos. En **qa/main no se consultó ninguna base**; el inventario
queda como tarea del dueño de datos antes de activar la restricción o promover.

## 4. Despliegue y reversa

Orden de despliegue por fases (ver también la matriz de compatibilidad del repositorio de la API):

1. **Expandir**: aplicar V008–V014 con el runner (`migrate`, luego `validate`). Compatibles con la API anterior, que sigue
   sirviendo. La reescritura de V012 toma un bloqueo exclusivo breve (≈ 0,5 s por 20 000 clientes, ≈ 1,6 s por 100 000
   en una máquina de desarrollo): ejecutar en una ventana tranquila.
2. **Actualizar la aplicación**: desplegar la API nueva (exige columnas, tabla y función nuevas). Durante un despliegue
   gradual conviven API anterior y nueva sin problema.
3. **Verificar**: salud, alta con contactos, rechazo de contactos inválidos, búsqueda y reactivación (ADMIN).
4. **Restringir (fase posterior)**: activar el CHECK según §3.

Reversa: volver a la API anterior es seguro en cualquier punto (el esquema expandido la tolera; los clientes y la
auditoría creados por la API nueva siguen legibles). En desechables, las U en orden inverso; en qa/main, migración
correctiva. La auditoría ya escrita es evidencia: no se elimina en una recuperación normal.

Flyway valida los checksums de V001–V007 y aplica solo V008+. La prueba CONT-03 lo comprueba contra una base creada desde el
commit original con datos sintéticos completos, incompletos e inactivos; CONT-07 comprueba el script pendiente.

## 5. Búsqueda: rendimiento

La primera versión evaluaba `fold_search_text` sobre cada fila en cada consulta: ≈ 16 µs por fila, es decir ≈ 320 ms con
20 000 clientes y ≈ 1,5–2,7 s con 100 000 (contra el valor por defecto propuesto de P95 < 300 ms para endpoints críticos,
`NFR-001`, aún sin medición oficial). Se añadieron las columnas generadas V012 y el índice V013; la medición
reproducible (`scripts/benchmark-search.mjs`) y su análisis están en `docs/hu-cli-05-search-benchmark.md`.

## 6. Privacidad

Ningún script ni prueba de este repositorio usa datos reales. El inventario devuelve únicamente conteos. Los
parámetros de búsqueda viajan en el cuerpo de la petición, nunca en URL ni logs.
