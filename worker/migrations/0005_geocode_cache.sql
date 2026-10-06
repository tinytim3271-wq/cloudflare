CREATE TABLE geocode_cache (
  address_key TEXT PRIMARY KEY,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  label TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX geocode_cache_expires_at_idx ON geocode_cache(expires_at);

CREATE TABLE geocode_request_pacing (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_available_at INTEGER NOT NULL
);

INSERT INTO geocode_request_pacing (id, next_available_at)
VALUES (1, 0);
