import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
test('CONT-01: schema uses the approved family and empty families have placeholders', () => {
  for (const prefix of ['', '05_rollbacks/']) {
    assert.ok(existsSync(resolve(root, prefix, '01_ddl/01_schemas')));
    assert.ok(!existsSync(resolve(root, prefix, '01_ddl/00_schemas')));
    for (const family of ['02_dml', '04_tcl']) assert.ok(existsSync(resolve(root, prefix, family, 'README.md')));
  }
});

test('CONT-02: CI can validate the delivery branch before a PR, preserving permanent events', () => {
  const workflow = readFileSync(resolve(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /push:\s*\n\s*branches: \[develop, qa, main, feat\/customers-schema-and-migration-runner\]/);
  assert.match(workflow, /pull_request:\s*\n\s*branches: \[develop, qa, main\]/);
  assert.match(workflow, /run: node --test --test-concurrency=1 tests\/integration.test.mjs/);
});
export function sqlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? sqlFiles(resolve(dir, e.name)) : e.name.endsWith('.sql') ? [resolve(dir, e.name)] : []);
}

test('CONT-06: every historical SQL byte and CODEOWNERS remain intact', () => {
  const paths = ['01_ddl', '02_dml', '03_dcl', '04_tcl', '05_rollbacks'].flatMap(d => sqlFiles(resolve(root, d)));
  paths.push(resolve(root, '.github/CODEOWNERS'));
  for (const path of paths) {
    const historical = relative(root, path).replaceAll('\\', '/').replace('/01_schemas/', '/00_schemas/');
    const blob = spawnSync('git', ['show', `90b02296f7b057a4cfc6fbe6be4f78afe7cbe9a4:${historical}`], { cwd: root });
    assert.equal(blob.status, 0);
    assert.deepEqual(readFileSync(path), blob.stdout, historical);
  }
});

test('CLI-DB-10/14: global versions have matching, family-preserving reversions', () => {
  const forward = ['01_ddl', '02_dml', '03_dcl', '04_tcl'].flatMap(d => sqlFiles(resolve(root, d)));
  assert.equal(forward.length, 7);
  assert.deepEqual(forward.map(f => /V(\d{3})__/.exec(f)?.[1]).sort(), ['001','002','003','004','005','006','007']);
  const rollback = sqlFiles(resolve(root, '05_rollbacks'));
  assert.equal(rollback.length, forward.length);
  for (const f of forward) {
    const inverse = resolve(root, '05_rollbacks', relative(root, f).replace(/V(\d{3})__/, 'U$1__'));
    assert.ok(rollback.includes(inverse));
    assert.ok(readFileSync(inverse, 'utf8').trim());
  }
});

test('REV-06: root example exposes both credential modes without a committed password', () => {
  const example = readFileSync(resolve(root, '.env.example'), 'utf8');
  for (const key of ['FLYWAY_URL', 'FLYWAY_USER', 'FLYWAY_PASSWORD', 'FLYWAY_PASSWORD_FILE',
    'CUSTOMERS_FLYWAY_URL', 'DB_ADMIN_USER', 'CUSTOMERS_DB_ADMIN_PASSWORD_FILE', 'COMPOSE_PROJECT_NAME', 'PLATFORM_NETWORK']) {
    assert.match(example, new RegExp(`^${key}=`, 'm'));
  }
  assert.match(example, /^FLYWAY_PASSWORD=$/m);
});

test('REV-07: JDBC connection, login and socket limits have safe finite defaults', () => {
  const config = readFileSync(resolve(root, 'flyway.toml'), 'utf8');
  assert.match(config, /jdbcProperties\.connectTimeout\s*=\s*"5"/);
  assert.match(config, /jdbcProperties\.loginTimeout\s*=\s*"10"/);
  assert.match(config, /jdbcProperties\.socketTimeout\s*=\s*"60"/);
});
