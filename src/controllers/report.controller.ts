import { Request, Response } from 'express';
import { ReportService } from '../services/report.service';

const service = new ReportService();

export class ReportController {
  static getAccountBalances(req: Request, res: Response) {
    const balances = service.getAccountBalances();
    res.json(balances);
  }

  static getEnvelopeBalances(req: Request, res: Response) {
    const { accountId } = req.query;
    if (!accountId) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'accountId query parameter is required',
        },
      });
    }
    const balances = service.getEnvelopeBalances(Number(accountId));
    res.json(balances);
  }

  static getNegativeEnvelopes(req: Request, res: Response) {
    const envelopes = service.getNegativeEnvelopes();
    res.json(envelopes);
  }

  static getMonthlyExpenses(req: Request, res: Response) {
    const { month } = req.query;
    if (!month) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'month query parameter is required (YYYY-MM format)',
        },
      });
    }
    const expenses = service.getMonthlyExpenses(month as string);
    res.json(expenses);
  }

  static getCategoryTotals(req: Request, res: Response) {
    const totals = service.getCategoryTotals();
    res.json(totals);
  }

  static getInconsistencies(req: Request, res: Response) {
    const { accountId } = req.query;
    const inconsistencies = service.getInconsistencies(
      accountId ? Number(accountId) : undefined
    );
    res.json(inconsistencies);
  }
}

