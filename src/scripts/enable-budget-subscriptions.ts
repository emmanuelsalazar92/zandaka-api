import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { budgetPlansReady } from '../db/budget-plan';
import { installBudgetSubscriptions } from '../db/budget-subscriptions';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--db')
  throw new Error(
    'Usage: node dist/scripts/enable-budget-subscriptions.js --db <existing testing DB>',
  );
const target = path.resolve(args[1]);
if (!fs.existsSync(target) || !fs.statSync(target).isFile())
  throw new Error('Select an existing SQLite file explicitly.');
const db = new Database(target, { fileMustExist: true });
try {
  db.pragma('foreign_keys = ON');
  if (!budgetPlansReady(db)) throw new Error('Prepare compatible budget planning storage first.');
  installBudgetSubscriptions(db);
  console.log('Budget subscription storage prepared.');
} finally {
  db.close();
}
