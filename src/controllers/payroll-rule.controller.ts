import { Request, Response } from 'express';
import { PayrollRuleService } from '../services/payroll-rule.service';
import {
  createPayrollCcssRuleSchema,
  createPayrollIncomeTaxRuleSchema,
  deactivatePayrollRuleSchema,
  getActivePayrollRuleSchema,
  getPayrollRuleByIdSchema,
  listPayrollRuleHistorySchema,
  updatePayrollRuleSchema,
} from '../validators/payroll.validator';

const service = new PayrollRuleService();

export class PayrollRuleController {
  static getActive(req: Request, res: Response) {
    const { query } = getActivePayrollRuleSchema.parse({ query: req.query });
    res.json(service.getActiveRuleResponse(query));
  }

  static history(req: Request, res: Response) {
    const { query } = listPayrollRuleHistorySchema.parse({ query: req.query });
    res.json(service.listHistory(query));
  }

  static getById(req: Request, res: Response) {
    const parsed = getPayrollRuleByIdSchema.parse({ params: req.params, query: req.query });
    res.json(service.getById(parsed.params.id, parsed.query.user_id));
  }

  static createCcss(req: Request, res: Response) {
    const { body } = createPayrollCcssRuleSchema.parse({ body: req.body });
    res.status(201).json(service.createCcss(body));
  }

  static createIncomeTax(req: Request, res: Response) {
    const { body } = createPayrollIncomeTaxRuleSchema.parse({ body: req.body });
    res.status(201).json(service.createIncomeTax(body));
  }

  static update(req: Request, res: Response) {
    const parsed = updatePayrollRuleSchema.parse({ params: req.params, body: req.body });
    res.json(service.update(parsed.params.id, parsed.body));
  }

  static deactivate(req: Request, res: Response) {
    const parsed = deactivatePayrollRuleSchema.parse({ params: req.params, query: req.query });
    res.json(service.deactivate(parsed.params.id, parsed.query.user_id));
  }
}
