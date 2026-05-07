-- Add user_access_token column to social_connections table
-- Stores the user access token from OAuth for Instagram content publishing

ALTER TABLE social_connections 
ADD COLUMN IF NOT EXISTS user_access_token TEXT;

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_social_connections_user_token 
ON social_connections(user_id, user_access_token);
