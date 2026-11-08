import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync, existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';

// No external database URL is accepted: all destructive checks own a fresh container.
const root = resolve(import.meta.dirname, '..');
const id = `customers-test-${randomBytes(6).toString('hex')}`;
const work = resolve(root, '.test-run', id);
const network = `${id}-network`;
const db = `${id}-postgres`;
const secret = () => `A'"$\\ space:${randomBytes(24).toString('hex')}`;
const adminPassword = secret();
const appPassword = secret();
const otherPassword = secret();
const env = { ...process.env, COMPOSE_PROJECT_NAME: id, PLATFORM_NETWORK: network,
  FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/synkro?connectTimeout=5&socketTimeout=60',
  FLYWAY_USER: 'postgres', FLYWAY_PASSWORD: adminPassword,
  FLYWAY_PASSWORD_FILE: '', CUSTOMERS_FLYWAY_URL: '', DB_ADMIN_USER: '',
  CUSTOMERS_DB_ADMIN_PASSWORD_FILE: '' };
const compose = ['compose', '-f', resolve(work, 'compose.json')];
const secretCompose = ['compose', '-f', resolve(work, 'compose-secrets.json')];
let started = false;

function docker(args, { input, variables = {}, ok = true } = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', input,
    env: { ...env, ...variables }, timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  // Never include command output: SQL/errors may contain passwords and input data.
  if (ok) assert.equal(r.status, 0, `Docker operation failed: ${args[0]} (exit ${r.status}; ${r.error?.code ?? 'see protected local diagnostics'})`);
  return r;
}
function sql(query, user = 'postgres', ok = true, password) {
  return docker(['exec', '-i', '-e', 'PGPASSWORD', db, 'psql', '-X', '-h', '127.0.0.1',
    '-U', user, '-d', 'synkro', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At'],
  { input: query, ok, variables: { PGPASSWORD: password ?? (user === 'postgres' ? adminPassword : user === 'customers_app' ? appPassword : otherPassword) } });
}
const value = query => sql(query).stdout.trim();
const literal = s => `'${s.replaceAll("'", "''")}'`;
function reject(query, state, user = 'customers_app') {
  const r = sql(query, user, false);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, new RegExp(`\\b${state}\\b`));
}
function runner(command = 'migrate', overrides = {}, ok = true, extra = [], fileMode = false) {
  const r = docker([...(fileMode ? secretCompose : compose), 'run', '--rm', '-T', ...extra, 'customers-db-migrate', command], { variables: overrides, ok });
  for (const s of [adminPassword, appPassword, otherPassword]) {
    assert.ok(!`${r.stdout}${r.stderr}`.includes(s), 'Runner leaked a credential');
  }
  return r;
}
const history = () => value('SELECT row_to_json(h) FROM customers_schema.flyway_schema_history h ORDER BY installed_rank');
// HU-CLI-05: the first seven migrations are the historical ones (never edited); V008-V014 are additive and compatible with
// the previous API. The contacts CHECK is NOT a migration yet (scripts/pending-activation, exercised by CONT-07).
const HISTORICAL = 7;
const MIGRATIONS = '14';
const contacts = "'cliente@example.test','3001234567','Calle 1 # 2-3'";
const insert = (doc = randomUUID().slice(0, 24)) => `INSERT INTO customers_schema.customer(name,identity_document,email,phone,address) VALUES ('Cliente',${literal(doc)},${contacts}) RETURNING customer_id`;

before(async () => {
  mkdirSync(work, { recursive: true, mode: 0o700 });
  writeFileSync(resolve(work, 'admin.secret'), adminPassword, { mode: 0o600 });
  writeFileSync(resolve(work, 'wrong.secret'), secret(), { mode: 0o600 });
  writeFileSync(resolve(work, 'compose.json'), JSON.stringify({ include: [resolve(root, 'deploy/compose.yml')] }));
  writeFileSync(resolve(work, 'compose-secrets.json'), JSON.stringify({ include: [{ path: [resolve(root, 'deploy/compose.yml'), resolve(root, 'deploy/compose.secrets.yml')] }] }));
  docker(['network', 'create', network]);
  docker(['run', '-d', '--name', db, '--network', network, '--network-alias', 'synkro-db',
    '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB=synkro',
    '-e', 'POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256',
    'postgres:16.6-alpine'], { variables: { POSTGRES_PASSWORD: adminPassword } });
  started = true;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (sql('SELECT 1', 'postgres', false).status === 0) { ready = true; break; }
    await new Promise(r => setTimeout(r, 1000));
  }
  assert.ok(ready, 'Ephemeral PostgreSQL did not become healthy');
  sql(`CREATE ROLE customers_app LOGIN PASSWORD ${literal(appPassword)};
       ALTER ROLE customers_app SET search_path = customers_schema;
       CREATE ROLE auth_app LOGIN PASSWORD ${literal(otherPassword)};
       CREATE ROLE products_app LOGIN PASSWORD ${literal(otherPassword)};
       CREATE ROLE workflow_app LOGIN PASSWORD ${literal(otherPassword)};
       CREATE ROLE test_reader LOGIN PASSWORD ${literal(otherPassword)};
       CREATE SCHEMA other_schema;
       CREATE TABLE other_schema.sentinel(id integer PRIMARY KEY);
       INSERT INTO other_schema.sentinel VALUES (42);
       GRANT USAGE ON SCHEMA other_schema TO products_app;
       GRANT SELECT, INSERT, UPDATE ON other_schema.sentinel TO products_app;`);
});

after(() => {
  if (started) docker(['rm', '-f', db], { ok: false });
  docker(['network', 'rm', network], { ok: false });
  // Only the randomly named directory created above, under this repository.
  rmSync(work, { recursive: true, force: true });
});

test('CLI-DB-01/09/12: external composition migrates empty PostgreSQL with exclusive history', () => {
  sql('ALTER ROLE customers_app RENAME TO absent_customers_app');
  try {
    assert.notEqual(runner('migrate', {}, false).status, 0);
    assert.equal(value("SELECT count(*) FROM pg_namespace WHERE nspname='customers_schema'"), '0');
  } finally { sql('ALTER ROLE absent_customers_app RENAME TO customers_app'); }
  runner();
  assert.equal(value("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), MIGRATIONS);
  assert.equal(value("SELECT count(*) FROM pg_tables WHERE tablename='flyway_schema_history' AND schemaname <> 'customers_schema'"), '0');
  assert.equal(value("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='customers_schema' AND tablename <> 'flyway_schema_history'"), 'customer,customer_audit,idempotency_key');
  assert.equal(value('SELECT id FROM other_schema.sentinel'), '42');
  runner('validate');
});

test('CLI-DB-11: real application authentication rejects an incorrect password', () => {
  assert.notEqual(sql('SELECT current_user', 'customers_app', false, 'incorrect-test-password').status, 0);
});

test('CONT-03: original commit database validates after relocation without changing history or data', t => {
  const original = resolve(work, 'original');
  const commit = '90b02296f7b057a4cfc6fbe6be4f78afe7cbe9a4';
  const listing = spawnSync('git', ['ls-tree', '-r', '--name-only', commit], { cwd: root, encoding: 'utf8' });
  assert.equal(listing.status, 0);
  for (const path of listing.stdout.trim().split('\n')) {
    const blob = spawnSync('git', ['show', `${commit}:${path}`], { cwd: root });
    assert.equal(blob.status, 0);
    const target = resolve(original, path);
    mkdirSync(resolve(target, '..'), { recursive: true });
    writeFileSync(target, blob.stdout);
  }
  // Separate database, on this suite's own tmpfs instance. No persistent URL accepted.
  sql('CREATE DATABASE original_test');
  const originalSql = query => docker(['exec', '-i', '-e', 'PGPASSWORD', db, 'psql', '-X', '-h', '127.0.0.1',
    '-U', 'postgres', '-d', 'original_test', '-v', 'ON_ERROR_STOP=1', '-At'], { input: query, variables: { PGPASSWORD: adminPassword } }).stdout.trim();
  const originalEnv = { CUSTOMERS_FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/original_test',
    DB_ADMIN_USER: 'postgres', CUSTOMERS_DB_ADMIN_PASSWORD_FILE: resolve(work, 'admin.secret') };
  docker(['compose', '-f', resolve(original, 'deploy/compose.yml'), 'run', '--rm', '-T', 'customers-migrate', 'migrate'], { variables: originalEnv });
  // Synthetic historical customers, written by the ORIGINAL schema (nullable contacts): complete, missing,
  // invalid phone, blank email, and an inactive one. HU-CLI-05 must preserve every one of them.
  originalSql(`INSERT INTO customers_schema.customer(name,identity_document,email,phone,address,active) VALUES
    ('Synthetic','relocation-proof',NULL,NULL,NULL,true),
    ('Legacy complete','legacy-complete','legacy@example.test','3001234567','Calle 1',true),
    ('Legacy short phone','legacy-short-phone','short@example.test','12345','Calle 2',true),
    ('Legacy blank email','legacy-blank-email','   ','3001234567','Calle 3',true),
    ('Legacy inactive','legacy-inactive',NULL,NULL,NULL,false);
    INSERT INTO customers_schema.idempotency_key(key,customer_id) SELECT 'relocation-proof-key', customer_id FROM customers_schema.customer WHERE identity_document='relocation-proof';
    INSERT INTO customers_schema.idempotency_key(key,customer_id) SELECT 'legacy-inactive-key', customer_id FROM customers_schema.customer WHERE identity_document='legacy-inactive';`);
  const snapshot = () => originalSql('SELECT row_to_json(h) FROM customers_schema.flyway_schema_history h ORDER BY installed_rank');
  // The original columns only: V012 adds the generated search columns, which never carried data of their own.
  const rows = () => originalSql('SELECT row_to_json(c) FROM (SELECT customer_id,name,identity_document,email,phone,address,registration_date,active FROM customers_schema.customer ORDER BY identity_document) c; SELECT row_to_json(k) FROM customers_schema.idempotency_key k ORDER BY key');
  const originalAs = (user, query, ok = true) => docker(['exec', '-i', '-e', 'PGPASSWORD', db, 'psql', '-X', '-h', '127.0.0.1',
    '-U', user, '-d', 'original_test', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At'], { input: query, ok, variables: { PGPASSWORD: appPassword } });
  const before = snapshot(), data = rows();
  assert.equal(originalSql("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), String(HISTORICAL));
  t.diagnostic(`original version/script/checksums: ${originalSql("SELECT version || ':' || script || ':' || checksum FROM customers_schema.flyway_schema_history WHERE type='SQL' ORDER BY installed_rank").replaceAll('\n', ', ')}`);
  const proposed = resolve(work, 'proposed');
  mkdirSync(proposed);
  for (const path of ['01_ddl', '02_dml', '03_dcl', '04_tcl', 'flyway.toml', 'scripts']) cpSync(resolve(root, path), resolve(proposed, path), { recursive: true });
  const oldFamily = resolve(proposed, '01_ddl/00_schemas');
  if (existsSync(oldFamily)) renameSync(oldFamily, resolve(proposed, '01_ddl/01_schemas'));
  assert.ok(existsSync(resolve(proposed, '01_ddl/01_schemas/V001__create_customers_schema.sql')));
  // The runner validates the historical checksums first and then applies only the additive V008+ migrations.
  for (const command of ['migrate', 'validate']) runner(command, { FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/original_test' }, true, ['-v', `${proposed}:/workspace:ro`]);
  // HU-CLI-05 Scenario 3: history rows 1-7 (version, script, checksum) are byte-identical; data and UUIDs untouched.
  assert.equal(snapshot().split('\n').slice(0, HISTORICAL + 1).join('\n'), before);   // + the schema-creation row
  assert.equal(originalSql("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), MIGRATIONS);
  assert.equal(rows(), data);
  assert.equal(originalSql('SELECT count(*) FROM customers_schema.customer'), '5');
  // No repair was performed: the incomplete/invalid contacts are still exactly as written, nothing fabricated.
  assert.equal(originalSql("SELECT count(*) FROM customers_schema.customer WHERE email IS NULL OR phone IS NULL OR address IS NULL OR email !~ '[^[:space:]]' OR phone !~ '^[0-9]{10}$'"), '4');
  // Legacy rows remain operable for the lifecycle: rename, deactivate and reactivate even with missing contacts.
  originalAs('customers_app', "UPDATE customers_schema.customer SET name='Legacy renamed' WHERE identity_document='relocation-proof'");
  originalAs('customers_app', "UPDATE customers_schema.customer SET active=false WHERE identity_document='legacy-short-phone'; UPDATE customers_schema.customer SET active=true WHERE identity_document='legacy-inactive'");
  assert.equal(originalSql("SELECT count(*) FROM customers_schema.customer WHERE identity_document='legacy-inactive' AND active AND email IS NULL"), '1');
  // Expansion only: the database does not (yet) require contacts, so a write by the PREVIOUS API (no contacts, or the
  // loose formats it accepted) is still stored. The API enforces completeness; the CHECK is pending activation.
  const newRow = (fields) => `INSERT INTO customers_schema.customer(name,identity_document,email,phone,address) VALUES ('Nuevo',${literal(randomUUID().slice(0, 24))},${fields})`;
  for (const legacyWrite of ["NULL,NULL,NULL", "'a@example.test','300-123-4567','Calle 1'", "'   ','3001234567','Calle 1'"]) originalAs('customers_app', newRow(legacyWrite));
  assert.match(originalAs('customers_app', newRow(`'a@example.test','${'1'.repeat(21)}','Calle 1'`), false).stderr, /\b23514\b/);   // the original length limits still apply
  originalAs('customers_app', newRow(contacts));
  // The stored search columns were backfilled by the migration for rows written before it existed.
  assert.equal(originalSql("SELECT count(*) FROM customers_schema.customer WHERE name_search IS DISTINCT FROM customers_schema.fold_search_text(name) OR document_search IS DISTINCT FROM customers_schema.fold_search_text(identity_document)"), '0');
  assert.match(originalAs('customers_app', `INSERT INTO customers_schema.customer(name,identity_document,email,phone,address) VALUES ('Dup','legacy-inactive',${contacts})`, false).stderr, /\b23505\b/);
  // Audit table: append-only for the application login, tied to existing customers.
  originalAs('customers_app', "INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) SELECT customer_id,'REACTIVATED','00000000-0000-4000-8000-000000000001' FROM customers_schema.customer WHERE identity_document='legacy-inactive'");
  for (const query of ["UPDATE customers_schema.customer_audit SET action='REACTIVATED'", 'DELETE FROM customers_schema.customer_audit', 'TRUNCATE customers_schema.customer_audit'])
    assert.match(originalAs('customers_app', query, false).stderr, /\b42501\b/, query);
  assert.match(originalAs('customers_app', "INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) VALUES (gen_random_uuid(),'REACTIVATED','00000000-0000-4000-8000-000000000001')", false).stderr, /\b23503\b/);
  assert.match(originalAs('customers_app', "INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) SELECT customer_id,'DELETED','00000000-0000-4000-8000-000000000001' FROM customers_schema.customer LIMIT 1", false).stderr, /\b23514\b/);
  originalSql('REVOKE ALL ON SCHEMA customers_schema FROM customers_reader,customers_writer; REVOKE ALL ON customers_schema.customer,customers_schema.idempotency_key,customers_schema.customer_audit FROM customers_reader,customers_writer');
  sql('DROP DATABASE original_test');
});

test('CONT-04: unsafe preexisting roles block even a no-op runner without altering them', () => {
  runner();
  const before = history();
  for (const role of ['customers_reader', 'customers_writer']) {
    sql(`ALTER ROLE ${role} LOGIN`);
    try {
      assert.notEqual(runner('migrate', {}, false).status, 0);
      assert.equal(value(`SELECT rolcanlogin FROM pg_roles WHERE rolname='${role}'`), 't');
      assert.equal(history(), before);
    } finally { sql(`ALTER ROLE ${role} NOLOGIN`); }
  }
  runner('validate');
});

test('CONT-05: safe existing roles are preserved and unexpected rollback dependencies fail atomically', () => {
  const roleIds = value("SELECT oid FROM pg_roles WHERE rolname IN ('customers_reader','customers_writer') ORDER BY rolname");
  sql(readFileSync(resolve(root, '03_dcl/00_roles/V006__create_roles.sql'), 'utf8'));
  assert.equal(value("SELECT oid FROM pg_roles WHERE rolname IN ('customers_reader','customers_writer') ORDER BY rolname"), roleIds);
  sql('GRANT USAGE ON SCHEMA other_schema TO customers_reader');
  try { reject(`BEGIN; ${readFileSync(resolve(root, '05_rollbacks/03_dcl/01_grants/U007__grant_permissions.sql'), 'utf8')} ${readFileSync(resolve(root, '05_rollbacks/03_dcl/00_roles/U006__create_roles.sql'), 'utf8')} COMMIT;`, '2BP01', 'postgres'); }
  finally { sql('REVOKE USAGE ON SCHEMA other_schema FROM customers_reader'); }
  assert.equal(value("SELECT oid FROM pg_roles WHERE rolname IN ('customers_reader','customers_writer') ORDER BY rolname"), roleIds);
  sql('CREATE VIEW other_schema.customer_dependency AS SELECT customer_id FROM customers_schema.customer');
  try { reject(`BEGIN; ALTER TABLE customers_schema.idempotency_key DROP CONSTRAINT fk_idempotency_key_customer; ${readFileSync(resolve(root, '05_rollbacks/01_ddl/03_tables/U002__create_customer.sql'), 'utf8')} COMMIT;`, '2BP01', 'postgres'); }
  finally { sql('DROP VIEW other_schema.customer_dependency'); }
  assert.equal(value('SELECT id FROM other_schema.sentinel'), '42');
  runner('validate');
});

test('CLI-DB-02: repeat migration preserves both data and complete history', () => {
  sql(insert('repeat-migration'), 'customers_app');
  const h = history();
  const rows = value('SELECT row_to_json(c) FROM customers_schema.customer c ORDER BY customer_id');
  runner();
  assert.equal(history(), h);
  assert.equal(value('SELECT row_to_json(c) FROM customers_schema.customer c ORDER BY customer_id'), rows);
});

test('CLI-DB-03/04 + HU-CLI-05: defaults, length boundaries and previous-API-compatible contacts', () => {
  const customer = sql(insert(), 'customers_app').stdout.trim().split('\n')[0];
  assert.match(customer, /^[0-9a-f-]{36}$/);
  const defaults = sql("SELECT customer_id IS NOT NULL AND registration_date <= now() AND active AND email='cliente@example.test' AND phone='3001234567' AND address IS NOT NULL FROM customers_schema.customer WHERE identity_document='repeat-migration'", 'customers_app').stdout.trim();
  assert.equal(defaults, 't');
  const row = (over) => {
    const fields = { name: 'Cliente', identity_document: randomUUID().slice(0, 24), email: 'a@example.test', phone: '3001234567', address: 'Calle 1', ...over };
    return `INSERT INTO customers_schema.customer(${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).map(v => v === null ? 'NULL' : literal(v)).join(',')})`;
  };
  const emailOf = n => `${'a'.repeat(n - 12)}@example.com`; // exactly n characters
  const accepted = [
    { name: 'x' }, { name: 'x'.repeat(150) }, { identity_document: 'x' }, { identity_document: 'x'.repeat(30) },
    { email: 'a@b.co' }, { email: emailOf(255) }, { phone: '0123456789' }, { phone: '0000000000' },
    { address: 'x' }, { address: 'x'.repeat(255) }, { address: 'Carrera 7 # 45-10, Bogotá' },
  ];
  for (const over of accepted) sql(row(over), 'customers_app');
  // Length limits of the original schema still apply. Contact completeness and format are NOT enforced here (pending
  // activation, CONT-07): the previous API may still write contactless or loosely formatted customers.
  const rejected = [
    { name: '' }, { name: 'x'.repeat(151) }, { identity_document: '' }, { identity_document: 'x'.repeat(31) },
    { email: emailOf(256) }, { phone: '1'.repeat(21) }, { address: 'x'.repeat(256) },
  ];
  for (const over of rejected) reject(row(over), '23514');
  for (const over of [{ email: null }, { phone: null }, { address: null }, { email: '' }, { phone: '300-123-4567' }, { email: 'no-at-sign' }, { address: '   ' }])
    sql(row({ ...over, identity_document: 'legacy-' + randomUUID().slice(0, 12) }), 'customers_app');
  for (const column of ['customer_id', 'name', 'identity_document', 'registration_date', 'active']) {
    const fields = { name: "'Cliente'", identity_document: literal(randomUUID().slice(0,24)), [column]: 'NULL' };
    reject(`INSERT INTO customers_schema.customer(${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).join(',')})`, '23502');
  }
  for (const column of ['name', 'identity_document']) {
    const other = column === 'name' ? 'identity_document' : 'name';
    reject(`INSERT INTO customers_schema.customer(${other}) VALUES ('required')`, '23502');
  }
});

test('CLI-DB-05: deactivation preserves the row and permanent document uniqueness', () => {
  sql("UPDATE customers_schema.customer SET active=false WHERE identity_document='repeat-migration'", 'customers_app');
  assert.equal(value("SELECT count(*) FROM customers_schema.customer WHERE identity_document='repeat-migration' AND NOT active"), '1');
  reject(insert('repeat-migration'), '23505');
});

test('CLI-DB-06: key boundaries, mandatory fields, duplicate, FK/index and atomic rollback', () => {
  const customerId = sql(insert('atomic-success'), 'customers_app').stdout.trim().split('\n')[0];
  for (const n of [8, 128]) sql(`INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES (${literal('k'.repeat(n))},'${customerId}')`, 'customers_app');
  for (const n of [7, 129]) reject(`INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES (${literal('k'.repeat(n))},'${customerId}')`, '23514');
  reject(`INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('kkkkkkkk','${customerId}')`, '23505');
  reject(`INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('no-owner','${randomUUID()}')`, '23503');
  for (const column of ['key', 'customer_id', 'created_at']) {
    const fields = { key: "'null-key'", customer_id: `'${customerId}'`, [column]: 'NULL' };
    reject(`INSERT INTO customers_schema.idempotency_key(${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).join(',')})`, '23502');
  }
  assert.equal(value("SELECT bool_and(created_at <= now()) FROM customers_schema.idempotency_key"), 't');
  assert.equal(value("SELECT confdeltype FROM pg_constraint WHERE conname='fk_idempotency_key_customer'"), 'r');
  assert.match(value("SELECT indexdef FROM pg_indexes WHERE schemaname='customers_schema' AND indexname='idx_idempotency_key_customer_id'"), /\(customer_id\)/);
  reject(`DELETE FROM customers_schema.customer WHERE customer_id='${customerId}'`, '23503', 'postgres');
  const failedId = randomUUID();
  reject(`BEGIN; INSERT INTO customers_schema.customer(customer_id,name,identity_document,email,phone,address) VALUES ('${failedId}','Atomic','atomic-failed',${contacts}); INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('kkkkkkkk','${failedId}'); COMMIT;`, '23505');
  assert.equal(value(`SELECT count(*) FROM customers_schema.customer WHERE customer_id='${failedId}'`), '0');
  const successId = randomUUID();
  sql(`BEGIN; INSERT INTO customers_schema.customer(customer_id,name,identity_document,email,phone,address) VALUES ('${successId}','Atomic','atomic-commit',${contacts}); INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('atomic-commit-key','${successId}'); COMMIT;`, 'customers_app');
  assert.equal(value(`SELECT count(*) FROM customers_schema.customer c JOIN customers_schema.idempotency_key k USING(customer_id) WHERE c.customer_id='${successId}'`), '1');
});

test('CLI-DB-07/08: real app and reader sessions enforce least privilege and domain isolation', () => {
  assert.equal(sql('SELECT current_user', 'customers_app').stdout.trim(), 'customers_app');
  sql("UPDATE customers_schema.idempotency_key SET key='renamed-key' WHERE key='kkkkkkkk'", 'customers_app');
  sql('SELECT * FROM customers_schema.customer; SELECT * FROM customers_schema.idempotency_key', 'customers_app');
  for (const table of ['customer', 'idempotency_key']) {
    for (const operation of ['DELETE FROM', 'TRUNCATE']) reject(`${operation} customers_schema.${table}`, '42501');
    reject(`ALTER TABLE customers_schema.${table} ADD COLUMN bad integer`, '42501');
    reject(`DROP TABLE customers_schema.${table}`, '42501');
  }
  for (const q of ['CREATE TABLE customers_schema.bad(id integer)', 'DROP SCHEMA customers_schema CASCADE',
    'SELECT * FROM customers_schema.flyway_schema_history', 'DELETE FROM customers_schema.flyway_schema_history',
    'UPDATE customers_schema.flyway_schema_history SET success=false',
    "INSERT INTO customers_schema.flyway_schema_history(installed_rank,description,type,script,installed_by,execution_time,success) VALUES (99,'bad','SQL','bad','bad',0,true)",
    'TRUNCATE customers_schema.flyway_schema_history', 'ALTER TABLE customers_schema.flyway_schema_history ADD COLUMN bad integer',
    'SELECT * FROM other_schema.sentinel', 'INSERT INTO other_schema.sentinel VALUES (43)',
    'SET ROLE postgres']) reject(q, '42501');
  for (const user of ['auth_app', 'products_app', 'workflow_app']) {
    for (const table of ['customer', 'idempotency_key', 'flyway_schema_history']) reject(`SELECT * FROM customers_schema.${table}`, '42501', user);
    reject(insert(), '42501', user);
    reject('SET ROLE customers_writer', '42501', user);
  }
  assert.equal(value("SELECT count(*) FROM pg_roles WHERE rolname IN ('customers_reader','customers_writer') AND NOT rolcanlogin AND NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole AND NOT rolbypassrls"), '2');
  sql('GRANT customers_reader TO test_reader');
  sql('SELECT * FROM customers_schema.customer; SELECT * FROM customers_schema.idempotency_key', 'test_reader');
  reject(insert(), '42501', 'test_reader');
  reject('UPDATE customers_schema.customer SET active=false', '42501', 'test_reader');
  reject('SELECT * FROM customers_schema.flyway_schema_history', '42501', 'test_reader');
  sql('REVOKE customers_reader FROM test_reader');
  // New tables must not silently become writable through default privileges.
  sql('CREATE TABLE customers_schema.future_private(id integer)');
  reject('SELECT * FROM customers_schema.future_private', '42501');
  sql('DROP TABLE customers_schema.future_private');
});

test('HU-CLI-05: search folding is immutable, case/accent-insensitive and available to the app login', () => {
  const fold = s => sql(`SELECT customers_schema.fold_search_text(${literal(s)})`, 'customers_app').stdout.trim();
  assert.equal(fold('Ana María PÉREZ'), 'ana maria perez');
  assert.equal(fold('Muñoz Núñez'), 'munoz nunez');
  assert.equal(fold('ÁÉÍÓÚÜÑ áéíóúüñ çÇ àèìòù âêîôû äëïöü ãõ ÿý'), 'aeiouun aeiouun cc aeiou aeiou aeiou ao yy');
  assert.equal(fold('María José'), 'maria jose'); // decomposed (NFD) accents
  assert.equal(fold('900.123.456-7 AB_12 %\\'), '900.123.456-7 ab_12 %\\'); // punctuation and wildcards untouched
  assert.equal(sql('SELECT customers_schema.fold_search_text(NULL) IS NULL', 'customers_app').stdout.trim(), 't');
  assert.equal(value("SELECT provolatile::text || proisstrict::text || prosecdef::text FROM pg_proc WHERE proname='fold_search_text' AND pronamespace='customers_schema'::regnamespace"), 'itruefalse');
  // Immutable means it can back an index; prove it and leave nothing behind.
  sql('CREATE INDEX proof_fold ON customers_schema.customer (customers_schema.fold_search_text(name)); DROP INDEX customers_schema.proof_fold');
  // The search-path of the function is pinned: a hostile schema cannot shadow lower/translate.
  assert.match(value("SELECT array_to_string(proconfig, ',') FROM pg_proc WHERE proname='fold_search_text' AND pronamespace='customers_schema'::regnamespace"), /search_path=pg_catalog/);
});

test('HU-CLI-05: stored search columns are generated, folded, indexed and never writable by the application', () => {
  const doc = 'BÚSQUEDA-' + randomUUID().slice(0, 8);
  const fields = (name, document) => `'${name}',${literal(document)},'cliente@example.test','3001234567','Calle 1'`;
  sql(`INSERT INTO customers_schema.customer(name,identity_document,email,phone,address) VALUES (${fields('María Ñuñez', doc)})`, 'customers_app');
  const read = d => sql(`SELECT name_search || '|' || document_search FROM customers_schema.customer WHERE identity_document=${literal(d)}`, 'customers_app').stdout.trim();
  assert.equal(read(doc), `maria nunez|${doc.replace('Ú', 'u').toLowerCase()}`);
  // The database recomputes them on UPDATE; they cannot disagree with the source columns.
  sql(`UPDATE customers_schema.customer SET name='José PÉREZ' WHERE identity_document=${literal(doc)}`, 'customers_app');
  assert.equal(read(doc).split('|')[0], 'jose perez');
  assert.equal(value('SELECT count(*) FROM customers_schema.customer WHERE name_search IS DISTINCT FROM customers_schema.fold_search_text(name) OR document_search IS DISTINCT FROM customers_schema.fold_search_text(identity_document)'), '0');
  // Generated columns: no application (current or previous) can write them.
  reject(`INSERT INTO customers_schema.customer(name,identity_document,name_search) VALUES ('x',${literal('g-' + randomUUID().slice(0, 8))},'forced')`, '428C9');
  reject(`UPDATE customers_schema.customer SET document_search='forced' WHERE identity_document=${literal(doc)}`, '428C9');
  // Layout: C collation for the document (btree equality and range), default collation for the ordering column, one index.
  assert.equal(value("SELECT string_agg(column_name || '=' || coalesce(collation_name,'default') || ':' || is_generated, ',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='customers_schema' AND table_name='customer' AND column_name IN ('name_search','document_search')"), 'document_search=C:ALWAYS,name_search=default:ALWAYS');
  assert.match(value("SELECT indexdef FROM pg_indexes WHERE schemaname='customers_schema' AND indexname='idx_customer_document_search'"), /\(document_search\)/);
  assert.equal(value("SELECT count(*) FROM pg_indexes WHERE schemaname='customers_schema' AND tablename='customer' AND indexdef ILIKE '%name_search%'"), '0');
  // The planner can use it for exact and prefix (range) lookups.
  for (const where of ["document_search = 'x'", "document_search >= 'x' AND document_search < 'x' || chr(1114111)"])
    assert.match(sql(`SET enable_seqscan=off; EXPLAIN (COSTS OFF) SELECT 1 FROM customers_schema.customer WHERE ${where}`, 'customers_app').stdout, /idx_customer_document_search/);
});

test('CONT-07: the prepared contacts CHECK is outside every migration and works when activated (pending activation)', () => {
  const pending = file => readFileSync(resolve(root, 'scripts/pending-activation', file), 'utf8');
  sql('CREATE DATABASE activation_test');
  try {
    runner('migrate', { FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/activation_test' });
    const psql = (user, password, query, ok = true) => docker(['exec', '-i', '-e', 'PGPASSWORD', db, 'psql', '-X', '-h', '127.0.0.1', '-U', user, '-d', 'activation_test',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-At'], { input: query, ok, variables: { PGPASSWORD: password } });
    const admin = query => psql('postgres', adminPassword, query).stdout.trim();
    const app = (query, ok = true) => psql('customers_app', appPassword, query, ok);
    const row = over => {
      const f = { name: 'Cliente', identity_document: randomUUID().slice(0, 24), email: 'a@example.test', phone: '3001234567', address: 'Calle 1', ...over };
      return `INSERT INTO customers_schema.customer(${Object.keys(f).join(',')}) VALUES (${Object.values(f).map(v => v === null ? 'NULL' : literal(v)).join(',')})`;
    };
    const constraint = "SELECT count(*) FROM pg_constraint WHERE conname='chk_customer_contacts_required'";
    // Historical customers written before activation, without contacts.
    admin("INSERT INTO customers_schema.customer(name,identity_document,active) VALUES ('Historical','hist-active',true),('Historical','hist-inactive',false)");
    const applied = admin("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success");
    assert.equal(applied, MIGRATIONS);
    assert.equal(admin(constraint), '0');                                       // not applied by Flyway
    app(row({ email: null, phone: null, address: null }));                      // previous-API write: stored
    admin(pending('require-contacts-check.sql'));
    assert.equal(admin(constraint), '1');
    runner('validate', { FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/activation_test' });   // history/checksums untouched
    assert.equal(admin("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), applied);
    // Historical rows stay operable: rename, deactivate, reactivate, with incomplete contacts and without inventing any.
    app("UPDATE customers_schema.customer SET name='Renamed' WHERE identity_document='hist-active'; UPDATE customers_schema.customer SET active=false WHERE identity_document='hist-active'; UPDATE customers_schema.customer SET active=true WHERE identity_document='hist-inactive'");
    assert.equal(admin("SELECT count(*) FROM customers_schema.customer WHERE identity_document LIKE 'hist-%' AND email IS NULL AND phone IS NULL AND address IS NULL"), '2');
    const rejected = [
      { email: null }, { phone: null }, { address: null }, { email: '' }, { phone: '' }, { address: '' }, { email: '   ' }, { address: '   ' }, { address: '\t\n' }, { phone: ' ' },
      { email: 'no-at-sign' }, { email: 'a@b' }, { email: 'a b@example.com' }, { email: 'a@@example.com' }, { email: '@example.com' }, { email: 'a@.com' }, { email: ' a@example.com' }, { email: 'a@example.com ' },
      { phone: '123456789' }, { phone: '12345678901' }, { phone: '30012345a7' }, { phone: '+573001234567' }, { phone: '300.1234567' }, { phone: '300 123 4567' }, { phone: '300-123-4567' }, { phone: '٣٠٠١٢٣٤٥٦٧' }, { phone: '3001234567\n' },
    ];
    for (const over of rejected) assert.match(app(row(over), false).stderr, /\b23514\b/, JSON.stringify(over));
    for (const over of [{}, { email: 'a@b.co' }, { phone: '0123456789' }, { address: 'Carrera 7 # 45-10, Bogotá' }]) app(row(over));
    // Rollback script removes it and contactless writes work again (the previous API is usable again).
    admin(pending('require-contacts-check.rollback.sql'));
    assert.equal(admin(constraint), '0');
    app(row({ email: null, phone: null, address: null }));
  } finally { sql('DROP DATABASE activation_test', 'postgres', false); }
});

test('HU-CLI-05: customer_audit is append-only for the app, readable by the reader, private to other domains', () => {
  const id = sql(insert('audited'), 'customers_app').stdout.trim().split('\n')[0];
  const actor = randomUUID();
  const audit = `INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id,correlation_id) VALUES ('${id}','REACTIVATED','${actor}','trace-1') RETURNING audit_id, occurred_at <= now()`;
  assert.match(sql(audit, 'customers_app').stdout, /^[0-9a-f-]{36}\|t$/m);
  assert.equal(value(`SELECT count(*) FROM customers_schema.customer_audit WHERE customer_id='${id}' AND actor_id='${actor}'`), '1');
  for (const q of ['UPDATE customers_schema.customer_audit SET actor_id=gen_random_uuid()', 'DELETE FROM customers_schema.customer_audit',
    'TRUNCATE customers_schema.customer_audit', 'ALTER TABLE customers_schema.customer_audit ADD COLUMN bad integer', 'DROP TABLE customers_schema.customer_audit']) reject(q, '42501');
  // Columns: unknown action, null operator and an orphan customer are impossible; the audited customer cannot be deleted.
  reject(`INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) VALUES ('${id}','OTHER','${actor}')`, '23514');
  reject(`INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) VALUES ('${id}','REACTIVATED',NULL)`, '23502');
  reject(`INSERT INTO customers_schema.customer_audit(customer_id,action,actor_id) VALUES ('${randomUUID()}','REACTIVATED','${actor}')`, '23503');
  reject(`DELETE FROM customers_schema.customer WHERE customer_id='${id}'`, '23503', 'postgres');
  assert.equal(value("SELECT confdeltype FROM pg_constraint WHERE conname='fk_customer_audit_customer'"), 'r');
  assert.match(value("SELECT indexdef FROM pg_indexes WHERE schemaname='customers_schema' AND indexname='idx_customer_audit_customer_id'"), /\(customer_id\)/);
  for (const user of ['auth_app', 'products_app', 'workflow_app']) reject('SELECT * FROM customers_schema.customer_audit', '42501', user);
  sql('GRANT customers_reader TO test_reader');
  try {
    sql('SELECT * FROM customers_schema.customer_audit', 'test_reader');
    reject(audit, '42501', 'test_reader');
  } finally { sql('REVOKE customers_reader FROM test_reader'); }
});

test('CLI-DB-11: invalid configuration, credentials, connection and missing user fail without secrets', () => {
  for (const overrides of [
    { FLYWAY_URL: '' }, { FLYWAY_USER: '' }, { FLYWAY_PASSWORD: '' },
    { FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/synkro?password=forbidden' },
    { FLYWAY_URL: 'jdbc:postgresql://synkro-db:1/synkro' },
    { FLYWAY_PASSWORD: otherPassword },
  ]) assert.notEqual(runner('migrate', overrides, false).status, 0);
  writeFileSync(resolve(work, 'empty.secret'), '', { mode: 0o600 });
  assert.notEqual(runner('migrate', { CUSTOMERS_DB_ADMIN_PASSWORD_FILE: resolve(work, 'empty.secret') }, false, [], true).status, 0);
  assert.notEqual(runner('migrate', {}, false, ['-e', 'FLYWAY_PASSWORD_FILE=/missing-secret']).status, 0);
  for (const command of ['clean', 'repair', '-X']) assert.notEqual(runner(command, {}, false).status, 0);
  const h = history();
  sql('ALTER ROLE customers_app RENAME TO absent_customers_app');
  try { assert.notEqual(runner('migrate', {}, false).status, 0); }
  finally { sql('ALTER ROLE absent_customers_app RENAME TO customers_app'); }
  assert.equal(history(), h);
  sql('CREATE TABLE public.flyway_schema_history(marker integer)');
  try { assert.notEqual(runner('migrate', {}, false).status, 0); }
  finally { sql('DROP TABLE public.flyway_schema_history'); }
  assert.equal(history(), h);
});

test('REV-01: published infrastructure interface, external include and file precedence', () => {
  // Independently executable with --test-name-pattern=REV; only this test owns setup migrations.
  runner();
  const h = history();
  const config = JSON.parse(docker([...compose, '--profile', 'tooling', 'config', '--format', 'json']).stdout);
  const service = config.services['customers-db-migrate'];
  assert.deepEqual(service.profiles, ['tooling']);
  assert.ok(!service.ports?.length);
  assert.equal(config.networks.platform.external, true);
  assert.equal(config.networks.platform.name, network);
  assert.ok(service.volumes.some(v => v.target === '/workspace' && v.read_only));
  assert.equal(service.environment.FLYWAY_URL, env.FLYWAY_URL);
  assert.equal(service.environment.FLYWAY_USER, env.FLYWAY_USER);
  // Compose config escapes dollars for re-interpolation. The successful SCRAM
  // migration above verifies the exact credential delivered to the container.
  assert.ok(service.environment.FLYWAY_PASSWORD, 'Environment credential must be wired');
  runner('validate', { CUSTOMERS_FLYWAY_URL: 'invalid-legacy-url', DB_ADMIN_USER: 'invalid-legacy-user' });
  runner('validate', { FLYWAY_URL: '', FLYWAY_USER: '', CUSTOMERS_FLYWAY_URL: env.FLYWAY_URL, DB_ADMIN_USER: env.FLYWAY_USER });
  runner('validate', { FLYWAY_PASSWORD: '', CUSTOMERS_DB_ADMIN_PASSWORD_FILE: resolve(work, 'admin.secret') }, true, [], true);
  runner('validate', { FLYWAY_PASSWORD: otherPassword, CUSTOMERS_DB_ADMIN_PASSWORD_FILE: resolve(work, 'admin.secret') }, true, [], true);
  // A configured bad file must never silently fall back to the good environment password.
  assert.notEqual(runner('validate', { CUSTOMERS_DB_ADMIN_PASSWORD_FILE: resolve(work, 'wrong.secret') }, false, [], true).status, 0);
  assert.equal(history(), h);
});

test('REV-02: bounded unavailable engine, not a test-process timeout', t => {
  docker(['pause', db]);
  const start = performance.now();
  try {
    const r = runner('info', {}, false);
    const elapsed = performance.now() - start;
    assert.equal(r.error, undefined, 'Runner must exit by itself before the 180s harness guard');
    assert.notEqual(r.status, null);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Flyway failed/); // Reject config/Compose errors as timing evidence.
    assert.ok(elapsed < 90000, `Unavailable engine took ${Math.round(elapsed)} ms`);
    t.diagnostic(`unavailable engine: ${Math.round(elapsed)} ms, exit ${r.status}`);
  } finally { docker(['unpause', db]); }
});

test('REV-03: socket read timeout terminates a real blocked history query', async t => {
  const tag = 'customers_socket_timeout_fixture';
  docker(['exec', '-d', '-e', 'PGPASSWORD', db, 'psql', '-X', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'synkro',
    '-v', 'ON_ERROR_STOP=1', '-c', `SET application_name='${tag}'; BEGIN; LOCK TABLE customers_schema.flyway_schema_history IN ACCESS EXCLUSIVE MODE; SELECT pg_sleep(120); ROLLBACK;`],
  { variables: { PGPASSWORD: adminPassword } });
  try {
    let locked = false;
    for (let i = 0; i < 20; i++) {
      if (value(`SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a USING(pid) WHERE a.application_name='${tag}' AND l.mode='AccessExclusiveLock' AND l.granted`) === '1') { locked = true; break; }
      await new Promise(r => setTimeout(r, 100));
    }
    assert.ok(locked, 'Fixture must hold the actual history lock before timing the runner');
    const start = performance.now();
    const r = runner('info', { FLYWAY_URL: 'jdbc:postgresql://synkro-db:5432/synkro?connectTimeout=5&socketTimeout=2' }, false);
    const elapsed = performance.now() - start;
    assert.equal(r.error, undefined);
    assert.notEqual(r.status, null);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Flyway failed/);
    assert.ok(elapsed >= 2000 && elapsed < 30000, `Blocked read took ${Math.round(elapsed)} ms`);
    t.diagnostic(`blocked history read: ${Math.round(elapsed)} ms, exit ${r.status}`);
  } finally { sql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='${tag}'`); }
  runner('validate');
});

test('REV-04: checksum drift is rejected and the original history can still validate', () => {
  const checksum = value("SELECT checksum FROM customers_schema.flyway_schema_history WHERE version='002'");
  assert.match(checksum, /^-?\d+$/);
  const before = history();
  sql("UPDATE customers_schema.flyway_schema_history SET checksum=checksum+1 WHERE version='002'");
  try {
    const r = runner('validate', {}, false);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Flyway failed/);
  } finally { sql(`UPDATE customers_schema.flyway_schema_history SET checksum=${checksum} WHERE version='002'`); }
  assert.equal(history(), before);
  runner('validate');
});

test('REV-05: URL bounds cannot be disabled or replaced with credential properties', () => {
  for (const query of ['connectTimeout=0', 'connectTimeout=6', 'socketTimeout=0', 'socketTimeout=61',
    'loginTimeout=0', 'loginTimeout=11', 'socketTimeout=2&socketTimeout=0', 'password=forbidden', 'currentSchema=public', 'socketTimeout=2&']) {
    const r = runner('info', { FLYWAY_URL: `jdbc:postgresql://synkro-db:5432/synkro?${query}` }, false);
    assert.equal(r.status, 2, `Unsafe URL properties must fail configuration validation: ${query}`);
    assert.ok(!`${r.stdout}${r.stderr}`.includes('forbidden'));
  }
});

test('CLI-DB-10: reverse every U, preserve external objects and users, rebuild and validate', () => {
  function files(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(resolve(dir,e.name)) : e.name.endsWith('.sql') ? [resolve(dir,e.name)] : []); }
  const rollbacks = files(resolve(root, '05_rollbacks')).sort((a,b) => Number(/U(\d+)__/.exec(b)[1]) - Number(/U(\d+)__/.exec(a)[1]));
  for (const path of rollbacks) {
    if (/U001__/.test(path)) sql('DROP TABLE customers_schema.flyway_schema_history');
    sql(`BEGIN;\n${readFileSync(path, 'utf8')}\nCOMMIT;`);
  }
  assert.equal(value("SELECT count(*) FROM pg_namespace WHERE nspname='customers_schema'"), '0');
  assert.equal(value("SELECT count(*) FROM pg_roles WHERE rolname IN ('customers_reader','customers_writer')"), '0');
  assert.equal(value("SELECT count(*) FROM pg_roles WHERE rolname IN ('customers_app','auth_app','products_app','workflow_app')"), '4');
  assert.equal(sql('SELECT id FROM other_schema.sentinel', 'products_app').stdout.trim(), '42');
  assert.equal(sql('SELECT current_user', 'customers_app').stdout.trim(), 'customers_app');
  runner();
  runner('validate');
  assert.equal(value("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), MIGRATIONS);
  const h = history();
  runner();
  assert.equal(history(), h);
  sql(insert('rebuilt'), 'customers_app');
  reject('DELETE FROM customers_schema.customer', '42501');
});
