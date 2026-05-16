-- Add Instagram container state to scheduled_publications
-- Allows the cron to resume processing containers across runs
ALTER TABLE scheduled_publications
  ADD COLUMN IF NOT EXISTS container_id text,
  ADD COLUMN IF NOT EXISTS ig_account_id text;
