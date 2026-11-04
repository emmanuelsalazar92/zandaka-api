import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { installTransferIdempotency } from '../db/transfer-idempotency';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--db' || !args[1]) {
  throw new Error('Usage: npm run db:transfer-idempotency -- --db <explicit SQLite file>');
}
const target = path.resolve(args[1]);
if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
  throw new Error('An existing, explicitly selected SQLite file is required');
}
const db = new Database(target, { fileMustExist: true });
try {
  db.pragma('foreign_keys = ON');
  installTransferIdempotency(db);
  console.log('Transfer retry storage enabled. Existing ledger values were not modified.');
} finally {
  db.close();
}
