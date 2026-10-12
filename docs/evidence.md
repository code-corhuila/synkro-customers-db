# Evidencia de validación

Fecha: 2026-10-12. Base develop: a098042426f259270d9ba28728212872fd2c1b4f.
Rama histórica: codex/hu-cli-02-customers-db (90b0229, PR #2).
Rama vigente: feat/customers-schema-and-migration-runner; el ciclo posterior
está separado en corrections-evidence.md. Este archivo preserva el ciclo original.
La continuación desde 3498ab2 y sus resultados nuevos están al final de
corrections-evidence.md; los verdes históricos siguientes no se reutilizan
como validación de esa continuación.

## Antes de implementar SQL y runner

- node --test tests/contract.test.mjs: rojo, falta 01_ddl (ENOENT); aún no
  existen migraciones ni reversiones.
- Suite de integración escrita antes del SQL. Intento de CLI-DB-01:
  falla setup por motor Docker detenido. **No es rojo funcional SQL**.
- Docker Desktop reporta error al retirar el socket userAnalyticsOtlpHttp.sock.
  Se intenta recuperar el motor antes de repetir.

## Recuperación del entorno local

Docker 28.0.1 recuperado al apartar la carpeta temporal de sockets como
run.stale-20261012; sin cambiar imágenes ni volúmenes. Tras un fallo DNS
transitorio se descargaron las imágenes fijadas:

- postgres:16.6-alpine, digest sha256:1d04b9ba1d4996401f2552b51beda8187f175c0645c091e4781134fc9c9a3eef.
- flyway/flyway:10.20.1, digest sha256:88dfed741ab3f5604140e8106ad837579e0ff2efe53bf60a78b79ba6a851a658.

## Ejecuciones

- Inventario V/U: verde (1/1). Compose config --quiet con valores ficticios:
  salida 0. Node syntax y git diff --check: salida 0. CODEOWNERS sin diferencias.
- Primera integración: 8/8 en 100.9 s, con construcción, repetición, límites,
  permisos efectivos, atomicidad, errores y reconstrucción. Esta ejecución aún
  no demostraba rechazo de contraseña en las sesiones TCP locales.
- Se añadió primero `real application authentication rejects an incorrect password`.
  Rojo real: la consulta con contraseña incorrecta devolvió 0, en vez de fallar.
  Se identificó trust en loopback generado por initdb. Se corrigió el fixture con
  POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256, sin cambiar la infraestructura real.
- Reejecución completa con SCRAM: **9/9**, 0 fallos, 0 omitidos, 114.6 s.
  Incluye ausencia de customers_app antes de cualquier esquema/historia,
  contraseña incorrecta rechazada, secretos vacíos/inaccesibles y reconstrucción.
  Los recursos efímeros y archivos secretos se eliminaron al finalizar.
- CI original: [run 38277301480](https://github.com/code-corhuila/synkro-customers-db/actions/runs/38277301480),
  check-common-files y migration-rebuild exitosos para la entrega 90b0229.

La evidencia TDD cubre inventario y la corrección de autenticación; el primer
intento de integración previo al SQL quedó bloqueado por Docker, no se presenta
como un fallo funcional del modelo. No se afirma revisión humana ni merge.
