import { createAppDb,installFunction,readMigration,applyAppMigrations } from './app-db.mjs';
export async function createAppNotificationDb({database=null}={}){
  const db=await createAppDb({database});
  await db.exec(`create schema extensions;
    create function extensions.gen_random_uuid() returns uuid language sql as $$select gen_random_uuid()$$;
    create function extensions.digest(text,text) returns bytea language sql as $$select sha256(convert_to($1,'UTF8'))$$;
    create table private.notification_draw_day_overrides(lottery text,draw_date date,is_draw_day boolean);
  `);
  await db.exec(await readMigration('20260823042016_create_member_notification_settings.sql'));
  for(const [file,name] of [
    ['20260829213702_fix_member_coalesce.sql','private.active_member_id'],
    ['20260913193834_remove_win_notification_settings.sql','private.default_member_notification_settings'],
    ['20260913133102_notification_reminder_draw_days.sql','private.notification_is_draw_day'],
    ['20260913133102_notification_reminder_draw_days.sql','private.notification_reminder_is_due'],
    ['20260913133102_notification_reminder_draw_days.sql','private.notification_member_matches'],
    ['20260905205428_notification_fast_results.sql','private.notification_draw_date_label'],
    ['20260908022115_simplify_matrix_card_notification_body.sql','private.notification_render_payload'],
  ]) await installFunction(db,file,name);
  await db.exec(await readMigration('20260904091705_notification_dispatch_schema.sql'));
  await db.exec(await readMigration('20260909095221_lottery_matrix_app_native_push.sql'));
  await applyAppMigrations(db,['app_member_settings','app_native_notifications']);
  return db;
}
