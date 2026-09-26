import { readFile } from 'node:fs/promises';
import { createAppDb, readMigration, installFunction } from './app-db.mjs';

export const matrixKinds = ['explore','tianheng','tianshu','tianyan','tiangong'];
export const matrixSources = {
  explore_list: '20260921003028_result_item_dedup.sql',
  tianheng_list: '20260921003028_result_item_dedup.sql',
  tianshu_list: '20260919101456_matrix_tianshu.sql',
  tianyan_list: '20260922002937_materialized_algorithm_read_cache.sql',
  tiangong_list: '20260924073703_restrict_tiangong_50_two_stage.sql',
  explore_validation: '20260912164938_matrix_order_analysis_reads.sql',
  tianheng_validation: '20260912164938_matrix_order_analysis_reads.sql',
  tianshu_validation: '20260919101456_matrix_tianshu.sql',
  tianyan_validation: '20260912164938_matrix_order_analysis_reads.sql',
  tiangong_validation: '20260912164938_matrix_order_analysis_reads.sql',
};
export async function createAppMatrixDb() {
  const db = await createAppDb();
  await db.exec(await readFile(new URL('../../supabase/tests/fixtures/matrix-analysis-tables.sql',import.meta.url), 'utf8'));
  const tianshu = await readMigration('20260919101456_matrix_tianshu.sql');
  await db.exec(tianshu.slice(tianshu.indexOf('create table public.matrix_tianshu_results'),tianshu.indexOf('alter table public.matrix_tianshu_results')));
  await db.exec(`
    alter table public.matrix_analysis_artifacts drop constraint matrix_analysis_artifacts_kind_check;
    alter table public.matrix_explore_results add column item_column_mask integer not null default 0;
    alter table public.matrix_tianheng_results add column item_column_mask integer not null default 0;
    create table private.matrix_permission_settings(singleton boolean primary key,registered_member_free_access boolean);
    insert into private.matrix_permission_settings values(true,false);
    create table private.matrix_analysis_active_versions(lottery text,draw_period text,number_order text,analysis_version text);
    create table private.security_identity_secret(secret text);
    insert into private.security_identity_secret values('test-only');
    create function private.security_collect(text,text,boolean,text) returns jsonb language sql as $$select '{"allowed":true}'::jsonb$$;
  `);
  const dedup = await readMigration('20260921003028_result_item_dedup.sql');
  await db.exec(dedup.slice(dedup.indexOf('create function private.matrix_result_item_keys'),dedup.indexOf('create function private.matrix_result_item_pack')));
  for (const [file,name] of [
    ['20260915175243_google_member_perks.sql','private.member_login_perks_eligible'],
    ['20260924222148_skip_redundant_referral_entitlement_count.sql','private.matrix_result_entitlements_for_member'],
    ['20260922034033_consolidate_member_read_paths.sql','private.matrix_result_entitlements'],
    ['20260912164938_matrix_order_analysis_reads.sql','private.matrix_analysis_read_period'],
    ['20260912230514_matrix_analysis_active_versions.sql','private.matrix_analysis_draw_order_eligible'],
    ['20260912230514_matrix_analysis_active_versions.sql','private.matrix_analysis_active_version'],
    ['20260829181807_matrix_result_rpc.sql','private.matrix_artifact_payload'],
    ['20260913031818_matrix_analysis_retention_v2.sql','private.matrix_analysis_order_version'],
    ['20260912164938_matrix_order_analysis_reads.sql','private.matrix_analysis_version_readable'],
    ['20260919101456_matrix_tianshu.sql','private.matrix_request_guard'],
  ]) await installFunction(db,file,name);
  await db.exec(await readMigration('20260922002937_materialized_algorithm_read_cache.sql'));
  for (const [operation,file] of Object.entries(matrixSources)) {
    await installFunction(db,file,`private.matrix_${operation}_impl`);
    // Public entry matches the existing guard wrapper; the guard and query body are real migrations.
    await db.exec(`create function public.matrix_${operation}(p_request jsonb) returns jsonb language sql security definer set search_path='' as $$select private.matrix_request_guard('${operation}',p_request)$$;`);
  }
  await db.exec(await readMigration('20260831000718_repair_qualified_coalesce.sql'));
  return db;
}
