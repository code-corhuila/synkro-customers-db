# PR preparado hacia develop

Título: `fix(customers-db): complete schema layout and runner verification`

Rama: `feat/customers-schema-and-migration-runner` → `develop`.
No se creó PR automáticamente. #2 ya estaba cerrado sin merge y apuntaba a
codex/hu-cli-02-customers-db; la rama antigua no figura en el remoto. No hay
PR abierto de esta rama. Esta entrega sustituye al candidato histórico para
revisión, sin modificar #2 ni reescribir los commits de Sergio.

## Problema y cambio

HU-CLI-02 tenía V001/U001 en 00_schemas y no podía validar su rama por push.
Además, una segunda migrate aceptaba roles de Customers que habían adquirido
LOGIN después de V006. Esta continuación mueve únicamente la pareja del esquema
a 01_schemas, completa placeholders espejo DML/TCL, comprueba roles inseguros
en cada preflight y habilita CI por push a la misma rama, conservando los eventos,
controles y permisos existentes. El checkout completo permite probar 90b0229.

Se preservan nombres, versiones y bytes de V001…V007/U001…U007, CODEOWNERS,
modelo aprobado, autoría e historial de Sergio. Sin instancia desplegable,
usuarios LOGIN nuevos, semillas ni cambios de infraestructura o synkro-docs.

## Validación

- Pruebas/evidencia nuevas antes de producción, commit 62e7a22: rojo de familia,
  disparador CI y rol inseguro; prueba temporal del traslado antes de moverlo.
  CONT-02 amplió primero su comprobación de checkout: rojo antes de fetch-depth.
- CONT-03 construye PostgreSQL desechable desde 90b0229 con Flyway 10.20.1,
  inserta cliente/clave sintéticos y ejecuta validate/migrate con 01_schemas:
  historial completo, checksums y datos idénticos, sin reaplicar versiones.
- Suite real: migración inicial, repetición, límites, permisos TCP/SCRAM,
  aislamiento centinela, escritura conjunta, configuración, secretos, límites
  de conexión/lectura, roles preexistentes, U inversas y reconstrucción.
- Resultados nuevos locales/CI y limpieza: docs/corrections-evidence.md.
  Matriz CLI-DB-01…14: docs/acceptance.md. SHA y enlace remoto se entregan en
  el informe final; usar la ejecución de ese SHA, no 90b0229.
- El intento original de integración previo al SQL estuvo bloqueado por Docker.
  Se conserva esa limitación; no se fabrica TDD funcional original.

## Coordinación y pendientes

Ángel recibe docs/handoff.md: contrato customers-db-migrate, Flyway 10.20.1,
compose principal y secrets, red/host/montajes, precedencias, límites 5/10/60 s,
admin del runner separado de customers_app, inventario V/U y comandos.
El runner probado no acredita la plataforma completa; Ángel actualizará el pin
solo después de revisión/aprobación y ejecutará la integración raíz.

Conciliar en synkro-docs la reserva base de HU-CLI-02 (2 puntos, Not started)
con #244 y CLI-DB-01…14; no se cambia el tablero ni se cierran HU-CLI-02,
HU-INF-02 o HU-WKF-03. Customers API/Workflow permanecen fuera de alcance.
Workflow accede a Customers mediante la API.

## Definition of Done

- [x] Correcciones nuevas con pruebas previas y evidencia roja/verde separada
- [x] SQL histórico y CODEOWNERS conservados; traslado compatible probado
- [x] Primera ejecución local completa: 6 estáticas / 17 integración, sin omisiones
- [ ] CI del SHA final publicado verificado (informe de entrega)
- [ ] Revisión y aprobación humana; integración y conciliación documental

Estado técnico actual: NOT READY hasta confirmar el CI de la continuación.
Refs code-corhuila/synkro-docs#244; sin cierre automático.