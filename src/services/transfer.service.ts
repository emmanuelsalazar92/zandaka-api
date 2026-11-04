import { createHash } from 'node:crypto';
import db from '../db/db';
import { TransactionRepository } from '../repositories/transaction.repo';
import { AccountRepository } from '../repositories/account.repo';
import { EnvelopeRepository } from '../repositories/envelope.repo';
import { CategoryRepository } from '../repositories/category.repo';
import { InstitutionRepository } from '../repositories/institution.repo';
import { assertMoney, decimalText } from '../utils/money';
import { CreateTransferRequest } from '../validators/transfer.validator';
import { TransactionService } from './transaction.service';

export class TransferService {
  create(data: CreateTransferRequest) {
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          userId: data.userId,
          date: data.date,
          description: data.description,
          from: [data.from.accountId, data.from.envelopeId],
          to: [data.to.accountId, data.to.envelopeId],
          amount: decimalText(data.amount),
        }),
      )
      .digest('hex');
    // A database-backed lock serializes lookup, posting, reconciliation and receipt.
    // A failed receipt insert rolls back every ledger change too.
    return db
      .transaction(() => {
        if (
          !db
            .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='transfer_request'")
            .get()
        ) {
          throw {
            code: 'FEATURE_NOT_READY',
            message: 'Transfer retry storage has not been enabled',
          };
        }
        const previous = db
          .prepare(
            'SELECT request_hash, transaction_id FROM transfer_request WHERE user_id=? AND request_id=?',
          )
          .get(data.userId, data.requestId) as
          | { request_hash: string; transaction_id: number }
          | undefined;
        if (previous) {
          if (previous.request_hash !== hash)
            throw {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'This request was already confirmed with different data',
            };
          const repo = new TransactionRepository();
          return {
            transaction: repo.findById(previous.transaction_id)!,
            lines: repo.findLinesByTransactionId(previous.transaction_id),
          };
        }
        if (
          data.from.accountId === data.to.accountId &&
          data.from.envelopeId === data.to.envelopeId
        ) {
          throw { code: 'VALIDATION_ERROR', message: 'Source and destination must differ' };
        }
        const accountRepo = new AccountRepository(),
          envelopeRepo = new EnvelopeRepository();
        const accounts = [data.from, data.to].map((endpoint) => {
          const account = accountRepo.findById(endpoint.accountId);
          const envelope = envelopeRepo.findById(endpoint.envelopeId);
          const category = envelope && new CategoryRepository().findById(envelope.category_id);
          const institution =
            account && new InstitutionRepository().findById(account.institution_id);
          if (!account || !envelope || !category || !institution)
            throw { code: 'NOT_FOUND', message: 'Transfer endpoint not found' };
          if (
            [account.user_id, category.user_id, institution.user_id].some(
              (id) => id !== data.userId,
            )
          ) {
            throw {
              code: 'FORBIDDEN',
              message: 'Transfer endpoints must belong to the selected user',
            };
          }
          return account;
        });
        if (accounts[0].currency.toUpperCase() !== accounts[1].currency.toUpperCase()) {
          throw {
            code: 'VALIDATION_ERROR',
            message: 'Cross-currency transfers require an explicit conversion model',
          };
        }
        const amount = assertMoney(data.amount, accounts[0].currency);
        if (!(amount > 0))
          throw { code: 'VALIDATION_ERROR', message: 'Transfer amount must be positive' };
        const result = new TransactionService().create({
          userId: data.userId,
          date: data.date,
          description: data.description,
          type: 'TRANSFER',
          lines: [
            { ...data.from, amount: -amount },
            { ...data.to, amount },
          ],
        });
        db.prepare(
          'INSERT INTO transfer_request(user_id,request_id,request_hash,transaction_id) VALUES(?,?,?,?)',
        ).run(data.userId, data.requestId, hash, result.transaction.id);
        return result;
      })
      .immediate();
  }
}
