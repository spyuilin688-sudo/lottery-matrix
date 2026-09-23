import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';

const directory = join(import.meta.dirname, '../../../supabase/migrations');
const name = readdirSync(directory).find((file) => file.endsWith('_require_current_card_for_completion.sql'));
const sql = name ? readFileSync(join(directory, name), 'utf8') : '';

function body(functionName) {
  const escaped = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sql.match(new RegExp(`create or replace function ${escaped}\\([^]*?\\$\\$([^]*?)\\$\\$;`, 'i'));
  assert.ok(match, `${functionName} must be defined in the migration`);
  return match[1];
}

test('the card gate requires a confirmed draw and the current published generation', () => {
  const helper = body('private.matrix_card_publication_complete');
  assert.match(helper, /result_status\s*=\s*'confirmed'/i);
  assert.match(helper, /desired_period\s*=\s*p_draw_period/i);
  assert.match(helper, /desired_digest\s*~\s*'\^\[0-9a-f\]\{64\}\$'/i);
  assert.match(helper, /published_at\s+is\s+not\s+null/i);
  assert.match(helper, /manifest\s*->>\s*'generation'\s*=\s*c\.desired_digest/i);
  assert.match(helper, /manifest\s*->>\s*'period'\s*=\s*p_draw_period/i);
  assert.match(helper, /manifest\s*->>\s*'lottery'\s*=\s*p_lottery/i);
});

test('the card gate checks sorted for every lottery and draw for evening lotteries', () => {
  const helper = body('private.matrix_card_publication_complete');
  assert.match(helper, /when\s+p_lottery\s*=\s*'天天樂'\s+then\s+array\['sorted'\]/i);
  assert.match(helper, /else\s+array\['sorted','draw'\]/i);
  assert.match(helper, /inputDigest/i);
  assert.match(helper, /mimeType/i);
  assert.match(helper, /sha256/i);
  assert.match(helper, /width/i);
  assert.match(helper, /height/i);
  assert.match(helper, /coalesce\(card_fields\.card_url,\s*''\)\s*!~/i);
  assert.match(helper, /matrix-card-png/i);
});

test('the current card gate is required by all three schedule completion paths', () => {
  const state = body('public.matrix_watchdog_chain_state');
  assert.match(state, /'cardComplete'\s*,\s*private\.matrix_card_publication_complete\(p_lottery,\s*p_draw_period\)/i);
  for (const name of [
    'private.matrix_primary_lottery_complete',
    'public.matrix_recovery_complete',
    'public.complete_matrix_watchdog_recovery',
  ]) {
    const completion = body(name);
    assert.match(completion, /\(v_chain->>'cardComplete'\)::boolean\s+is\s+(?:distinct\s+from\s+)?true/i, name);
  }
});

test('lease completion fences publication writes before checking the evidence', () => {
  const completion = body('public.complete_matrix_watchdog_recovery');
  assert.match(completion, /lock table public\.matrix_card_publications in share mode;[^]*?v_chain\s*:=/i);
  assert.match(sql, /revoke all on function private\.matrix_card_publication_complete\(text,text\) from public,anon,authenticated,service_role/i);
});

test('snapshot observation repairs a mismatched period even if its digest is unchanged', () => {
  const observer = body('public.observe_matrix_card_snapshot');
  assert.match(observer, /desired_digest\s+is\s+distinct\s+from\s+p_digest\s+or\s+desired_period\s+is\s+distinct\s+from\s+p_period/i);
});
