import { createHash } from 'node:crypto';
import db from '../db/db';
import { budgetSubscriptionsReady } from '../db/budget-subscriptions';
import { TransactionDetailRepository } from '../repositories/transaction-detail.repo';
import { decimal } from '../utils/money';
import type { SubscriptionDefinition } from '../validators/budget-subscriptions.validator';
import { BudgetPlanService } from './budget-plan.service';

type DefinitionRow = { id: string; user_id: number; revision: number; document_json: string };
type Charge = {
  transactionId: number;
  transactionLineId: number;
  amount: string;
  date: string;
  description: string;
};
type Stored = {
  line_id: string;
  transaction_line_id: number;
  forecast_hash: string;
  receipt_json: string;
};
type Plan = ReturnType<BudgetPlanService['get']>;

function failure(
  code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR',
  message: string,
  field?: string,
): never {
  throw { code, message, details: field ? [{ field, detail: message }] : [] };
}
function definitionView(row: DefinitionRow) {
  return {
    id: row.id,
    revision: row.revision,
    definition: JSON.parse(row.document_json) as SubscriptionDefinition,
  };
}

export class BudgetSubscriptionsService {
  private readonly plans = new BudgetPlanService();
  private readonly transactions = new TransactionDetailRepository();

  private ready(userId: number) {
    if (!db.prepare('SELECT 1 FROM user WHERE id=?').get(userId))
      failure('NOT_FOUND', 'User not found');
    if (!budgetSubscriptionsReady(db)) {
      throw { code: 'FEATURE_NOT_READY', message: 'Subscription storage has not been prepared' };
    }
  }

  catalog(userId: number) {
    this.ready(userId);
    const rows = db
      .prepare(
        `SELECT id,user_id,revision,document_json FROM subscription_definition
      WHERE user_id=? ORDER BY json_extract(document_json,'$.name') COLLATE NOCASE,id`,
      )
      .all(userId) as DefinitionRow[];
    return { items: rows.map(definitionView) };
  }

  saveDefinition(id: string, userId: number, revision: number, definition: SubscriptionDefinition) {
    return db
      .transaction(() => {
        this.ready(userId);
        const read = db.prepare('SELECT * FROM subscription_definition WHERE id=?');
        const previous = read.get(id) as DefinitionRow | undefined;
        if (previous && previous.user_id !== userId) failure('NOT_FOUND', 'Subscription not found');
        const data = JSON.stringify(definition);
        if (
          previous?.document_json === data &&
          (previous.revision === revision || previous.revision === revision + 1)
        )
          return definitionView(previous);
        if (revision !== (previous?.revision ?? 0))
          failure('CONFLICT', 'The subscription definition changed; reload');
        if (previous) {
          db.prepare(
            'UPDATE subscription_definition SET revision=revision+1,document_json=? WHERE id=?',
          ).run(data, id);
        } else {
          const count = db
            .prepare('SELECT COUNT(*) AS n FROM subscription_definition WHERE user_id=?')
            .get(userId) as { n: number };
          if (count.n >= 200) failure('VALIDATION_ERROR', 'The subscription catalog limit is 200');
          db.prepare(
            'INSERT INTO subscription_definition(id,user_id,revision,document_json) VALUES(?,?,1,?)',
          ).run(id, userId, data);
        }
        return definitionView(read.get(id) as DefinitionRow);
      })
      .immediate();
  }

  private occurrences(plan: Plan) {
    const lines = plan.document.lines.filter((line) => line.kind === 'subscription');
    const targets = db
      .prepare(
        `
      SELECT e.id,a.id AS accountId,a.currency,a.name AS accountName,c.name AS categoryName
      FROM json_each(?) requested
      JOIN account_envelope e ON e.id=requested.value
      JOIN account a ON a.id=e.account_id AND a.user_id=?
      JOIN category c ON c.id=e.category_id AND c.user_id=a.user_id
    `,
      )
      .all(
        JSON.stringify([...new Set(lines.map((line) => line.targetEnvelopeId))]),
        plan.userId,
      ) as {
      id: number;
      accountId: number;
      currency: string;
      accountName: string;
      categoryName: string;
    }[];
    const byTarget = new Map(targets.map((item) => [item.id, item]));
    const calculated = new Map(plan.calculation.lines.map((item) => [item.id, item]));
    return lines.map((line) => {
      const target =
        line.targetEnvelopeId === null ? undefined : byTarget.get(line.targetEnvelopeId);
      const value = calculated.get(line.id);
      const forecast = {
        lineId: line.id,
        name: line.name,
        originalAmount: line.amount,
        originalCurrency: line.currency,
        iva: line.iva,
        currency: line.payCurrency,
        roundUsd: line.roundUsd,
        source: line.subscriptionSource ?? null,
        engineVersion: plan.document.version,
        buy: plan.calculation.buy,
        sell: plan.calculation.sell,
        quoteSource: plan.document.exchange.source,
        quoteDate: plan.document.exchange.date,
        envelopeId: line.targetEnvelopeId,
        accountId: target?.currency === line.payCurrency ? target.accountId : null,
        accountName: target?.accountName ?? null,
        categoryName: target?.categoryName ?? null,
        planned: value?.payAmount ?? null,
        reserveUsd: value?.reserveUsd ?? null,
        explanation: value?.explanation ?? [],
      };
      // Cosmetic account/category renames keep the existing receipt current.
      const hash = createHash('sha256')
        .update(
          JSON.stringify({
            price: [
              forecast.originalAmount,
              forecast.originalCurrency,
              forecast.iva,
              forecast.currency,
              forecast.roundUsd,
            ],
            quote: [forecast.buy, forecast.sell, forecast.quoteSource, forecast.quoteDate],
            target: [forecast.envelopeId, forecast.accountId],
            planned: forecast.planned,
            version: forecast.engineVersion,
            month: plan.document.month,
          }),
        )
        .digest('hex');
      return { forecast, hash };
    });
  }

  private rows(planId: string): Stored[] {
    return db.prepare('SELECT * FROM subscription_charge WHERE plan_id=?').all(planId) as Stored[];
  }

  private view(plan: Plan) {
    const saved = new Map(this.rows(plan.id).map((row) => [row.line_id, row]));
    const occurrences = this.occurrences(plan).map(({ forecast, hash }) => {
      const row = saved.get(forecast.lineId);
      saved.delete(forecast.lineId);
      const receipt = row
        ? (JSON.parse(row.receipt_json) as Charge & {
            forecast: typeof forecast;
            difference: string;
          })
        : null;
      return {
        ...forecast,
        receipt: receipt && { ...receipt, current: row?.forecast_hash === hash },
      };
    });
    return {
      planId: plan.id,
      revision: plan.revision,
      month: plan.document.month,
      occurrences,
      detachedCount: saved.size,
    };
  }

  get(planId: string, userId: number) {
    return db.transaction(() => {
      this.ready(userId);
      return this.view(this.plans.get(planId, userId));
    })();
  }

  link(
    planId: string,
    lineId: string,
    userId: number,
    revision: number,
    transactionId: number,
    transactionLineId: number,
  ) {
    return db
      .transaction(() => {
        this.ready(userId);
        const plan = this.plans.get(planId, userId);
        if (plan.revision !== revision) failure('CONFLICT', 'The budget changed; reload');
        const occurrence = this.occurrences(plan).find((item) => item.forecast.lineId === lineId);
        if (
          !occurrence ||
          occurrence.forecast.planned === null ||
          occurrence.forecast.accountId === null
        )
          failure(
            'VALIDATION_ERROR',
            'The forecast needs a calculable amount and a destination account',
          );
        const { forecast, hash } = occurrence;
        const previous = this.rows(planId).find((row) => row.line_id === lineId);
        if (previous && previous.transaction_line_id !== transactionLineId)
          failure('CONFLICT', 'This forecast already has a linked charge');
        const used = db
          .prepare('SELECT plan_id,line_id FROM subscription_charge WHERE transaction_line_id=?')
          .get(transactionLineId) as { plan_id: string; line_id: string } | undefined;
        if (used && (used.plan_id !== planId || used.line_id !== lineId))
          failure('CONFLICT', 'This charge already confirms another forecast');
        const transaction = this.transactions.findForUser(transactionId, userId);
        if (!transaction) failure('NOT_FOUND', 'Charge not found');
        const line = transaction.lines.find((item) => item.id === transactionLineId);
        if (
          transaction.type !== 'EXPENSE' ||
          !line ||
          line.amount >= 0 ||
          line.envelopeActive === null
        )
          failure('VALIDATION_ERROR', 'Select a debit line from a recorded expense');
        if (line.accountCurrency !== forecast.currency)
          failure('VALIDATION_ERROR', 'Currency differs from the forecast', 'currency');
        if (line.accountId !== forecast.accountId)
          failure('VALIDATION_ERROR', 'Account differs from the forecast', 'account');
        if (previous?.forecast_hash === hash) return this.view(plan);
        const amount = decimal(line.amount).abs().toFixed();
        const receipt = {
          transactionId,
          transactionLineId,
          date: transaction.date,
          description: transaction.description,
          amount,
          forecast,
          difference: decimal(amount).minus(forecast.planned!).toFixed(),
        };
        db.prepare(
          `INSERT INTO subscription_charge(plan_id,line_id,transaction_line_id,forecast_hash,receipt_json)
        VALUES(?,?,?,?,?) ON CONFLICT(plan_id,line_id) DO UPDATE SET forecast_hash=excluded.forecast_hash,receipt_json=excluded.receipt_json`,
        ).run(planId, lineId, transactionLineId, hash, JSON.stringify(receipt));
        return this.view(plan);
      })
      .immediate();
  }
}
