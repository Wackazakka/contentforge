-- Add cta_text column to product_profiles
-- Used as verbatim CTA appended at the bottom of generated articles

ALTER TABLE product_profiles
  ADD COLUMN IF NOT EXISTS cta_text text;
