-- Add columns needed for scheduling from the publish page
alter table scheduled_publications
  add column if not exists page_ids text[] default '{}',
  add column if not exists caption text,
  add column if not exists draft_id uuid,
  add column if not exists job_id text,
  add column if not exists user_id uuid;
