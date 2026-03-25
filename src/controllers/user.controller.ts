import { Request, Response } from 'express';
import { UserService } from '../services/user.service';

const service = new UserService();

export class UserController {
  static getPreferredCurrency(req: Request, res: Response) {
    const preferredCurrency = service.getPreferredCurrency();
    res.json(preferredCurrency);
  }
}
