-- SQLite schema for Norwegian place names gazetteer
-- Based on Kartverket Stedsnavn (SSR) dataset

-- Main places table
CREATE TABLE IF NOT EXISTS places (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ssr_id TEXT UNIQUE NOT NULL,           -- Original Stedsnavn lokalid
  primary_name TEXT NOT NULL,             -- Main place name
  alt_names TEXT,                         -- JSON array of alternative names
  lat REAL NOT NULL,                      -- WGS84 latitude
  lon REAL NOT NULL,                      -- WGS84 longitude
  place_class TEXT,                       -- city/town/village/hamlet/etc.
  municipality_code TEXT,                 -- 4-digit kommune code
  municipality_name TEXT,                 -- Kommune name
  county_name TEXT,                       -- Fylke name
  population INTEGER,                     -- Population if available
  is_county_seat INTEGER DEFAULT 0,       -- Boolean: 1 if fylkeshovedstad
  is_municipality_seat INTEGER DEFAULT 0, -- Boolean: 1 if kommunesenter
  importance_score REAL,                  -- Derived importance (0-10)

  CHECK (lat BETWEEN -90 AND 90),
  CHECK (lon BETWEEN -180 AND 180),
  CHECK (is_county_seat IN (0, 1)),
  CHECK (is_municipality_seat IN (0, 1))
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_places_primary_name ON places(primary_name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_places_municipality ON places(municipality_code);
CREATE INDEX IF NOT EXISTS idx_places_county ON places(county_name);
CREATE INDEX IF NOT EXISTS idx_places_class ON places(place_class);
CREATE INDEX IF NOT EXISTS idx_places_location ON places(lat, lon);
CREATE INDEX IF NOT EXISTS idx_places_importance ON places(importance_score DESC);

-- Full-text search index using FTS5
-- tokenize='unicode61 remove_diacritics 0' keeps Norwegian characters (æøå)
CREATE VIRTUAL TABLE IF NOT EXISTS places_fts USING fts5(
  primary_name,
  alt_names,
  municipality_name,
  county_name,
  content='places',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 0'
);

-- Triggers to keep FTS index in sync with places table
CREATE TRIGGER IF NOT EXISTS places_ai AFTER INSERT ON places BEGIN
  INSERT INTO places_fts(rowid, primary_name, alt_names, municipality_name, county_name)
  VALUES (new.id, new.primary_name, new.alt_names, new.municipality_name, new.county_name);
END;

CREATE TRIGGER IF NOT EXISTS places_ad AFTER DELETE ON places BEGIN
  DELETE FROM places_fts WHERE rowid = old.id;
END;

CREATE TRIGGER IF NOT EXISTS places_au AFTER UPDATE ON places BEGIN
  UPDATE places_fts
  SET primary_name = new.primary_name,
      alt_names = new.alt_names,
      municipality_name = new.municipality_name,
      county_name = new.county_name
  WHERE rowid = new.id;
END;

-- Metadata table for tracking ETL builds
CREATE TABLE IF NOT EXISTS _metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Insert initial metadata
INSERT OR REPLACE INTO _metadata (key, value) VALUES
  ('schema_version', '1.0'),
  ('source', 'Kartverket Stedsnavn'),
  ('license', 'CC BY 4.0'),
  ('license_url', 'https://creativecommons.org/licenses/by/4.0/');
