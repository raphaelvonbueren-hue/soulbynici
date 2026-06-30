-- cron-jobs.sql — soulbynici
-- Zwei Cron-Jobs, die die Edge Functions zeitgesteuert aufrufen.
-- Im Supabase SQL-Editor ausführen (Database -> SQL Editor).
--
-- WICHTIG: Diese Datei enthält KEIN Secret. Der SERVICE_ROLE_KEY wird zur
-- Laufzeit aus dem Supabase Vault gelesen. Niemals einen Key hier eintragen/committen.
--
-- Zeitzone-Hinweis: pg_cron läuft in UTC. Ziel ist 08:00 Schweizer Zeit.
-- '0 6 * * *' = 06:00 UTC = 08:00 Europe/Zurich im Sommer (CEST).
-- Im Winter (CET, UTC+1) läuft es dann um 07:00 lokal — bei einer Geburtstags-
-- Mail unkritisch. DST-genaue Steuerung würde Server-Timezone-Config erfordern.

-- 1) Extensions (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) SERVICE_ROLE_KEY EINMALIG im Vault hinterlegen.
--    Diese eine Zeile separat ausführen, Platzhalter durch den echten Key ersetzen.
--    NICHT in diese Datei schreiben / nicht committen:
--
--    select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
--    Prüfen, dass er da ist (zeigt NICHT den Wert):
--    select name from vault.secrets where name = 'service_role_key';

-- 3) Bestehende Jobs idempotent entplanen
do $$
begin
  if exists (select 1 from cron.job where jobname = 'birthday-email-daily') then
    perform cron.unschedule('birthday-email-daily');
  end if;
  if exists (select 1 from cron.job where jobname = 'reminder-24h-hourly') then
    perform cron.unschedule('reminder-24h-hourly');
  end if;
end $$;

-- 4) birthday-email-daily — täglich 06:00 UTC = 08:00 Schweiz (Sommer)
select cron.schedule(
  'birthday-email-daily',
  '0 6 * * *',
  $job$
  select net.http_post(
    url := 'https://zaieumbmfksnfzbzqqln.supabase.co/functions/v1/send-birthday-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 5) reminder-24h-hourly — stündlich
select cron.schedule(
  'reminder-24h-hourly',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://zaieumbmfksnfzbzqqln.supabase.co/functions/v1/send-reminder-24h',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);

-- 6) Kontrolle
-- select jobname, schedule, active from cron.job order by jobname;
-- Letzte Läufe:
-- select jobid, status, start_time, end_time from cron.job_run_details order by start_time desc limit 10;
