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
    userId: number;
    from?: string;
    to?: string;
    type?: 'INCOME' | 'EXPENSE' | 'TRANSFER' | 'ADJUSTMENT';
    accountId?: number;
    categoryId?: number;
    q?: string;
    amountMin?: number;
    amountMax?: number;
    page: number;
    pageSize: number;
    sortBy: 'date' | 'amount' | 'createdAt';
    sortDir: 'asc' | 'desc';
  }): {
    data: Array<
      Transaction & {
        amount: number;
        lines: Array<
          TransactionLine & {
            account_name?: string | null;
            category_id?: number | null;
            category_name?: string | null;
          }
        >;
      }
    >;
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  } {
    const conditions: string[] = [
      't.user_id = ?',
      `EXISTS (
        SELECT 1
        FROM transaction_line tl_active
        JOIN account_envelope ae_active ON tl_active.envelope_id = ae_active.id
        WHERE tl_active.transaction_id = t.id AND ae_active.is_active = 1
      )`,
    ];
    const values: any[] = [params.userId];

    if (params.from) {
      conditions.push('t.date >= ?');
      values.push(params.from);
    }
    if (params.to) {
      conditions.push('t.date <= ?');
      values.push(params.to);
    }
    if (params.type) {
      conditions.push('t.type = ?');
      values.push(params.type);
    }
    if (params.q) {
      conditions.push('LOWER(t.description) LIKE ?');
      values.push(`%${params.q.toLowerCase()}%`);
    }
    if (params.accountId) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM transaction_line tl_acc
          JOIN account_envelope ae_acc ON tl_acc.envelope_id = ae_acc.id
          WHERE tl_acc.transaction_id = t.id
            AND tl_acc.account_id = ?
            AND ae_acc.is_active = 1
        )`
      );
      values.push(params.accountId);
    }
    if (params.categoryId) {
      conditions.push(
        `EXISTS (
          SELECT 1
          FROM transaction_line tl_cat
          JOIN account_envelope ae ON tl_cat.envelope_id = ae.id
          WHERE tl_cat.transaction_id = t.id
            AND ae.category_id = ?
            AND ae.is_active = 1
        )`
      );
      values.push(params.categoryId);
    }
    if (params.amountMin !== undefined) {
      conditions.push('IFNULL(tt.total_amount, 0) >= ?');
      values.push(params.amountMin);
    }
    if (params.amountMax !== undefined) {
      conditions.push('IFNULL(tt.total_amount, 0) <= ?');
      values.push(params.amountMax);
    }

    const sortColumnMap: Record<typeof params.sortBy, string> = {
      date: 't.date',
      amount: 'tt.total_amount',
      createdAt: 't.created_at',
    };
    const sortColumn = sortColumnMap[params.sortBy];
    const sortDir = params.sortDir.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countQuery = `
      WITH totals AS (
        SELECT tl.transaction_id, SUM(tl.amount) AS total_amount
        FROM transaction_line tl
        JOIN account_envelope ae ON tl.envelope_id = ae.id
        WHERE ae.is_active = 1
        GROUP BY tl.transaction_id
      )
      SELECT COUNT(DISTINCT t.id) AS total
      FROM transactions t
      LEFT JOIN totals tt ON tt.transaction_id = t.id
      ${baseWhere}
    `;

    const totalItems = (db.prepare(countQuery).get(...values) as any)?.total ?? 0;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / params.pageSize);
    const offset = (params.page - 1) * params.pageSize;

    const dataQuery = `
      WITH totals AS (
        SELECT tl.transaction_id, SUM(tl.amount) AS total_amount
        FROM transaction_line tl
        JOIN account_envelope ae ON tl.envelope_id = ae.id
        WHERE ae.is_active = 1
        GROUP BY tl.transaction_id
      ),
      filtered AS (
        SELECT t.id
        FROM transactions t
        LEFT JOIN totals tt ON tt.transaction_id = t.id
        ${baseWhere}
        ORDER BY ${sortColumn} ${sortDir}, t.id DESC
        LIMIT ? OFFSET ?
      )
      SELECT t.*,
             tt.total_amount,
             tl.id as line_id,
             tl.account_id,
             a.name as account_name,
             tl.envelope_id,
             ae.category_id,
             c.name as category_name,
             tl.amount
      FROM transactions t
      JOIN filtered f ON t.id = f.id
      LEFT JOIN totals tt ON tt.transaction_id = t.id
      JOIN transaction_line tl ON t.id = tl.transaction_id
      LEFT JOIN account a ON tl.account_id = a.id
      JOIN account_envelope ae ON tl.envelope_id = ae.id AND ae.is_active = 1
      LEFT JOIN category c ON ae.category_id = c.id
      ORDER BY ${sortColumn} ${sortDir}, t.id DESC, tl.id ASC
    `;

    const rows = db
      .prepare(dataQuery)
      .all(...values, params.pageSize, offset) as any[];

    const transactionMap = new Map<
      number,
      Transaction & {
        amount: number;
        lines: Array<
          TransactionLine & {
            account_name?: string | null;
            category_id?: number | null;
            category_name?: string | null;
          }
        >;
      }
    >();

    for (const row of rows) {
      if (!transactionMap.has(row.id)) {
        transactionMap.set(row.id, {
          id: row.id,
          user_id: row.user_id,
          date: row.date,
          description: row.description,
          type: row.type,
          created_at: row.created_at,
          amount: row.total_amount ?? 0,
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
          account_name: row.account_name ?? null,
          category_id: row.category_id ?? null,
          category_name: row.category_name ?? null,
        });
      }
    }

    return {
      data: Array.from(transactionMap.values()),
      meta: {
        page: params.page,
        pageSize: params.pageSize,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 && params.page < totalPages,
        hasPrevPage: totalPages > 0 && params.page > 1,
      },
    };
  }
}

