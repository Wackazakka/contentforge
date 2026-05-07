-- Add content_type column to publications table
-- Supports distinguishing between video and article publications

ALTER TABLE publications 
ADD COLUMN IF NOT EXISTS content_type TEXT DEFAULT 'video';

-- Create index for filtering by content_type
CREATE INDEX IF NOT EXISTS idx_publications_content_type 
ON publications(content_type);
