import db from '../db/db';
import { ExchangeRate } from '../types';

export class ExchangeRateRepository {
  list(params: {
    userId: number;
    fromCurrency?: string;
    toCurrency?: string;
    effectiveDate?: string;
  }): ExchangeRate[] {
    const conditions = ['user_id = ?'];
    const values: Array<number | string> = [params.userId];

    if (params.fromCurrency) {
      conditions.push('from_currency = ?');
      values.push(params.fromCurrency);
    }

    if (params.toCurrency) {
      conditions.push('to_currency = ?');
      values.push(params.toCurrency);
    }

    if (params.effectiveDate) {
      conditions.push('effective_date = ?');
      values.push(params.effectiveDate);
    }

    const stmt = db.prepare(`
      SELECT *
      FROM exchange_rate
      WHERE ${conditions.join(' AND ')}
      ORDER BY effective_date DESC, updated_at DESC, id DESC
    `);

    return stmt.all(...values) as ExchangeRate[];
  }

  findById(id: number): ExchangeRate | null {
    const stmt = db.prepare('SELECT * FROM exchange_rate WHERE id = ?');
    return stmt.get(id) as ExchangeRate | null;
  }

  findDuplicate(params: {
    userId: number;
    fromCurrency: string;
    toCurrency: string;
    effectiveDate: string;
    excludeId?: number;
  }): ExchangeRate | null {
    const conditions = [
      'user_id = ?',
      'from_currency = ?',
      'to_currency = ?',
      'effective_date = ?',
    ];
    const values: Array<number | string> = [
      params.userId,
      params.fromCurrency,
      params.toCurrency,
      params.effectiveDate,
    ];

    if (params.excludeId !== undefined) {
      conditions.push('id <> ?');
      values.push(params.excludeId);
    }

    const stmt = db.prepare(`
      SELECT *
      FROM exchange_rate
      WHERE ${conditions.join(' AND ')}
      LIMIT 1
    `);

    return stmt.get(...values) as ExchangeRate | null;
  }

  create(params: {
    userId: number;
    fromCurrency: string;
    toCurrency: string;
    rate: number;
    effectiveDate: string;
  }): ExchangeRate {
    const stmt = db.prepare(`
      INSERT INTO exchange_rate (
        user_id,
        from_currency,
        to_currency,
        rate,
        effective_date
      )
      VALUES (?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.userId,
      params.fromCurrency,
      params.toCurrency,
      params.rate,
      params.effectiveDate,
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  update(
    id: number,
    params: {
      fromCurrency?: string;
      toCurrency?: string;
      rate?: number;
      effectiveDate?: string;
    },
  ): ExchangeRate | null {
    const updates: string[] = [];
    const values: Array<number | string> = [];

    if (params.fromCurrency !== undefined) {
      updates.push('from_currency = ?');
      values.push(params.fromCurrency);
    }

    if (params.toCurrency !== undefined) {
      updates.push('to_currency = ?');
      values.push(params.toCurrency);
    }

    if (params.rate !== undefined) {
      updates.push('rate = ?');
      values.push(params.rate);
    }

    if (params.effectiveDate !== undefined) {
      updates.push('effective_date = ?');
      values.push(params.effectiveDate);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const stmt = db.prepare(`UPDATE exchange_rate SET ${updates.join(', ')} WHERE id = ?`);
    const result = stmt.run(...values);

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  delete(id: number): boolean {
    const stmt = db.prepare('DELETE FROM exchange_rate WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }
}
