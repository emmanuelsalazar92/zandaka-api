import db from '../db/db';

export interface AccountBalance {
  id: number;
  user_id: number;
  institution_id: number;
  name: string;
  currency: string;
  is_active: number;
  allow_overdraft: number;
  institution: string | null;
  type: string | null;
  balance: number;
  has_active_envelopes: boolean;
  active_envelopes_count: number;
}

interface RawAccountBalance extends Omit<AccountBalance, 'has_active_envelopes'> {
  has_active_envelopes: number;
}

export interface EnvelopeBalance {
  envelopeId: number;
  categoryId: number;
  categoryName: string;
  balance: number;
  currency: string;
}

export interface NegativeEnvelope {
  envelopeId: number;
  accountId: number;
  accountName: string;
  categoryId: number;
  categoryName: string;
  balance: number;
}

export interface MonthlyExpense {
  categoryId: number;
  categoryName: string;
  total: number;
}

export interface CategoryTotal {
  categoryId: number;
  categoryName: string;
  total: number;
}

export interface Inconsistency {
  accountId: number;
  accountName: string;
  reconciliationDate: string;
  realBalance: number;
  calculatedBalance: number;
  difference: number;
}

export interface EnvelopeCurrencyTotal {
  currency: string;
  total: number;
}

export class ReportRepository {
  getAccountBalances(isActive?: boolean): AccountBalance[] {
    let query = `
      SELECT 
        a.id,
        a.user_id,
        a.institution_id,
        a.name,
        a.currency,
        a.is_active,
        a.allow_overdraft,
        i.name as institution,
        i.type as type,
        COALESCE(ab.balance, 0) as balance,
        CASE
          WHEN COALESCE(ae.active_envelopes_count, 0) > 0 THEN 1
          ELSE 0
        END as has_active_envelopes,
        COALESCE(ae.active_envelopes_count, 0) as active_envelopes_count
      FROM account a
      LEFT JOIN institution i ON a.institution_id = i.id
      LEFT JOIN (
        SELECT account_id, COALESCE(SUM(amount), 0) as balance
        FROM transaction_line
        GROUP BY account_id
      ) ab ON a.id = ab.account_id
      LEFT JOIN (
        SELECT account_id, COUNT(*) as active_envelopes_count
        FROM account_envelope
        WHERE is_active = 1
        GROUP BY account_id
      ) ae ON a.id = ae.account_id
    `;
    const params: any[] = [];

    if (typeof isActive === 'boolean') {
      query += ' WHERE a.is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    query += ' ORDER BY a.name';

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as RawAccountBalance[];

    return rows.map((row) => ({
      ...row,
      has_active_envelopes: Boolean(row.has_active_envelopes),
    }));
  }

  getEnvelopeBalances(accountId: number): EnvelopeBalance[] {
    const stmt = db.prepare(`
      SELECT 
        ae.id as envelopeId,
        ae.category_id as categoryId,
        c.name as categoryName,
        COALESCE(SUM(tl.amount), 0) as balance,
        a.currency as currency
      FROM account_envelope ae
      JOIN account a ON ae.account_id = a.id
      JOIN category c ON ae.category_id = c.id
      LEFT JOIN transaction_line tl ON ae.id = tl.envelope_id
      WHERE ae.account_id = ? AND ae.is_active = 1
      GROUP BY ae.id, ae.category_id, c.name, a.currency
      ORDER BY c.name
    `);
    return stmt.all(accountId) as EnvelopeBalance[];
  }

  getNegativeEnvelopes(): NegativeEnvelope[] {
    const stmt = db.prepare(`
      SELECT 
        ae.id as envelopeId,
        ae.account_id as accountId,
        a.name as accountName,
        ae.category_id as categoryId,
        c.name as categoryName,
        COALESCE(SUM(tl.amount), 0) as balance
      FROM account_envelope ae
      JOIN account a ON ae.account_id = a.id
      JOIN category c ON ae.category_id = c.id
      LEFT JOIN transaction_line tl ON ae.id = tl.envelope_id
      WHERE ae.is_active = 1
      GROUP BY ae.id, ae.account_id, a.name, ae.category_id, c.name
      HAVING balance < 0
      ORDER BY balance ASC
    `);
    return stmt.all() as NegativeEnvelope[];
  }

  getMonthlyExpenses(month: string): MonthlyExpense[] {
    // month format: YYYY-MM
    const stmt = db.prepare(`
      SELECT 
        c.id as categoryId,
        c.name as categoryName,
        COALESCE(SUM(tl.amount), 0) as total
      FROM transaction_line tl
      JOIN transactions t ON tl.transaction_id = t.id
      JOIN account_envelope ae ON tl.envelope_id = ae.id
      JOIN category c ON ae.category_id = c.id
      WHERE t.date LIKE ? 
        AND t.type IN ('EXPENSE', 'TRANSFER')
        AND tl.amount < 0
      GROUP BY c.id, c.name
      ORDER BY total ASC
    `);
    return stmt.all(`${month}%`) as MonthlyExpense[];
  }

  getCategoryTotals(): CategoryTotal[] {
    const stmt = db.prepare(`
      SELECT 
        c.id as categoryId,
        c.name as categoryName,
        COALESCE(SUM(tl.amount), 0) as total
      FROM transaction_line tl
      JOIN account_envelope ae ON tl.envelope_id = ae.id
      JOIN category c ON ae.category_id = c.id
      WHERE ae.is_active = 1
      GROUP BY c.id, c.name
      ORDER BY total ASC
    `);
    return stmt.all() as CategoryTotal[];
  }

  getEnvelopeTotalByCurrency(currency: string): EnvelopeCurrencyTotal {
    const stmt = db.prepare(`
      SELECT
        UPPER(a.currency) as currency,
        COALESCE(SUM(tl.amount), 0) as total
      FROM account_envelope ae
      JOIN account a ON ae.account_id = a.id
      LEFT JOIN transaction_line tl ON ae.id = tl.envelope_id
      WHERE ae.is_active = 1
        AND UPPER(a.currency) = UPPER(?)
    `);

    const result = stmt.get(currency) as EnvelopeCurrencyTotal | undefined;

    return {
      currency: currency.toUpperCase(),
      total: result?.total ?? 0,
    };
  }

  getAccountCalculatedBalance(accountId: number, asOfDate?: string): number {
    let query = `
      SELECT COALESCE(SUM(tl.amount), 0) as balance
      FROM transaction_line tl
      JOIN transactions t ON tl.transaction_id = t.id
      WHERE tl.account_id = ?
    `;
    const params: any[] = [accountId];

    if (asOfDate) {
      query += ' AND t.date <= ?';
      params.push(asOfDate);
    }

    const stmt = db.prepare(query);
    const result = stmt.get(...params) as { balance: number } | undefined;
    return result?.balance || 0;
  }

  getInconsistencies(accountId?: number): Inconsistency[] {
    const reconciliations = accountId
      ? [
          {
            accountId,
            reconciliation: this.findLatestReconciliation(accountId),
          },
        ]
      : this.findAllLatestReconciliations();

    const inconsistencies: Inconsistency[] = [];

    for (const { accountId: accId, reconciliation } of reconciliations) {
      if (!reconciliation) continue;

      const account = this.getAccount(accId);
      if (!account) continue;

      const calculatedBalance = this.getAccountCalculatedBalance(accId, reconciliation.date);
      const difference = reconciliation.real_balance - calculatedBalance;

      if (Math.abs(difference) > 0.01) {
        // Only include if difference is significant (more than 1 cent)
        inconsistencies.push({
          accountId: accId,
          accountName: account.name,
          reconciliationDate: reconciliation.date,
          realBalance: reconciliation.real_balance,
          calculatedBalance,
          difference,
        });
      }
    }

    return inconsistencies;
  }

  private findLatestReconciliation(accountId: number) {
    const stmt = db.prepare(`
      SELECT * FROM reconciliation 
      WHERE account_id = ? 
      ORDER BY date DESC, created_at DESC 
      LIMIT 1
    `);
    return stmt.get(accountId) as any;
  }

  private findAllLatestReconciliations() {
    const accountsStmt = db.prepare('SELECT DISTINCT account_id FROM account');
    const accounts = accountsStmt.all() as Array<{ account_id: number }>;

    return accounts.map((acc) => ({
      accountId: acc.account_id,
      reconciliation: this.findLatestReconciliation(acc.account_id),
    }));
  }

  private getAccount(accountId: number) {
    const stmt = db.prepare('SELECT * FROM account WHERE id = ?');
    return stmt.get(accountId) as any;
  }
}
