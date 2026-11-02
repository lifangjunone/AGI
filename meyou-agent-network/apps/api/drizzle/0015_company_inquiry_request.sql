ALTER TABLE customer_threads ADD COLUMN IF NOT EXISTS inquiry_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS customer_threads_inquiry_request
ON customer_threads(organization_id,customer_id,inquiry_request_id)
WHERE inquiry_request_id IS NOT NULL;
