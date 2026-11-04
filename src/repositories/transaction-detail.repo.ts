import db from '../db/db';
import { moneyStatement } from '../db/money-statement';
import type { Transaction } from '../types';

export interface TransactionDetail {
  id: number;
  userId: number;
  date: string;
  description: string;
  type: Transaction['type'];
  createdAt: string | null;
  correction: { available: false; reason: 'NO_AUDITED_CORRECTION_FLOW' };
  lines: Array<{
    id: number;
    accountId: number;
    accountName: string | null;
    accountCurrency: string | null;
    institutionName: string | null;
    envelopeId: number;
    categoryName: string | null;
    envelopeActive: boolean | null;
    amount: number;
  }>;
}

/** Historical inspection: include every stored line, even inactive or unresolved links. */
export class TransactionDetailRepository {
  findForUser(id: number, userId: number): TransactionDetail | null {
    return db.transaction((): TransactionDetail | null => {
      const transaction = moneyStatement(
        'SELECT id, user_id, date, description, type, created_at FROM transactions WHERE id = ? AND user_id = ?',
      ).get(id, userId) as Transaction | undefined;
      if (!transaction) return null;

      // The owner predicate also scopes linked names. Do not expose another owner's
      // catalog through an inconsistent historical foreign key. Never filter lines.
      const lines = moneyStatement(`
        SELECT tl.id, tl.account_id AS accountId, a.name AS accountName,
               a.currency AS accountCurrency, i.name AS institutionName,
               tl.envelope_id AS envelopeId, c.name AS categoryName,
               ae.is_active AS envelopeActive, tl.amount
        FROM transaction_line tl
        JOIN transactions t ON t.id = tl.transaction_id AND t.user_id = ?
        LEFT JOIN account a ON a.id = tl.account_id AND a.user_id = t.user_id
        LEFT JOIN institution i ON i.id = a.institution_id AND i.user_id = t.user_id
        LEFT JOIN account_envelope ae ON ae.id = tl.envelope_id AND ae.account_id = a.id
        LEFT JOIN category c ON c.id = ae.category_id AND c.user_id = t.user_id
        WHERE tl.transaction_id = ?
        ORDER BY tl.id ASC
      `).all(userId, id) as Array<
        Omit<TransactionDetail['lines'][number], 'envelopeActive'> & {
          envelopeActive: number | null;
        }
      >;

      return {
        id: transaction.id,
        userId: transaction.user_id,
        date: transaction.date,
        description: transaction.description,
        type: transaction.type,
        createdAt: transaction.created_at ?? null,
        correction: { available: false, reason: 'NO_AUDITED_CORRECTION_FLOW' },
        lines: lines.map((line) => ({
          ...line,
          envelopeActive: line.envelopeActive === null ? null : Boolean(line.envelopeActive),
        })),
      };
    })();
  }
}
