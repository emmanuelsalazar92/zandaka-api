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

  static list(req: Request, res: Response) {
    const { userId, fromCurrency, toCurrency, effectiveDate } = req.query;
    const exchangeRates = service.list({
      userId: Number(userId),
      fromCurrency: typeof fromCurrency === 'string' ? fromCurrency : undefined,
      toCurrency: typeof toCurrency === 'string' ? toCurrency : undefined,
      effectiveDate: typeof effectiveDate === 'string' ? effectiveDate : undefined,
    });
    res.json(exchangeRates);
  }

  static getById(req: Request, res: Response) {
    const { id } = req.params;
    const { userId } = req.query;
    const exchangeRate = service.findById(Number(id), Number(userId));
    res.json(exchangeRate);
  }

  static create(req: Request, res: Response) {
    const { userId, fromCurrency, toCurrency, rate, effectiveDate } = req.body;
    const exchangeRate = service.create({
      userId,
      fromCurrency,
      toCurrency,
      rate,
      effectiveDate,
    });
    res.status(201).json(exchangeRate);
  }

  static update(req: Request, res: Response) {
    const { id } = req.params;
    const { userId, fromCurrency, toCurrency, rate, effectiveDate } = req.body;
    const exchangeRate = service.update(Number(id), {
      userId,
      fromCurrency,
      toCurrency,
      rate,
      effectiveDate,
    });
    res.json(exchangeRate);
  }

  static remove(req: Request, res: Response) {
    const { id } = req.params;
    const { userId } = req.query;
    service.delete(Number(id), Number(userId));
    res.status(204).send();
  }
}
