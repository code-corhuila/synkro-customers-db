# synkro-customers-db

Esquema PostgreSQL de Customers, migraciones Flyway y runner para
[HU-CLI-02 / #244](https://github.com/code-corhuila/synkro-docs/issues/244).
Infraestructura conserva instancia, volumen y usuarios; este repositorio
administra customers_schema y sus roles.

## Modelo y permisos

| Tabla | Contrato |
|---|---|
| customer | customer_id UUID/gen_random_uuid(), name 1–150, identity_document único 1–30, email NULL/≤255, phone NULL/≤20, address NULL/≤255, registration_date timestamptz/now(), active true |
| idempotency_key | key PK 8–128, customer_id obligatorio/FK ON DELETE RESTRICT, created_at timestamptz/now() |

Textos `text` con CHECK nombrados. El documento permanece único incluso inactivo.
Índice único para buscar por documento e índice de la FK; sin semillas,
extensiones ni relaciones entre dominios.

customers_reader tiene SELECT; customers_writer SELECT/INSERT/UPDATE. Ambos
NOLOGIN. El writer se concede a customers_app existente. No se conceden
DELETE/TRUNCATE/DDL ni acceso a customers_schema.flyway_schema_history.
Las tablas futuras requieren grants explícitos, sin default privileges amplios.

## Ejecución

Requisitos: Docker con Compose 2.20+ (include), PostgreSQL 16 saludable y red
externa platform. Infraestructura provisiona customers_app LOGIN INHERIT, sin
privilegios administrativos, membresías ajenas ni propiedad de objetos, con
search_path customers_schema.

1. Copiar .env.example o el ejemplo del ambiente a env/dev.env, env/qa.env o env/main.env.
2. Infraestructura suministra FLYWAY_URL, FLYWAY_USER y FLYWAY_PASSWORD desde
   su entorno protegido. Alternativamente, usar el override de archivo descrito abajo.
3. Infraestructura crea red, inicia PostgreSQL y espera salud.
4. En qa/main, exigir backup verificado antes de ejecutar deliberadamente:

```sh
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate migrate
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate validate
```

| Variable | Uso |
|---|---|
| COMPOSE_PROJECT_NAME | synkro-dev, synkro-qa o synkro-main |
| PLATFORM_NETWORK | Red externa, por defecto platform; configurable para pruebas aisladas |
| FLYWAY_URL | jdbc:postgresql://synkro-db:5432/synkro?connectTimeout=5&socketTimeout=60 |
| FLYWAY_USER | Usuario administrativo suministrado por infraestructura |
| FLYWAY_PASSWORD | Contraseña en entorno protegido, nunca argumento de línea de comandos |
| FLYWAY_PASSWORD_FILE | Ruta dentro del contenedor a un archivo previamente montado; prevalece sobre FLYWAY_PASSWORD |
| CUSTOMERS_FLYWAY_URL | Alias anterior, usado solo si FLYWAY_URL está vacío |
| DB_ADMIN_USER | Alias anterior, usado solo si FLYWAY_USER está vacío |
| CUSTOMERS_DB_ADMIN_PASSWORD_FILE | Ruta absoluta del secreto en el host, solo con deploy/compose.secrets.yml |

El modo estándar no exige archivo. Para usar un archivo protegido fuera del
repositorio (ACL restringida o 0600), añadir `-f deploy/compose.secrets.yml`
después de `-f deploy/compose.yml`. Ese override monta el secreto y fija
FLYWAY_PASSWORD_FILE. Un archivo configurado inválido o vacío falla: no recurre
a la contraseña del entorno. No publicar la salida de compose config con secretos.

La URL admite hostname/IPv4, no IPv6, credenciales ni parámetros arbitrarios.
Infraestructura monta certificados de confianza si usa TLS con verificación.
Las contraseñas admiten comillas, espacios, dólar y barras; no saltos finales
significativos, que el wrapper elimina. No se pasan contraseñas por argumentos
ni se publican logs SQL/JDBC. Restringir acceso administrativo al host/Docker,
que puede inspeccionar procesos y secretos.

Flyway está fijado a 10.20.1. El servicio tiene perfil tooling, sin puertos ni
base/volumen propios, y repositorio de solo lectura. up sin ese perfil no migra.
Tres reintentos complementan la espera de salud. Los límites JDBC por defecto
son connectTimeout=5, loginTimeout=10 y socketTimeout=60 segundos. La URL puede
reducirlos (respectivamente 1..5, 1..10 y 1..60), nunca desactivarlos ni duplicarlos.
También admite sslmode=disable/prefer/require/verify-ca/verify-full. URL prevalece
sobre las propiedades JDBC del archivo; por eso se valida explícitamente.
No es un límite total de duración de migraciones. Con imágenes disponibles y
Docker/DNS operativos, el fixture de motor pausado debe salir por sí mismo antes
de 90 s; una lectura bloqueada con socketTimeout=2 debe fallar antes de 30 s.
El guardián de 180 s del arnés no cuenta como éxito.
El wrapper devuelve 2 para configuración/operación inválida y propaga errores
de Flyway. Solo acepta migrate/validate/info, sin opciones arbitrarias.
info devuelve confirmación sin detalle bruto. Inventario administrativo:

```sql
SELECT version, description, success
FROM customers_schema.flyway_schema_history ORDER BY installed_rank;
```

## Composición externa

Con repositorios hermanos, la composición raíz de infraestructura incluye:

```yaml
include:
  - ../synkro-customers-db/deploy/compose.yml
```

El montaje relativo se resuelve desde deploy/compose.yml. El secreto opcional usa ruta
absoluta. La raíz define PostgreSQL; no se duplica aquí. Si también declara
platform, usar la misma configuración de red externa. Este archivo no declara
name ni reemplaza el proyecto raíz.

```sh
docker compose --env-file env/dev.env up -d --wait synkro-db
docker compose --env-file env/dev.env run --rm -T customers-db-migrate migrate
docker compose --env-file env/dev.env run --rm -T customers-db-migrate validate
```

Contrato consultado: [handoff de infraestructura](https://github.com/code-corhuila/synkro-infra-postgres/blob/b2fbfbd9ea3f81b451d66ba85465d0c5a4f8656f/docs/owner-handoffs/customers-db.md).
Para incluir ambos archivos desde la raíz, usar:

```yaml
include:
  - path:
      - ../synkro-customers-db/deploy/compose.yml
      - ../synkro-customers-db/deploy/compose.secrets.yml
```

La suite reproduce este contrato; no ejecuta la plataforma completa.
Serializar runners administrativos. Exigir salida cero y
verificar permisos antes de desplegar Customers API; nunca darle credenciales admin.

## Pruebas y recuperación

Node.js 20.11+ y Docker/Compose; no hay paquetes npm:

```sh
node --test tests/contract.test.mjs
docker pull postgres:16.6-alpine
docker pull flyway/flyway:10.20.1
node --test --test-concurrency=1 tests/integration.test.mjs
```

La suite crea red y PostgreSQL aleatorios con tmpfs, contraseñas aleatorias y
conexiones TCP reales. No acepta una URL externa. Prueba restricciones,
atomicidad, permisos, aislamiento, errores, repetición y U inversas/reconstrucción.
Usa include externo y elimina sus recursos y secretos al terminar. Si el proceso
es interrumpido forzosamente, revisar customers-test-* y .test-run/ antes de limpiarlos.
El CI conserva check-common-files y agrega migration-rebuild.
También se activa por push a feat/customers-schema-and-migration-runner,
conservando los eventos de PR y ramas permanentes. El checkout del job de
migraciones obtiene el historial para reproducir la base de 90b0229.
CONT-03 prueba actualización desde ese commit con datos sintéticos e historial
inalterados; CONT-04/05 prueban roles preexistentes y dependencias inesperadas.

V001–V007: esquema, customer, idempotency_key, FK, índice, roles, grants. Una
secuencia global en DDL/DML/DCL/TCL, cada V con U en 05_rollbacks/misma familia.
DML/TCL quedan vacías sin operaciones aprobadas. No editar V aplicadas. No usar
undo (no disponible en Community) ni clean. Las U destruyen datos y se prueban
solo en instancias desechables; en qa/main preferir V correctiva y backup.

Rama de entrega: `feat/customers-schema-and-migration-runner`. Se conserva el
commit revisado 90b0229 y la autoría de Sergio. V001/U001 ahora están en
01_ddl/01_schemas y 05_rollbacks/01_ddl/01_schemas; los nombres, versiones y
bytes de los catorce SQL se conservan. Flyway 10.20.1 valida y migra una base
creada desde el original sin cambiar historial/checksums/datos. No se consultó
ninguna base persistente. Un historial previo puede conservar 00_schemas en
script; no necesita repair. El preflight comprueba reader/writer NOLOGIN y sin
privilegios de instancia peligrosos también en ejecuciones sin V pendientes.

[Diseño y matriz](docs/design.md) · [Recuperación](docs/recovery.md) ·
[Handoff de infraestructura/API](docs/handoff.md) · [Evidencia histórica](docs/evidence.md) ·
[Correcciones y evidencia](docs/corrections-evidence.md) · [Aceptación](docs/acceptance.md)

Part of the **SynkroTech SAS Sales Management System** — organization `code-corhuila`.
Governance and documentation live in [`synkro-docs`](https://github.com/code-corhuila/synkro-docs).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `synkro-docs`.
