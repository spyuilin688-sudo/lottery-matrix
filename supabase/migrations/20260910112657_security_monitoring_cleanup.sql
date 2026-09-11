-- Enable bounded retention independently of the paused security push dispatcher.
select cron.schedule('matrix-security-cleanup','*/5 * * * *','select private.security_cleanup();');
