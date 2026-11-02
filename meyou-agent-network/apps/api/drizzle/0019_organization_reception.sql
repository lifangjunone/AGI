ALTER TABLE organizations ADD COLUMN IF NOT EXISTS reception_mode text NOT NULL DEFAULT 'human';
