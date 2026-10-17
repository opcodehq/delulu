-- Keep connection identity for post/automation history and same-account reconnects.
-- All current-account reads and credential rotations use this updatable view.
ALTER TABLE connections ADD COLUMN disconnected_at timestamptz;
CREATE VIEW active_connections AS
  SELECT * FROM connections WHERE disconnected_at IS NULL
  WITH LOCAL CHECK OPTION;
