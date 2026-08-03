-- Påslaget skal bety påslag (Lars 3/8: «når de velger 100 % bør det være
-- 100 % påslag på den prisen de får fra ContentForge»).
--
-- FØR:  kundepris = COSTS_NOK × Π(1 + påslag/100) / 2
-- ETTER: kundepris = COSTS_NOK × Π(1 + påslag/100)
--
-- Halveringen gjorde at «100 %» i virkeligheten var NULL margin, og at en
-- partner som satte 50 % solgte med tap uten å bli advart. Tallet i
-- grensesnittet løy om hva det gjorde.
--
-- Denne migrasjonen regner om lagrede verdier så INGEN priser flytter seg:
--     nytt påslag = (gammelt − 100) / 2
-- Gammel 200 → ny 50 (IndigoBooms reelle påslag har hele tiden vært 50 %).
-- Gammel 100 → ny 0  (null margin, som før).
--
-- ⚠️ Omregningen er eksakt for partnere som ligger RETT UNDER root, fordi den
-- gamle formelen delte på 2 én gang for hele kjeden. Derfor rører vi kun dem.
-- Kommer det flere ledd senere (VoiceBank over IndigoBoom), settes de nye
-- leddene direkte i den nye skalaen — de har ingen gammel verdi å regne om.

update public.tenants child
set markup_percent = greatest(0, (coalesce(child.markup_percent, 100) - 100) / 2.0)
from public.tenants parent
where child.parent_tenant_id = parent.id
  and parent.parent_tenant_id is null;

comment on column public.tenants.markup_percent is
  'Påslag i prosent på innprisen fra leddet over. 0 = selger til innpris (ingen margin), 100 = dobbel pris. Kundepris = innpris × (1 + påslag/100).';
