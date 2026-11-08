// HU-CLI-05 search benchmark (synthetic data only, disposable PostgreSQL, everything labelled and removed by exact name).
//
//   node scripts/benchmark-search.mjs                # 20 000 and 100 000 customers
//   node scripts/benchmark-search.mjs 20000 50000    # custom sizes
//
// It measures, with EXPLAIN (ANALYZE) and the median of five runs:
//   * "scan"   the first design: fold_search_text evaluated on every row (V001-V011 only), and
//   * "stored" the delivered design: generated columns + index (V001-V014) with the query of JdbcCustomerRepository.SEARCH,
// in both custom and generic plan modes (the JDBC driver switches to generic plans after five executions), plus the write
// cost (INSERT/UPDATE) and the storage of both schemas. The numbers are an order of magnitude on a development machine.
import {spawnSync} from 'node:child_process';
import {randomBytes, randomUUID} from 'node:crypto';
import {readdirSync, readFileSync} from 'node:fs';
import {resolve, join, basename} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sizes = process.argv.slice(2).map(Number).filter(Boolean); if (!sizes.length) sizes.push(20000, 100000);
const name = `customers-bench-${randomUUID().slice(0, 8)}`;
const docker = (args, input) => spawnSync('docker', args, {input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: {...process.env, MSYS_NO_PATHCONV: '1'}});
const psql = (sql, db = 'bench') => { const r = docker(['exec', '-i', name, 'psql', '-U', 'postgres', '-d', db, '-X', '-At', '-v', 'ON_ERROR_STOP=1'], sql); if (r.status !== 0) throw new Error(r.stderr.split('\n')[0]); return r.stdout; };

const files = new Map();
(function walk(d) { for (const e of readdirSync(d, {withFileTypes: true})) { const p = join(d, e.name); if (e.isDirectory()) { if (!['node_modules', '.git', 'tests', 'scripts', 'docs', '05_rollbacks'].includes(e.name)) walk(p); } else if (/^V\d+__.*\.sql$/.test(e.name)) files.set(Number(basename(e.name).match(/^V(\d+)/)[1]), p); } })(root);
const migrate = (versions) => { for (const v of versions) psql((v === 7 ? 'CREATE TABLE IF NOT EXISTS customers_schema.flyway_schema_history(installed_rank int);\n' : '') + readFileSync(files.get(v), 'utf8')); };

// The query of JdbcCustomerRepository.SEARCH (keep in sync), and the first design, both as prepared statements.
const T = 'customers_schema.customer', F = 'customers_schema.fold_search_text', MAX = 'chr(1114111)';
const exact = `c.document_search=${F}($1)`, prefix = `c.document_search>${F}($1) AND c.document_search<${F}($1)||${MAX}`;
const branch = (rank, where) => `(SELECT c.customer_id,c.name,c.identity_document,c.active,c.name_search,${rank} AS rank FROM ${T} c WHERE ${where} AND c.active=$3 ORDER BY c.name_search,c.customer_id LIMIT 6)`;
const STORED = `WITH q AS (SELECT ${F}($1) AS phrase, string_to_array(${F}($2),' ') AS tokens)
SELECT customer_id,name,identity_document,active,rank FROM (
 ${branch(0, exact)}
 UNION ALL ${branch(1, prefix)}
 UNION ALL (SELECT c.customer_id,c.name,c.identity_document,c.active,c.name_search,2 AS rank FROM ${T} c, q WHERE c.active=$3 AND NOT (c.document_search>=q.phrase AND c.document_search<q.phrase||${MAX}) AND NOT EXISTS (SELECT 1 FROM unnest(q.tokens) t WHERE strpos(c.name_search,t)=0) ORDER BY c.name_search,c.customer_id LIMIT 6)
) m ORDER BY rank,name_search,customer_id LIMIT 6`;
const SCAN = `WITH q AS (SELECT ${F}($1) AS phrase, string_to_array(${F}($2),' ') AS tokens)
SELECT c.customer_id,c.name,c.identity_document,c.active,m.rank FROM ${T} c CROSS JOIN q CROSS JOIN LATERAL (SELECT CASE
 WHEN ${F}(c.identity_document)=q.phrase THEN 0 WHEN starts_with(${F}(c.identity_document),q.phrase) THEN 1
 WHEN NOT EXISTS (SELECT 1 FROM unnest(q.tokens) t WHERE strpos(${F}(c.name),t)=0) THEN 2 END AS rank) m
WHERE c.active=$3 AND m.rank IS NOT NULL ORDER BY m.rank,${F}(c.name),c.customer_id LIMIT 6`;
const scenarios = {'name, two tokens': ["'maria sofia'", "'maria sofia'"], 'name, one token': ["'maria'", "'maria'"], 'name, no match': ["'zzzqq'", "'zzzqq'"],
    'name, ~50% match': ["'ar'", "'ar'"], 'document, exact': ["'1000000500'", "'1000000500'"], 'document, prefix (all match)': ["'10000'", "'10000'"]};
function median(statement, mode, args) {
    const runs = Array.from({length: 5}, () => `EXPLAIN (ANALYZE, COSTS OFF, SUMMARY ON) EXECUTE s(${args},true);`).join('\n');
    const out = psql(`SET jit=off; SET plan_cache_mode=${mode}; PREPARE s(text,text,boolean) AS ${statement};\n${runs}`);
    return out.split('\n').filter(l => l.startsWith('Execution Time')).map(l => parseFloat(l.split(': ')[1])).sort((a, b) => a - b)[2];
}
const GENERATE = n => `TRUNCATE ${T} CASCADE;
WITH f AS (SELECT ARRAY['María','José','Sofía','Andrés','Ángela','Núñez','Camila','Luis','Valentina','Jesús','Inés','Martín','Lucía','Sebastián','Daniela','Fernando','Paola','Héctor','Ximena','Óscar'] a),
     l AS (SELECT ARRAY['Pérez','García','Rodríguez','Gómez','Hernández','Muñoz','Ñañez','Castro','Vargas','Ramírez','Ortiz','Jiménez','Soto','Cárdenas','Peña','Álvarez','Torres','Mejía','Rojas','Quintero'] a)
INSERT INTO ${T}(name,identity_document,email,phone,address)
SELECT f.a[1+g%20]||' '||f.a[1+(g/20)%20]||' '||l.a[1+(g/400)%20]||' '||l.a[1+(g/8000)%20], lpad((1000000000+g)::text,10,'0'), 'c'||g||'@example.test', '3'||lpad(g::text,9,'0'), 'Calle '||g
FROM generate_series(1,${n}) g, f, l;
ANALYZE ${T};`;
const timed = sql => { const t = process.hrtime.bigint(); psql(sql); return Number(process.hrtime.bigint() - t) / 1e6; };
const size = () => psql(`SELECT pg_size_pretty(pg_table_size('${T}')) || ' table + ' || pg_size_pretty(pg_indexes_size('${T}')) || ' indexes'`).trim();

try {
    const r = docker(['run', '-d', '--name', name, '--label', 'synkro.benchmark=hu-cli-05', '--tmpfs', '/var/lib/postgresql/data', '-e', `POSTGRES_PASSWORD=${randomBytes(12).toString('hex')}`, '-e', 'POSTGRES_DB=bench', 'postgres:16.6-alpine', '-c', 'fsync=off', '-c', 'shared_buffers=256MB']);
    if (r.status !== 0) throw new Error('could not start PostgreSQL');
    for (let i = 0; i < 60 && docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'bench']).status !== 0; i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
    migrate([1, 2, 3, 4, 5, 8]);                      // schema + fold function; the audit objects are irrelevant here
    console.log(`PostgreSQL ${psql('SHOW server_version').trim()}, synthetic data, median of 5 EXPLAIN ANALYZE runs (ms)\n`);
    const result = {};
    for (const n of sizes) {
        // First design: no stored columns. Write cost and storage first, so both schemas are loaded the same way.
        const scanInsert = timed(GENERATE(n)), scanUpdate = timed(`UPDATE ${T} SET name=name||' x' WHERE identity_document < '${1000000000 + Math.floor(n / 10)}'`), scanSize = size();
        const scan = Object.fromEntries(Object.entries(scenarios).map(([k, a]) => [k, median(SCAN, 'force_custom_plan', a.join(','))]));
        const rewrite = timed(readFileSync(files.get(12), 'utf8')), indexBuild = timed(readFileSync(files.get(13), 'utf8'));   // V012 + V013 on the loaded table
        psql(`TRUNCATE ${T} CASCADE;`);
        const storedInsert = timed(GENERATE(n)), storedUpdate = timed(`UPDATE ${T} SET name=name||' x' WHERE identity_document < '${1000000000 + Math.floor(n / 10)}'`), storedSize = size();
        const plans = {};
        for (const mode of ['force_custom_plan', 'force_generic_plan']) plans[mode] = Object.fromEntries(Object.entries(scenarios).map(([k, a]) => [k, median(STORED, mode, a.join(','))]));
        if (process.env.BENCH_EXPLAIN) console.log(psql(`SET jit=off; PREPARE s(text,text,boolean) AS ${STORED}; EXPLAIN (ANALYZE, COSTS OFF, BUFFERS) EXECUTE s(${scenarios['document, exact'].join(',')},true);`));
        const rows = Object.keys(scenarios).map(k => ({scenario: k, 'first design (ms)': scan[k], 'stored, custom plan (ms)': plans.force_custom_plan[k], 'stored, generic plan (ms)': plans.force_generic_plan[k]}));
        console.log(`== ${n} customers`); console.table(rows);
        console.log(`   INSERT ${n}: first design ${scanInsert.toFixed(0)} ms, stored ${storedInsert.toFixed(0)} ms | UPDATE ${Math.floor(n / 10)} names: ${scanUpdate.toFixed(0)} ms vs ${storedUpdate.toFixed(0)} ms`);
        console.log(`   V012 table rewrite (ACCESS EXCLUSIVE) ${rewrite.toFixed(0)} ms, V013 index build ${indexBuild.toFixed(0)} ms`);
        console.log(`   storage: first design ${scanSize}; stored ${storedSize}\n`);
        // Reset for the next size: drop the new objects so the first design is measured on a clean base again.
        psql(`DROP INDEX customers_schema.idx_customer_document_search; ALTER TABLE ${T} DROP COLUMN document_search, DROP COLUMN name_search;`);
        result[n] = {scan, plans};
    }
} finally { docker(['rm', '-fv', name]); }
