import { createHash, randomUUID } from 'node:crypto';
import db from '../db/db';
import { moneyStatement } from '../db/money-statement';
import { budgetPlansReady } from '../db/budget-plan';
import { BudgetPlanDocument, calculateBudgetPlan } from '../utils/budget-plan';
import { assertMoney, decimal, decimalNumber } from '../utils/money';
import { TransferService } from './transfer.service';

type Row = {
  id: string;
  user_id: number;
  month: string;
  document_json: string;
  revision: number;
  status: 'draft' | 'finalized' | 'funded';
  last_write_hash: string | null;
  fund_hash: string | null;
  receipt_json: string | null;
  created_at: string;
  updated_at: string;
};
export type PlanEnvelopeOption = {
  id: number;
  accountId: number;
  accountName: string;
  currency: 'USD' | 'CRC';
  categoryName: string;
  institutionName: string;
  balance: number;
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const conflict = (message: string) => {
  throw { code: 'CONFLICT', message };
};
const accountingDate = () => {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  return ['year', 'month', 'day']
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join('-');
};

export class BudgetPlanService {
  private ready(userId: number) {
    if (!db.prepare('SELECT id FROM user WHERE id=?').get(userId))
      throw { code: 'NOT_FOUND', message: 'User not found' };
    if (!budgetPlansReady(db))
      throw {
        code: 'FEATURE_NOT_READY',
        message: 'Budget planning storage has not been prepared or is incompatible',
      };
  }
  private owned(id: string, userId: number): Row {
    this.ready(userId);
    const row = db.prepare('SELECT * FROM budget_plan WHERE id=? AND user_id=?').get(id, userId) as
      | Row
      | undefined;
    if (!row) throw { code: 'NOT_FOUND', message: 'Budget plan not found' };
    return row;
  }
  private view(row: Row) {
    const document = JSON.parse(row.document_json) as BudgetPlanDocument;
    return {
      id: row.id,
      userId: row.user_id,
      revision: row.revision,
      status: row.status,
      document,
      calculation: calculateBudgetPlan(document),
      receipt: row.receipt_json ? (JSON.parse(row.receipt_json) as unknown) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
  list(userId: number, page: number, pageSize: number) {
    this.ready(userId);
    const total = (
      db.prepare('SELECT COUNT(*) AS n FROM budget_plan WHERE user_id=?').get(userId) as {
        n: number;
      }
    ).n;
    const items = (
      db
        .prepare(
          'SELECT * FROM budget_plan WHERE user_id=? ORDER BY month DESC,id LIMIT ? OFFSET ?',
        )
        .all(userId, pageSize, (page - 1) * pageSize) as Row[]
    ).map((row) => this.view(row));
    return { items, page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
  }
  get(id: string, userId: number) {
    return this.view(this.owned(id, userId));
  }
  previousAssignments(id: string, userId: number) {
    const current = this.owned(id, userId),
      doc = JSON.parse(current.document_json) as BudgetPlanDocument;
    const source = db
      .prepare('SELECT * FROM budget_plan WHERE user_id=? AND month<? ORDER BY month DESC LIMIT 1')
      .get(userId, current.month) as Row | undefined;
    if (!source) throw { code: 'NOT_FOUND', message: 'No previous assignments found' };
    const previous = JSON.parse(source.document_json) as BudgetPlanDocument;
    return {
      sourceId: source.id,
      document: {
        ...doc,
        lines: previous.lines.map((line) => ({ ...line, id: randomUUID() })),
        sources: previous.sources,
      },
    };
  }
  options(userId: number) {
    this.ready(userId);
    const envelopes = moneyStatement(`SELECT ae.id, a.id AS accountId, a.name AS accountName,
      a.currency, c.name AS categoryName, i.name AS institutionName,
      money_balance(COALESCE(decimal_sum(tl.amount),0),a.currency) AS balance
      FROM account_envelope ae JOIN account a ON a.id=ae.account_id
      JOIN category c ON c.id=ae.category_id JOIN institution i ON i.id=a.institution_id
      LEFT JOIN transaction_line tl ON tl.envelope_id=ae.id
      WHERE a.user_id=? AND c.user_id=? AND i.user_id=?
      AND ae.is_active=1 AND a.is_active=1 AND c.is_active=1 AND i.is_active=1
      AND c.parent_id IS NOT NULL AND a.currency IN ('USD','CRC')
      GROUP BY ae.id ORDER BY a.name,c.name,ae.id`).all(
      userId,
      userId,
      userId,
    ) as PlanEnvelopeOption[];
    const accounts = db
      .prepare(
        `SELECT a.id,a.name,a.currency,i.name AS institutionName FROM account a
      JOIN institution i ON i.id=a.institution_id WHERE a.user_id=? AND i.user_id=?
      AND a.is_active=1 AND i.is_active=1 AND a.currency IN ('USD','CRC') ORDER BY a.name,a.id`,
      )
      .all(userId, userId) as Array<{
      id: number;
      name: string;
      currency: string;
      institutionName: string;
    }>;
    return { envelopes, accounts };
  }
  private references(userId: number, doc: BudgetPlanDocument) {
    const { envelopes, accounts } = this.options(userId);
    for (const id of [doc.incomeAccountId, doc.retainedAccountId])
      if (id !== null && !accounts.some((a) => a.id === id && a.currency === 'USD'))
        throw { code: 'VALIDATION_ERROR', message: 'Select an active USD account of this user' };
    for (const source of doc.sources)
      if (!envelopes.some((e) => e.id === source.envelopeId && e.accountId === source.accountId))
        throw { code: 'VALIDATION_ERROR', message: 'Invalid source envelope' };
    for (const line of doc.lines)
      if (
        line.targetEnvelopeId !== null &&
        !envelopes.some((e) => e.id === line.targetEnvelopeId && e.currency === line.payCurrency)
      )
        throw { code: 'VALIDATION_ERROR', message: 'Invalid destination envelope or currency' };
  }
  save(id: string, userId: number, expectedRevision: number, document: BudgetPlanDocument) {
    this.ready(userId);
    const writeHash = hash({ expectedRevision, document });
    return db
      .transaction(() => {
        const current = db.prepare('SELECT * FROM budget_plan WHERE id=?').get(id) as
          | Row
          | undefined;
        if (current && current.user_id !== userId)
          throw { code: 'NOT_FOUND', message: 'Budget plan not found' };
        if (current?.last_write_hash === writeHash) return this.view(current);
        if (current && (current.revision !== expectedRevision || current.status !== 'draft'))
          conflict('The plan changed or is read-only; reload before saving');
        if (!current && expectedRevision !== 0) conflict('The plan no longer exists');
        if (
          db
            .prepare('SELECT id FROM budget_plan WHERE user_id=? AND month=? AND id<>?')
            .get(userId, document.month, id)
        )
          conflict('A plan already exists for this month');
        this.references(userId, document);
        if (current)
          db.prepare(
            'UPDATE budget_plan SET month=?,document_json=?,revision=revision+1,last_write_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',
          ).run(document.month, JSON.stringify(document), writeHash, id);
        else
          db.prepare(
            "INSERT INTO budget_plan(id,user_id,month,document_json,revision,status,last_write_hash) VALUES(?,?,?,?,1,'draft',?)",
          ).run(id, userId, document.month, JSON.stringify(document), writeHash);
        return this.get(id, userId);
      })
      .immediate();
  }
  transition(id: string, userId: number, revision: number, status: 'finalized' | 'draft') {
    return db
      .transaction(() => {
        const row = this.owned(id, userId);
        if (row.revision !== revision || row.status === 'funded' || row.status === status)
          conflict('The plan changed or is read-only');
        const document = JSON.parse(row.document_json) as BudgetPlanDocument;
        if (status === 'finalized') {
          const calculation = calculateBudgetPlan(document);
          if (calculation.issues.length)
            throw {
              code: 'VALIDATION_ERROR',
              message: 'Resolve the plan before finalizing',
              details: calculation.issues,
            };
          if (
            calculation.free !== null &&
            decimal(calculation.free).gt(0) &&
            document.retainedAccountId === null
          )
            throw {
              code: 'VALIDATION_ERROR',
              message: 'Choose the USD account for unconverted funds',
              details: [
                {
                  field: 'retainedAccountId',
                  detail: 'Elige la cuenta USD donde conservarás el libre.',
                },
              ],
            };
          this.references(userId, document);
          this.funding(id, userId);
        }
        db.prepare(
          'UPDATE budget_plan SET status=?,revision=revision+1,last_write_hash=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?',
        ).run(status, id);
        return this.get(id, userId);
      })
      .immediate();
  }
  remove(id: string, userId: number, revision: number) {
    return db
      .transaction(() => {
        const row = this.owned(id, userId);
        if (row.status !== 'draft' || row.revision !== revision)
          conflict('Only the current draft can be deleted');
        db.prepare('DELETE FROM budget_plan WHERE id=? AND user_id=?').run(id, userId);
        return { deleted: true };
      })
      .immediate();
  }
  funding(id: string, userId: number) {
    const row = this.owned(id, userId),
      doc = JSON.parse(row.document_json) as BudgetPlanDocument;
    const calculation = calculateBudgetPlan(doc);
    if (calculation.issues.length)
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Resolve the plan before applying',
        details: calculation.issues,
      };
    const { envelopes } = this.options(userId),
      destinations = new Set(doc.lines.map((l) => l.targetEnvelopeId));
    const transfers = calculation.lines.map((line) => {
      const original = doc.lines.find((l) => l.id === line.id)!;
      const target = envelopes.find(
        (e) => e.id === original.targetEnvelopeId && e.currency === line.payCurrency,
      );
      if (!target)
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Choose an active destination for every assignment',
          details: [
            { field: `lines.${line.id}.targetEnvelopeId`, detail: 'Elige el sobre de destino.' },
          ],
        };
      const source = doc.sources.find((s) => s.accountId === target.accountId);
      const from = envelopes.find(
        (e) => e.id === source?.envelopeId && e.accountId === target.accountId,
      );
      if (!from || destinations.has(from.id))
        throw {
          code: 'VALIDATION_ERROR',
          message: 'Choose a distinct source envelope in each destination account',
          details: [
            {
              field: 'sources',
              detail:
                'El sobre de fondos debe ser distinto de todos los destinos y pertenecer a la misma cuenta.',
            },
          ],
        };
      return {
        lineId: line.id,
        name: original.name,
        amount: line.payAmount,
        currency: line.payCurrency,
        source: from,
        target,
      };
    });
    const sources = [...new Set(transfers.map((t) => t.source.id))].map((id) => {
      const related = transfers.filter((t) => t.source.id === id),
        source = related[0].source;
      const total = related.reduce((sum, t) => sum.plus(t.amount), decimal(0));
      return {
        ...source,
        required: total.toFixed(),
        sufficient: decimal(source.balance).gte(total),
      };
    });
    return { transfers, sources };
  }
  fund(id: string, userId: number, revision: number, requestId: string, date: string) {
    const fundHash = hash({ revision, requestId, date });
    return db
      .transaction(() => {
        const row = this.owned(id, userId);
        if (row.status === 'funded') {
          if (row.fund_hash !== fundHash) conflict('This budget has already been applied');
          return this.get(id, userId);
        }
        if (row.revision !== revision || row.status !== 'finalized')
          conflict('Finalize and review the current plan first');
        if (date < `${row.month}-01` || date > accountingDate())
          throw {
            code: 'VALIDATION_ERROR',
            message:
              'Choose an accounting date on or after the budget month begins, not in the future',
          };
        const preview = this.funding(id, userId);
        if (preview.sources.some((s) => !s.sufficient))
          conflict('There are not enough existing funds in one or more source envelopes');
        const transactions = preview.transfers.map((t) => {
          const amount = assertMoney(t.amount, t.currency);
          const posted = new TransferService().create({
            userId,
            requestId: randomUUID(),
            date,
            description: `Presupuesto ${row.month}: ${t.name}`,
            amount: decimalNumber(amount),
            from: { accountId: t.source.accountId, envelopeId: t.source.id },
            to: { accountId: t.target.accountId, envelopeId: t.target.id },
          });
          return {
            lineId: t.lineId,
            transactionId: posted.transaction.id,
            amount: t.amount,
            currency: t.currency,
            sourceEnvelopeId: t.source.id,
            targetEnvelopeId: t.target.id,
            accountId: t.target.accountId,
          };
        });
        const receipt = {
          requestId,
          date,
          revision,
          transactions,
          postedAt: new Date().toISOString(),
        };
        db.prepare(
          "UPDATE budget_plan SET status='funded',revision=revision+1,fund_hash=?,receipt_json=?,last_write_hash=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        ).run(fundHash, JSON.stringify(receipt), id);
        return this.get(id, userId);
      })
      .immediate();
  }
}
