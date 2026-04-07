import db from '../db/db';
import { CashDenomination } from '../types';

export class CashDenominationRepository {
  create(params: {
    userId: number;
    currency: string;
    value: number;
    type: 'BILL' | 'COIN';
    label: string | null;
    sortOrder: number;
    isActive: boolean;
  }): CashDenomination {
    const stmt = db.prepare(`
      INSERT INTO cash_denomination (
        user_id,
        currency,
        value,
        type,
        label,
        sort_order,
        is_active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      params.userId,
      params.currency,
      params.value,
      params.type,
      params.label,
      params.sortOrder,
      params.isActive ? 1 : 0,
    );

    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): CashDenomination | null {
    const stmt = db.prepare('SELECT * FROM cash_denomination WHERE id = ?');
    return stmt.get(id) as CashDenomination | null;
  }

  findByUserAndCurrency(params: {
    userId: number;
    currency?: string;
    includeInactive?: boolean;
  }): CashDenomination[] {
    const conditions = ['user_id = ?'];
    const values: Array<number | string> = [params.userId];

    if (params.currency) {
      conditions.push('currency = ?');
      values.push(params.currency);
    }

    if (!params.includeInactive) {
      conditions.push('is_active = 1');
    }

    const stmt = db.prepare(`
      SELECT *
      FROM cash_denomination
      WHERE ${conditions.join(' AND ')}
      ORDER BY sort_order ASC, value DESC, id ASC
    `);

    return stmt.all(...values) as CashDenomination[];
  }

  findActiveDuplicate(params: {
    userId: number;
    currency: string;
    value: number;
    excludeId?: number;
  }): CashDenomination | null {
    const stmt = db.prepare(`
      SELECT *
      FROM cash_denomination
      WHERE user_id = ?
        AND currency = ?
        AND value = ?
        AND is_active = 1
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `);

    return stmt.get(
      params.userId,
      params.currency,
      params.value,
      params.excludeId ?? null,
      params.excludeId ?? null,
    ) as CashDenomination | null;
  }

  update(
    id: number,
    params: {
      currency: string;
      value: number;
      type: 'BILL' | 'COIN';
      label: string | null;
      sortOrder: number;
      isActive: boolean;
    },
  ): CashDenomination | null {
    const stmt = db.prepare(`
      UPDATE cash_denomination
      SET
        currency = ?,
        value = ?,
        type = ?,
        label = ?,
        sort_order = ?,
        is_active = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const result = stmt.run(
      params.currency,
      params.value,
      params.type,
      params.label,
      params.sortOrder,
      params.isActive ? 1 : 0,
      id,
    );

    if (result.changes === 0) {
      return null;
    }

    return this.findById(id);
  }

  deactivate(id: number): CashDenomination | null {
    const stmt = db.prepare(`
      UPDATE cash_denomination
      SET is_active = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const result = stmt.run(id);
    if (result.changes === 0) {
      return null;
    }
    return this.findById(id);
  }
}
