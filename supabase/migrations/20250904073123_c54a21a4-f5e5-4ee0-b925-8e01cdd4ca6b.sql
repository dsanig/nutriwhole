-- Remove the problematic unique constraint that prevents multiple requests with same status
ALTER TABLE coach_assignment_requests DROP CONSTRAINT IF EXISTS coach_assignment_requests_client_id_coach_id_status_key;

-- Add a more appropriate constraint that allows multiple requests but ensures uniqueness per request
-- We'll keep the existing primary key on id which is sufficient for uniqueness