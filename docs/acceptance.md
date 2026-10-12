# Matriz de aceptación — correcciones de HU-CLI-02

Rama: feat/customers-schema-and-migration-runner. Evidencia original en
evidence.md y ciclo posterior en corrections-evidence.md. PASS aquí significa
verificación del repositorio con PostgreSQL desechable, no despliegue aprobado.

| ID | Repositorio | Evidencia concreta |
|---|---|---|
| CLI-DB-01 | PASS | integration.test.mjs: CLI-DB-01/09/12, siete V en base vacía |
| CLI-DB-02 | PASS | CLI-DB-02, datos e historial completo idénticos al repetir |
| CLI-DB-03 | PASS | CLI-DB-03/04, defaults y campos opcionales NULL |
| CLI-DB-04 | PASS | CLI-DB-03/04, cada límite aprobado y exceso rechazado |
| CLI-DB-05 | PASS | CLI-DB-05, baja lógica conserva fila y unicidad permanente |
| CLI-DB-06 | PASS | CLI-DB-06, key 7/8/128/129, FK, índice y rollback atómico |
| CLI-DB-07 | PASS | CLI-DB-07/08, sesiones TCP app/reader con permisos efectivos |
| CLI-DB-08 | PASS | CLI-DB-07/08, aislamiento frente a usuarios y esquema centinela |
| CLI-DB-09 | PASS | CLI-DB-01/09/12, historia exclusiva; REV-04 rechaza checksum alterado |
| CLI-DB-10 | PASS | CLI-DB-10, todas las U inversas y reconstrucción completa |
| CLI-DB-11 | PASS | Dos grupos CLI-DB-11 y REV-02/03/05: autenticación, configuración, secretos y límites reales |
| CLI-DB-12 | PASS | REV-01: include externo, perfil, red, montaje y contrato FLYWAY; ambos modos de contraseña |
| CLI-DB-13 | BLOCKED | Rama publicada; creación de PR rechazada. Workflow solo PR/ramas permanentes: no hay ejecución del SHA nuevo |
| CLI-DB-14 | PASS | contract.test.mjs: inventario V/U; diff contra 90b0229 vacío para SQL y CODEOWNERS |

Los nombres de prueba remiten a [integración](../tests/integration.test.mjs)
y [contrato](../tests/contract.test.mjs). La nomenclatura 01_schemas es una
corrección separada **BLOCKED**, no queda satisfecha por el inventario V/U.

| Frontera | Estado | Alcance y siguiente responsable |
|---|---|---|
| Repositorio y fixtures | PASS | Restricciones, permisos, repetición, rollback/rebuild y contrato externo |
| Esquema centinela | PASS | Conservación e inaccesibilidad comprobadas con usuarios reales; no son migraciones completas de otros dominios |
| Plataforma real | BLOCKED | Ángel: pin aprobado e integración en raíz, PostgreSQL publicado 16.15-alpine3.23; fixture 16.6-alpine |
| Customers API | BLOCKED | Equipo API: consumo real, transacción cliente+clave, manejo de conflicto y baja lógica; SQL no acredita endpoints |
| Migraciones persistentes/ruta | BLOCKED | Responsables deben confirmar aplicaciones de 90b0229; rutas y bytes preservados por orden del usuario |
| Conciliación documental | BLOCKED | Handoff para synkro-docs #244; no se editó ni cerró otro repositorio/issue |

**NOT READY** para revisión final: falta resolver la familia del esquema y
confirmar CI del SHA publicado (PR de sustitución preparado, no creado). Las fronteras de plataforma/API también quedan
explícitas; no se consideran realizadas por esta suite. PR #2 permanece en borrador.
