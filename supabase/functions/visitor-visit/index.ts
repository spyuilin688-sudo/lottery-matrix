import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createVisitorVisitHandler } from './handler.ts';

function requiredEnvironment(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error('SUPABASE_CONFIG_MISSING');
  return value;
}

const supabase = createClient(
  requiredEnvironment('SUPABASE_URL'),
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const handler = createVisitorVisitHandler({
  async recordVisit(source) {
    const { error } = await supabase.rpc('record_matrix_visit_edge', { p_source: source });
    if (error) throw error;
  },
});

Deno.serve(handler);
