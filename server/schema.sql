CREATE SCHEMA IF NOT EXISTS studylang;

CREATE TABLE IF NOT EXISTS studylang.users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Ученик',
  language TEXT NOT NULL DEFAULT 'fr',
  theme TEXT NOT NULL DEFAULT 'light',
  tutor_prompt TEXT NOT NULL DEFAULT '',
  sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
  chats JSONB NOT NULL DEFAULT '[]'::jsonb,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  custom_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  hidden_files JSONB NOT NULL DEFAULT '[]'::jsonb,
  homework JSONB NOT NULL DEFAULT '[]'::jsonb,
  advice JSONB NOT NULL DEFAULT '{"overall":{},"files":{}}'::jsonb,
  shelf JSONB NOT NULL DEFAULT '{}'::jsonb,
  email TEXT NOT NULL DEFAULT '',
  picture TEXT NOT NULL DEFAULT '',
  google_sub TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE studylang.users ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '';
ALTER TABLE studylang.users ADD COLUMN IF NOT EXISTS picture TEXT NOT NULL DEFAULT '';
ALTER TABLE studylang.users ADD COLUMN IF NOT EXISTS google_sub TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_uidx
  ON studylang.users (google_sub)
  WHERE google_sub IS NOT NULL;

INSERT INTO studylang.users (id) VALUES ('local') ON CONFLICT (id) DO NOTHING;
