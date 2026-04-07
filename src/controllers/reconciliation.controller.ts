import { Request, Response } from 'express';
import { ReconciliationService } from '../services/reconciliation.service';

const service = new ReconciliationService();

export class ReconciliationController {
  static create(req: Request, res: Response) {
    const reconciliation = service.create(req.body);
    res.status(201).json(reconciliation);
  }

  static list(req: Request, res: Response) {
    const accountId =
      req.query.account_id !== undefined
        ? Number(req.query.account_id)
        : req.query.accountId !== undefined
          ? Number(req.query.accountId)
          : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const offset = req.query.offset ? Number(req.query.offset) : 0;
    const reconciliations = service.list({
      accountId,
      status: status as 'OPEN' | 'BALANCED' | 'IGNORED' | undefined,
      limit,
      offset,
    });
    res.json(reconciliations);
  }

  static getById(req: Request, res: Response) {
    const { id } = req.params;
    const reconciliation = service.findById(Number(id));
    res.json(reconciliation);
  }

  static getCashDenominationsForAccount(req: Request, res: Response) {
    const { accountId } = req.params;
    const payload = service.getCashDenominationsForAccount(Number(accountId));
    res.json(payload);
  }

  static getExpectedTotalForAccount(req: Request, res: Response) {
    const { accountId } = req.params;
    const date = String(req.query.date);
    const payload = service.getExpectedTotalForAccount(Number(accountId), date);
    res.json(payload);
  }

  static getActiveByAccount(req: Request, res: Response) {
    const { accountId } = req.params;
    const reconciliation = service.findActiveByAccountId(Number(accountId));
    res.json(reconciliation);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { note } = req.body;
    const reconciliation = service.updateNote(Number(id), note ?? null);
    res.json(reconciliation);
  }

  static getSummary(req: Request, res: Response) {
    const { id } = req.params;
    const summary = service.getSummary(Number(id));
    res.json(summary);
  }

  static remove(req: Request, res: Response) {
    const { id } = req.params;
    service.blockDeletion(Number(id));
    res.status(204).send();
  }

  static ignore(req: Request, res: Response) {
    const { id } = req.params;
    const reconciliation = service.ignore(Number(id));
    res.json(reconciliation);
  }
}
