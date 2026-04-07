import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

const service = new UserService();

export class UserController {
  static getPreferredCurrency(req: Request, res: Response) {
    const preferredCurrency = service.getPreferredCurrency();
    res.json(preferredCurrency);
  }

  static getById(req: Request, res: Response) {
    const { id } = req.params;
    const user = service.getSettings(Number(id));
    res.json(user);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { name, baseCurrency } = req.body;
    const user = service.updateSettings(Number(id), { name, baseCurrency });
    res.json(user);
  }
}
