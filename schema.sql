CREATE TABLE IF NOT EXISTS facts (
  q_lower   TEXT PRIMARY KEY,
  q         TEXT NOT NULL,
  a         TEXT NOT NULL,
  taught_at TEXT NOT NULL
);
