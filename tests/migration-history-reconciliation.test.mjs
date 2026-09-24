import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const snapshot = JSON.parse(readFileSync(new URL('../docs/operations/migration-history-reconciled-20260924.json', import.meta.url), 'utf8'));
const directory = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const hash = (algorithm, bytes) => createHash(algorithm).update(bytes).digest('hex');
// Applied after this 254-record snapshot; Supabase assigned the new filename's version.
const appliedAfterSnapshot = new Map([
 ['20260924072000_sync_ecpay_payment_reversals.sql', '20260924121843_sync_ecpay_payment_reversals.sql'],
]);

test('every captured production record has exactly one canonical filename in recorded order', () => {
 const versions = files.map(name => name.split('_')[0]);
 assert.equal(new Set(versions).size, versions.length, 'migration versions must be unique');
 const recordedNames = new Set(snapshot.records.map(row => row.name));
 const recordedFiles = files.filter(name => recordedNames.has(name.slice(15, -4)));
 assert.deepEqual(recordedFiles, snapshot.records.map(row => `${row.version}_${row.name}.sql`));
 for (const row of snapshot.records) {
  if (row.old_file) assert.equal(files.includes(row.old_file), false, row.old_file);
 }
});

test('renames preserve reviewed repository SQL and restorations preserve recorded SQL bytes', () => {
 for (const row of snapshot.records.filter(row => row.old_file || row.restored)) {
  const bytes = readFileSync(new URL(row.file, directory));
  assert.equal(hash('sha256', bytes), row.repo_sha256, row.file);
  if (row.restored) assert.equal(hash('md5', bytes), row.recorded_md5, row.file);
 }
 assert.equal(snapshot.records.filter(row => row.old_file).length, 113);
 assert.equal(snapshot.records.filter(row => row.restored).length, 13);
});

test('unrecorded historical files stay explicit, including later applied migrations', () => {
 const cutoff = snapshot.records.at(-1).version;
 const captured = new Set(snapshot.records.map(row => row.file));
 const stillUnrecorded = snapshot.unrecorded_files.filter(row => !appliedAfterSnapshot.has(row.file));
 assert.deepEqual(files.filter(name => name.slice(0, 14) <= cutoff && !captured.has(name)),
  stillUnrecorded.map(row => row.file));
 for (const row of stillUnrecorded) {
  assert.equal(hash('sha256', readFileSync(new URL(row.file, directory))), row.repo_sha256, row.file);
 }
 for (const [oldFile, newFile] of appliedAfterSnapshot) {
  const recordedAtSnapshot = snapshot.unrecorded_files.find(row => row.file === oldFile);
  assert.ok(recordedAtSnapshot, oldFile);
  assert.equal(files.includes(oldFile), false, oldFile);
  assert.equal(files.includes(newFile), true, newFile);
  assert.ok(newFile.slice(0, 14) > cutoff, newFile);
  assert.equal(hash('sha256', readFileSync(new URL(newFile, directory))), recordedAtSnapshot.repo_sha256, newFile);
 }
});

test('restored post-retirement identity RPC reads general status and remains service-only', async t => {
 const db = new PGlite(); t.after(() => db.close());
 await db.exec(`create role anon; create role authenticated; create role service_role;
 create schema private;
 create function private.matrix_analysis_read_period(text,text,int) returns text language sql as $$select '12004'::text$$;
 create function private.matrix_analysis_order_version(text,text,text,text) returns text language sql as $$select '12004:version'::text$$;`);
 await db.exec(readFileSync(new URL('../supabase/migrations/20260920112544_ensure_matrix_status_identity_get.sql', import.meta.url), 'utf8'));
 const { rows } = await db.query(`select public.matrix_status_identity_get('{"lottery":"今彩539"}'::jsonb) as identity`);
 assert.deepEqual(rows[0].identity, { drawPeriod: '12004', analysisVersion: '12004:version' });
 for (const role of ['anon', 'authenticated', 'service_role']) {
  const result = await db.query("select has_function_privilege($1,'public.matrix_status_identity_get(jsonb)','EXECUTE') as allowed", [role]);
  assert.equal(result.rows[0].allowed, role === 'service_role', role);
 }
 await assert.rejects(db.query("select public.matrix_status_identity_get('{}'::jsonb)"), /INVALID_REQUEST/);
});
