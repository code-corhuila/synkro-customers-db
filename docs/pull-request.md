## Cambios

Descripción preparada para la sustitución de #2. La rama está publicada, pero
la creación del nuevo PR fue rechazada: este documento no acredita un PR creado.

HU-CLI-02 entrega customer e idempotency_key, permisos limitados e historial
exclusivo. Esta revisión conserva 90b0229 y alinea el ejecutor con el handoff
publicado de infraestructura: customers-db-migrate, FLYWAY_URL/USER/PASSWORD,
archivo opcional con precedencia y límites JDBC 5/10/60 segundos.

Rama: feat/customers-schema-and-migration-runner → develop.
Sustituye como candidato de entrega a #2, que permanece abierto y en borrador
con su rama intacta. Renombrar su head cerraría el PR según GitHub; se publica
una referencia nueva sin reescritura ni borrado.

## Validación y evidencia

- Pruebas de correcciones guardadas primero en 2db2b7e: inventario 1 PASS/2 FAIL
  y REV-01 1 FAIL/13 omitidas antes de implementar; el resto de REV ya estaba escrito.
- El ciclo original tuvo rojo de inventario, bloqueo Docker y rojo posterior
  de autenticación. No demuestra rojo funcional completo del modelo antes del SQL.
- Las pruebas usan exclusivamente PostgreSQL desechable, conexiones SCRAM,
  composición externa y centinela. Incluyen motor pausado, lectura bloqueada,
  checksum alterado solo en fixture, precedencia de secretos y reconstrucción.
- Matriz CLI-DB-01…14: docs/acceptance.md. Resultados: docs/corrections-evidence.md.
- Verde local: 3/3 estáticas y 14/14 integración, sin omisiones, 210.8 s;
  motor pausado 29.020 s y lectura bloqueada 6.269 s, salida propia 1 en ambos.
- CI del SHA publicado y enlace de ejecución: se agregan a la descripción remota
  tras verificar ambos jobs, sin atribuir al SHA nuevo el CI histórico.
- CI nuevo BLOCKED: workflow solo por PR o push a ramas permanentes. No se
  alteraron esos disparadores ni se publicaron cambios en ramas permanentes.

## Pendientes y alcance

**NOT READY — conservar borrador.** El traslado 00_schemas → 01_schemas queda
BLOCKED por orden del usuario hasta confirmar aplicaciones persistentes. Todas
las rutas y bytes de V/U y CODEOWNERS permanecen idénticos a 90b0229.
No se modificaron bases persistentes ni otros repositorios.

El contrato se contrastó con infra@7731dc3; no acredita plataforma completa.
Ángel recibe docs/handoff.md para pin aprobado, inventario e integración real.
Customers API y conciliación del alcance en synkro-docs #244 siguen como handoff.

## Definition of Done

- [ ] TDD funcional completo de la implementación original (evidencia parcial explícita)
- [x] Pruebas de correcciones registradas antes de implementar; rojo separado del ciclo original
- [ ] Pipeline del SHA final verificado (actualizar en PR con enlace)
- [x] Sin credenciales comprometidas ni argumentos con contraseñas
- [ ] Familia 01_schemas conciliada con posibles aplicaciones persistentes
- [ ] Revisado y aprobado conforme a política

Refs code-corhuila/synkro-docs#244. No cierra la HU ni historias relacionadas.
