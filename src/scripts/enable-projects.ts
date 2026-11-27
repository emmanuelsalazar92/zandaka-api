import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { installProjectMovements } from '../db/project';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--db')
  throw new Error('Usage: node dist/scripts/enable-projects.js --db <existing testing DB>');
const target = fs.realpathSync(path.resolve(args[1]));
if (!fs.statSync(target).isFile() || /^production-audit-/i.test(path.basename(target)))
  throw new Error('Select an existing testing database, not an audit copy.');

const db = new Database(target, { fileMustExist: true });
try {
  db.pragma('foreign_keys = ON');
  installProjectMovements(db);
  console.log('Project and movement link storage is ready.');
} finally {
  db.close();
}
