import { Request, Response } from 'express';
import { ReconciliationService } from '../services/reconciliation.service';

const service = new ReconciliationService();

export class ReconciliationController {
  static create(req: Request, res: Response) {
    const { accountId, date, realBalance, note } = req.body;
    const reconciliation = service.create({ accountId, date, realBalance, note });
    res.status(201).json(reconciliation);
  }

  static list(req: Request, res: Response) {
    const { accountId } = req.query;
    if (accountId) {
      const reconciliations = service.findByAccountId(Number(accountId));
      res.json(reconciliations);
    } else {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'accountId query parameter is required',
        },
      });
    }
  }
}

