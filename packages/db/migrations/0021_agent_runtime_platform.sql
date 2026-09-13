-- Serverless personalized agent workspaces, runs, approvals, usage, memory, and rituals.

CREATE TABLE agent_workspaces (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  runtime_provider text NOT NULL DEFAULT 'cloudflare',
  runtime_gadget_key text NOT NULL,
  runtime_path text,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'disabled', 'deleted')),
  access_tier text NOT NULL DEFAULT 'trial' CHECK (access_tier IN ('trial', 'beta', 'addon', 'community')),
  trial_turns_remaining integer NOT NULL DEFAULT 50 CHECK (trial_turns_remaining >= 0),
  monthly_budget_micros bigint NOT NULL DEFAULT 10000000 CHECK (monthly_budget_micros >= 0),
  daily_budget_micros bigint NOT NULL DEFAULT 1000000 CHECK (daily_budget_micros >= 0),
  max_concurrent_runs integer NOT NULL DEFAULT 2 CHECK (max_concurrent_runs BETWEEN 1 AND 10),
  max_run_seconds integer NOT NULL DEFAULT 1200 CHECK (max_run_seconds BETWEEN 60 AND 3600),
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  rituals_enabled boolean NOT NULL DEFAULT false,
  external_writes_enabled boolean NOT NULL DEFAULT true,
  advanced_code_enabled boolean NOT NULL DEFAULT false,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_workspaces_live_owner_idx
  ON agent_workspaces (user_id, workspace_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX agent_workspaces_runtime_key_idx
  ON agent_workspaces (user_id, runtime_gadget_key) WHERE deleted_at IS NULL;

CREATE TABLE agent_runs (
  id text PRIMARY KEY,
  agent_workspace_id text NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('web', 'whatsapp', 'ritual', 'migration')),
  source_message_key text,
  chat_key text NOT NULL,
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 1 AND 20000),
  status text NOT NULL CHECK (status IN (
    'queued', 'submitted', 'running', 'waiting_approval', 'completed',
    'interrupting', 'interrupted', 'failed', 'timed_out'
  )),
  idempotency_key text NOT NULL,
  runtime_chat_path text,
  output text NOT NULL DEFAULT '',
  provider text,
  model text,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_input_tokens bigint NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  cost_micros bigint NOT NULL DEFAULT 0 CHECK (cost_micros >= 0),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, idempotency_key)
);

CREATE INDEX agent_runs_workspace_created_idx
  ON agent_runs (workspace_id, user_id, created_at DESC);
CREATE INDEX agent_runs_active_idx ON agent_runs (updated_at)
  WHERE status IN ('queued', 'submitted', 'running', 'waiting_approval', 'interrupting');

CREATE TABLE agent_run_events (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  type text NOT NULL,
  role text NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, sequence)
);

ALTER TABLE agent_run_events ADD CONSTRAINT agent_run_events_payload_object
  CHECK (jsonb_typeof(payload) = 'object');

CREATE TABLE agent_action_approvals (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  runtime_action_id text NOT NULL,
  kind text NOT NULL,
  summary text NOT NULL,
  risk text NOT NULL CHECK (risk IN ('low', 'consequential')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'approved', 'rejected', 'expired', 'applied', 'failed'
  )),
  code_hash text NOT NULL,
  code_hint text NOT NULL,
  sender_address text,
  expires_at timestamptz NOT NULL,
  resolved_at timestamptz,
  applied_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, runtime_action_id)
);

CREATE INDEX agent_action_approvals_pending_idx
  ON agent_action_approvals (expires_at) WHERE status = 'pending';

CREATE TABLE agent_usage_ledger (
  id text PRIMARY KEY,
  billing_owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_workspace_id text NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('reservation', 'actual', 'release')),
  idempotency_key text NOT NULL UNIQUE,
  provider text,
  model text,
  input_tokens bigint NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  output_tokens bigint NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  cached_input_tokens bigint NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  cost_micros bigint NOT NULL CHECK (cost_micros >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_usage_ledger_owner_period_idx
  ON agent_usage_ledger (billing_owner_user_id, created_at DESC);

CREATE TABLE agent_memories (
  id text PRIMARY KEY,
  agent_workspace_id text NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN (
    'voice', 'audience', 'goal', 'preference', 'rejected_pattern', 'platform_insight', 'brand_fact'
  )),
  value jsonb NOT NULL,
  provenance text NOT NULL,
  confidence numeric(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status text NOT NULL CHECK (status IN ('proposed', 'confirmed', 'rejected')),
  requires_confirmation boolean NOT NULL DEFAULT true,
  source_run_id text REFERENCES agent_runs(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_memories_context_idx
  ON agent_memories (agent_workspace_id, category, status, updated_at DESC);

CREATE TABLE agent_rituals (
  id text PRIMARY KEY,
  agent_workspace_id text NOT NULL REFERENCES agent_workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'morning_brief', 'draft_ideas', 'daily_performance', 'weekly_plan', 'custom'
  )),
  name text NOT NULL,
  prompt text NOT NULL,
  timezone text NOT NULL,
  schedule jsonb NOT NULL,
  delivery_channels jsonb NOT NULL DEFAULT '["web"]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  runtime_schedule_id text,
  per_run_budget_micros bigint NOT NULL DEFAULT 250000 CHECK (per_run_budget_micros >= 0),
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_rituals ADD CONSTRAINT agent_rituals_schedule_object
  CHECK (jsonb_typeof(schedule) = 'object');
ALTER TABLE agent_rituals ADD CONSTRAINT agent_rituals_delivery_array
  CHECK (jsonb_typeof(delivery_channels) = 'array');

-- Keep channel delivery history while moving its execution reference to neutral runs.
ALTER TABLE agent_channel_messages
  ADD COLUMN agent_run_id text REFERENCES agent_runs(id) ON DELETE SET NULL;

CREATE TABLE agent_channel_link_tokens (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES agent_channel_connections(id) ON DELETE CASCADE,
  sender_address text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_by_user_id text REFERENCES users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_channel_link_tokens_expiry_idx
  ON agent_channel_link_tokens (expires_at) WHERE claimed_at IS NULL;

-- Preserve readable history from the short-lived machine-backed implementation.
INSERT INTO agent_workspaces (
  id, user_id, workspace_id, runtime_provider, runtime_gadget_key, state,
  access_tier, trial_turns_remaining, last_activity_at, created_at, updated_at
)
SELECT
  'agent_workspace_' || substr(md5(ac.id), 1, 12), ac.user_id, ac.workspace_id,
  'legacy-machine', 'workspace:' || ac.workspace_id,
  CASE WHEN ac.deleted_at IS NULL THEN 'disabled' ELSE 'deleted' END,
  'beta', 0, ac.last_activity_at, ac.created_at, ac.updated_at
FROM agent_computers ac
ON CONFLICT (user_id, workspace_id) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO agent_runs (
  id, agent_workspace_id, user_id, workspace_id, source, chat_key, objective,
  status, idempotency_key, output, provider, model, error, started_at,
  completed_at, created_at, updated_at
)
SELECT
  'agent_run_' || substr(md5(t.id), 1, 12), aw.id, t.user_id, t.workspace_id,
  'migration', 'migration:' || t.id, t.objective,
  CASE t.status
    WHEN 'completed' THEN 'completed'
    WHEN 'cancelled' THEN 'interrupted'
    WHEN 'failed' THEN 'failed'
    WHEN 'timed_out' THEN 'timed_out'
    ELSE 'interrupted'
  END,
  'migration:' || t.id, '', NULL, NULL, t.error,
  t.started_at, COALESCE(t.completed_at, now()), t.created_at, t.updated_at
FROM agent_tasks t
JOIN agent_workspaces aw ON aw.user_id = t.user_id AND aw.workspace_id = t.workspace_id
ON CONFLICT (user_id, workspace_id, idempotency_key) DO NOTHING;

CREATE TRIGGER agent_workspaces_set_updated_at BEFORE UPDATE ON agent_workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_runs_set_updated_at BEFORE UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_action_approvals_set_updated_at BEFORE UPDATE ON agent_action_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_memories_set_updated_at BEFORE UPDATE ON agent_memories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_rituals_set_updated_at BEFORE UPDATE ON agent_rituals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
