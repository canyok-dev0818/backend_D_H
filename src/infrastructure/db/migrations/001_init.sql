-- Notification Preferences Service schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS default_preferences (
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  PRIMARY KEY (notification_type, channel)
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  enabled BOOLEAN NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_type, channel)
);

CREATE TABLE IF NOT EXISTS user_quiet_hours (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  blocked_types JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS global_policies (
  id SERIAL PRIMARY KEY,
  notification_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  region TEXT NOT NULL,
  deny BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (notification_type, channel, region)
);

CREATE TABLE IF NOT EXISTS preference_commands (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  command JSONB NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, idempotency_key)
);

-- Seed default preferences (assignment examples)
INSERT INTO default_preferences (notification_type, channel, enabled) VALUES
  ('transactional_email', 'email', true),
  ('marketing_email', 'email', false),
  ('transactional_sms', 'sms', true),
  ('marketing_sms', 'sms', false),
  ('transactional_push', 'push', true),
  ('marketing_push', 'push', false),
  ('transactional_messenger', 'messenger', true),
  ('marketing_messenger', 'messenger', false)
ON CONFLICT (notification_type, channel) DO NOTHING;

-- Example global policy: marketing SMS denied in EU
INSERT INTO global_policies (notification_type, channel, region, deny) VALUES
  ('marketing_sms', 'sms', 'EU', true)
ON CONFLICT (notification_type, channel, region) DO NOTHING;
