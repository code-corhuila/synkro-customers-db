# HU-CLI-02: diseño y conciliación

Diseño inicial registrado antes de implementar las migraciones (2026-10-12).
Contrato del runner actualizado posteriormente; evidencia de ese ciclo en corrections-evidence.md.
Rama vigente: feat/customers-schema-and-migration-runner; 90b0229 conservado como ancestro.

- Historia confirmada: [synkro-docs#244](https://github.com/code-corhuila/synkro-docs/issues/244).
- HU-CLI-01 (#187) entrega la estructura de Customers API; la persistencia corresponde a esta historia.
- `04-requirements/user-stories.md` aún describe HU-CLI-02 como estructura base (2 puntos). El issue #244 contiene el alcance ampliado recibido. Requiere conciliación documental separada; no se publica ni cierra otra historia aquí.
- Base: `develop`, `a098042426f259270d9ba28728212872fd2c1b4f`. Solo existen las ramas remotas develop, qa y main; no hay PR abiertos ni migraciones históricas al iniciar.
- Fuentes consultadas en synkro-docs: entidades/reglas, mapa de dominio, modelos, diccionario, ADR-005/009/012, deployment, testing-strategy, DoR, DoD y branching-policy.
- ADR-012 prevalece sobre los ejemplos antiguos con `${app_user}`, historia compartida o permisos sobre todas las tablas. Se concede el rol a `customers_app`; solo las tablas de negocio reciben permisos.

Fuentes reconsultadas para la continuación en synkro-docs main
`61056c93e6e0783a9199bf56778e9494739bc458` (2026-10-12).
Blobs de archivo, no SHA de commit:

| Fuente | Blob |
|---|---|
| 02-domain/entities-and-rules.md | ec8c81ec985ec537cfe8d76a5ca5ce907ea1de09 |
| 02-domain/domain-map.md | fcdb59133a8715ca79f6d85ddc6d42ac9430be47 |
| 06-data/models.md | 41478b200887c23c9eb04140dadb22df959bd8e8 |
| 06-data/data-dictionary.md | 2a35cffbbde35068fa814039002f78cd6b9b663f |
| ADR-005 | af9c58314daa8c4d4a25feb7f8d90d6c4ae2c270 |
| ADR-009 | de31ed393f18e8af365ac1b0414941a61b785cc9 |
| ADR-012 | 229ead675610e2a4781d2cc686ccd3cb8b5aa865 |
| 05-architecture/deployment.md | 0860d8ebeae3fc9b599f496ea87f9048112b6e9b |
| 11-quality/testing-strategy.md | 34dbc708e058f9b34b1355e1cf2599bb36797e5c |
| 00-governance/definition-of-ready.md | 800b3e8b8bcc7b64040d847446aa9dbe0a46b414 |
| 00-governance/definition-of-done.md | d0d5fd0314bb6053e4481a3ac12ec978b3f7c1d9 |
| 00-governance/branching-policy.md | 3431c735a1fdce92b3a89f05f5f14b90b821d89e |
| 00-governance/git-conventions.md | 5da09793835bc2db7f1037b690240846952c791b |
| 04-requirements/user-stories.md | 667b0366ee0150c7fbe8b179b2afe846a61c39cf |

Handoff vigente de infraestructura: rama feat/postgres-bootstrap-and-root-composition,
commit `b2fbfbd9ea3f81b451d66ba85465d0c5a4f8656f`, archivo
docs/owner-handoffs/customers-db.md, blob `9ab7c5face4ee1ae293e0e7a6584daf0a2d1479f`.
Su inventario de entrega Customers e issue está desactualizado frente a #244
y esta rama; el contrato FLYWAY sigue siendo compatible. Se prepara corrección
de trazabilidad para revisión, sin editar infraestructura ni synkro-docs.

Configuración de herramienta contrastada con documentación oficial:
[defaultSchema](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-default-schema-setting),
[schemas](https://documentation.red-gate.com/flyway/reference/configuration/environments-namespace/environment-schemas-setting)
y [connectRetries](https://documentation.red-gate.com/fd/environment-connect-retries-setting-277578922.html).

## Estructura prevista

| Versión | Familia | Cambio | Inversa |
|---|---|---|---|
| 001 | 01_ddl/01_schemas | customers_schema, quitar permisos públicos | DROP SCHEMA sin CASCADE |
| 002 | 01_ddl/03_tables | customer | DROP TABLE customer |
| 003 | 01_ddl/03_tables | idempotency_key | DROP TABLE idempotency_key |
| 004 | 01_ddl/04_alter | FK interna ON DELETE RESTRICT | DROP CONSTRAINT |
| 005 | 01_ddl/10_indexes | índice de customer_id en idempotency_key | DROP INDEX |
| 006 | 03_dcl/00_roles | reader/writer NOLOGIN | DROP ROLE |
| 007 | 03_dcl/01_grants | permisos explícitos y membresía customers_app | REVOKE |

Cada V tiene una U en `05_rollbacks/<misma familia>`. DML y TCL conservan sus README como placeholders: no hay semillas ni transacciones administrativas aprobadas que justifiquen SQL adicional. Flyway administra la transacción por migración.

V001/U001 se trasladaron de 00_schemas a 01_schemas después de probar la
compatibilidad en Flyway 10.20.1. CONT-03 construye una base desde 90b0229 y
valida/migra la misma base con la estructura propuesta: no cambia ninguna fila
del historial, checksum ni dato sintético. El campo script conserva su ruta
histórica 00_schemas. No hay repair/baseline/clean ni modificación de SQL.
No se conoce si hubo aplicaciones persistentes y no se consultó ninguna.
DML/TCL y sus familias espejo contienen placeholders, sin SQL ficticio.

La documentación oficial explica [versiones y checksums](https://documentation.red-gate.com/fd/versioned-migrations-273973333.html)
y [validate](https://documentation.red-gate.com/flyway/reference/commands/validate).
La compatibilidad de rutas se afirma por la prueba en la versión fijada.

`customer`: UUID por defecto, nombre 1–150, documento único 1–30 incluso inactivo, email hasta 255, teléfono hasta 20, dirección hasta 255; opcionales NULL. `registration_date` timestamptz/now(), `active` true. `idempotency_key`: key 8–128, PK; customer_id obligatorio y FK; created_at timestamptz/now(). No se agregan reglas de formato ni índices sin diseño.

## Contrato previsto del ejecutor

Servicio `customers-db-migrate`, perfil `tooling`, imagen Flyway fijada, repositorio montado solo lectura. Sin PostgreSQL, puertos ni volumen persistente. Red externa `platform`; infraestructura espera salud antes de ejecutar. `up` sin perfil no migra.

Solo operaciones migrate/validate/info. Interfaz FLYWAY_URL/USER/PASSWORD, destino
publicado synkro-db:5432/synkro. Alternativa opcional de archivo con precedencia
sobre PASSWORD y fallo sin fallback si es inválido. Alias anteriores solo si las
variables nuevas están vacías. Detalles y los nueve parámetros en README.
Límites JDBC connectTimeout/loginTimeout/socketTimeout de 5/10/60 s, además de
reintentos; no constituyen un límite total de migración. URL solo puede reducirlos.
Configuración fija: único/default schema customers_schema, historial
flyway_schema_history, clean y baseline automático desactivados. Salidas sin
credenciales ni SQL con datos; diagnóstico sensible en sesión protegida.

Fuentes: [handoff vigente](https://github.com/code-corhuila/synkro-infra-postgres/blob/b2fbfbd9ea3f81b451d66ba85465d0c5a4f8656f/docs/owner-handoffs/customers-db.md),
[propiedades pgJDBC](https://jdbc.postgresql.org/documentation/use/) y
[jdbcProperties de Flyway](https://documentation.red-gate.com/flyway/reference/configuration/environments-namespace/environment-jdbc-properties-namespace).

Flyway puede crear el esquema para alojar su historial antes de V001; V001 lo declara idempotentemente y aplica la política de acceso. Las U se ejecutan con psql en entorno desechable, inversamente, quitando el historial antes de U001; nunca se usa clean ni se presupone licencia de undo.

## Matriz de verificación prevista

| Criterios | Prueba real |
|---|---|
| CLI-DB-01/09 | primera ejecución, siete V exitosas e historial exclusivo |
| CLI-DB-02 | segunda ejecución: mismos registros e historial completo idéntico |
| CLI-DB-03/04/05 | defaults, NULL, límites exactos/excedidos, obligatorios, unicidad con baja lógica |
| CLI-DB-06 | clave 7/8/128/129, duplicado, FK, RESTRICT y rollback de cliente+clave |
| CLI-DB-07/08 | conexiones TCP autenticadas como app, reader y otros usuarios; CRUD permitido/prohibido, DDL, historia y aislamiento |
| CLI-DB-10 | U inversas, esquema/roles ausentes, usuarios y dominio centinela intactos, reconstrucción |
| CLI-DB-11 | configuración, secreto, contraseña/conexión, usuario ausente e historial legacy |
| CLI-DB-12 | composición externa incluye runner con rutas, red y secreto reales |
| CLI-DB-13/14 | CI conserva controles comunes; inventario V/U, diff de archivos protegidos |

El plan inicial pedía pruebas antes del SQL/runner. El rojo funcional completo
del modelo no quedó demostrado antes de implementar: Docker bloqueó ese intento.
evidence.md conserva lo sucedido; corrections-evidence.md registra exclusivamente
el ciclo posterior. acceptance.md distingue repositorio, centinela, plataforma y API.
