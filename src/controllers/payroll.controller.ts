import { Request, Response } from 'express';
import { PayrollService } from '../services/payroll.service';
import { calculateNetSalarySchema } from '../validators/payroll.validator';

const service = new PayrollService();

export class PayrollController {
  static calculateNetSalary(req: Request, res: Response) {
    const { body } = calculateNetSalarySchema.parse({ body: req.body });
    res.json(service.calculateNetSalary(body));
  }
}
