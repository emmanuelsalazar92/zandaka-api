import { NextFunction, Request, Response } from 'express';
import { ExchangeRateService } from '../services/exchange-rate.service';

const service = new ExchangeRateService();

export class ExchangeRateController {
  static async getByDate(req: Request, res: Response, next: NextFunction) {
    try {
      const { day, month, year } = req.params;
      const exchangeRate = await service.getByDate(Number(day), Number(month), Number(year));
      res.json(exchangeRate);
    } catch (error) {
      next(error);
    }
  }
}
