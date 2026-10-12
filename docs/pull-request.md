## Description

### Summary

Completa Customers DB para HU-CLI-02: customer e idempotency_key con restricciones
del modelo, roles NOLOGIN, grants limitados, historial propio y runner explícito
contra PostgreSQL compartido.

### Changes

- Siete V y siete U, sin semillas ni usuarios nuevos.
- Compose tooling con secreto por archivo, montaje de solo lectura y versión fija.
- Pruebas reales de restricciones, permisos, atomicidad, aislamiento y reconstrucción.
- Conserva controles CI y agrega migration-rebuild.
- Documenta integración, recuperación y conciliación del backlog.

### Validation

Local: inventario V/U 1/1; aceptación PostgreSQL 9/9 con SCRAM obligatorio
(114.6 s), reconstrucción completa y segunda ejecución sin cambios. Compose,
sintaxis Node y git diff --check correctos; CODEOWNERS intacto.
Evidencia rojo/verde y límites en docs/evidence.md. Verificar también el job
migration-rebuild de este PR antes de integrar.

### Definition of Done

- [x] Tests were written before the implementation (see scoped evidence)
- [ ] The pipeline passes
- [x] No hardcoded credentials, keys, or environment secrets
- [ ] Reviewed and approved per branch policy

Refs code-corhuila/synkro-docs#244. Cierre después de revisión, integración y
conciliación documental; no cierra las historias relacionadas.
