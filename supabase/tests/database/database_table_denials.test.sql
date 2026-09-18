-- Exercise direct reads without fetching a row or invoking any business RPC.
begin read only;
set local role anon;
do $audit$
declare v_table text;
begin
  foreach v_table in array array[
    'activation_code_batches','activation_codes','admin_accounts','admin_login_records',
    'audit_logs','payments','plans','transfer_requests'
  ] loop
    begin
      execute format('select 1 from public.%I limit 0',v_table);
    exception when insufficient_privilege then continue;
    end;
    raise exception 'DIRECT_TABLE_READ_NOT_DENIED: %',v_table;
  end loop;
end
$audit$;
reset role;
set local role authenticated;
do $audit$
declare v_table text;
begin
  foreach v_table in array array[
    'activation_code_batches','activation_codes','admin_accounts','admin_login_records',
    'audit_logs','payments','plans','transfer_requests'
  ] loop
    begin
      execute format('select 1 from public.%I limit 0',v_table);
    exception when insufficient_privilege then continue;
    end;
    raise exception 'DIRECT_TABLE_READ_NOT_DENIED: %',v_table;
  end loop;
end
$audit$;
rollback;
