import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
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
const insert = (doc = randomUUID().slice(0, 24)) => `INSERT INTO customers_schema.customer(name,identity_document) VALUES ('Cliente',${literal(doc)}) RETURNING customer_id`;

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
  assert.equal(value("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), '7');
  assert.equal(value("SELECT count(*) FROM pg_tables WHERE tablename='flyway_schema_history' AND schemaname <> 'customers_schema'"), '0');
  assert.equal(value("SELECT string_agg(tablename, ',' ORDER BY tablename) FROM pg_tables WHERE schemaname='customers_schema' AND tablename <> 'flyway_schema_history'"), 'customer,idempotency_key');
  assert.equal(value('SELECT id FROM other_schema.sentinel'), '42');
  runner('validate');
});

test('CLI-DB-11: real application authentication rejects an incorrect password', () => {
  assert.notEqual(sql('SELECT current_user', 'customers_app', false, 'incorrect-test-password').status, 0);
});

test('CLI-DB-02: repeat migration preserves both data and complete history', () => {
  sql(insert('repeat-migration'), 'customers_app');
  const h = history();
  const rows = value('SELECT row_to_json(c) FROM customers_schema.customer c ORDER BY customer_id');
  runner();
  assert.equal(history(), h);
  assert.equal(value('SELECT row_to_json(c) FROM customers_schema.customer c ORDER BY customer_id'), rows);
});

test('CLI-DB-03/04: defaults, nullable fields and every approved text boundary', () => {
  const customer = sql(insert(), 'customers_app').stdout.trim().split('\n')[0];
  assert.match(customer, /^[0-9a-f-]{36}$/);
  const defaults = sql("SELECT customer_id IS NOT NULL AND registration_date <= now() AND active AND email IS NULL AND phone IS NULL AND address IS NULL FROM customers_schema.customer WHERE identity_document='repeat-migration'", 'customers_app').stdout.trim();
  assert.equal(defaults, 't');
  const columns = { name: [1, 150], identity_document: [1, 30], email: [0, 255], phone: [0, 20], address: [0, 255] };
  for (const [column, [min, max]] of Object.entries(columns)) {
    for (const length of [min, max]) {
      const doc = column === 'identity_document' ? 'x'.repeat(length) : randomUUID().slice(0, 24);
      const fields = { name: 'Cliente', identity_document: doc, [column]: 'x'.repeat(length) };
      sql(`INSERT INTO customers_schema.customer(${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).map(literal).join(',')})`, 'customers_app');
    }
    for (const length of [max + 1, ...(min ? [min - 1] : [])]) {
      const fields = { name: 'Cliente', identity_document: randomUUID().slice(0,24), [column]: 'x'.repeat(length) };
      reject(`INSERT INTO customers_schema.customer(${Object.keys(fields).join(',')}) VALUES (${Object.values(fields).map(literal).join(',')})`, '23514');
    }
  }
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
  reject(`BEGIN; INSERT INTO customers_schema.customer(customer_id,name,identity_document) VALUES ('${failedId}','Atomic','atomic-failed'); INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('kkkkkkkk','${failedId}'); COMMIT;`, '23505');
  assert.equal(value(`SELECT count(*) FROM customers_schema.customer WHERE customer_id='${failedId}'`), '0');
  const successId = randomUUID();
  sql(`BEGIN; INSERT INTO customers_schema.customer(customer_id,name,identity_document) VALUES ('${successId}','Atomic','atomic-commit'); INSERT INTO customers_schema.idempotency_key(key,customer_id) VALUES ('atomic-commit-key','${successId}'); COMMIT;`, 'customers_app');
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
  const config = JSON.parse(docker([...compose, 'config', '--format', 'json']).stdout);
  const service = config.services['customers-db-migrate'];
  assert.deepEqual(service.profiles, ['tooling']);
  assert.ok(!service.ports?.length);
  assert.equal(config.networks.platform.external, true);
  assert.equal(config.networks.platform.name, network);
  assert.ok(service.volumes.some(v => v.target === '/workspace' && v.read_only));
  assert.equal(service.environment.FLYWAY_URL, env.FLYWAY_URL);
  assert.equal(service.environment.FLYWAY_USER, env.FLYWAY_USER);
  assert.ok(service.environment.FLYWAY_PASSWORD === adminPassword, 'Environment credential must pass unchanged');
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
  assert.equal(value("SELECT count(*) FROM customers_schema.flyway_schema_history WHERE type='SQL' AND success"), '7');
  const h = history();
  runner();
  assert.equal(history(), h);
  sql(insert('rebuilt'), 'customers_app');
  reject('DELETE FROM customers_schema.customer', '42501');
});
