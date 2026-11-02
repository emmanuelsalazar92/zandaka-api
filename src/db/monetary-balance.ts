import type { Database } from 'better-sqlite3';
import { monetaryBalance } from '../utils/monetary-balance';
import { decimalText } from '../utils/money';

// Normalize only after decimal_sum, before the Number API boundary. No schema or
// stored-value changes, and no dependency on applying money-decimal-v1.
export function registerMonetaryBalanceSql(db: Database): void {
  db.function('money_balance', { deterministic: true }, (value: unknown, currency: unknown) =>
    decimalText(monetaryBalance(value === null ? '0' : String(value), String(currency))),
  );
}
