# HU-CLI-05 — Contactos obligatorios, búsqueda y reactivación: política de migración

Refs [code-corhuila/synkro-docs#304](https://github.com/code-corhuila/synkro-docs/issues/304). Alcance de este
repositorio: migraciones **aditivas** V008–V013 (con sus U), el inventario agregado y esta política. No se
modifica ninguna migración V001–V007 ni sus checksums.

## 1. Qué agrega cada migración

| Versión | Archivo | Efecto |
|---|---|---|
| V008 | `01_ddl/06_functions/V008__create_search_fold_function.sql` | `customers_schema.fold_search_text(text)`: minúsculas y sin diacríticos (precompuestos y combinados). `IMMUTABLE`, `STRICT`, `search_path` fijo; **sin extensiones**. |
| V009 | `01_ddl/03_tables/V009__create_customer_audit.sql` | `customer_audit`: registro de transiciones controladas (`REACTIVATED`), con operador, correlación y fecha. |
| V010 | `01_ddl/04_alter/V010__add_customer_audit_foreign_key.sql` | FK de la auditoría al cliente (`ON DELETE RESTRICT`). |
| V011 | `01_ddl/04_alter/V011__require_contacts_after_cutover.sql` | CHECK `chk_customer_contacts_required`: email, teléfono y dirección obligatorios y válidos para toda fila registrada **desde** la migración. |
| V012 | `01_ddl/10_indexes/V012__create_customer_audit_index.sql` | Índice por `customer_id` de la auditoría. |
| V013 | `03_dcl/01_grants/V013__grant_audit_and_search_permissions.sql` | Auditoría **solo SELECT/INSERT** (nunca UPDATE/DELETE/TRUNCATE); `EXECUTE` de la función solo para reader/writer. |

Cada V tiene su U en `05_rollbacks/` (misma familia). Las U destruyen datos y se prueban solo en instancias
desechables; en qa/main se prefiere una V correctiva y respaldo verificado.

## 2. Datos históricos: por qué el CHECK exime lo anterior al corte

Las filas existentes pueden tener email, teléfono o dirección vacíos o inválidos. Un `CHECK ... NOT VALID` común
**también se evalúa en cada UPDATE**, de modo que impediría desactivar o reactivar a un cliente histórico incompleto.
Por eso la restricción solo exige completitud a las filas con `registration_date` posterior al instante de la
migración. Lo anterior **no se repara, no se inventa ni se borra**. Se conservan UUID, documento, fecha de registro y
referencias de Ventas (que guardan solo el UUID).

La API valida completitud en **todo** `POST` y `PUT` de reemplazo, sin importar la antigüedad de la fila: un cliente
histórico incompleto se completa en el momento en que alguien lo edita. Desactivar y reactivar no exigen contactos.

## 3. Reparación y restricción definitiva (decisión del dueño de datos)

1. Ejecutar `scripts/contact-inventory.sql` en cada ambiente (devuelve solo contadores, sin datos personales).
2. El dueño de negocio decide, por categoría, entre completar, aceptar excepciones o dejar inactivos.
3. Cualquier reparación masiva usa una migración o script **revisado**, aprobado y con respaldo previo; nunca valores
   fabricados que parezcan reales.
4. Con `incomplete_rows_blocking_the_definitive_constraint = 0`, una migración posterior reemplaza V011 por la
   restricción incondicional (`DROP CONSTRAINT` + `ADD CONSTRAINT` sin exención) sin editar V011.

Estado actual: en **dev** se consultó, solo en lectura y con agregados, el inventario previo: 4 clientes (3 activos,
1 inactivo) y 0 con contactos faltantes o inválidos. En **qa/main no se consultó ninguna base**; el inventario queda como
tarea del dueño de datos antes de promover.

## 4. Despliegue y reversa

- Aplicar primero esta base, **antes** de la API nueva (la API exige columnas/tabla/función nuevas). Para la API
  anterior las migraciones son compatibles: no quitan columnas ni cambian tipos.
- Flyway valida los checksums de V001–V007 y aplica solo V008+. La prueba CONT-03 lo comprueba contra una base
  creada desde el commit original con datos sintéticos completos, incompletos e inactivos.
- Reversa: en desechables, las U en orden inverso; en qa/main, migración correctiva. La auditoría ya escrita es
  evidencia: no se elimina en una recuperación normal.

## 5. Búsqueda: costo y límites

La función de plegado no tiene índice funcional: la API limita a 6 filas con `LIMIT` y ordena de forma estable
(coincidencia exacta de documento, prefijo de documento, nombre por todos los términos; después nombre y UUID). Con el
volumen actual (decenas de miles) el barrido es aceptable; el benchmark sintético está en
`docs/hu-cli-05-search-benchmark.md`. Si el volumen crece, añadir un índice sobre `fold_search_text(name)` con una
migración nueva (la función es `IMMUTABLE`, por lo que es indexable).

## 6. Privacidad

Ningún script ni prueba de este repositorio usa datos reales. El inventario devuelve únicamente conteos. Los
parámetros de búsqueda viajan en el cuerpo de la petición, nunca en URL ni logs.
