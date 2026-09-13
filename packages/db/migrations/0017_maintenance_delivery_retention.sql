-- Durable maintenance cadences and indexes for bounded message retention.

CREATE TABLE maintenance_schedules (
  job_key text PRIMARY KEY,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_started_at timestamptz,
  last_completed_at timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX maintenance_schedules_due_idx
  ON maintenance_schedules (next_run_at)
  WHERE locked_until IS NULL;

CREATE INDEX message_deliveries_unsent_retention_idx
  ON message_deliveries (created_at)
  WHERE status IN ('queued', 'leased', 'failed', 'dead', 'suppressed');

CREATE INDEX message_deliveries_sent_retention_idx
  ON message_deliveries (sent_at)
  WHERE status = 'sent';

CREATE TRIGGER maintenance_schedules_set_updated_at
  BEFORE UPDATE ON maintenance_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
