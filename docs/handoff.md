# Entrega coordinada — HU-CLI-02

## Ángel / HU-INF-02

- Rama: feat/customers-schema-and-migration-runner, con 90b0229 como ancestro.
- Contrato leído en [infra@7731dc3](https://github.com/code-corhuila/synkro-infra-postgres/blob/7731dc3c4e077b15a98254ddf56777195f1bd5dd/docs/owner-handoffs/customers-db.md),
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
- Antes de integrar, confirmar con responsables si 90b0229 se aplicó fuera de
  fixtures. Hasta entonces conservar bytes y rutas, incluido 00_schemas; la
  alineación a 01_schemas sigue BLOCKED. No modificar historia ni base persistente.
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
- Relacionar CLI-DB-01…14 con tests/integration.test.mjs, tests/contract.test.mjs,
  V/U y job migration-rebuild.
- Corregir ejemplos antiguos con ${app_user} y ALL TABLES que abarcan historia;
  reflejar usuario fijo y grants explícitos según ADR-012.
- Actualizar deployment/local-setup y matriz con rama, SHA, PR y ejecución CI.
  No modificar ADR aceptados ni cerrar HU-INF-02/HU-WKF-03 por esta entrega.
- DoD pendiente hasta revisión e integración aprobadas. No se cambian documentos
  ni issues del repositorio ajeno en esta implementación.

## PR

Destino develop. Título:
`feat(customers-db): align migration runner with infrastructure contract`.
Descripción en docs/pull-request.md; inventario en docs/design.md;
historia en docs/evidence.md; correcciones en docs/corrections-evidence.md y
matriz en docs/acceptance.md. PR #2 y su rama se conservan; la nueva entrega lo
referencia como antecedente, sin cerrarlo ni solicitar revisión final.
