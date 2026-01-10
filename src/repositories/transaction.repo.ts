import db from '../db/db';
import { Transaction, TransactionLine } from '../types';

export class TransactionRepository {
  create(
    userId: number,
    date: string,
    description: string,
    type: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT',
    lines: Array<{ accountId: number; envelopeId: number; amount: number }>
  ): { transaction: Transaction; lines: TransactionLine[] } {
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (user_id, date, description, type)
      VALUES (?, ?, ?, ?)
    `);

    const insertLine = db.prepare(`
      INSERT INTO transaction_line (transaction_id, account_id, envelope_id, amount)
      VALUES (?, ?, ?, ?)
    `);

    const transaction = db.transaction(() => {
      const txResult = insertTransaction.run(userId, date, description, type);
      const transactionId = txResult.lastInsertRowid as number;

      const createdLines: TransactionLine[] = [];
      for (const line of lines) {
        const lineResult = insertLine.run(
          transactionId,
          line.accountId,
          line.envelopeId,
          line.amount
        );
        createdLines.push({
          id: lineResult.lastInsertRowid as number,
          transaction_id: transactionId,
          account_id: line.accountId,
          envelope_id: line.envelopeId,
          amount: line.amount,
        });
      }

      const transaction = this.findById(transactionId)!;
      return { transaction, lines: createdLines };
    });

    return transaction();
  }

  findById(id: number): Transaction | null {
    const stmt = db.prepare('SELECT * FROM transactions WHERE id = ?');
    return stmt.get(id) as Transaction | null;
  }

  findLinesByTransactionId(transactionId: number): TransactionLine[] {
    const stmt = db.prepare('SELECT * FROM transaction_line WHERE transaction_id = ?');
    return stmt.all(transactionId) as TransactionLine[];
  }

  findWithFilters(params: {
    from?: string;
    to?: string;
    accountId?: number;
    categoryId?: number;
    q?: string;
    userId?: number;
  }): Array<Transaction & { lines: TransactionLine[] }> {
    let query = `
      SELECT t.*, 
             tl.id as line_id, tl.account_id, tl.envelope_id, tl.amount
      FROM transactions t
      LEFT JOIN transaction_line tl ON t.id = tl.transaction_id
      WHERE 1=1
    `;
    const conditions: string[] = [];
    const values: any[] = [];

    if (params.userId) {
      conditions.push('t.user_id = ?');
      values.push(params.userId);
    }
    if (params.from) {
      conditions.push('t.date >= ?');
      values.push(params.from);
    }
    if (params.to) {
      conditions.push('t.date <= ?');
      values.push(params.to);
    }
    if (params.accountId) {
      conditions.push('tl.account_id = ?');
      values.push(params.accountId);
    }
    if (params.q) {
      conditions.push('t.description LIKE ?');
      values.push(`%${params.q}%`);
    }

    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    if (params.categoryId) {
      query += ` AND EXISTS (
        SELECT 1 FROM transaction_line tl2
        JOIN account_envelope ae ON tl2.envelope_id = ae.id
        WHERE tl2.transaction_id = t.id AND ae.category_id = ?
      )`;
      values.push(params.categoryId);
    }

    query += ' ORDER BY t.date DESC, t.id DESC';

    const stmt = db.prepare(query);
    const rows = stmt.all(...values) as any[];

    // Group lines by transaction
    const transactionMap = new Map<number, Transaction & { lines: TransactionLine[] }>();
    for (const row of rows) {
      if (!transactionMap.has(row.id)) {
        transactionMap.set(row.id, {
          id: row.id,
          user_id: row.user_id,
          date: row.date,
          description: row.description,
          type: row.type,
          created_at: row.created_at,
          lines: [],
        });
      }
      if (row.line_id) {
        transactionMap.get(row.id)!.lines.push({
          id: row.line_id,
          transaction_id: row.id,
          account_id: row.account_id,
          envelope_id: row.envelope_id,
          amount: row.amount,
        });
      }
    }

    return Array.from(transactionMap.values());
  }
}

