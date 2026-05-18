-- Add avatar_image_url column to product_profiles
-- Saves the avatar image URL so users don't have to re-upload each time

ALTER TABLE product_profiles
  ADD COLUMN IF NOT EXISTS avatar_image_url text;
