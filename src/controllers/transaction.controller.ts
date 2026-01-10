import { Request, Response } from 'express';
import { TransactionService } from '../services/transaction.service';

const service = new TransactionService();

export class TransactionController {
  static create(req: Request, res: Response) {
    const data = req.body;
    const result = service.create(data);
    res.status(201).json(result);
  }

  static list(req: Request, res: Response) {
    const { from, to, accountId, categoryId, q, userId } = req.query;
    const transactions = service.findWithFilters({
      from: from as string,
      to: to as string,
      accountId: accountId ? Number(accountId) : undefined,
      categoryId: categoryId ? Number(categoryId) : undefined,
      q: q as string,
      userId: userId ? Number(userId) : undefined,
    });
    res.json(transactions);
  }
}

