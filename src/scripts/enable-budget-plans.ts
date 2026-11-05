import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { installBudgetPlans } from '../db/budget-plan';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--db')
  throw new Error('Usage: node dist/scripts/enable-budget-plans.js --db <existing testing DB>');
const target = path.resolve(args[1]);
if (!fs.existsSync(target) || !fs.statSync(target).isFile())
  throw new Error('Select an existing SQLite file explicitly.');
const db = new Database(target, { fileMustExist: true });
try {
  db.pragma('foreign_keys = ON');
  installBudgetPlans(db);
  console.log('Budget planning storage prepared. Existing budgets and ledger were not changed.');
} finally {
  db.close();
}
