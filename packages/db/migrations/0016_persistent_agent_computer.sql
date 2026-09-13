-- Durable workspace computers, terminal tasks, and versioned private files.

CREATE TABLE agent_computers (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_sandbox_id text UNIQUE,
  state text NOT NULL CHECK (state IN (
    'provisioning', 'running', 'pausing', 'paused', 'stopping', 'stopped', 'failed', 'deleted'
  )),
  network_policy text NOT NULL CHECK (network_policy IN (
    'none', 'packages', 'public_network', 'approved_domains'
  )),
  approved_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  environment_version integer NOT NULL DEFAULT 1 CHECK (environment_version > 0),
  latest_snapshot_id text,
  active_task_id text,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  estimated_cost_usd numeric(14, 6) NOT NULL DEFAULT 0 CHECK (estimated_cost_usd >= 0),
  failure_reason text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_computers ADD CONSTRAINT agent_computers_approved_domains_array
  CHECK (jsonb_typeof(approved_domains) = 'array');

CREATE UNIQUE INDEX agent_computers_live_owner_idx
  ON agent_computers (user_id, workspace_id)
  WHERE deleted_at IS NULL;

CREATE INDEX agent_computers_workspace_idx
  ON agent_computers (workspace_id, updated_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX agent_computers_lifecycle_idx
  ON agent_computers (state, last_activity_at)
  WHERE deleted_at IS NULL;

CREATE TABLE agent_tasks (
  id text PRIMARY KEY,
  computer_id text NOT NULL REFERENCES agent_computers(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  objective text NOT NULL CHECK (char_length(objective) BETWEEN 1 AND 20000),
  status text NOT NULL CHECK (status IN (
    'queued', 'planning', 'waiting_for_permission', 'provisioning', 'running',
    'waiting_for_input', 'checkpointing', 'completed', 'cancelling', 'cancelled',
    'failed', 'timed_out'
  )),
  network_policy text NOT NULL CHECK (network_policy IN (
    'none', 'packages', 'public_network', 'approved_domains'
  )),
  idempotency_key text NOT NULL,
  timeout_seconds integer NOT NULL DEFAULT 3600 CHECK (timeout_seconds BETWEEN 1 AND 14400),
  command_budget integer NOT NULL DEFAULT 40 CHECK (command_budget BETWEEN 1 AND 200),
  commands_used integer NOT NULL DEFAULT 0 CHECK (commands_used >= 0),
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, idempotency_key)
);

ALTER TABLE agent_computers
  ADD CONSTRAINT agent_computers_active_task_fk
  FOREIGN KEY (active_task_id) REFERENCES agent_tasks(id) ON DELETE SET NULL;

CREATE INDEX agent_tasks_workspace_idx
  ON agent_tasks (workspace_id, created_at DESC);
CREATE INDEX agent_tasks_active_idx
  ON agent_tasks (status, updated_at)
  WHERE status IN (
    'queued', 'planning', 'waiting_for_permission', 'provisioning', 'running',
    'waiting_for_input', 'checkpointing', 'cancelling'
  );

CREATE TABLE agent_commands (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  command text NOT NULL,
  working_directory text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  exit_code integer,
  stdout_preview text NOT NULL DEFAULT '',
  stderr_preview text NOT NULL DEFAULT '',
  output_truncated boolean NOT NULL DEFAULT false,
  full_log_bucket_key text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_id, sequence)
);

CREATE TABLE agent_processes (
  id text PRIMARY KEY,
  computer_id text NOT NULL REFERENCES agent_computers(id) ON DELETE CASCADE,
  task_id text REFERENCES agent_tasks(id) ON DELETE SET NULL,
  provider_process_id text,
  command text NOT NULL,
  working_directory text NOT NULL,
  status text NOT NULL CHECK (status IN (
    'starting', 'running', 'completed', 'failed', 'stopping', 'stopped'
  )),
  lease_expires_at timestamptz NOT NULL,
  exit_code integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX agent_processes_active_idx
  ON agent_processes (computer_id, lease_expires_at)
  WHERE status IN ('starting', 'running', 'stopping');

CREATE TABLE workspace_files (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id text REFERENCES workspace_files(id) ON DELETE SET NULL,
  logical_path text NOT NULL,
  filename text NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private', 'workspace')),
  source text NOT NULL CHECK (source IN ('upload', 'whatsapp', 'connector', 'agent', 'computer')),
  status text NOT NULL CHECK (status IN ('pending', 'available', 'processing', 'quarantined', 'deleted')),
  current_version_id text,
  upload_expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workspace_files_live_workspace_path_idx
  ON workspace_files (workspace_id, logical_path)
  WHERE deleted_at IS NULL AND visibility = 'workspace';
CREATE UNIQUE INDEX workspace_files_live_private_path_idx
  ON workspace_files (workspace_id, owner_user_id, logical_path)
  WHERE deleted_at IS NULL AND visibility = 'private';
CREATE INDEX workspace_files_parent_idx
  ON workspace_files (workspace_id, parent_id, filename)
  WHERE deleted_at IS NULL;
CREATE INDEX workspace_files_pending_expiry_idx
  ON workspace_files (upload_expires_at)
  WHERE status = 'pending' AND deleted_at IS NULL;

CREATE TABLE workspace_file_versions (
  id text PRIMARY KEY,
  file_id text NOT NULL REFERENCES workspace_files(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  bucket_key text NOT NULL UNIQUE,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  created_by_user_id text NOT NULL REFERENCES users(id),
  created_by_task_id text REFERENCES agent_tasks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, version)
);

-- Object deletion is retryable and quota is released exactly once when the
-- tombstone is finalized.
CREATE TABLE workspace_file_deletions (
  file_id text PRIMARY KEY REFERENCES workspace_files(id) ON DELETE CASCADE,
  billing_owner_user_id text NOT NULL REFERENCES users(id),
  reserved_bytes bigint NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX workspace_file_deletions_retry_idx
  ON workspace_file_deletions (updated_at, attempts);

ALTER TABLE workspace_files
  ADD CONSTRAINT workspace_files_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES workspace_file_versions(id) ON DELETE RESTRICT;

CREATE TABLE workspace_snapshots (
  id text PRIMARY KEY,
  computer_id text NOT NULL REFERENCES agent_computers(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  provider_snapshot_id text,
  backup_bucket_key text,
  environment_version integer NOT NULL CHECK (environment_version > 0),
  reason text NOT NULL CHECK (reason IN (
    'manual', 'task_checkpoint', 'environment_change', 'before_destructive_action', 'idle_archive'
  )),
  status text NOT NULL CHECK (status IN ('creating', 'available', 'failed', 'deleted')),
  size_bytes bigint NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_computers
  ADD CONSTRAINT agent_computers_latest_snapshot_fk
  FOREIGN KEY (latest_snapshot_id) REFERENCES workspace_snapshots(id) ON DELETE SET NULL;

CREATE INDEX workspace_snapshots_computer_idx
  ON workspace_snapshots (computer_id, created_at DESC)
  WHERE status = 'available';

CREATE TRIGGER agent_computers_set_updated_at BEFORE UPDATE ON agent_computers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_tasks_set_updated_at BEFORE UPDATE ON agent_tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER agent_processes_set_updated_at BEFORE UPDATE ON agent_processes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER workspace_files_set_updated_at BEFORE UPDATE ON workspace_files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
