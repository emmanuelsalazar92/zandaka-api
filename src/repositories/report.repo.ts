import db from '../db/db';

export interface AccountBalance {
  id: number;
  user_id: number;
  institution_id: number;
  name: string;
  currency: string;
  is_active: number;
  allow_overdraft: number;
  created_at: string;
  updated_at: string;
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
  currency: string;
  categoryId: number;
  categoryName: string;
  balance: number;
}

export interface MonthlyExpense {
  categoryId: number;
  categoryName: string;
  currency: string;
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
  currency: string;
  reconciliationDate: string;
  realBalance: number;
  calculatedBalance: number;
  difference: number;
}

export interface EnvelopeCurrencyTotal {
  currency: string;
  total: number;
}

export interface ReportSnapshotSummary {
  id: number;
  user_id: number;
  report_month: string;
  version: number;
  is_latest: number;
  base_currency: string;
  total_crc: number;
  total_usd: number;
  exchange_rate_used: number | null;
  exchange_rate_id: number | null;
  consolidated_amount: number | null;
  ccss_rule_set_id: number | null;
  income_tax_rule_set_id: number | null;
  generated_at: string;
  line_count: number;
}

export interface ReportSnapshotRecord {
  id: number;
  user_id: number;
  report_month: string;
  generated_at: string;
  base_currency: string;
  total_crc: number;
  total_usd: number;
  exchange_rate_used: number | null;
  exchange_rate_id: number | null;
  consolidated_amount: number | null;
  ccss_rule_set_id: number | null;
  income_tax_rule_set_id: number | null;
  version: number;
  is_latest: number;
  notes: string | null;
  status: 'DRAFT' | 'FINALIZED' | 'ARCHIVED';
  created_at: string;
  updated_at: string;
}

export interface ReportSnapshotLineRecord {
  id: number;
  report_snapshot_id: number;
  line_type: 'ACCOUNT_TOTAL' | 'ENVELOPE_TOTAL';
  account_id: number | null;
  account_name: string;
  account_currency: string;
  envelope_id: number | null;
  envelope_name: string | null;
  category_id: number | null;
  category_name: string | null;
  amount: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ReportSnapshotDocument {
  snapshot: ReportSnapshotRecord;
  lines: ReportSnapshotLineRecord[];
}

export interface GenerateReportSnapshotInput {
  userId: number;
  reportMonth: string;
  baseCurrency: 'CRC' | 'USD';
  exchangeRateId: number | null;
  exchangeRateUsed: number | null;
  ccssRuleSetId: number | null;
  incomeTaxRuleSetId: number | null;
  notes: string | null;
}

type SnapshotAccountTotalRow = {
  account_id: number;
  account_name: string;
  account_currency: string;
  amount: number;
};

type SnapshotEnvelopeTotalRow = {
  account_id: number;
  account_name: string;
  account_currency: string;
  envelope_id: number;
  envelope_name: string;
  category_id: number;
  category_name: string;
  amount: number;
};

type SnapshotRowInsert = {
  lineType: 'ACCOUNT_TOTAL' | 'ENVELOPE_TOTAL';
  accountId: number | null;
  accountName: string;
  accountCurrency: string;
  envelopeId: number | null;
  envelopeName: string | null;
  categoryId: number | null;
  categoryName: string | null;
  amount: number;
  sortOrder: number;
};

export class ReportRepository {
  listSnapshotsByUser(userId: number, includeArchived = false): ReportSnapshotRecord[] {
    const stmt = db.prepare(`
      SELECT
        id,
        user_id,
        report_month,
        generated_at,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_used,
        exchange_rate_id,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status,
        created_at,
        updated_at
      FROM report_snapshot
      WHERE user_id = ?
        AND (? = 1 OR status <> 'ARCHIVED')
      ORDER BY report_month DESC, is_latest DESC, version DESC, generated_at DESC, id DESC
    `);

    return stmt.all(userId, includeArchived ? 1 : 0) as ReportSnapshotRecord[];
  }

  findSnapshotById(snapshotId: number): ReportSnapshotRecord | null {
    const stmt = db.prepare(`
      SELECT
        id,
        user_id,
        report_month,
        generated_at,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_used,
        exchange_rate_id,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status,
        created_at,
        updated_at
      FROM report_snapshot
      WHERE id = ?
    `);

    return (stmt.get(snapshotId) as ReportSnapshotRecord | undefined) ?? null;
  }

  archiveSnapshotById(snapshotId: number): ReportSnapshotRecord | null {
    const findSnapshot = db.prepare(`
      SELECT
        id,
        user_id,
        report_month,
        generated_at,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_used,
        exchange_rate_id,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status,
        created_at,
        updated_at
      FROM report_snapshot
      WHERE id = ?
    `);

    const archiveSnapshot = db.prepare(`
      UPDATE report_snapshot
      SET status = 'ARCHIVED', is_latest = 0, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const clearLatestForMonth = db.prepare(`
      UPDATE report_snapshot
      SET is_latest = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND report_month = ?
    `);

    const findReplacementLatest = db.prepare(`
      SELECT id
      FROM report_snapshot
      WHERE user_id = ?
        AND report_month = ?
        AND status <> 'ARCHIVED'
      ORDER BY version DESC, generated_at DESC, id DESC
      LIMIT 1
    `);

    const setLatestSnapshot = db.prepare(`
      UPDATE report_snapshot
      SET is_latest = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    const transaction = db.transaction((targetSnapshotId: number) => {
      const currentSnapshot = findSnapshot.get(targetSnapshotId) as
        | ReportSnapshotRecord
        | undefined;
      if (!currentSnapshot) {
        return null;
      }

      if (currentSnapshot.status === 'ARCHIVED') {
        return currentSnapshot;
      }

      archiveSnapshot.run(targetSnapshotId);
      clearLatestForMonth.run(currentSnapshot.user_id, currentSnapshot.report_month);

      const replacement = findReplacementLatest.get(
        currentSnapshot.user_id,
        currentSnapshot.report_month,
      ) as { id: number } | undefined;

      if (replacement) {
        setLatestSnapshot.run(replacement.id);
      }

      return (findSnapshot.get(targetSnapshotId) as ReportSnapshotRecord | undefined) ?? null;
    });

    return transaction(snapshotId);
  }
  findSnapshotDocumentById(snapshotId: number): ReportSnapshotDocument | null {
    const snapshotStmt = db.prepare(`
      SELECT
        id,
        user_id,
        report_month,
        generated_at,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_used,
        exchange_rate_id,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status,
        created_at,
        updated_at
      FROM report_snapshot
      WHERE id = ?
    `);

    const linesStmt = db.prepare(`
      SELECT
        id,
        report_snapshot_id,
        line_type,
        account_id,
        account_name,
        account_currency,
        envelope_id,
        envelope_name,
        category_id,
        category_name,
        amount,
        sort_order,
        created_at,
        updated_at
      FROM report_snapshot_line
      WHERE report_snapshot_id = ?
      ORDER BY sort_order ASC, id ASC
    `);

    const snapshot = snapshotStmt.get(snapshotId) as ReportSnapshotRecord | undefined;
    if (!snapshot) {
      return null;
    }

    const lines = linesStmt.all(snapshotId) as ReportSnapshotLineRecord[];

    return { snapshot, lines };
  }

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
        a.created_at,
        a.updated_at,
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
        UPPER(a.currency) as currency,
        ae.category_id as categoryId,
        c.name as categoryName,
        COALESCE(SUM(tl.amount), 0) as balance
      FROM account_envelope ae
      JOIN account a ON ae.account_id = a.id
      JOIN category c ON ae.category_id = c.id
      LEFT JOIN transaction_line tl ON ae.id = tl.envelope_id
      WHERE ae.is_active = 1
      GROUP BY ae.id, ae.account_id, a.name, a.currency, ae.category_id, c.name
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
        UPPER(a.currency) as currency,
        COALESCE(SUM(tl.amount), 0) as total
      FROM transaction_line tl
      JOIN transactions t ON tl.transaction_id = t.id
      JOIN account_envelope ae ON tl.envelope_id = ae.id
      JOIN account a ON ae.account_id = a.id
      JOIN category c ON ae.category_id = c.id
      WHERE t.date LIKE ? 
        AND t.type IN ('EXPENSE', 'TRANSFER')
        AND tl.amount < 0
      GROUP BY c.id, c.name, a.currency
      ORDER BY total ASC
    `);
    return stmt.all(`${month}%`) as MonthlyExpense[];
  }

  getCategoryTotals(): CategoryTotal[] {
    const stmt = db.prepare(`
      SELECT 
        c.id as categoryId,
        c.name as categoryName,
        UPPER(a.currency) as currency,
        COALESCE(SUM(tl.amount), 0) as total
      FROM transaction_line tl
      JOIN account_envelope ae ON tl.envelope_id = ae.id
      JOIN account a ON ae.account_id = a.id
      JOIN category c ON ae.category_id = c.id
      WHERE ae.is_active = 1
      GROUP BY c.id, c.name, a.currency
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
          currency: account.currency,
          reconciliationDate: reconciliation.date,
          realBalance: reconciliation.real_balance,
          calculatedBalance,
          difference,
        });
      }
    }

    return inconsistencies;
  }

  getActiveAccountInconsistencies(): Inconsistency[] {
    const reconciliations = this.findAllLatestActiveReconciliationsForActiveAccounts();
    const inconsistencies: Inconsistency[] = [];

    for (const { accountId, reconciliation } of reconciliations) {
      if (!reconciliation) continue;

      const account = this.getAccount(accountId);
      if (!account) continue;

      const calculatedBalance = this.getAccountCalculatedBalance(accountId, reconciliation.date);
      const difference = reconciliation.real_balance - calculatedBalance;

      if (Math.abs(difference) > 0.01) {
        inconsistencies.push({
          accountId,
          accountName: account.name,
          currency: account.currency,
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

  generateSnapshot(input: GenerateReportSnapshotInput): ReportSnapshotSummary {
    const insertSnapshot = db.prepare(`
      INSERT INTO report_snapshot (
        user_id,
        report_month,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_id,
        exchange_rate_used,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        version,
        is_latest,
        notes,
        status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'FINALIZED')
    `);

    const deactivatePreviousSnapshots = db.prepare(`
      UPDATE report_snapshot
      SET is_latest = 0, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND report_month = ? AND is_latest = 1
    `);

    const findLatestVersion = db.prepare(`
      SELECT COALESCE(MAX(version), 0) as max_version
      FROM report_snapshot
      WHERE user_id = ? AND report_month = ?
    `);

    const insertLine = db.prepare(`
      INSERT INTO report_snapshot_line (
        report_snapshot_id,
        line_type,
        account_id,
        account_name,
        account_currency,
        envelope_id,
        envelope_name,
        category_id,
        category_name,
        amount,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const findSnapshotById = db.prepare(`
      SELECT
        id,
        user_id,
        report_month,
        version,
        is_latest,
        base_currency,
        total_crc,
        total_usd,
        exchange_rate_used,
        exchange_rate_id,
        consolidated_amount,
        ccss_rule_set_id,
        income_tax_rule_set_id,
        generated_at
      FROM report_snapshot
      WHERE id = ?
    `);

    const transaction = db.transaction((payload: GenerateReportSnapshotInput) => {
      const accountTotals = this.getActiveAccountTotalsByUser(payload.userId);
      const envelopeTotals = this.getActiveEnvelopeTotalsByUser(payload.userId);

      const totalCrc = accountTotals
        .filter((account) => account.account_currency.toUpperCase() === 'CRC')
        .reduce((sum, account) => sum + account.amount, 0);
      const totalUsd = accountTotals
        .filter((account) => account.account_currency.toUpperCase() === 'USD')
        .reduce((sum, account) => sum + account.amount, 0);

      const consolidatedAmount =
        payload.exchangeRateUsed !== null
          ? payload.baseCurrency === 'CRC'
            ? totalCrc + totalUsd * payload.exchangeRateUsed
            : totalUsd + totalCrc / payload.exchangeRateUsed
          : null;

      const latestVersionRow = findLatestVersion.get(payload.userId, payload.reportMonth) as {
        max_version: number;
      };
      const nextVersion = (latestVersionRow?.max_version ?? 0) + 1;

      deactivatePreviousSnapshots.run(payload.userId, payload.reportMonth);

      const snapshotInsertResult = insertSnapshot.run(
        payload.userId,
        payload.reportMonth,
        payload.baseCurrency,
        totalCrc,
        totalUsd,
        payload.exchangeRateId,
        payload.exchangeRateUsed,
        consolidatedAmount,
        payload.ccssRuleSetId,
        payload.incomeTaxRuleSetId,
        nextVersion,
        payload.notes,
      );

      const snapshotId = Number(snapshotInsertResult.lastInsertRowid);
      let sortOrder = 0;

      for (const account of accountTotals) {
        const accountLine: SnapshotRowInsert = {
          lineType: 'ACCOUNT_TOTAL',
          accountId: account.account_id,
          accountName: account.account_name,
          accountCurrency: account.account_currency,
          envelopeId: null,
          envelopeName: null,
          categoryId: null,
          categoryName: null,
          amount: account.amount,
          sortOrder: sortOrder++,
        };

        insertLine.run(
          snapshotId,
          accountLine.lineType,
          accountLine.accountId,
          accountLine.accountName,
          accountLine.accountCurrency,
          accountLine.envelopeId,
          accountLine.envelopeName,
          accountLine.categoryId,
          accountLine.categoryName,
          accountLine.amount,
          accountLine.sortOrder,
        );

        const accountEnvelopeTotals = envelopeTotals.filter(
          (envelope) => envelope.account_id === account.account_id,
        );

        for (const envelope of accountEnvelopeTotals) {
          const envelopeLine: SnapshotRowInsert = {
            lineType: 'ENVELOPE_TOTAL',
            accountId: envelope.account_id,
            accountName: envelope.account_name,
            accountCurrency: envelope.account_currency,
            envelopeId: envelope.envelope_id,
            envelopeName: envelope.envelope_name,
            categoryId: envelope.category_id,
            categoryName: envelope.category_name,
            amount: envelope.amount,
            sortOrder: sortOrder++,
          };

          insertLine.run(
            snapshotId,
            envelopeLine.lineType,
            envelopeLine.accountId,
            envelopeLine.accountName,
            envelopeLine.accountCurrency,
            envelopeLine.envelopeId,
            envelopeLine.envelopeName,
            envelopeLine.categoryId,
            envelopeLine.categoryName,
            envelopeLine.amount,
            envelopeLine.sortOrder,
          );
        }
      }

      const snapshot = findSnapshotById.get(snapshotId) as Omit<
        ReportSnapshotSummary,
        'line_count'
      >;

      return {
        ...snapshot,
        line_count: sortOrder,
      };
    });

    return transaction(input);
  }

  private findLatestActiveReconciliation(accountId: number) {
    const stmt = db.prepare(`
      SELECT * FROM reconciliation
      WHERE account_id = ?
        AND is_active = 1
      ORDER BY date DESC, created_at DESC
      LIMIT 1
    `);
    return stmt.get(accountId) as any;
  }

  private findAllLatestReconciliations(activeOnly = false) {
    const accountsStmt = db.prepare(`
      SELECT id as account_id
      FROM account
      ${activeOnly ? 'WHERE is_active = 1' : ''}
    `);
    const accounts = accountsStmt.all() as Array<{ account_id: number }>;

    return accounts.map((acc) => ({
      accountId: acc.account_id,
      reconciliation: this.findLatestReconciliation(acc.account_id),
    }));
  }

  private findAllLatestActiveReconciliationsForActiveAccounts() {
    const accountsStmt = db.prepare(`
      SELECT id as account_id
      FROM account
      WHERE is_active = 1
    `);
    const accounts = accountsStmt.all() as Array<{ account_id: number }>;

    return accounts.map((acc) => ({
      accountId: acc.account_id,
      reconciliation: this.findLatestActiveReconciliation(acc.account_id),
    }));
  }

  private getAccount(accountId: number) {
    const stmt = db.prepare('SELECT * FROM account WHERE id = ?');
    return stmt.get(accountId) as any;
  }

  private getActiveAccountTotalsByUser(userId: number): SnapshotAccountTotalRow[] {
    const stmt = db.prepare(`
      SELECT
        a.id as account_id,
        a.name as account_name,
        UPPER(a.currency) as account_currency,
        CAST(COALESCE(SUM(tl.amount), 0) AS NUMERIC) as amount
      FROM account a
      LEFT JOIN transaction_line tl ON a.id = tl.account_id
      WHERE a.user_id = ?
        AND a.is_active = 1
      GROUP BY a.id, a.name, a.currency
      ORDER BY a.name ASC, a.id ASC
    `);

    return stmt.all(userId) as SnapshotAccountTotalRow[];
  }

  private getActiveEnvelopeTotalsByUser(userId: number): SnapshotEnvelopeTotalRow[] {
    const stmt = db.prepare(`
      SELECT
        a.id as account_id,
        a.name as account_name,
        UPPER(a.currency) as account_currency,
        ae.id as envelope_id,
        c.name as envelope_name,
        c.id as category_id,
        c.name as category_name,
        CAST(COALESCE(SUM(tl.amount), 0) AS NUMERIC) as amount
      FROM account a
      JOIN account_envelope ae
        ON ae.account_id = a.id
       AND ae.is_active = 1
      JOIN category c ON c.id = ae.category_id
      LEFT JOIN transaction_line tl ON tl.envelope_id = ae.id
      WHERE a.user_id = ?
        AND a.is_active = 1
      GROUP BY a.id, a.name, a.currency, ae.id, c.id, c.name
      ORDER BY a.name ASC, c.name ASC, ae.id ASC
    `);

    // We intentionally include active envelopes with zero balance to mirror the existing
    // /reports/envelope-balances behavior, so the snapshot preserves the visible envelope structure.
    return stmt.all(userId) as SnapshotEnvelopeTotalRow[];
  }
}
