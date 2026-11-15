# Root composition

Detailed procedures and delivery notes moved from the repository README at
[source 57febd8](https://github.com/code-corhuila/synkro-customers-db/blob/57febd822c9c25739ac2a8e464cae144d7ad322f/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## External composition

The root infrastructure includes the owning sibling runner:

```yaml
include:
  - ../synkro-customers-db/deploy/compose.yml
```

Relative mounts resolve from deploy/compose.yml; the optional secret path is absolute. The root defines PostgreSQL and the external platform network; this file neither duplicates the instance nor overrides the root project name.

```sh
docker compose --env-file env/dev.env up -d --wait synkro-db
docker compose --env-file env/dev.env run --rm -T customers-db-migrate migrate
docker compose --env-file env/dev.env run --rm -T customers-db-migrate validate
```

Original consulted contract: [infrastructure handoff](https://github.com/code-corhuila/synkro-infra-postgres/blob/b2fbfbd9ea3f81b451d66ba85465d0c5a4f8656f/docs/owner-handoffs/customers-db.md). To include the file override from the root:

```yaml
include:
  - path:
      - ../synkro-customers-db/deploy/compose.yml
      - ../synkro-customers-db/deploy/compose.secrets.yml
```

The owning suite reproduces this contract; it does not run the complete platform. Serialize administrative runners, require a zero exit and verify privileges before deploying Customers API. Never pass administrator credentials to that API.
