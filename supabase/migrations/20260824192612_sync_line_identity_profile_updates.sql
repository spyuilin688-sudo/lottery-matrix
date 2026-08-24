-- Re-run LINE member synchronization when the provider profile changes.

drop trigger if exists sync_line_member_from_identity on auth.identities;

create trigger sync_line_member_from_identity
after insert or update of provider, provider_id, user_id, identity_data
on auth.identities
for each row
execute function private.sync_line_member_from_identity();
