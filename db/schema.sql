-- trigram indexes for the "contains" searches
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'analyst' CHECK (role IN ('admin', 'analyst')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- case-insensitive unique emails
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (lower(email));

CREATE TABLE IF NOT EXISTS calls (
  id               INTEGER       PRIMARY KEY,
  caller_name      TEXT          NOT NULL,
  caller_number    TEXT          NOT NULL,
  receiver_number  TEXT          NOT NULL,
  city             TEXT          NOT NULL,
  direction        TEXT          NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status           TEXT          NOT NULL CHECK (status IN ('successful', 'failed')),
  duration_seconds INTEGER       NOT NULL CHECK (duration_seconds >= 0),
  cost             NUMERIC(10,2) NOT NULL CHECK (cost >= 0),
  start_time       TIMESTAMPTZ   NOT NULL,
  end_time         TIMESTAMPTZ   NOT NULL
);

CREATE INDEX IF NOT EXISTS calls_start_time_idx ON calls (start_time);
CREATE INDEX IF NOT EXISTS calls_caller_number_trgm ON calls USING gin (caller_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS calls_receiver_number_trgm ON calls USING gin (receiver_number gin_trgm_ops);
CREATE INDEX IF NOT EXISTS calls_city_trgm ON calls USING gin (city gin_trgm_ops);
