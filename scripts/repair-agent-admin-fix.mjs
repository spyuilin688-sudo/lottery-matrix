import { readFileSync, writeFileSync } from 'node:fs';

const path = 'scripts/agent-admin-fix.mjs';
const source = readFileSync(path, 'utf8');
const replacements = [
  ["token === `eq.${row.token_hash}`", "token === 'eq.' + row.token_hash"],
  ["cookie: `matrix_admin_session=${second.token}`", "cookie: 'matrix_admin_session=' + second.token"],
];
let next = source;
for (const [from, to] of replacements) {
  if (!next.includes(from)) throw new Error(`Missing repair target: ${from}`);
  next = next.replace(from, to);
}
writeFileSync(path, next);
