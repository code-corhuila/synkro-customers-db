# Correcciones posteriores a 90b0229

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

CI del nuevo SHA pendiente de publicación; se actualizará con enlace verificable.
