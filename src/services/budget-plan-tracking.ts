import { z } from 'zod';
import db from '../db/db';
import { decimal } from '../utils/money';
import type { BudgetPlanService } from './budget-plan.service';

type Plan = ReturnType<BudgetPlanService['get']>;
const id = z.number().int().positive().safe();
const receiptSchema = z.object({
  requestId: z.guid(),
  revision: id,
  date: z.iso.date(),
  transactions: z
    .array(
      z.object({
        lineId: z.guid(),
        transactionId: id,
        amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
        currency: z.enum(['CRC', 'USD']),
        sourceEnvelopeId: id,
        targetEnvelopeId: id,
        accountId: id,
      }),
    )
    .min(1)
    .max(200),
});
type Envelope = {
  envelopeId: number;
  accountId: number;
  accountName: string;
  categoryName: string;
  currency: 'CRC' | 'USD';
  active: number;
};
type Amounts = Map<number, string>;

function add(amounts: Amounts, envelopeId: number, amount: string) {
  amounts.set(
    envelopeId,
    decimal(amounts.get(envelopeId) ?? '0')
      .plus(amount)
      .toFixed(),
  );
}

function confirmedFunding(plan: Plan, catalog: Map<number, Envelope>) {
  if (plan.status !== 'funded') return { date: null, amounts: new Map<number, string>() };
  const result = receiptSchema.safeParse(plan.receipt);
  if (!result.success) return null;
  const { transactions, revision, date } = result.data;
  const ids = new Set(transactions.map((line) => line.transactionId));
  if (
    revision + 1 !== plan.revision ||
    date < `${plan.document.month}-01` ||
    transactions.length !== plan.document.lines.length ||
    ids.size !== transactions.length ||
    new Set(transactions.map((line) => line.lineId)).size !== transactions.length
  )
    return null;
  const lines = new Map(plan.document.lines.map((line) => [line.id, line]));
  const calculated = new Map(plan.calculation.lines.map((line) => [line.id, line.payAmount]));
  const ledger = db
    .prepare(
      `
    SELECT t.id, tl.account_id AS accountId, tl.envelope_id AS envelopeId, tl.amount
    FROM json_each(?) requested
    JOIN transactions t ON t.id=requested.value
    JOIN transaction_line tl ON tl.transaction_id=t.id
    JOIN account_envelope e ON e.id=tl.envelope_id AND e.account_id=tl.account_id
    JOIN account a ON a.id=e.account_id AND a.user_id=t.user_id
    JOIN category c ON c.id=e.category_id AND c.user_id=t.user_id
    WHERE t.user_id=? AND t.type='TRANSFER' AND t.date=?
  `,
    )
    .all(JSON.stringify([...ids]), plan.userId, date) as {
    id: number;
    accountId: number;
    envelopeId: number;
    amount: string | number;
  }[];
  const ledgerById = new Map<number, typeof ledger>();
  for (const entry of ledger) {
    const group = ledgerById.get(entry.id) ?? [];
    group.push(entry);
    ledgerById.set(entry.id, group);
  }
  const sources = new Map(
    plan.document.sources.map((source) => [source.accountId, source.envelopeId]),
  );
  const amounts: Amounts = new Map();
  for (const line of transactions) {
    const planned = lines.get(line.lineId);
    const amount = calculated.get(line.lineId);
    const target = catalog.get(line.targetEnvelopeId);
    const posted = ledgerById.get(line.transactionId);
    if (
      !planned ||
      !amount ||
      !target ||
      posted?.length !== 2 ||
      planned.targetEnvelopeId !== line.targetEnvelopeId ||
      planned.payCurrency !== line.currency ||
      target.accountId !== line.accountId ||
      target.currency !== line.currency ||
      sources.get(line.accountId) !== line.sourceEnvelopeId ||
      line.sourceEnvelopeId === line.targetEnvelopeId ||
      !decimal(amount).eq(line.amount) ||
      !posted.every((entry) => entry.accountId === line.accountId) ||
      !posted.some(
        (entry) =>
          entry.envelopeId === line.sourceEnvelopeId &&
          decimal(entry.amount).eq(decimal(line.amount).neg()),
      ) ||
      !posted.some(
        (entry) =>
          entry.envelopeId === line.targetEnvelopeId && decimal(entry.amount).eq(line.amount),
      )
    )
      return null;
    add(amounts, line.targetEnvelopeId, line.amount);
  }
  return { date, amounts };
}

export function budgetPlanTracking(plan: Plan) {
  const month = plan.document.month;
  const [year, number] = month.split('-').map(Number);
  const from = `${month}-01`;
  const to = new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10);
  // t.date is the stored Costa Rica accounting day. created_at is registration time.
  const spending = db
    .prepare(
      `
    SELECT tl.envelope_id AS envelopeId, decimal_sum(tl.amount) AS debits
    FROM transactions t
    JOIN transaction_line tl ON tl.transaction_id=t.id
    JOIN account_envelope e ON e.id=tl.envelope_id AND e.account_id=tl.account_id
    JOIN account a ON a.id=e.account_id AND a.user_id=t.user_id AND a.currency IN ('CRC','USD')
    JOIN category c ON c.id=e.category_id AND c.user_id=t.user_id
    WHERE t.user_id=? AND t.type='EXPENSE' AND t.date BETWEEN ? AND ?
      AND decimal_cmp(tl.amount, '0') < 0
    GROUP BY tl.envelope_id
  `,
    )
    .all(plan.userId, from, to) as Array<{ envelopeId: number; debits: string }>;
  const ids = new Set([
    ...plan.document.lines.flatMap((line) =>
      line.targetEnvelopeId === null ? [] : [line.targetEnvelopeId],
    ),
    ...spending.map((row) => row.envelopeId),
  ]);
  const envelopes = db
    .prepare(
      `
    SELECT e.id AS envelopeId, a.id AS accountId, a.name AS accountName,
      c.name AS categoryName, a.currency, (e.is_active=1 AND a.is_active=1 AND c.is_active=1) AS active
    FROM json_each(?) requested
    JOIN account_envelope e ON e.id=requested.value
    JOIN account a ON a.id=e.account_id AND a.currency IN ('CRC','USD')
    JOIN category c ON c.id=e.category_id AND c.user_id=a.user_id
    WHERE a.user_id=?
    ORDER BY a.currency, a.name, a.id, c.name, e.id
  `,
    )
    .all(JSON.stringify([...ids]), plan.userId) as Envelope[];
  const catalog = new Map(envelopes.map((row) => [row.envelopeId, row]));
  const planned: Amounts = new Map();
  const missingAmounts = new Set<number>();
  const calculated = new Map(plan.calculation.lines.map((line) => [line.id, line.payAmount]));
  let unmappedCount = 0;
  for (const line of plan.document.lines) {
    const target = line.targetEnvelopeId === null ? undefined : catalog.get(line.targetEnvelopeId);
    if (!target || target.currency !== line.payCurrency) {
      unmappedCount++;
      continue;
    }
    const amount = calculated.get(line.id);
    if (amount !== undefined) add(planned, target.envelopeId, amount);
    else missingAmounts.add(target.envelopeId);
  }
  const confirmed = confirmedFunding(plan, catalog);
  const expenses = new Map(
    spending.map((row) => [row.envelopeId, decimal(row.debits).neg().toFixed()]),
  );
  return {
    planId: plan.id,
    revision: plan.revision,
    month,
    from,
    to,
    unmappedCount,
    fundingStatus: confirmed === null ? 'unverified' : confirmed.date ? 'confirmed' : 'pending',
    fundingDate: confirmed?.date ?? null,
    rows: envelopes.map(({ active, ...row }) => ({
      ...row,
      active: active === 1,
      hasPlan: planned.has(row.envelopeId) || missingAmounts.has(row.envelopeId),
      planned: missingAmounts.has(row.envelopeId) ? null : (planned.get(row.envelopeId) ?? null),
      assigned: confirmed === null ? null : (confirmed.amounts.get(row.envelopeId) ?? '0'),
      spent: expenses.get(row.envelopeId) ?? '0',
    })),
  };
}
