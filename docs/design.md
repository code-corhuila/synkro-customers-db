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

Blobs de las fuentes consultadas en main (Git SHA del archivo, no de commit):

| Fuente | Blob |
|---|---|
| 06-data/models.md | 41478b200887c23c9eb04140dadb22df959bd8e8 |
| 06-data/data-dictionary.md | 2a35cffbbde35068fa814039002f78cd6b9b663f |
| ADR-005 | af9c58314daa8c4d4a25feb7f8d90d6c4ae2c270 |
| ADR-009 | de31ed393f18e8af365ac1b0414941a61b785cc9 |
| ADR-012 | 229ead675610e2a4781d2cc686ccd3cb8b5aa865 |

Configuración de herramienta contrastada con documentación oficial:
[defaultSchema](https://documentation.red-gate.com/flyway/reference/configuration/flyway-namespace/flyway-default-schema-setting),
[schemas](https://documentation.red-gate.com/flyway/reference/configuration/environments-namespace/environment-schemas-setting)
y [connectRetries](https://documentation.red-gate.com/fd/environment-connect-retries-setting-277578922.html).

## Estructura prevista

| Versión | Familia | Cambio | Inversa |
|---|---|---|---|
| 001 | 01_ddl/00_schemas | customers_schema, quitar permisos públicos | DROP SCHEMA sin CASCADE |
| 002 | 01_ddl/03_tables | customer | DROP TABLE customer |
| 003 | 01_ddl/03_tables | idempotency_key | DROP TABLE idempotency_key |
| 004 | 01_ddl/04_alter | FK interna ON DELETE RESTRICT | DROP CONSTRAINT |
| 005 | 01_ddl/10_indexes | índice de customer_id en idempotency_key | DROP INDEX |
| 006 | 03_dcl/00_roles | reader/writer NOLOGIN | DROP ROLE |
| 007 | 03_dcl/01_grants | permisos explícitos y membresía customers_app | REVOKE |

Cada V tiene una U en `05_rollbacks/<misma familia>`. DML y TCL conservan sus README como placeholders: no hay semillas ni transacciones administrativas aprobadas que justifiquen SQL adicional. Flyway administra la transacción por migración.

La familia requerida para el esquema es 01_schemas. El traslado de V001/U001
queda BLOCKED: el usuario desconoce aplicaciones persistentes y ordenó preservar
rutas y contenido. La tabla refleja la ubicación real conservada, no conformidad
con esa corrección pendiente. No se crean SQL duplicados ni vacíos.

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

Fuentes: [handoff vigente](https://github.com/code-corhuila/synkro-infra-postgres/blob/7731dc3c4e077b15a98254ddf56777195f1bd5dd/docs/owner-handoffs/customers-db.md),
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
