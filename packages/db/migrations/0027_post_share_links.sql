-- Workspace policy: admins can restrict share links to signed-in members.
ALTER TABLE workspaces
  ADD COLUMN public_share_links boolean NOT NULL DEFAULT true;

-- Shareable post previews. One active link per post; the token is stored as a
-- SHA-256 lookup hash plus a ciphertext so members can copy it again later.
CREATE TABLE post_share_links (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  token_ciphertext text NOT NULL,
  cipher_version text NOT NULL DEFAULT 'v1' CHECK (cipher_version = 'v1'),
  access text NOT NULL CHECK (access IN ('anyone', 'workspace')),
  created_by_member_id text NOT NULL REFERENCES workspace_members(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX post_share_links_active_idx
  ON post_share_links(post_id) WHERE revoked_at IS NULL;

-- Feedback left through a share link. Kept per post, so renewing or replacing
-- the link preserves the conversation.
CREATE TABLE post_share_comments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id text NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  share_link_id text NOT NULL REFERENCES post_share_links(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (length(author_name) BETWEEN 1 AND 60),
  author_user_id text REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX post_share_comments_post_idx
  ON post_share_comments(workspace_id, post_id, created_at);
