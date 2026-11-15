# Testing and recovery

Detailed procedures and delivery notes moved from the repository README at
[source 57febd8](https://github.com/code-corhuila/synkro-customers-db/blob/57febd822c9c25739ac2a8e464cae144d7ad322f/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Testing and recovery

Node.js 20.11+ and Docker/Compose are required; there are no npm packages:

```sh
node --test tests/contract.test.mjs
docker pull postgres:16.6-alpine
docker pull flyway/flyway:10.20.1
node --test --test-concurrency=1 tests/integration.test.mjs
```

The suite creates random networks/PostgreSQL with tmpfs, random passwords and real TCP connections. It accepts no external database URL. It checks constraints, atomicity, permissions, isolation, errors, repeat migration and inverse-U/rebuild behavior, reproduces external include and removes its owned resources/secrets. After forced interruption, inspect customers-test-* and .test-run/ before cleanup.

The original CI retains check-common-files and adds migration-rebuild, with the feature trigger feat/customers-schema-and-migration-runner and permanent-branch/PR events. Migration checkout obtains history for the 90b0229 baseline. CONT-03 checks upgrade from that commit without changing synthetic data/history; CONT-04/05 check preexisting roles and unexpected dependencies.

V001–V007 introduced schema, customer, idempotency_key, FK, index, roles and grants in a single DDL/DML/DCL/TCL sequence, each V with its U under the same family in 05_rollbacks. DML/TCL remain empty without an approved operation. Never edit applied V files, use Community undo or run clean. U files destroy data and are tested only in disposable instances; prefer a corrective forward migration plus backup in qa/main.

The original delivery branch was feat/customers-schema-and-migration-runner. The reviewed 90b0229 commit and Sergio's authorship are preserved. V001/U001 moved to 01_ddl/01_schemas and 05_rollbacks/01_ddl/01_schemas without changing the fourteen SQL names, versions or bytes. Flyway 10.20.1 validates/migrates the original base without history/checksum/data changes; that recorded verification did not query a persistent database.

An old ledger may retain 00_schemas in script and needs no repair. Preflight checks reader/writer NOLOGIN and absence of dangerous instance privileges, including repeat runs with no pending migration.
