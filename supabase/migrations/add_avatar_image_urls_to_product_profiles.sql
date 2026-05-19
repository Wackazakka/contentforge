ALTER TABLE product_profiles
  ADD COLUMN IF NOT EXISTS avatar_image_urls text[];
