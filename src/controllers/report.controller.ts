import { NextFunction, Request, Response } from 'express';
import { ReportService } from '../services/report.service';

const service = new ReportService();

export class ReportController {
  static listSnapshots(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = Number(req.query.userId);
      const includeArchived =
        typeof req.query.includeArchived === 'string'
          ? req.query.includeArchived === 'true' || req.query.includeArchived === '1'
          : false;
      const snapshots = service.listSnapshots(userId, includeArchived);
      res.json(snapshots);
    } catch (error) {
      next(error);
    }
  }

  static getSnapshotById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const snapshot = service.getSnapshotById(Number(id));
      res.json(snapshot);
    } catch (error) {
      next(error);
    }
  }

  static archiveSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const snapshot = service.archiveSnapshot(Number(req.params.id), req.body.user_id);
      res.json({
        message: 'Report snapshot archived successfully',
        data: snapshot,
      });
    } catch (error) {
      next(error);
    }
  }

  static getAccountBalances(req: Request, res: Response) {
    const { isActive } = req.query;
    const activeFilter =
      typeof isActive === 'string' ? isActive === 'true' || isActive === '1' : undefined;
    const balances = service.getAccountBalances(activeFilter);
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

  static getEnvelopeTotalByCurrency(req: Request, res: Response) {
    const { currency } = req.query;
    if (!currency || typeof currency !== 'string') {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'currency query parameter is required',
        },
      });
    }

    const total = service.getEnvelopeTotalByCurrency(currency);
    res.json(total);
  }

  static getInconsistencies(req: Request, res: Response) {
    const { accountId } = req.query;
    const inconsistencies = service.getInconsistencies(accountId ? Number(accountId) : undefined);
    res.json(inconsistencies);
  }

  static getActiveAccountInconsistencies(req: Request, res: Response) {
    const inconsistencies = service.getActiveAccountInconsistencies();
    res.json(inconsistencies);
  }

  static async generateSnapshot(req: Request, res: Response, next: NextFunction) {
    try {
      const snapshot = await service.generateSnapshot(req.body);
      res.status(201).json({
        message: 'Report snapshot generated successfully',
        data: snapshot,
      });
    } catch (error) {
      next(error);
    }
  }

  static async downloadSnapshotPdf(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const disposition = req.query.disposition === 'inline' ? 'inline' : 'attachment';
      const result = await service.generateSnapshotPdf(Number(id));
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', disposition + '; filename="' + result.fileName + '"');
      res.status(200).send(result.pdf);
    } catch (error) {
      next(error);
    }
  }
}
