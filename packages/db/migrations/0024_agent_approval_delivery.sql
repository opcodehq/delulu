-- Encrypted, expiring approval delivery payloads keep plaintext codes out of
-- canonical run history while allowing callback and channel recovery.

ALTER TABLE agent_runs
  ADD COLUMN approval_delivery_ciphertext text,
  ADD COLUMN approval_delivery_cipher_version text
    CHECK (approval_delivery_cipher_version IN ('v1')),
  ADD COLUMN approval_delivery_expires_at timestamptz;

CREATE INDEX agent_runs_approval_delivery_expiry_idx
  ON agent_runs (approval_delivery_expires_at)
  WHERE approval_delivery_ciphertext IS NOT NULL;
