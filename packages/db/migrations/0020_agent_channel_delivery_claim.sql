-- Add an at-most-once outbound delivery claim for concurrent schedulers.

ALTER TABLE agent_channel_messages
  DROP CONSTRAINT agent_channel_messages_status_check;

ALTER TABLE agent_channel_messages
  ADD CONSTRAINT agent_channel_messages_status_check CHECK (status IN (
    'received', 'queued', 'running', 'sending', 'replied', 'failed', 'suppressed'
  ));

DROP INDEX agent_channel_connections_live_workspace_idx;

CREATE UNIQUE INDEX agent_channel_connections_live_workspace_idx
  ON agent_channel_connections (workspace_id, user_id, channel)
  WHERE status != 'disconnected';

CREATE INDEX agent_channel_messages_sending_recovery_idx
  ON agent_channel_messages (updated_at)
  WHERE status = 'sending';
