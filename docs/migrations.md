# Migrations

Detailed procedures and delivery notes moved from the repository README at
[source 57febd8](https://github.com/code-corhuila/synkro-customers-db/blob/57febd822c9c25739ac2a8e464cae144d7ad322f/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Migration execution

Prerequisites: Docker Compose 2.20+ with include, a healthy PostgreSQL 16 and the external platform network. Infrastructure provisions customers_app LOGIN INHERIT without administrative privileges, unrelated memberships or object ownership, with search_path customers_schema.

1. Copy .env.example or the environment example into env/dev.env, env/qa.env or env/main.env.
2. Infrastructure supplies FLYWAY_URL, FLYWAY_USER and FLYWAY_PASSWORD through a protected environment; alternatively use the file override below.
3. Infrastructure creates the network, starts PostgreSQL and waits for health.
4. In qa/main, require a verified backup before deliberate migration.

```sh
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate migrate
docker compose --env-file env/dev.env -f deploy/compose.yml run --rm -T customers-db-migrate validate
```

| Variable | Use |
|---|---|
| COMPOSE_PROJECT_NAME | synkro-dev, synkro-qa or synkro-main |
| PLATFORM_NETWORK | External platform; configurable for isolated tests |
| FLYWAY_URL | jdbc:postgresql://synkro-db:5432/synkro?connectTimeout=5&socketTimeout=60 |
| FLYWAY_USER | Infrastructure-supplied migration administrator |
| FLYWAY_PASSWORD | Protected environment credential, never a command argument |
| FLYWAY_PASSWORD_FILE | Mounted in-container credential file; takes precedence |
| CUSTOMERS_FLYWAY_URL | Legacy alias used only when FLYWAY_URL is empty |
| DB_ADMIN_USER | Legacy alias used only when FLYWAY_USER is empty |
| CUSTOMERS_DB_ADMIN_PASSWORD_FILE | Absolute host secret path with deploy/compose.secrets.yml |

The standard mode does not require a file. For a protected external file (restricted ACL or 0600), append -f deploy/compose.secrets.yml after -f deploy/compose.yml. It mounts the secret and sets FLYWAY_PASSWORD_FILE. An invalid/empty configured file fails instead of falling back to the environment credential. Do not publish expanded secret-bearing Compose output.

The URL accepts hostnames/IPv4, not IPv6, embedded credentials or arbitrary parameters. Infrastructure mounts trust certificates for verified TLS. Passwords may contain quotes, spaces, dollar signs and slashes; the wrapper removes trailing line breaks. Credentials are not process arguments and SQL/JDBC logs are suppressed. Restrict host/Docker administrative access because it can inspect processes and secrets.

Flyway is pinned to 10.20.1. The runner is in tooling, publishes no port, owns no database/volume and mounts the repository read-only. Ordinary up does not migrate. Three retries complement health readiness. JDBC defaults are connectTimeout=5, loginTimeout=10 and socketTimeout=60 seconds. URL overrides may reduce them to 1..5, 1..10 and 1..60, never disable or duplicate them; sslmode supports disable/prefer/require/verify-ca/verify-full. URL settings take precedence over JDBC file properties, so they are validated explicitly.

These are not total migration-duration guarantees. With images and Docker/DNS available, the paused-engine fixture must exit itself within 90 seconds; socketTimeout=2 must bound a stalled read below 30 seconds. The harness's 180-second watchdog does not count as success.

The wrapper returns 2 for invalid configuration/operation and propagates Flyway failures. Only migrate/validate/info are accepted, without arbitrary options; info emits a safe confirmation, not raw details. Administrative ledger inspection:

```sql
SELECT version, description, success
FROM customers_schema.flyway_schema_history ORDER BY installed_rank;
```
