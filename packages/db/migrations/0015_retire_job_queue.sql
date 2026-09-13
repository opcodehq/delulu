-- deployment-safe-contract: paused cutover with acknowledged DO transfer and guarded retirement
-- The one-time transfer must acknowledge every outstanding deadline before
-- destructive retirement. Empty installations need no transfer.
DO $$
BEGIN
  IF (
    EXISTS (SELECT 1 FROM jobs WHERE status IN ('pending','leased','dispatched')) OR
    EXISTS (SELECT 1 FROM automation_trigger_repairs) OR
    EXISTS (SELECT 1 FROM subscriptions WHERE status IN ('active','trialing')) OR
    EXISTS (SELECT 1 FROM quota_reservations WHERE status = 'pending') OR
    EXISTS (SELECT 1 FROM cancellation_requests WHERE status IN ('scheduled','effective','deleting')) OR
    EXISTS (SELECT 1 FROM message_deliveries WHERE status IN ('queued','failed','leased'))
  ) AND NOT EXISTS (SELECT 1 FROM execution_receipts WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Run the scheduler transfer with old workers stopped before retiring the SQL queue';
  END IF;
  IF EXISTS (SELECT 1 FROM jobs WHERE status IN ('pending','leased','dispatched')) OR
     EXISTS (SELECT 1 FROM automation_trigger_repairs) THEN
    RAISE EXCEPTION 'Scheduler transfer is incomplete';
  END IF;
END $$;

DROP TABLE jobs;
DROP TYPE job_status;
DROP TABLE automation_trigger_repairs;
DROP INDEX message_deliveries_due_idx;
ALTER TABLE message_deliveries DROP CONSTRAINT message_deliveries_status_check;
ALTER TABLE message_deliveries ADD CONSTRAINT message_deliveries_status_check
  CHECK (status IN ('queued','sent','failed','dead','suppressed'));
ALTER TABLE message_deliveries
  DROP COLUMN locked_until,
  DROP COLUMN next_attempt_at,
  DROP COLUMN max_attempts;
DELETE FROM execution_receipts WHERE id = '00000000-0000-0000-0000-000000000001';
