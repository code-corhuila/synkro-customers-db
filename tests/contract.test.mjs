import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(import.meta.dirname, '..');
export function sqlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? sqlFiles(resolve(dir, e.name)) : e.name.endsWith('.sql') ? [resolve(dir, e.name)] : []);
}

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
