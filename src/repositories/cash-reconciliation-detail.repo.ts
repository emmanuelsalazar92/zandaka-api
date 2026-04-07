import db from '../db/db';
import { CashReconciliationDetail } from '../types';

export class CashReconciliationDetailRepository {
  createMany(
    reconciliationId: number,
    lines: Array<{
      denominationId: number | null;
      denominationValue: number;
      denominationType: 'BILL' | 'COIN';
      denominationLabel: string | null;
      quantity: number;
      lineTotal: number;
      sortOrder: number;
    }>,
  ): CashReconciliationDetail[] {
    if (lines.length === 0) {
      return [];
    }

    const stmt = db.prepare(`
      INSERT INTO cash_reconciliation_detail (
        reconciliation_id,
        denomination_id,
        denomination_value,
        denomination_type,
        denomination_label,
        quantity,
        line_total,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction(
      (
        currentReconciliationId: number,
        currentLines: Array<{
          denominationId: number | null;
          denominationValue: number;
          denominationType: 'BILL' | 'COIN';
          denominationLabel: string | null;
          quantity: number;
          lineTotal: number;
          sortOrder: number;
        }>,
      ) => {
        currentLines.forEach((line) => {
          stmt.run(
            currentReconciliationId,
            line.denominationId,
            line.denominationValue,
            line.denominationType,
            line.denominationLabel,
            line.quantity,
            line.lineTotal,
            line.sortOrder,
          );
        });
      },
    );

    insertMany(reconciliationId, lines);
    return this.findByReconciliationId(reconciliationId);
  }

  findByReconciliationId(reconciliationId: number): CashReconciliationDetail[] {
    const stmt = db.prepare(`
      SELECT *
      FROM cash_reconciliation_detail
      WHERE reconciliation_id = ?
      ORDER BY sort_order ASC, id ASC
    `);

    return stmt.all(reconciliationId) as CashReconciliationDetail[];
  }

  hasDenominationUsage(denominationId: number): boolean {
    const stmt = db.prepare(`
      SELECT 1
      FROM cash_reconciliation_detail
      WHERE denomination_id = ?
      LIMIT 1
    `);

    return Boolean(stmt.get(denominationId));
  }
}
