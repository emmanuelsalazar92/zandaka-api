import db from '../db/db';
import { Budget, BudgetLine, BudgetStatus } from '../types';

type BudgetListRow = Budget & {
  distributed_amount: number;
  distributed_percentage: number;
  lines_count: number;
  funding_source_account_name: string | null;
};

type BudgetLineRow = BudgetLine & {
  category_name: string;
  category_parent_id: number | null;
  category_is_active: number;
  envelope_account_id: number | null;
  envelope_is_active: number | null;
  account_name: string | null;
  account_currency: string | null;
};

export class BudgetRepository {
  create(userId: number, month: string, currency: string, totalIncome: number): Budget {
    const stmt = db.prepare(`
      INSERT INTO budget (user_id, month, currency, total_income, status)
      VALUES (?, ?, ?, ?, 'draft')
    `);
    const result = stmt.run(userId, month, currency, totalIncome);
    return this.findById(result.lastInsertRowid as number)!;
  }

  findById(id: number): Budget | null {
    const stmt = db.prepare('SELECT * FROM budget WHERE id = ?');
    return stmt.get(id) as Budget | null;
  }

  findByIdForUser(id: number, userId: number): Budget | null {
    const stmt = db.prepare('SELECT * FROM budget WHERE id = ? AND user_id = ?');
    return stmt.get(id, userId) as Budget | null;
  }

  findByUserMonthCurrency(userId: number, month: string, currency: string): Budget | null {
    const stmt = db.prepare(`
      SELECT *
      FROM budget
      WHERE user_id = ? AND month = ? AND currency = ?
    `);
    return stmt.get(userId, month, currency) as Budget | null;
  }

  list(params: {
    userId: number;
    month?: string;
    currency?: string;
    status?: BudgetStatus;
    fromMonth?: string;
    toMonth?: string;
    page: number;
    pageSize: number;
  }): {
    data: BudgetListRow[];
    meta: {
      page: number;
      pageSize: number;
      totalItems: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  } {
    const conditions: string[] = ['b.user_id = ?'];
    const values: Array<number | string> = [params.userId];

    if (params.month) {
      conditions.push('b.month = ?');
      values.push(params.month);
    }
    if (params.currency) {
      conditions.push('b.currency = ?');
      values.push(params.currency);
    }
    if (params.status) {
      conditions.push('b.status = ?');
      values.push(params.status);
    }
    if (params.fromMonth) {
      conditions.push('b.month >= ?');
      values.push(params.fromMonth);
    }
    if (params.toMonth) {
      conditions.push('b.month <= ?');
      values.push(params.toMonth);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const countQuery = `
      SELECT COUNT(*) AS total
      FROM budget b
      ${where}
    `;

    const totalItems = ((db.prepare(countQuery).get(...values) as { total?: number } | undefined)?.total ??
      0) as number;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / params.pageSize);
    const offset = (params.page - 1) * params.pageSize;

    const dataQuery = `
      WITH summaries AS (
        SELECT
          budget_id,
          COUNT(*) AS lines_count,
          COALESCE(SUM(amount), 0) AS distributed_amount,
          COALESCE(SUM(percentage), 0) AS distributed_percentage
        FROM budget_line
        GROUP BY budget_id
      )
      SELECT
        b.*,
        COALESCE(s.distributed_amount, 0) AS distributed_amount,
        COALESCE(s.distributed_percentage, 0) AS distributed_percentage,
        COALESCE(s.lines_count, 0) AS lines_count,
        a.name AS funding_source_account_name
      FROM budget b
      LEFT JOIN summaries s ON s.budget_id = b.id
      LEFT JOIN account a ON a.id = b.funding_source_account_id
      ${where}
      ORDER BY b.month DESC, b.id DESC
      LIMIT ? OFFSET ?
    `;

    const data = db.prepare(dataQuery).all(...values, params.pageSize, offset) as BudgetListRow[];

    return {
      data,
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

  getDistributionSummary(budgetId: number): {
    line_count: number;
    distributed_amount: number;
    distributed_percentage: number;
  } {
    const stmt = db.prepare(`
      SELECT
        COUNT(*) AS line_count,
        COALESCE(SUM(amount), 0) AS distributed_amount,
        COALESCE(SUM(percentage), 0) AS distributed_percentage
      FROM budget_line
      WHERE budget_id = ?
    `);
    return stmt.get(budgetId) as {
      line_count: number;
      distributed_amount: number;
      distributed_percentage: number;
    };
  }

  getLines(budgetId: number): BudgetLineRow[] {
    const stmt = db.prepare(`
      SELECT
        bl.*,
        c.name AS category_name,
        c.parent_id AS category_parent_id,
        c.is_active AS category_is_active,
        ae.account_id AS envelope_account_id,
        ae.is_active AS envelope_is_active,
        a.name AS account_name,
        a.currency AS account_currency
      FROM budget_line bl
      JOIN category c ON c.id = bl.category_id
      LEFT JOIN account_envelope ae ON ae.id = bl.account_envelope_id
      LEFT JOIN account a ON a.id = ae.account_id
      WHERE bl.budget_id = ?
      ORDER BY bl.sort_order ASC, bl.id ASC
    `);
    return stmt.all(budgetId) as BudgetLineRow[];
  }

  replaceLines(
    budgetId: number,
    lines: Array<{
      categoryId: number;
      amount: number;
      percentage: number;
      notes?: string;
      sortOrder: number;
    }>,
  ): BudgetLine[] {
    const deleteLines = db.prepare('DELETE FROM budget_line WHERE budget_id = ?');
    const insertLine = db.prepare(`
      INSERT INTO budget_line (
        budget_id,
        category_id,
        account_envelope_id,
        amount,
        percentage,
        notes,
        sort_order
      )
      VALUES (?, ?, NULL, ?, ?, ?, ?)
    `);
    const touchBudget = db.prepare(`
      UPDATE budget
      SET funding_source_account_id = NULL, updated_at = datetime('now')
      WHERE id = ?
    `);

    const replace = db.transaction(() => {
      deleteLines.run(budgetId);
      for (const line of lines) {
        insertLine.run(
          budgetId,
          line.categoryId,
          line.amount,
          line.percentage,
          line.notes ?? null,
          line.sortOrder,
        );
      }
      touchBudget.run(budgetId);
      return this.getLines(budgetId).map((line) => ({
        id: line.id,
        budget_id: line.budget_id,
        category_id: line.category_id,
        account_envelope_id: line.account_envelope_id,
        amount: line.amount,
        percentage: line.percentage,
        notes: line.notes,
        sort_order: line.sort_order,
        created_at: line.created_at,
        updated_at: line.updated_at,
      }));
    });

    return replace();
  }

  updateStatus(id: number, status: BudgetStatus): Budget | null {
    const stmt = db.prepare(`
      UPDATE budget
      SET status = ?, updated_at = datetime('now')
      WHERE id = ?
    `);
    stmt.run(status, id);
    return this.findById(id);
  }

  findMostRecentPreviousBudget(userId: number, currency: string, month: string): Budget | null {
    const stmt = db.prepare(`
      SELECT *
      FROM budget
      WHERE user_id = ? AND currency = ? AND month < ?
      ORDER BY month DESC, id DESC
      LIMIT 1
    `);
    return stmt.get(userId, currency, month) as Budget | null;
  }

  copyLinesFromBudget(sourceBudgetId: number, destinationBudgetId: number): BudgetLine[] {
    const getSourceBudget = db.prepare('SELECT funding_source_account_id FROM budget WHERE id = ?');
    const deleteLines = db.prepare('DELETE FROM budget_line WHERE budget_id = ?');
    const copyLines = db.prepare(`
      INSERT INTO budget_line (
        budget_id,
        category_id,
        account_envelope_id,
        amount,
        percentage,
        notes,
        sort_order
      )
      SELECT
        ?,
        category_id,
        account_envelope_id,
        amount,
        percentage,
        notes,
        sort_order
      FROM budget_line
      WHERE budget_id = ?
      ORDER BY sort_order ASC, id ASC
    `);
    const updateBudget = db.prepare(`
      UPDATE budget
      SET funding_source_account_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    const copy = db.transaction(() => {
      const sourceBudget = getSourceBudget.get(sourceBudgetId) as
        | { funding_source_account_id: number | null }
        | undefined;
      deleteLines.run(destinationBudgetId);
      copyLines.run(destinationBudgetId, sourceBudgetId);
      updateBudget.run(sourceBudget?.funding_source_account_id ?? null, destinationBudgetId);
      return this.getLines(destinationBudgetId).map((line) => ({
        id: line.id,
        budget_id: line.budget_id,
        category_id: line.category_id,
        account_envelope_id: line.account_envelope_id,
        amount: line.amount,
        percentage: line.percentage,
        notes: line.notes,
        sort_order: line.sort_order,
        created_at: line.created_at,
        updated_at: line.updated_at,
      }));
    });

    return copy();
  }

  findFundingAccounts(userId: number, currency: string): Array<{
    id: number;
    name: string;
    currency: string;
    institution_id: number;
    institution_name: string;
  }> {
    const stmt = db.prepare(`
      SELECT
        a.id,
        a.name,
        a.currency,
        a.institution_id,
        i.name AS institution_name
      FROM account a
      JOIN institution i ON i.id = a.institution_id
      WHERE a.user_id = ?
        AND a.currency = ?
        AND a.is_active = 1
        AND i.is_active = 1
      ORDER BY i.name ASC, a.name ASC, a.id ASC
    `);
    return stmt.all(userId, currency) as Array<{
      id: number;
      name: string;
      currency: string;
      institution_id: number;
      institution_name: string;
    }>;
  }

  findFundingEnvelopes(
    userId: number,
    currency: string,
    categoryIds: number[],
  ): Array<{
    id: number;
    account_id: number;
    category_id: number;
    account_name: string;
    account_currency: string;
    institution_name: string;
    category_name: string;
  }> {
    if (categoryIds.length === 0) {
      return [];
    }

    const placeholders = categoryIds.map(() => '?').join(', ');
    const stmt = db.prepare(`
      SELECT
        ae.id,
        ae.account_id,
        ae.category_id,
        a.name AS account_name,
        a.currency AS account_currency,
        i.name AS institution_name,
        c.name AS category_name
      FROM account_envelope ae
      JOIN account a ON a.id = ae.account_id
      JOIN institution i ON i.id = a.institution_id
      JOIN category c ON c.id = ae.category_id
      WHERE a.user_id = ?
        AND a.currency = ?
        AND a.is_active = 1
        AND i.is_active = 1
        AND ae.is_active = 1
        AND c.is_active = 1
        AND ae.category_id IN (${placeholders})
      ORDER BY c.name ASC, i.name ASC, a.name ASC, ae.id ASC
    `);
    return stmt.all(userId, currency, ...categoryIds) as Array<{
      id: number;
      account_id: number;
      category_id: number;
      account_name: string;
      account_currency: string;
      institution_name: string;
      category_name: string;
    }>;
  }

  replaceFundingPlan(
    budgetId: number,
    sourceAccountId: number,
    lines: Array<{ budgetLineId: number; accountEnvelopeId: number }>,
  ): Budget {
    const resetLines = db.prepare(`
      UPDATE budget_line
      SET account_envelope_id = NULL, updated_at = datetime('now')
      WHERE budget_id = ?
    `);
    const assignLine = db.prepare(`
      UPDATE budget_line
      SET account_envelope_id = ?, updated_at = datetime('now')
      WHERE id = ? AND budget_id = ?
    `);
    const updateBudget = db.prepare(`
      UPDATE budget
      SET funding_source_account_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    const replace = db.transaction(() => {
      resetLines.run(budgetId);
      for (const line of lines) {
        assignLine.run(line.accountEnvelopeId, line.budgetLineId, budgetId);
      }
      updateBudget.run(sourceAccountId, budgetId);
      return this.findById(budgetId)!;
    });

    return replace();
  }

  executeFunding(params: {
    budgetId: number;
    userId: number;
    date: string;
    description: string;
    lines: Array<{ accountId: number; envelopeId: number; amount: number }>;
  }): { transactionId: number } {
    const insertTransaction = db.prepare(`
      INSERT INTO transactions (user_id, date, description, type)
      VALUES (?, ?, ?, 'ADJUSTMENT')
    `);
    const insertLine = db.prepare(`
      INSERT INTO transaction_line (transaction_id, account_id, envelope_id, amount)
      VALUES (?, ?, ?, ?)
    `);
    const markFunded = db.prepare(`
      UPDATE budget
      SET status = 'funded', updated_at = datetime('now')
      WHERE id = ?
    `);

    const execute = db.transaction(() => {
      const transactionResult = insertTransaction.run(
        params.userId,
        params.date,
        params.description,
      );
      const transactionId = transactionResult.lastInsertRowid as number;

      for (const line of params.lines) {
        insertLine.run(transactionId, line.accountId, line.envelopeId, line.amount);
      }

      markFunded.run(params.budgetId);
      return { transactionId };
    });

    return execute();
  }
}

export type { BudgetListRow, BudgetLineRow };
