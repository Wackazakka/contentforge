-- Fryser KUNDEN paa royalty-raden.
--
-- Bakgrunn: raden lagret byraaet (used_by_tenant_id) og produktet (product_id),
-- men ikke sluttkunden. Kundeidentiteten maatte utledes via
-- product_id -> products.organization_id -> organizations. Satsene er frosset
-- paa raden; kundeleddet var det ikke. Slettes produktet, staar beloepene igjen
-- uten at man kan si hvem som betalte.
--
-- ON DELETE SET NULL, ikke CASCADE: en slettet kunde skal ikke ta royalty-
-- historikken med seg. Rettighetshaveren har krav paa pengene uansett.

alter table voice_usage_events
  add column if not exists organization_id uuid
  references organizations(id) on delete set null;

-- Etterfyll det som fortsatt er utledbart fra produktet.
update voice_usage_events e
set organization_id = p.organization_id
from products p
where e.product_id = p.id
  and e.organization_id is null;

create index if not exists voice_usage_events_org_idx
  on voice_usage_events (organization_id, created_at desc);
