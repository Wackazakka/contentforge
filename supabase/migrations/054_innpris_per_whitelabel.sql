-- To påslag, ett per ledd (Lars 3/8):
--
--   råkost ──(vårt påslag mot DENNE partneren)──▶ INNPRIS ──(partnerens eget påslag)──▶ sluttpris
--
-- «ContentForge setter påslag for den enkelte white-label. Påslaget påvirker
-- bare én ting for IndigoBoom: innprisen. Så setter IndigoBoom sitt påslag, og
-- det påvirker bare én ting: hvor mye sluttbrukeren må betale.»
--
-- Fram til nå fantes bare ETT tall (markup_percent), og det ble brukt til
-- begge betydningene. Derfor så det ut som de to påvirket hverandre — man
-- redigerte samme felt fra to sider.
--
-- markup_percent  = partnerens eget påslag  → sluttprisen (partneren eier det)
-- wholesale_markup_pct = vårt påslag mot partneren → innprisen (vi eier det)
--
-- Standard 100 tilsvarer dagens tall nøyaktig: COSTS_NOK er råkost × 2, og
-- innpris = råkost × (1 + 100/100) = COSTS_NOK. Ingen priser flytter seg.

alter table public.tenants
  add column if not exists wholesale_markup_pct numeric not null default 100;

comment on column public.tenants.wholesale_markup_pct is
  'VÅRT påslag i prosent på råkost for denne partneren. Setter innprisen de faktureres. Eies av leddet over. Partnerens eget påslag mot sine kunder ligger i markup_percent.';
