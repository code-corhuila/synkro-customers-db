# Model and permissions

Detailed procedures and delivery notes moved from the repository README at
[source 57febd8](https://github.com/code-corhuila/synkro-customers-db/blob/57febd822c9c25739ac2a8e464cae144d7ad322f/README.md).
Recorded execution results retain their original scope; moving them does not
constitute a new execution or certify a different revision.

Run commands from the repository root unless a step explicitly changes directory.

## Model and permissions

| Table | Contract |
|---|---|
| customer | customer_id UUID/gen_random_uuid(); name 1–150; identity_document unique 1–30; nullable email ≤255, phone ≤20 and address ≤255; registration_date timestamptz/now(); active true |
| idempotency_key | key PK 8–128; required customer_id FK with ON DELETE RESTRICT; created_at timestamptz/now() |



Text fields use named CHECK constraints. Identity documents remain unique after deactivation. There are document-uniqueness and foreign-key indexes, no seeds/extensions and no cross-domain relationships.

customers_reader has SELECT; customers_writer has SELECT/INSERT/UPDATE. Both are NOLOGIN. The writer is granted to the infrastructure-created customers_app login. DELETE/TRUNCATE/DDL and migration-ledger access are not granted. Future tables require explicit grants rather than broad default privileges.
