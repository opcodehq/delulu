-- Channel identity metadata only. Transcripts and delivery state remain in DOs.
CREATE TABLE agent_beta_invites (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  invited_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE agent_channel_identities (
  id text PRIMARY KEY,
  environment text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('telegram', 'whatsapp')),
  provider_account_id text NOT NULL,
  provider_user_id text NOT NULL,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  verified_email text NOT NULL,
  generation text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now(),
  disconnected_at timestamptz,
  UNIQUE (environment, channel, provider_account_id, provider_user_id)
);

CREATE INDEX agent_channel_identities_user_idx
  ON agent_channel_identities(user_id) WHERE disconnected_at IS NULL;

CREATE TABLE agent_instruction_skills (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id text NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  instructions text NOT NULL CHECK (length(instructions) BETWEEN 1 AND 12000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE agent_instruction_skill_versions (
  skill_id text NOT NULL REFERENCES agent_instruction_skills(id) ON DELETE CASCADE,
  revision integer NOT NULL,
  title text NOT NULL,
  instructions text NOT NULL,
  edited_by_user_id text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (skill_id, revision)
);

-- Content-free concurrency and budget receipts shared across linked channels.
CREATE TABLE agent_channel_turns (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_workspace_id text NOT NULL REFERENCES agent_workspaces(id),
  billing_owner_user_id text NOT NULL REFERENCES users(id),
  reserved_micros bigint NOT NULL CHECK (reserved_micros >= 0),
  state text NOT NULL CHECK (state IN ('active', 'settled', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  settled_at timestamptz
);
CREATE INDEX agent_channel_turns_active_idx ON agent_channel_turns(billing_owner_user_id, expires_at) WHERE state = 'active';

ALTER TABLE agent_memories ADD COLUMN scope text NOT NULL DEFAULT 'workspace'
  CHECK (scope IN ('workspace', 'personal'));
