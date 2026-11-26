import type { Database } from 'better-sqlite3';

const schema = `CREATE TABLE project (
  id TEXT NOT NULL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finalized_at TEXT,
  archived_at TEXT,
  creation_key TEXT,
  creation_title TEXT,
  UNIQUE(user_id, creation_key)
)`;

const normalize = (sql: string) => sql.replace(/\bIF NOT EXISTS\b/gi, '').replace(/[\s;]/g, '');

export function projectsReady(db: Database): boolean {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'project'")
    .get() as { sql: string } | undefined;
  return Boolean(
    row &&
    normalize(row.sql) === normalize(schema) &&
    !db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'project'")
      .get(),
  );
}

export function installProjects(db: Database): void {
  db.transaction(() => {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user'").get())
      throw new Error('An existing Zandaka database with the user table is required.');
    db.exec(schema.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'));
    if (!projectsReady(db)) throw new Error('Incompatible project schema; setup rolled back.');
    db.exec(
      'CREATE INDEX IF NOT EXISTS idx_project_owner_updated ON project(user_id, updated_at DESC, id DESC)',
    );
  }).immediate();
}
