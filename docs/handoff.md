# Entrega coordinada — HU-CLI-02

## Ángel / HU-INF-02

- Entrega: deploy/compose.yml, customers-migrate, perfil tooling, Flyway 10.20.1,
  montaje relativo al repositorio y red externa platform.
- Infraestructura conserva PostgreSQL 16, volumen, usuarios, contraseñas y salud.
  Provisionar customers_app LOGIN INHERIT no administrativo, search_path
  customers_schema, sin membresías extra ni propiedad de objetos.
- Mapear DB_ADMIN_USER y URL; suministrar contraseña mediante
  CUSTOMERS_DB_ADMIN_PASSWORD_FILE. No enviarla a ninguna API.
- Esperar salud, backup qa/main y ejecutar runners consecutivamente.
- Historia: customers_schema.flyway_schema_history. No compartir public ni
  añadir currentSchema a la URL. Historia legacy bloquea el runner.
- Verificar aislamiento efectivo después de todos los runners: concesiones
  de otros dominios pueden romperlo. La suite usa un dominio centinela y usuarios
  reales; no afirma integrar las migraciones completas Auth/Products/Workflow.
- README contiene include y variables. No crear manualmente objetos Customers.

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
`feat(customers-db): implement schema, isolated Flyway runner and rebuild tests`.
Descripción en docs/pull-request.md; inventario en docs/design.md;
resultados y limitaciones en docs/evidence.md.
