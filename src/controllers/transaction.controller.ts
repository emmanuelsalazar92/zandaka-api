import { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.service';
import { getTransactionsSchema } from '../validators/transaction.validator';

const service = new TransactionService();

export class TransactionController {
  static create(req: Request, res: Response) {
    const data = req.body;
    const result = service.create(data);
    res.status(201).json(result);
  }

  static list(req: Request, res: Response) {
    const { query } = getTransactionsSchema.parse({ query: req.query });
    const amountMinProvided = Object.prototype.hasOwnProperty.call(req.query, 'amountMin');
    const amountMaxProvided = Object.prototype.hasOwnProperty.call(req.query, 'amountMax');
    const applyAmountFilter = amountMinProvided || amountMaxProvided;

    if (query.from && query.to && query.from > query.to) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid date range',
        details: [{ field: 'from', message: 'from must be <= to' }],
      };
    }

    if (
      applyAmountFilter &&
      query.amountMax !== undefined &&
      query.amountMin > query.amountMax
    ) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid amount range',
        details: [{ field: 'amountMin', message: 'amountMin must be <= amountMax' }],
      };
    }

    const transactions = service.findWithFilters({
      userId: query.userId,
      from: query.from,
      to: query.to,
      type: query.type === 'ALL' ? undefined : query.type,
      accountId: query.accountId,
      categoryId: query.categoryId,
      q: query.q,
      amountMin: applyAmountFilter ? query.amountMin : undefined,
      amountMax: amountMaxProvided ? query.amountMax : undefined,
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      sortDir: query.sortDir,
    });

    res.json(transactions);
  }
}

