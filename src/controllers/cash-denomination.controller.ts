import { Request, Response } from 'express';
import { CashDenominationService } from '../services/cash-denomination.service';

const service = new CashDenominationService();

export class CashDenominationController {
  static list(req: Request, res: Response) {
    const userId = req.query.userId ? Number(req.query.userId) : 1;
    const currency = req.query.currency ? String(req.query.currency) : undefined;
    const includeInactive = req.query.includeInactive !== 'false';

    const payload = service.list({ userId, currency, includeInactive });
    res.json(payload);
  }

  static create(req: Request, res: Response) {
    const denomination = service.create(req.body);
    res.status(201).json(denomination);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const denomination = service.update(Number(id), req.body);
    res.json(denomination);
  }

  static deactivate(req: Request, res: Response) {
    const { id } = req.params;
    const userId = req.query.userId ? Number(req.query.userId) : 1;
    const denomination = service.deactivate(Number(id), userId);
    res.json(denomination);
  }
}
