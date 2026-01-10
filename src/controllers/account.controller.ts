import { Request, Response } from 'express';
import { AccountService } from '../services/account.service';

const service = new AccountService();

export class AccountController {
  static create(req: Request, res: Response) {
    const { userId, institutionId, name, currency, allowOverdraft } = req.body;
    const account = service.create(userId, institutionId, name, currency, allowOverdraft);
    res.status(201).json(account);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { name } = req.body;
    const account = service.update(Number(id), name);
    res.json(account);
  }

  static deactivate(req: Request, res: Response) {
    const { id } = req.params;
    service.deactivate(Number(id));
    res.status(204).send();
  }
}

