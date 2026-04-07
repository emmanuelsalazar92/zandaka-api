import { Request, Response } from 'express';
import { BudgetService } from '../services/budget.service';
import {
  copyBudgetSchema,
  createBudgetSchema,
  deleteBudgetSchema,
  finalizeBudgetSchema,
  fundBudgetSchema,
  getBudgetSchema,
  getFundingPlanSchema,
  historyBudgetsSchema,
  listBudgetsSchema,
  replaceBudgetLinesSchema,
  saveFundingPlanSchema,
} from '../validators/budget.validator';

const service = new BudgetService();

export class BudgetController {
  static create(req: Request, res: Response) {
    const { body } = createBudgetSchema.parse({ body: req.body });
    const result = service.create(body);
    res.status(201).json(result);
  }

  static list(req: Request, res: Response) {
    const { query } = listBudgetsSchema.parse({ query: req.query });
    res.json(service.list(query));
  }

  static history(req: Request, res: Response) {
    const { query } = historyBudgetsSchema.parse({ query: req.query });
    if (query.fromMonth && query.toMonth && query.fromMonth > query.toMonth) {
      throw {
        code: 'VALIDATION_ERROR',
        message: 'Invalid month range.',
        details: [{ field: 'fromMonth', detail: 'fromMonth must be less than or equal to toMonth.' }],
      };
    }

    res.json(service.history(query));
  }

  static getById(req: Request, res: Response) {
    const parsed = getBudgetSchema.parse({ params: req.params, query: req.query });
    res.json(service.getById(parsed.params.id, parsed.query.userId));
  }

  static getLines(req: Request, res: Response) {
    const parsed = getBudgetSchema.parse({ params: req.params, query: req.query });
    res.json(service.getLines(parsed.params.id, parsed.query.userId));
  }

  static validate(req: Request, res: Response) {
    const parsed = getBudgetSchema.parse({ params: req.params, query: req.query });
    res.json(service.validate(parsed.params.id, parsed.query.userId));
  }

  static replaceLines(req: Request, res: Response) {
    const parsed = replaceBudgetLinesSchema.parse({ params: req.params, body: req.body });
    res.json(service.replaceLines(parsed.params.id, parsed.body.userId, parsed.body.lines));
  }

  static finalize(req: Request, res: Response) {
    const parsed = finalizeBudgetSchema.parse({ params: req.params, body: req.body });
    res.json(service.finalize(parsed.params.id, parsed.body.userId));
  }

  static remove(req: Request, res: Response) {
    const parsed = deleteBudgetSchema.parse({ params: req.params, query: req.query });
    res.json(service.remove(parsed.params.id, parsed.query.userId));
  }

  static copyFromPrevious(req: Request, res: Response) {
    const parsed = copyBudgetSchema.parse({ params: req.params, body: req.body });
    res.json(
      service.copyFromPrevious(parsed.params.id, parsed.body.userId, parsed.body.sourceBudgetId),
    );
  }

  static getFundingOptions(req: Request, res: Response) {
    const parsed = getBudgetSchema.parse({ params: req.params, query: req.query });
    res.json(service.getFundingOptions(parsed.params.id, parsed.query.userId));
  }

  static saveFundingPlan(req: Request, res: Response) {
    const parsed = saveFundingPlanSchema.parse({ params: req.params, body: req.body });
    res.json(
      service.saveFundingPlan(parsed.params.id, parsed.body.userId, {
        sourceAccountId: parsed.body.sourceAccountId,
        lines: parsed.body.lines,
      }),
    );
  }

  static getFundingPlan(req: Request, res: Response) {
    const parsed = getFundingPlanSchema.parse({ params: req.params, query: req.query });
    res.json(service.getFundingPlan(parsed.params.id, parsed.query.userId));
  }

  static fund(req: Request, res: Response) {
    const parsed = fundBudgetSchema.parse({ params: req.params, body: req.body });
    res.json(service.fund(parsed.params.id, parsed.body.userId, parsed.body.description));
  }
}
