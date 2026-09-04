import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const migrationsDir = path.resolve('supabase/migrations');
const migrationSuffix = '_restrict_member_rpc_execute.sql';
const deployedMigrationFloor = '20260904092249';
const targets = [
  'public.matrix_custom_status_reset(text, text)',
  'public.member_notification_settings_get()',
  'public.member_notification_settings_save(jsonb)',
];
const protectedAnonymousRpcs = [
  'matrix_explore_list',
  'matrix_explore_validation',
  'matrix_tianyan_list',
];

const compact = (sql) => sql.toLowerCase().replace(/\s+/g, ' ').trim();
const requiredRoles = {
  grant: ['authenticated', 'service_role'],
  revoke: ['anon', 'public'],
};

function blank(sql) {
  return sql.replace(/[^\n]/g, ' ');
}

function stripSqlCommentsAndLiterals(sql) {
  let result = '';
  let cursor = 0;

  while (cursor < sql.length) {
    if (sql.startsWith('--', cursor)) {
      const end = sql.indexOf('\n', cursor);
      const limit = end === -1 ? sql.length : end;
      result += blank(sql.slice(cursor, limit));
      cursor = limit;
      continue;
    }

    if (sql.startsWith('/*', cursor)) {
      let depth = 1;
      let end = cursor + 2;
      while (end < sql.length && depth > 0) {
        if (sql.startsWith('/*', end)) {
          depth += 1;
          end += 2;
        } else if (sql.startsWith('*/', end)) {
          depth -= 1;
          end += 2;
        } else {
          end += 1;
        }
      }
      result += blank(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    if (sql[cursor] === '\'' || sql[cursor] === '"') {
      const quote = sql[cursor];
      let end = cursor + 1;
      while (end < sql.length) {
        if (sql[end] === quote && sql[end + 1] === quote) {
          end += 2;
        } else if (sql[end] === quote) {
          end += 1;
          break;
        } else {
          end += 1;
        }
      }
      result += blank(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    const dollarTag = sql.slice(cursor).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollarTag) {
      const close = sql.indexOf(dollarTag, cursor + dollarTag.length);
      const end = close === -1 ? sql.length : close + dollarTag.length;
      result += blank(sql.slice(cursor, end));
      cursor = end;
      continue;
    }

    result += sql[cursor];
    cursor += 1;
  }

  return result;
}

function parseTerminatedStatements(sql) {
  const fragments = stripSqlCommentsAndLiterals(sql).split(';');
  assert.equal(compact(fragments.pop()), '', 'SQL must end every statement with a semicolon');
  return fragments.map(compact).filter(Boolean);
}

function assertPrivilegeContract(sql) {
  const sanitized = stripSqlCommentsAndLiterals(sql);
  const statements = parseTerminatedStatements(sql);
  const permittedStatements = targets.flatMap((target) => [
    `revoke execute on function ${target} from public, anon`,
    `grant execute on function ${target} to authenticated, service_role`,
  ]);
  const executeStatements = statements.filter((statement) =>
    /^(grant|revoke)\s+(execute|all)\b/.test(statement));

  assert.deepEqual(
    [...statements].sort(),
    [...permittedStatements].sort(),
    'migration must contain exactly the six permitted statements',
  );

  assert.doesNotMatch(sanitized, /\b(all functions|default privileges)\b/);
  assert.doesNotMatch(
    sanitized,
    /revoke\s+(?:execute|all)\s+on\s+(?:all\s+functions(?:\s+in\s+schema\s+public)?|functions\s+in\s+schema\s+public|schema\s+public)\b/,
  );

  for (const rpc of protectedAnonymousRpcs) {
    assert.doesNotMatch(sql.toLowerCase(), new RegExp(`\\b${rpc}\\b`));
  }

  assert.equal(executeStatements.length, targets.length * 2, 'unexpected execute privilege statement');
  const counts = new Map();

  for (const statement of executeStatements) {
    const match = statement.match(
      /^(grant|revoke)\s+execute\s+on\s+function\s+(.+?)\s+(to|from)\s+([a-z_][a-z0-9_]*(?:\s*,\s*[a-z_][a-z0-9_]*)*)$/,
    );
    assert.ok(match, `invalid execute privilege statement: ${statement}`);

    const [, action, identity, direction, roleList] = match;
    assert.equal(direction, action === 'grant' ? 'to' : 'from', `invalid ${action} direction`);

    const target = compact(identity).replace(/\s*,\s*/g, ', ');
    assert.ok(targets.includes(target), `unexpected function identity: ${target}`);

    const roles = roleList.split(/\s*,\s*/).sort();
    assert.deepEqual(roles, requiredRoles[action], `unexpected ${action} roles for ${target}`);

    const key = `${action}:${target}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  for (const target of targets) {
    assert.equal(counts.get(`revoke:${target}`), 1, `missing or duplicate revoke for ${target}`);
    assert.equal(counts.get(`grant:${target}`), 1, `missing or duplicate grant for ${target}`);
  }
}

const validFixture = targets.flatMap((target) => [
  `revoke execute on function ${target} from public, anon;`,
  `grant execute on function ${target} to authenticated, service_role;`,
]).join('\n');

test('regression fixtures reject unsafe member RPC privilege SQL', async (t) => {
  const fixtures = {
    'comment-only required revoke': validFixture.replace(
      'revoke execute on function public.matrix_custom_status_reset(text, text) from public, anon;',
      '-- revoke execute on function public.matrix_custom_status_reset(text, text) from public, anon;',
    ),
    'string-literal required revoke': validFixture.replace(
      'revoke execute on function public.matrix_custom_status_reset(text, text) from public, anon;',
      "select 'revoke execute on function public.matrix_custom_status_reset(text, text) from public, anon;';",
    ),
    'extra function statement': `${validFixture}\nrevoke execute on function public.other_rpc() from public, anon;`,
    'target re-grant to anon': `${validFixture}\ngrant execute on function public.member_notification_settings_get() to anon;`,
    'target re-grant to public': `${validFixture}\ngrant execute on function public.member_notification_settings_get() to public;`,
    'wrong grant role': validFixture.replace('authenticated, service_role', 'authenticated, anon'),
    'wrong function signature': validFixture.replace(
      'public.matrix_custom_status_reset(text, text)',
      'public.matrix_custom_status_reset(text, jsonb)',
    ),
    'schema usage revoke': `${validFixture}\nReVoKe UsAgE On ScHeMa public FrOm anon;`,
    'mixed-case default privileges': `${validFixture}\nAlTeR DeFaUlT PrIvIlEgEs In ScHeMa public ReVoKe ExEcUtE On FuNcTiOnS FrOm public;`,
    'unrelated DDL': `${validFixture}\nCrEaTe TaBlE public.unrelated_contract_escape(id bigint);`,
  };

  for (const [name, sql] of Object.entries(fixtures)) {
    await t.test(name, () => assert.throws(() => assertPrivilegeContract(sql)));
  }

  await t.test('accepts the exact allowlist case-insensitively', () => {
    assert.doesNotThrow(() => assertPrivilegeContract(validFixture.toUpperCase()));
  });
});

test('restricts execute privileges to authenticated member RPCs only', async () => {
  const migrationNames = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(migrationSuffix));

  assert.equal(
    migrationNames.length, 1, `expected exactly one ${migrationSuffix} migration`);
  const version = migrationNames[0].slice(0, -migrationSuffix.length);
  assert.match(version, /^\d+$/, `invalid migration version: ${migrationNames[0]}`);
  assert.ok(
    BigInt(version) > BigInt(deployedMigrationFloor),
    `migration ${version} must be newer than deployed history ${deployedMigrationFloor}`,
  );
  assertPrivilegeContract(await readFile(path.join(migrationsDir, migrationNames[0]), 'utf8'));
});
