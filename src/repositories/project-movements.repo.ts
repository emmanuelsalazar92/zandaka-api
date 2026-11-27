import type { Database } from 'better-sqlite3';

export type ProjectMovementKind = 'expense' | 'refund';
export type ProjectMovementSearch = {
  q?: string;
  transactionId?: number;
  from?: string;
  to?: string;
  accountId?: number;
  categoryId?: number;
  currency?: string;
  kind: ProjectMovementKind;
  page: number;
};

export type ProjectBreakdownFilter = { currency: string; categoryId: number | null };

export type ProjectMovementGroup = {
  date: string;
  currency: string;
  categoryId: number | null;
  categoryName: string | null;
  expenseDebits: string;
  refunds: string;
  included: number;
  excluded: number;
  latestLedgerUpdate: string;
};

type MovementLine = {
  lineId: number;
  transactionId: number;
  date: string;
  description: string;
  accountId: number;
  accountName: string;
  categoryId: number | null;
  categoryName: string | null;
  currency: string;
  amount: string;
};

const pageSize = 20;
const dimensions = `
  JOIN account a ON a.id = tl.account_id AND a.user_id = t.user_id
  LEFT JOIN account_envelope ae ON ae.id = tl.envelope_id AND ae.account_id = a.id
  LEFT JOIN category c ON c.id = ae.category_id AND c.user_id = t.user_id`;
const joins = `
  FROM transaction_line tl
  JOIN transactions t ON t.id = tl.transaction_id AND t.user_id = @owner
  ${dimensions}`;

// The same ledger criteria govern search, linking, and display of previously linked lines.
const eligibleKind = `CASE
  WHEN t.type = 'EXPENSE' AND decimal_cmp(tl.amount, '0') < 0 THEN 'expense'
  WHEN t.type = 'INCOME' AND decimal_cmp(tl.amount, '0') > 0 THEN 'refund'
END`;

const fields = `tl.id AS lineId, t.id AS transactionId, t.date,
  COALESCE(t.description, '') AS description, a.id AS accountId, a.name AS accountName,
  c.id AS categoryId, c.name AS categoryName, UPPER(a.currency) AS currency,
  decimal_text(tl.amount) AS amount`;
const sort = 'ORDER BY t.date DESC, t.id DESC, tl.id ASC';
type SearchLine = MovementLine & { linkedKind: ProjectMovementKind | null };
const linked = `${joins}
  JOIN project_transaction_line ptl
    ON ptl.project_id = @projectId AND ptl.transaction_line_id = tl.id`;
const eligible = `COALESCE((${eligibleKind}) = ptl.kind, 0)`;

export class ProjectMovementsRepository {
  constructor(private db: Database) {}

  filters(owner: number) {
    const accounts = this.db
      .prepare(
        'SELECT id, name, UPPER(currency) AS currency FROM account WHERE user_id = ? ORDER BY name, id',
      )
      .all(owner) as { id: number; name: string; currency: string }[];
    const categories = this.db
      .prepare('SELECT id, name FROM category WHERE user_id = ? ORDER BY name, id')
      .all(owner) as { id: number; name: string }[];
    return {
      accounts,
      categories,
      currencies: [...new Set(accounts.map(({ currency }) => currency))].sort(),
    };
  }

  search(projectId: string, owner: number, search: ProjectMovementSearch) {
    // Qualify a transaction using one eligible line that satisfies every selected filter.
    // Then return its eligible lines so whole-transaction selection stays explicit.
    const condition = ['t.user_id = @owner', 't.type = @type'];
    if (search.transactionId !== undefined) condition.push('t.id = @transactionId');
    if (search.q) condition.push("instr(lower(COALESCE(t.description, '')), lower(@q)) > 0");
    if (search.from) condition.push('t.date >= @from');
    if (search.to) condition.push('t.date <= @to');
    const lineConditions = ['tl.transaction_id = t.id', `(${eligibleKind}) = @kind`];
    if (search.accountId) lineConditions.push('a.id = @accountId');
    if (search.categoryId) lineConditions.push('c.id = @categoryId');
    if (search.currency) lineConditions.push('UPPER(a.currency) = @currency');
    const matches = `SELECT t.id, t.date FROM transactions t WHERE ${condition.join(' AND ')}
      AND EXISTS (SELECT 1 FROM transaction_line tl ${dimensions} WHERE ${lineConditions.join(' AND ')})`;
    const type = search.kind === 'refund' ? 'INCOME' : 'EXPENSE';
    const params = {
      ...search,
      projectId,
      owner,
      type,
      pageSize,
      offset: (search.page - 1) * pageSize,
    };
    const { total } = this.db.prepare(`SELECT count(*) AS total FROM (${matches})`).get(params) as {
      total: number;
    };
    const rows = this.db
      .prepare(
        `
      WITH matches AS (
        ${matches} ORDER BY t.date DESC, t.id DESC LIMIT @pageSize OFFSET @offset
      )
      SELECT ${fields}, ptl.kind AS linkedKind
      ${joins}
      JOIN matches m ON m.id = t.id
      LEFT JOIN project_transaction_line ptl
        ON ptl.project_id = @projectId AND ptl.transaction_line_id = tl.id
      WHERE (${eligibleKind}) = @kind
      ${sort}
    `,
      )
      .all(params) as SearchLine[];
    const grouped = new Map<number, SearchLine[]>();
    for (const row of rows) {
      const lines = grouped.get(row.transactionId) ?? [];
      lines.push(row);
      grouped.set(row.transactionId, lines);
    }
    const items = Array.from(grouped, ([id, lines]) => ({
      id,
      date: lines[0].date,
      description: lines[0].description,
      lines,
    }));
    return { items, total, page: search.page, pageSize };
  }

  groups(projectId: string, owner: number) {
    return this.db
      .prepare(
        `
      WITH lines AS (
        SELECT substr(t.date, 1, 10) AS day, UPPER(a.currency) AS currency,
          c.id AS categoryId, c.name AS categoryName, tl.amount, ptl.kind,
          ${eligible} AS included,
          MAX(COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', t.updated_at), ''),
              COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', tl.updated_at), '')) AS changed
        ${linked}
      )
      SELECT day AS date, currency, categoryId, categoryName,
        decimal_sum(CASE WHEN included = 1 AND kind = 'expense' THEN amount END) AS expenseDebits,
        decimal_sum(CASE WHEN included = 1 AND kind = 'refund' THEN amount END) AS refunds,
        sum(included) AS included, count(*) - sum(included) AS excluded,
        max(changed) AS latestLedgerUpdate
      FROM lines
      GROUP BY day, currency, categoryId, categoryName
      ORDER BY day, currency, categoryId
    `,
      )
      .iterate({ projectId, owner }) as Iterable<ProjectMovementGroup>;
  }

  includesTransaction(projectId: string, owner: number, transactionId: number) {
    return Boolean(
      this.db
        .prepare(`SELECT 1 ${linked} WHERE t.id = @transactionId LIMIT 1`)
        .get({ projectId, owner, transactionId }),
    );
  }

  list(projectId: string, owner: number, page: number, filter?: ProjectBreakdownFilter) {
    const scope = filter
      ? `${linked} WHERE ${eligible} = 1 AND UPPER(a.currency) = @currency AND c.id IS @categoryId`
      : linked;
    const params = { projectId, owner, pageSize, offset: (page - 1) * pageSize, ...filter };
    const { total } = this.db.prepare(`SELECT count(*) AS total ${scope}`).get(params) as {
      total: number;
    };
    const items = (
      this.db
        .prepare(
          `
      SELECT ${fields}, ptl.kind, ${eligible} AS eligible
      ${scope} ${sort} LIMIT @pageSize OFFSET @offset
    `,
        )
        .all(params) as (MovementLine & { kind: ProjectMovementKind; eligible: number })[]
    ).map((row) => ({ ...row, eligible: Boolean(row.eligible) }));
    return { items, total, page, pageSize };
  }

  planAdd(projectId: string, owner: number, lineIds: number[], kind: ProjectMovementKind) {
    const find = this.db.prepare(`
      SELECT (${eligibleKind}) AS eligibleKind, ptl.kind AS linkedKind
      ${joins} LEFT JOIN project_transaction_line ptl
        ON ptl.project_id = @projectId AND ptl.transaction_line_id = tl.id
      WHERE tl.id = @lineId
    `);
    return lineIds.filter((lineId) => {
      const row = find.get({ projectId, owner, lineId }) as
        | { eligibleKind: ProjectMovementKind | null; linkedKind: ProjectMovementKind | null }
        | undefined;
      if (!row || row.eligibleKind !== kind || (row.linkedKind && row.linkedKind !== kind)) {
        throw {
          code: 'VALIDATION_ERROR',
          message: 'One or more lines cannot be linked as requested',
        };
      }
      return !row.linkedKind;
    });
  }

  add(projectId: string, lineIds: number[], kind: ProjectMovementKind) {
    const insert = this.db.prepare(
      'INSERT INTO project_transaction_line(project_id, transaction_line_id, kind) VALUES (?, ?, ?)',
    );
    for (const lineId of lineIds) insert.run(projectId, lineId, kind);
  }

  planRemove(projectId: string, lineIds: number[]) {
    const exists = this.db.prepare(
      'SELECT 1 FROM project_transaction_line WHERE project_id = ? AND transaction_line_id = ?',
    );
    return lineIds.filter((lineId) => exists.get(projectId, lineId));
  }

  remove(projectId: string, lineIds: number[]) {
    const del = this.db.prepare(
      'DELETE FROM project_transaction_line WHERE project_id = ? AND transaction_line_id = ?',
    );
    for (const lineId of lineIds) del.run(projectId, lineId);
  }
}
