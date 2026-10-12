# Entrega coordinada — HU-CLI-02

## Ángel / HU-INF-02

- Rama: feat/customers-schema-and-migration-runner, con 90b0229 como ancestro.
- Contrato vigente leído en [infra@b2fbfbd](https://github.com/code-corhuila/synkro-infra-postgres/blob/b2fbfbd9ea3f81b451d66ba85465d0c5a4f8656f/docs/owner-handoffs/customers-db.md),
  rama feat/postgres-bootstrap-and-root-composition. develop aún es esqueleto.
- Entrega: deploy/compose.yml, customers-db-migrate, perfil tooling, Flyway 10.20.1,
  montaje relativo al repositorio y red externa platform.
- Infraestructura conserva PostgreSQL 16, volumen, usuarios, contraseñas y salud.
  Provisionar customers_app LOGIN INHERIT no administrativo, search_path
  customers_schema, sin membresías extra ni propiedad de objetos.
- Entradas acordadas: FLYWAY_URL, FLYWAY_USER, FLYWAY_PASSWORD. La raíz publica
  jdbc:postgresql://synkro-db:5432/synkro?connectTimeout=5&socketTimeout=60 y obtiene
  la contraseña administrativa de su archivo protegido en memoria. No enviarla a API.
- Alternativa: deploy/compose.secrets.yml con CUSTOMERS_DB_ADMIN_PASSWORD_FILE
  absoluto; fija FLYWAY_PASSWORD_FILE dentro del contenedor y prevalece sobre
  PASSWORD. Archivo inválido falla sin fallback. Alias URL/USER antiguos solo
  cuando las variables estándar estén vacías. README contiene include de ambos modos.
- Límites JDBC 5/10/60 s (conexión/login/lectura); URL puede reducirlos. Se probó
  fallo propio con motor pausado y lectura bloqueada, no solo timeout del arnés.
- Esperar salud, backup qa/main y ejecutar runners consecutivamente.
- Historia: customers_schema.flyway_schema_history. No compartir public ni
  añadir currentSchema a la URL. Historia legacy bloquea el runner.
- Verificar aislamiento efectivo después de todos los runners: concesiones
  de otros dominios pueden romperlo. La suite usa un dominio centinela y usuarios
  reales; no afirma integrar las migraciones completas Auth/Products/Workflow.
- README contiene include y variables. No crear manualmente objetos Customers.
- V001/U001 trasladadas a 01_schemas manteniendo nombres, versiones y bytes.
  CONT-03 demuestra actualización desde 90b0229 sobre la misma base temporal:
  validate/migrate no reaplican versiones ni cambian historial/checksums/datos.
  No se conoce una aplicación persistente ni se consultó ninguna. Inventariarla
  al preparar el despliegue; no reescribir la ruta script histórica 00_schemas.
- Preflight rechaza reader/writer con LOGIN o privilegios peligrosos también
  en una segunda migración. No corrige ni elimina roles ajenos. U sin CASCADE
  falla ante dependencias inesperadas; inventariarlas antes de revertir.
- Integración real pendiente de pin aprobado y composición completa de infraestructura.
  El fixture usa PostgreSQL 16.6-alpine; la composición publicada fija 16.15-alpine3.23.
  La compatibilidad del contrato en un fixture no acredita esa ejecución completa.

## Customers API / HU-CLI-01 y siguientes

- Conectar como customers_app después de migrar. Desactivar generación de esquema
  y migraciones de la API; usar esquema explícito o search_path.
- Mapear registeredAt a registration_date; UUID, timestamptz y límites en README.
- Insertar cliente y clave en una transacción. Ante conflicto de key, rollback
  y consulta del recurso existente en otra transacción. No hay trigger que
  imponga esa transacción por la API.
- Baja lógica con active=false y documento permanentemente único. SELECT no
  filtra inactivos automáticamente: cada caso de uso aplica su regla.
- No DELETE/TRUNCATE/DDL ni acceso a historia. Tablas futuras requieren grants.
- Workflow valida clientes mediante Customers API (ADR-012), nunca SQL ni
  customers_reader. No se implementa la saga en esta entrega.

## Trazabilidad documental (PR separado en synkro-docs)

- Conciliar la fila HU-CLI-02 (estructura base, 2 puntos) con el issue #244.
  La fila actual dice Not started; #244 sigue abierto y contiene CLI-DB-01…14.
  Preparar descripción/criterios del alcance ampliado para aprobación del equipo;
  no inventar una estimación nueva ni marcar Done antes de revisión/integración.
- Relacionar CLI-DB-01…14 con tests/integration.test.mjs, tests/contract.test.mjs,
  V/U y job migration-rebuild.
- Corregir ejemplos antiguos con ${app_user} y ALL TABLES que abarcan historia;
  reflejar usuario fijo y grants explícitos según ADR-012.
- Actualizar deployment/local-setup y matriz con rama, SHA, PR y ejecución CI.
  No modificar ADR aceptados ni cerrar HU-INF-02/HU-WKF-03 por esta entrega.
- DoD pendiente hasta revisión e integración aprobadas. No se cambian documentos
  ni issues del repositorio ajeno en esta implementación.
- Corregir en una revisión futura el inventario del handoff de infraestructura:
  ya existe esta rama y #244; el documento consultado aún dice que no encontró
  entrega/issue. Ángel incorpora únicamente el SHA aprobado tras su revisión.

## Inventario y reproducción

| V / U | Familia | Objeto |
|---|---|---|
| V001 / U001 | 01_ddl/01_schemas | customers_schema |
| V002 / U002 | 01_ddl/03_tables | customer |
| V003 / U003 | 01_ddl/03_tables | idempotency_key |
| V004 / U004 | 01_ddl/04_alter | FK RESTRICT |
| V005 / U005 | 01_ddl/10_indexes | índice FK |
| V006 / U006 | 03_dcl/00_roles | NOLOGIN reader/writer |
| V007 / U007 | 03_dcl/01_grants | grants de negocio y membresía app |

Cada U está en 05_rollbacks/<familia>. No se agregaron versiones nuevas.
Antes de una prueba local reproducible: Docker/Compose con include, Node 20.11+
e imágenes postgres:16.6-alpine y flyway/flyway:10.20.1 disponibles.

```sh
git rev-parse feat/customers-schema-and-migration-runner
node --test tests/contract.test.mjs
node --test --test-concurrency=1 tests/integration.test.mjs
git diff --check
```

El SHA completo del primer comando identifica la entrega; el informe de cierre
entrega el valor publicado y el enlace CI de ese mismo SHA. Registrar el SHA
aprobado en infraestructura después de revisar, sin usar una referencia mutable.
Los resultados locales y remotos se distinguen en corrections-evidence.md y
acceptance.md. No reemplazar el CI final por el histórico de 90b0229.

Comandos del operador, con valores proporcionados por infraestructura en
env/dev.env protegido (admin del runner, nunca customers_app):

```sh
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate migrate
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate validate
docker compose --env-file env/dev.env -f deploy/compose.yml -f deploy/compose.secrets.yml run --rm -T customers-db-migrate validate
```

FLYWAY_URL/USER no vacías prevalecen sobre CUSTOMERS_FLYWAY_URL/DB_ADMIN_USER.
Archivo FLYWAY_PASSWORD_FILE configurado prevalece sobre FLYWAY_PASSWORD;
override secrets lo fija a /run/secrets/customers_db_admin_password y usa
CUSTOMERS_DB_ADMIN_PASSWORD_FILE absoluto en host, sin fallback ante fallo.
COMPOSE_PROJECT_NAME pertenece a la raíz; PLATFORM_NETWORK selecciona la red
externa (platform por defecto). Host synkro-db:5432, base synkro; /workspace
monta el repo solo lectura, sin puertos ni volumen propios. Límites 5/10/60 s
de conexión/login/lectura, con URL capaz de reducirlos; no límite total de SQL.

## PR

Destino develop. Título:
`fix(customers-db): complete schema layout and runner verification`.
Descripción en docs/pull-request.md; inventario en docs/design.md;
historia en docs/evidence.md; correcciones en docs/corrections-evidence.md y
matriz en docs/acceptance.md. En la inspección actual PR #2 ya estaba cerrado
sin merge y su rama remota ausente. No hay PR abierto de esta rama; se prepara
un nuevo candidato hacia develop, sin crear, cerrar ni fusionar PR automáticamente.
