# Matriz de aceptación — continuación de HU-CLI-02

Rama: feat/customers-schema-and-migration-runner. Validación nueva desde
3498ab2 (2026-10-12), independiente de los verdes históricos de Sergio.
Evidencia original en evidence.md; correcciones y continuación en
corrections-evidence.md. PASS se limita al repositorio y fixtures.

| ID | Estado | Evidencia |
|---|---|---|
| CLI-DB-01 | PASS | Siete V en PostgreSQL vacío; solo dos tablas de negocio |
| CLI-DB-02 | PASS | Segunda migrate conserva datos e historial completo; CONT-03 desde 90b0229 |
| CLI-DB-03 | PASS | UUID/defaults/NULL opcionales y cliente válido |
| CLI-DB-04 | PASS | Límites aprobados, NOT NULL, documento duplicado rechazado |
| CLI-DB-05 | PASS | Baja lógica conserva fila y unicidad incluso inactivo |
| CLI-DB-06 | PASS | key 7/8/128/129, PK, FK RESTRICT/índice, transacción conjunta y rollback |
| CLI-DB-07 | PASS | Sesiones TCP SCRAM reales app/reader: SELECT/INSERT/UPDATE |
| CLI-DB-08 | PASS | DELETE/TRUNCATE/DDL/historial prohibidos; otros usuarios y centinela aislados |
| CLI-DB-09 | PASS | Historial exclusivo; drift rechazado; CONT-03 conserva cada fila/checksum tras traslado |
| CLI-DB-10 | PASS | Siete U inversas, reconstrucción, repetición; CONT-05 bloquea dependencias sin CASCADE |
| CLI-DB-11 | PASS | Configuración/autenticación/conectividad/secreto, límites reales, CONT-04 roles inseguros incluso no-op |
| CLI-DB-12 | PASS | Include externo, tooling, red externa, montaje solo lectura, variables y secretos |
| CLI-DB-13 | BLOCKED | Push de rama habilitado; falta verificar CI del SHA publicado de la continuación |
| CLI-DB-14 | PASS | Bytes de los 14 SQL, nombres/versiones, CODEOWNERS e historial/autoría conservados; CONT-01/06 |

Pruebas: [integración](../tests/integration.test.mjs) y
[contrato](../tests/contract.test.mjs). V001/U001 en 01_schemas;
las otras seis parejas mantienen familia. DML/TCL y espejos tienen placeholders,
sin migraciones vacías. Primera ejecución: 6/6 estáticas y 17/17 integración,
0 fallos/omisiones; evidencia final posterior en corrections-evidence.md.

| Frontera | Estado | Siguiente acción |
|---|---|---|
| Repositorio / fixtures | PASS | Validación técnica local; CI pendiente |
| Traslado 00_schemas → 01_schemas | PASS | CONT-03, Flyway 10.20.1 original y estructura propuesta, misma base y datos intactos |
| Centinela | PASS | Prueba del repositorio; no integra todos los dominios |
| Plataforma real | BLOCKED | Ángel revisa/aprueba pin y ejecuta composición raíz; fixture 16.6, infraestructura 16.15 |
| Customers API | BLOCKED | Equipo API integra persistencia y HTTP; no implementado aquí |
| Conciliación documental | BLOCKED | Preparación en handoff.md para #244/backlog, sin editar synkro-docs |

**NOT READY** mientras falte CI de la continuación. La preparación técnica
para revisión no cierra la HU ni acredita revisión humana, integración aprobada,
Customers API o plataforma completa. PR #2 se encontró cerrado sin merge;
no hay PR abierto para la rama actual. Descripción preparada en pull-request.md.