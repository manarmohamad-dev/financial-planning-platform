-- Additive provider identities; existing passwords and memberships are preserved.
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
CREATE TABLE google_identities (
  subject text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE google_auth_challenges (
  nonce_hash text PRIMARY KEY,
  session_hash text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX google_auth_challenges_expiry ON google_auth_challenges(expires_at);
GRANT SELECT, INSERT ON google_identities TO planner_app;
GRANT SELECT, INSERT, DELETE ON google_auth_challenges TO planner_app;
