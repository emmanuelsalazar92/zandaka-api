import db from './db';
import { decimalNumber, decimalText } from '../utils/money';
import { decimalColumns } from './precision';

const financialFields = new Set([
  ...Object.values(decimalColumns).flatMap((columns) => Object.keys(columns)),
  'balance',
  'total',
  'total_amount',
  'distributed_amount',
  'distributed_percentage',
]);

function hydrate(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row;
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      financialFields.has(key) && typeof value === 'string' ? decimalNumber(value) : value,
    ]),
  );
}

// Bind numeric values as canonical decimal text so SQLite never formats a money Number
// through its 15-digit REAL-to-TEXT conversion. INTEGER-affinity IDs remain integers.
export function moneyStatement(sql: string) {
  const stmt = db.prepare(sql);
  const bind = (values: unknown[]) =>
    values.map((value) => (typeof value === 'number' ? decimalText(decimalNumber(value)) : value));
  return {
    run: (...values: unknown[]) => stmt.run(...bind(values)),
    get: (...values: unknown[]) => hydrate(stmt.get(...bind(values))),
    all: (...values: unknown[]) => stmt.all(...bind(values)).map(hydrate),
  };
}
