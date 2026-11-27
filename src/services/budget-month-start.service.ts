import db from '../db/db';
import { budgetMonthStartReady } from '../db/budget-month-start';
import { TransactionDetailRepository } from '../repositories/transaction-detail.repo';
import type { TransactionDetail } from '../repositories/transaction-detail.repo';
import { decimal } from '../utils/money';
import type { CreateTransferRequest } from '../validators/transfer.validator';
import { BudgetPlanService } from './budget-plan.service';
import { TransferService } from './transfer.service';

type Movement = {
  id: number;
  date: string;
  accountId: number;
  accountName: string | null;
  envelopeId: number;
  amount: string;
  currency: 'CRC' | 'USD';
};
type Evidence = { movements: Movement[]; rate: string | null };
type Stored = {
  step: string;
  revision: number;
  movement_id: number;
  request_id: string | null;
  evidence_json: string;
};
type Step = {
  key: string;
  kind: 'fx' | 'payment' | 'transfer';
  label: string;
  planned: string;
  currency: 'CRC' | 'USD';
  fromAccountId: number;
  alternateFromAccountId?: number;
  fromEnvelopeId: number | null;
  toAccountId: number | null;
  toEnvelopeId: number | null;
};

function invalid(message = 'The selected movement does not match this step'): never {
  throw { code: 'VALIDATION_ERROR', message };
}
function conflict(message = 'The plan changed; reload before confirming this step'): never {
  throw { code: 'CONFLICT', message };
}

export class BudgetMonthStartService {
  private readonly plans = new BudgetPlanService();
  private readonly transactions = new TransactionDetailRepository();

  private context(id: string, userId: number) {
    const plan = this.plans.get(id, userId);
    if (!budgetMonthStartReady(db)) {
      throw {
        code: 'FEATURE_NOT_READY',
        message: 'Month-start evidence storage has not been prepared',
      };
    }
    const rows = db
      .prepare(
        'SELECT step, revision, movement_id, request_id, evidence_json FROM budget_month_start WHERE plan_id=?',
      )
      .all(id) as Stored[];
    const rowsByStep = new Map(rows.map((row) => [row.step, row]));
    const doc = plan.document;
    const calculation = plan.calculation;
    const { envelopes, accounts } = this.plans.options(userId);
    const envelopesById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
    const calculatedLines = new Map(calculation.lines.map((line) => [line.id, line]));
    const steps: Step[] = [];
    if (calculation.issues.length) return { plan, rowsByStep, steps };
    if (
      doc.incomeAccountId &&
      accounts.some((a) => a.id === doc.incomeAccountId && a.currency === 'USD') &&
      calculation.convertUsd !== null &&
      Number(calculation.convertUsd) > 0
    ) {
      steps.push({
        key: 'fx',
        kind: 'fx',
        label: 'Conversión USD a CRC',
        planned: calculation.convertUsd,
        currency: 'USD',
        fromAccountId: doc.incomeAccountId,
        alternateFromAccountId:
          doc.retainedAccountId !== doc.incomeAccountId &&
          accounts.some(
            (account) => account.id === doc.retainedAccountId && account.currency === 'USD',
          )
            ? (doc.retainedAccountId ?? undefined)
            : undefined,
        fromEnvelopeId: null,
        toAccountId: null,
        toEnvelopeId: null,
      });
    }
    const fx = rowsByStep.get('fx');
    const credit =
      fx?.revision === plan.revision
        ? (JSON.parse(fx.evidence_json) as Evidence).movements[1]
        : null;
    const crcByAccount = new Map<number, string>();
    for (const line of doc.lines) {
      const value = calculatedLines.get(line.id);
      const target =
        line.targetEnvelopeId === null ? undefined : envelopesById.get(line.targetEnvelopeId);
      if (!value || !target || target.currency !== line.payCurrency) continue;
      steps.push({
        key: `payment:${line.id}`,
        kind: 'payment',
        label: line.name,
        planned: value.payAmount,
        currency: line.payCurrency,
        fromAccountId: target.accountId,
        fromEnvelopeId: target.id,
        toAccountId: null,
        toEnvelopeId: null,
      });
      if (line.payCurrency === 'CRC') {
        const total = decimal(crcByAccount.get(target.accountId) ?? '0').plus(value.payAmount);
        crcByAccount.set(target.accountId, total.toFixed());
      }
    }
    for (const source of doc.sources) {
      const planned = crcByAccount.get(source.accountId);
      if (!credit || !planned || source.accountId === credit.accountId) continue;
      if (
        envelopesById.get(source.envelopeId)?.accountId !== source.accountId ||
        envelopesById.get(credit.envelopeId)?.accountId !== credit.accountId ||
        doc.lines.some((line) => line.targetEnvelopeId === source.envelopeId)
      )
        continue;
      steps.push({
        key: `transfer:${source.accountId}`,
        kind: 'transfer',
        label: 'Traslado de fondos en CRC',
        planned,
        currency: 'CRC',
        fromAccountId: credit.accountId,
        fromEnvelopeId: credit.envelopeId,
        toAccountId: source.accountId,
        toEnvelopeId: source.envelopeId,
      });
    }
    return { plan, rowsByStep, steps };
  }

  get(id: string, userId: number) {
    return db.transaction(() => {
      const { plan, rowsByStep, steps } = this.context(id, userId);
      const keys = new Set(steps.map((step) => step.key));
      return {
        planId: id,
        revision: plan.revision,
        steps: steps.map((step) => {
          const row = rowsByStep.get(step.key);
          return {
            ...step,
            evidence: row
              ? {
                  ...(JSON.parse(row.evidence_json) as Evidence),
                  current: row.revision === plan.revision,
                }
              : null,
          };
        }),
        detachedCount: [...rowsByStep.keys()].filter((key) => !keys.has(key)).length,
      };
    })();
  }

  private transaction(id: number, userId: number): TransactionDetail {
    const transaction = this.transactions.findForUser(id, userId);
    if (!transaction) throw { code: 'NOT_FOUND', message: 'Movement not found' };
    return transaction;
  }

  private movement(
    transaction: TransactionDetail,
    line: TransactionDetail['lines'][number],
  ): Movement {
    if (
      (line.accountCurrency !== 'USD' && line.accountCurrency !== 'CRC') ||
      line.envelopeActive === null
    )
      invalid();
    return {
      id: transaction.id,
      date: transaction.date,
      accountId: line.accountId,
      accountName: line.accountName,
      envelopeId: line.envelopeId,
      amount: decimal(line.amount).abs().toFixed(),
      currency: line.accountCurrency,
    };
  }

  private evidence(step: Step, userId: number, movementIds: number[]): Evidence {
    const first = this.transaction(movementIds[0], userId);
    if (step.kind === 'fx') {
      if (movementIds.length !== 2 || movementIds[0] === movementIds[1]) invalid();
      const second = this.transaction(movementIds[1], userId);
      const [debit] = first.lines;
      const [credit] = second.lines;
      if (
        first.type !== 'EXPENSE' ||
        second.type !== 'INCOME' ||
        first.lines.length !== 1 ||
        second.lines.length !== 1 ||
        (debit.accountId !== step.fromAccountId &&
          debit.accountId !== step.alternateFromAccountId) ||
        debit.accountId === credit.accountId ||
        debit.accountCurrency !== 'USD' ||
        credit.accountCurrency !== 'CRC' ||
        debit.amount >= 0 ||
        credit.amount <= 0
      )
        invalid();
      return {
        movements: [this.movement(first, debit), this.movement(second, credit)],
        rate: decimal(credit.amount).div(decimal(debit.amount).abs()).toFixed(6),
      };
    }
    if (movementIds.length !== 1) invalid();
    if (step.kind === 'payment') {
      const [debit] = first.lines;
      if (
        first.type !== 'EXPENSE' ||
        first.lines.length !== 1 ||
        debit.amount >= 0 ||
        debit.accountCurrency !== step.currency ||
        debit.accountId !== step.fromAccountId ||
        debit.envelopeId !== step.fromEnvelopeId
      )
        invalid();
      return { movements: [this.movement(first, debit)], rate: null };
    }
    const debit = first.lines.find((line) => line.amount < 0);
    const credit = first.lines.find((line) => line.amount > 0);
    if (
      first.type !== 'TRANSFER' ||
      first.lines.length !== 2 ||
      !debit ||
      !credit ||
      debit.accountId !== step.fromAccountId ||
      credit.accountId !== step.toAccountId ||
      debit.envelopeId !== step.fromEnvelopeId ||
      credit.envelopeId !== step.toEnvelopeId ||
      debit.accountCurrency !== step.currency ||
      credit.accountCurrency !== step.currency ||
      !decimal(debit.amount).abs().eq(credit.amount)
    )
      invalid();
    return { movements: [this.movement(first, debit), this.movement(first, credit)], rate: null };
  }

  private persist(
    id: string,
    revision: number,
    key: string,
    ids: number[],
    evidence: Evidence,
    requestId: string | null,
  ) {
    const inUse = db
      .prepare(
        `SELECT 1 FROM budget_month_start WHERE plan_id=? AND step<>?
      AND (movement_id IN (?, ?) OR second_movement_id IN (?, ?))`,
      )
      .get(id, key, ids[0], ids[1] ?? null, ids[0], ids[1] ?? null);
    if (inUse) conflict('The movement is already linked to another step');
    db.prepare(
      `INSERT INTO budget_month_start(plan_id,step,revision,movement_id,second_movement_id,request_id,evidence_json)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(plan_id,step) DO UPDATE SET
      revision=excluded.revision, movement_id=excluded.movement_id, second_movement_id=excluded.second_movement_id,
      request_id=excluded.request_id, evidence_json=excluded.evidence_json`,
    ).run(id, key, revision, ids[0], ids[1] ?? null, requestId, JSON.stringify(evidence));
  }

  link(id: string, userId: number, revision: number, key: string, ids: number[]) {
    return db
      .transaction(() => {
        const { plan, rowsByStep, steps } = this.context(id, userId);
        if (plan.revision !== revision) conflict();
        const step = steps.find((item) => item.key === key);
        if (!step) invalid('This step is unavailable in the current plan');
        const previous = rowsByStep.get(key);
        const evidence = this.evidence(step, userId, ids);
        if (previous?.revision === revision) {
          if (previous.evidence_json !== JSON.stringify(evidence))
            conflict('A movement already confirms this step');
          return this.get(id, userId);
        }
        this.persist(
          id,
          revision,
          key,
          ids,
          evidence,
          previous?.movement_id === ids[0] ? previous.request_id : null,
        );
        return this.get(id, userId);
      })
      .immediate();
  }

  transfer(id: string, revision: number, key: string, data: CreateTransferRequest) {
    return db
      .transaction(() => {
        const { plan, rowsByStep, steps } = this.context(id, data.userId);
        const previous = rowsByStep.get(key);
        if (previous?.request_id === data.requestId) {
          const existing = new TransferService().create(data);
          if (existing.transaction.id !== previous.movement_id) conflict();
          return existing;
        }
        if (plan.revision !== revision) conflict();
        if (previous) conflict('Review the linked movement before creating another transfer');
        const step = steps.find((item) => item.key === key && item.kind === 'transfer');
        if (
          !step ||
          data.from.accountId !== step.fromAccountId ||
          data.from.envelopeId !== step.fromEnvelopeId ||
          data.to.accountId !== step.toAccountId ||
          data.to.envelopeId !== step.toEnvelopeId
        )
          invalid();
        const source = this.plans
          .options(data.userId)
          .envelopes.find((item) => item.id === data.from.envelopeId);
        if (!source || decimal(source.balance).lt(data.amount))
          conflict('There are not enough existing funds in the source envelope');
        const result = new TransferService().create(data);
        const ids = [result.transaction.id];
        this.persist(id, revision, key, ids, this.evidence(step, data.userId, ids), data.requestId);
        return result;
      })
      .immediate();
  }
}
