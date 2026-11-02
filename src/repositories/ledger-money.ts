import { moneyStatement } from '../db/money-statement';
import { assertMoney, sumMoney } from '../utils/money';

// Call inside the same write transaction as the new ledger lines. An overflow must
// reject the operation before any transaction header, funding status or line is written.
export function assertLedgerCapacity(
  lines: Array<{ accountId: number; envelopeId: number; amount: number }>,
): void {
  for (const scope of ['account', 'envelope'] as const) {
    const groups = new Map<number, number[]>();
    for (const line of lines) {
      const id = scope === 'account' ? line.accountId : line.envelopeId;
      groups.set(id, [...(groups.get(id) ?? []), line.amount]);
    }
    for (const [id, amounts] of groups) {
      const row = moneyStatement(
        scope === 'account'
          ? `SELECT a.currency, money_balance(COALESCE(decimal_sum(tl.amount), 0), a.currency) AS balance FROM account a
            LEFT JOIN transaction_line tl ON tl.account_id=a.id WHERE a.id=? GROUP BY a.id`
          : `SELECT a.currency, money_balance(COALESCE(decimal_sum(tl.amount), 0), a.currency) AS balance FROM account_envelope ae
            JOIN account a ON a.id=ae.account_id LEFT JOIN transaction_line tl ON tl.envelope_id=ae.id
            WHERE ae.id=? GROUP BY ae.id`,
      ).get(id) as { currency: string; balance: number } | undefined;
      if (!row) throw { code: 'NOT_FOUND', message: `Ledger ${scope} ${id} not found` };
      for (const amount of amounts) assertMoney(amount, row.currency);
      assertMoney(sumMoney([row.balance, ...amounts]), row.currency);
    }
  }
}
