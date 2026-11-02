import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Test setup, not a migration: create an empty, synthetic legacy-schema database.
// Never accept an existing file or a path outside the temporary test directory.
export function createSyntheticDb(file: string): void {
  const target = path.resolve(file);
  if (!target.startsWith(path.resolve(os.tmpdir()) + path.sep) || fs.existsSync(target)) {
    throw new Error('A new temporary synthetic database path is required');
  }
  const db = new Database(target);
  try {
    db.exec(fs.readFileSync(path.join(__dirname, '../fixtures/legacy-money-v0.sql'), 'utf8'));
  } finally {
    db.close();
  }
}
