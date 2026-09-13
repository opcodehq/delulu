-- Durable human-channel connections and message-to-agent delivery state.

CREATE TABLE agent_channel_connections (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  status text NOT NULL CHECK (status IN (
    'onboarding', 'active', 'failed', 'disconnected'
  )),
  gateway_customer_id text NOT NULL,
  gateway_agent_id text NOT NULL,
  gateway_connection_id text UNIQUE,
  address text,
  allowed_sender text NOT NULL,
  onboarding_url text,
  onboarding_expires_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_channel_connections_live_workspace_idx
  ON agent_channel_connections (workspace_id, user_id, channel)
  WHERE status != 'disconnected';

CREATE UNIQUE INDEX agent_channel_connections_gateway_agent_idx
  ON agent_channel_connections (gateway_agent_id, channel)
  WHERE status != 'disconnected';

CREATE TABLE agent_channel_messages (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES agent_channel_connections(id) ON DELETE CASCADE,
  gateway_event_id text NOT NULL UNIQUE,
  gateway_message_id text UNIQUE,
  gateway_conversation_id text,
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL CHECK (status IN (
    'received', 'queued', 'running', 'sending', 'replied', 'failed', 'suppressed'
  )),
  sender_address text,
  text text NOT NULL DEFAULT '',
  media jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_task_id text REFERENCES agent_tasks(id) ON DELETE SET NULL,
  error text,
  occurred_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_channel_messages ADD CONSTRAINT agent_channel_messages_media_array
  CHECK (jsonb_typeof(media) = 'array');

CREATE INDEX agent_channel_messages_connection_created_idx
  ON agent_channel_messages (connection_id, created_at DESC);

CREATE INDEX agent_channel_messages_dispatch_idx
  ON agent_channel_messages (status, updated_at)
  WHERE status IN ('received', 'queued', 'running');

CREATE TRIGGER agent_channel_connections_set_updated_at
  BEFORE UPDATE ON agent_channel_connections
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER agent_channel_messages_set_updated_at
  BEFORE UPDATE ON agent_channel_messages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
