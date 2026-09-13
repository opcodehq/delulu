-- Idempotency receipts for Gatekeeper-approved effects. Kept separate from
-- approval codes because the runtime may retry an apply RPC after disconnect.

CREATE TABLE agent_external_effects (
  idempotency_key text PRIMARY KEY,
  caller_email text NOT NULL,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action_kind text NOT NULL,
  status text NOT NULL CHECK (status IN ('executing', 'completed', 'failed')),
  result jsonb,
  error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_external_effects_recovery_idx
  ON agent_external_effects (updated_at) WHERE status = 'executing';

CREATE TRIGGER agent_external_effects_set_updated_at
  BEFORE UPDATE ON agent_external_effects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
