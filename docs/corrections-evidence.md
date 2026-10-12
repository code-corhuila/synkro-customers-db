# Correcciones posteriores a 90b0229

> Registro histórico de Sergio. La continuación actual se documenta al final;
> sus resultados y estados sustituyen los bloqueos históricos para esta entrega.

Base revisada: `90b02296f7b057a4cfc6fbe6be4f78afe7cbe9a4`, conservada como ancestro.
Rama: `feat/customers-schema-and-migration-runner`.

## Conciliación (2026-10-12)

El remoto y la copia local coincidían en el SHA revisado; no había cambios
locales ni commits ajenos adicionales. El PR #2 seguía abierto y en borrador.
Según [GitHub](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch),
renombrar la rama head cierra su PR; no se ejecutó esa operación.
Se conserva #2 y su rama, y se prepara un PR de sustitución explícito.

Infraestructura: handoff leído en
`synkro-infra-postgres@7731dc3c4e077b15a98254ddf56777195f1bd5dd`, rama
`feat/postgres-bootstrap-and-root-composition`,
`docs/owner-handoffs/customers-db.md` (blob 7b8ee1de40380d701bbbe9b8a0531bd0c5b32200).
También se consultaron compose.postgres.yml y scripts/operations.py:
servicio synkro-db, base synkro; URL raíz con connectTimeout=5 y socketTimeout=60.
La copia local y develop solo contienen archivos comunes (22ddd80bbd5c781190e79cca19ae864c1f297633).
No se modificó infraestructura ni se ejecutó la composición completa.

El usuario no conoce posibles aplicaciones persistentes y ordenó conservar
rutas. Se mantienen V001/U001 en 00_schemas. Las pruebas históricas y el handoff
solo acreditan fixtures y una dependencia pendiente; no prueban que nadie haya
migrado manualmente. **Traslado a 01_schemas BLOCKED** hasta inventario confirmado
por los responsables. No se consultan ni modifican bases persistentes.

## Rojo antes de implementar las correcciones

- `node --test tests/contract.test.mjs`: 1 PASS, 2 FAIL. Falta .env.example;
  faltan propiedades JDBC connectTimeout/loginTimeout/socketTimeout.
- `node --test --test-name-pattern=REV-01 tests/integration.test.mjs`: 1 FAIL,
  13 omitidas por filtro. PostgreSQL temporal arrancó; Compose terminó con 1
  al usar la interfaz publicada FLYWAY_* / customers-db-migrate sin secreto obligatorio.
- REV-02…05 ya escritas antes del cambio de runner: límites reales con motor
  pausado y consulta bloqueada, drift de checksum y propiedades URL inseguras.
  No se presentan las pruebas filtradas como ejecutadas.

El ciclo original está conservado en evidence.md: rojo de inventario, bloqueo
Docker, rojo de autenticación y ejecuciones posteriores. No hay evidencia de
rojo funcional del modelo completo antes de la implementación inicial.

## Verde y publicación

Las pruebas rojas y este registro se guardaron en el commit adicional `2db2b7e`,
antes de modificar Compose, wrapper, configuración o ejemplos. No hubo amend,
rebase ni force-push.

Dos ejecuciones iniciales posteriores dieron 3/3 estáticas y 13/14 integración.
REV-01 requirió corregir el propio test: activar tooling al inspeccionar config
y no comparar una contraseña con la representación escapada de Compose (`$`).
La contraseña exacta ya se verifica mediante migración real con SCRAM. No se
atribuyen esos dos fallos del arnés al código de producción. En ambas ejecuciones
pasaron motor pausado, lectura bloqueada, drift y reconstrucción.

Verde local final (2026-10-12):

- `node --test tests/contract.test.mjs`: **3/3 PASS**, sin omisiones.
- REV-01 aislada: 1 PASS, 13 omitidas por filtro, 39.3 s.
- `node --test --test-concurrency=1 tests/integration.test.mjs`: **14/14 PASS**,
  0 FAIL, 0 omitidas, 210.8 s. Incluye restricciones, permisos efectivos, SCRAM,
  secretos, include externo, repetición y U inversas/reconstrucción completa.
- Motor pausado: 29 020 ms, salida propia 1, menor que 90 s; lectura bloqueada:
  6 269 ms, salida propia 1, menor que 30 s. Ninguna dependió del timeout de 180 s.
- Sintaxis Node y git diff --check correctos. Diff contra 90b0229 vacío para
  DDL/DML/DCL/TCL, U y CODEOWNERS: rutas y contenido históricos intactos.
- Entornos exclusivamente desechables, con eliminación de recursos y archivos
  temporales por el teardown. Ninguna base persistente consultada ni modificada.

Publicación: push normal de `aec323fdc41867feefdc426f5196e22cae39a593` a
feat/customers-schema-and-migration-runner. La creación del PR de sustitución
fue rechazada por la herramienta (user rejected MCP tool call); no se creó ni
se intentó por otra vía. #2 y su rama permanecen abiertos/en borrador e intactos.
La descripción de sustitución queda preparada en pull-request.md.

**CI nuevo BLOCKED:** el workflow solo se dispara por pull_request o push a
develop/qa/main, no por push a esta rama. No se modifican ramas permanentes ni
se atribuye al SHA nuevo el CI exitoso de 90b0229. Falta una ejecución remota
autorizada mediante el PR correspondiente. El commit documental posterior
registra esta limitación sin cambiar el código probado.

## Continuación — pruebas previas a los cambios (2026-10-12)

Inicio limpio en 3498ab26cc146011a7b28027283a434e2671b26d, misma rama y remoto.
90b0229, 2db2b7e, aec323f y 3498ab2 son ancestros; autores intactos.
PR #2 está cerrado sin merge, aún draft, head codex/hu-cli-02-customers-db;
la rama histórica ya no aparece en ls-remote y no hay PR abierto para la rama vigente.

Antes de corregir código:

- Contrato: CONT-01 y CONT-02 FAIL (familia/placeholders y disparador push);
  tres controles existentes PASS. CONT-06 añadido para comparar los bytes de
  todos los SQL y CODEOWNERS contra 90b0229.
- Integración filtrada CONT: CONT-03/05 PASS y CONT-04 FAIL porque migrate
  devolvió 0 después de ALTER ROLE customers_reader LOGIN. La prueba restaura
  NOLOGIN en finally. Solo tres pruebas seleccionadas; no es la suite completa.
- CONT-03 se refinó antes de producción para montar una copia propuesta con
  01_schemas. Reejecución aislada PASS, 23.265 s total: original extraído desde
  90b0229, PostgreSQL tmpfs propio, Flyway 10.20.1 original, datos sintéticos en
  ambas tablas, validate/migrate con la carpeta propuesta, historial entero y
  datos idénticos. No repair/baseline/clean ni manipulación de historial.
- Historial original version/script/checksum:
  001:00_schemas/V001__create_customers_schema.sql:1501799604;
  002:03_tables/V002__create_customer.sql:-812018864;
  003:03_tables/V003__create_idempotency_key.sql:-1281968613;
  004:04_alter/V004__add_foreign_keys.sql:-48311283;
  005:10_indexes/V005__create_indexes.sql:-2090867766;
  006:00_roles/V006__create_roles.sql:2008003005;
  007:01_grants/V007__grant_permissions.sql:1821486826.

La compatibilidad demostrada permite el traslado autorizado sin averiguar si
hubo aplicaciones persistentes. Esa aplicación sigue desconocida y no se
consultó ninguna base persistente. El historial puede conservar 00_schemas en
script: Flyway 10.20.1 valida el traslado sin cambiar esa fila ni checksum.
Esta regresión nueva no constituye TDD de la implementación original.
