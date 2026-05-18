-- Schema-Update: 24h-Reminder-Tracking
-- Auszuführen in Supabase SQL Editor

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bookings_reminder
  ON bookings (date, reminder_sent_at)
  WHERE reminder_sent_at IS NULL;

-- Hinweis: pg_cron Job für stündliche Erinnerungen separat anlegen:
-- (Im Supabase Dashboard → Database → Cron Jobs)
--
-- SELECT cron.schedule(
--   'reminder-24h-hourly',
--   '0 * * * *',  -- jede volle Stunde
--   $$
--   SELECT net.http_post(
--     'https://zaieumbmfksnfzbzqqln.supabase.co/functions/v1/send-reminder-24h',
--     '{}'::jsonb,
--     'application/json',
--     ARRAY[net.http_header('Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY')]
--   );
--   $$
-- );
