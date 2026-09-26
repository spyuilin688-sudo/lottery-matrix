select cron.schedule(
 'matrix-architecture-billing-daily',
 '20 1 * * *',
 $job$
 select net.http_post(
   url := (select rtrim(decrypted_secret,'/') from vault.decrypted_secrets where name='matrix_project_url') || '/functions/v1/architecture-billing-sync',
   headers := jsonb_build_object('Content-Type','application/json','x-matrix-dispatch-token',
     (select decrypted_secret from vault.decrypted_secrets where name='matrix_notification_dispatch_token')),
   body := '{}'::jsonb,
   timeout_milliseconds := 50000
 );
 $job$
);
