-- Velkomstsiden registrerer besøk (Lars 27.10.2026). used_at settes først når
-- testeren trykker knappen på /velkommen; den som åpner lenken og stopper der,
-- var usynlig. seen_at = første besøk, seen_count = antall besøk. Bruker ikke
-- opp lenken.
alter table welcome_invites add column if not exists seen_at timestamptz;
alter table welcome_invites add column if not exists seen_count integer not null default 0;
