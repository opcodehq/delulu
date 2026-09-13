-- Expand-only transition: the old column and source remain readable during a
-- rolling deployment, while new code gains a neutral source and typed approval
-- delivery. A later compatibility release may contract the retired schema.
ALTER TABLE agent_runs DROP CONSTRAINT agent_runs_source_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_source_check
  CHECK (source IN ('web', 'whatsapp', 'external', 'ritual', 'migration'));

ALTER TABLE agent_action_approvals
  ADD COLUMN code_ciphertext text,
  ADD COLUMN code_cipher_version text;
