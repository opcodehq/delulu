-- Removing a workspace member must not be blocked by share links they created.
-- Links outlive their creator; attribution simply becomes unknown.
ALTER TABLE post_share_links
  ALTER COLUMN created_by_member_id DROP NOT NULL,
  DROP CONSTRAINT post_share_links_created_by_member_id_fkey,
  ADD CONSTRAINT post_share_links_created_by_member_id_fkey
    FOREIGN KEY (created_by_member_id) REFERENCES workspace_members(id)
    ON DELETE SET NULL;
