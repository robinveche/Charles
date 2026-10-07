//! Schéma SQLite. Chaque évolution = une nouvelle migration (jamais modifier une migration publiée).
use tauri_plugin_sql::{Migration, MigrationKind};

pub const DB_URL: &str = "sqlite:charles.db";

const V1: &str = r#"
CREATE TABLE IF NOT EXISTS items (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL DEFAULT 'task',      -- task | event
  category_id  TEXT NOT NULL DEFAULT 'task',
  priority     INTEGER NOT NULL DEFAULT 0,        -- 0 normale, 1 importante, 2 urgente
  date         TEXT,                              -- YYYY-MM-DD (local)
  time         TEXT,                              -- HH:mm (local)
  duration_min INTEGER NOT NULL DEFAULT 60,
  reminders    TEXT NOT NULL DEFAULT '[]',        -- JSON : minutes avant
  recurrence   TEXT,                              -- JSON : règle de répétition
  series_id    TEXT,                              -- occurrence terminée -> série d'origine
  done_at      TEXT,
  fired_keys   TEXT NOT NULL DEFAULT '[]',        -- notifications déjà envoyées
  contact_id   TEXT,                              -- V2 : CRM léger
  source       TEXT NOT NULL DEFAULT 'local',     -- local | google
  external_id  TEXT,                              -- V2 : id Google Calendar
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  deleted_at   TEXT                               -- suppression douce (sync)
);
CREATE INDEX IF NOT EXISTS idx_items_date ON items(date);
CREATE INDEX IF NOT EXISTS idx_items_done ON items(done_at);
CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_items_external ON items(source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT 'circle',
  color      TEXT NOT NULL DEFAULT '#8a8f98',
  kind       TEXT NOT NULL DEFAULT 'task',
  sort       INTEGER NOT NULL DEFAULT 0,
  builtin    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Préparé pour la V2 (clients / contacts)
CREATE TABLE IF NOT EXISTS contacts (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  company    TEXT NOT NULL DEFAULT '',
  email      TEXT NOT NULL DEFAULT '',
  phone      TEXT NOT NULL DEFAULT '',
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Préparé pour la synchronisation (curseurs, jetons Google…)
CREATE TABLE IF NOT EXISTS sync_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"#;

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "schema initial",
            sql: V1,
            kind: MigrationKind::Up,
        },
        // Correctif 1.0.1 : supprime les copies fantômes sans id créées par le bug de l'éditeur
        Migration {
            version: 2,
            description: "nettoyage lignes sans id",
            sql: "DELETE FROM items WHERE id IS NULL OR id = '';",
            kind: MigrationKind::Up,
        },
        // 1.2 : projets (Spotwise, MP Finance, ICN…)
        Migration {
            version: 3,
            description: "projets",
            sql: "ALTER TABLE items ADD COLUMN project_id TEXT;
                  CREATE INDEX IF NOT EXISTS idx_items_project ON items(project_id);
                  CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#8a8f98',
                    sort INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, deleted_at TEXT
                  );",
            kind: MigrationKind::Up,
        },
        // 1.2 : avant, les tâches avaient 1 h par défaut sans que l'utilisateur l'ait choisi
        Migration {
            version: 4,
            description: "duree des taches non precisee",
            sql: "UPDATE items SET duration_min = 0 WHERE kind = 'task' AND duration_min = 60;",
            kind: MigrationKind::Up,
        },
    ]
}
