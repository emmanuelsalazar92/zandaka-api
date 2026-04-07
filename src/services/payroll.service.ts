import { PayrollNetSalaryCalculationResponse } from '../types';
import { calculateNetSalary } from '../utils/payroll.util';
import { PayrollRuleService } from './payroll-rule.service';

export class PayrollService {
  private payrollRuleService = new PayrollRuleService();

  calculateNetSalary(input: {
    user_id: number;
    gross_salary: number;
    period_date: string;
  }): PayrollNetSalaryCalculationResponse {
    const ccssRule = this.payrollRuleService.getActiveRuleSetByDate(
      input.user_id,
      'CCSS_WORKER',
      input.period_date,
    );
    const incomeTaxRule = this.payrollRuleService.getActiveRuleSetByDate(
      input.user_id,
      'INCOME_TAX',
      input.period_date,
    );

    if (!ccssRule.ccss_detail) {
      throw {
        code: 'CONFLICT',
        message: `CCSS rule set ${ccssRule.rule_set.id} is missing its detail record.`,
        details: [
          {
            field: 'ccss_rule_set_id',
            detail: `Rule set ${ccssRule.rule_set.id} has no payroll_ccss_worker_rate row.`,
          },
        ],
      };
    }

    if (incomeTaxRule.income_tax_brackets.length === 0) {
      throw {
        code: 'CONFLICT',
        message: `Income tax rule set ${incomeTaxRule.rule_set.id} has no brackets.`,
        details: [
          {
            field: 'income_tax_rule_set_id',
            detail: `Rule set ${incomeTaxRule.rule_set.id} has no payroll_income_tax_bracket rows.`,
          },
        ],
      };
    }

    const result = calculateNetSalary({
      grossSalary: input.gross_salary,
      ccssWorkerRate: ccssRule.ccss_detail.employee_rate,
      incomeTaxBrackets: incomeTaxRule.income_tax_brackets,
    });

    return {
      gross_salary: input.gross_salary,
      period_date: input.period_date,
      ccss_worker_rate: ccssRule.ccss_detail.employee_rate,
      ccss_worker_amount: result.ccssWorkerAmount,
      taxable_base: result.taxableBase,
      income_tax_amount: result.incomeTaxAmount,
      net_salary: result.netSalary,
      ccss_rule_set_id: ccssRule.rule_set.id,
      income_tax_rule_set_id: incomeTaxRule.rule_set.id,
      tax_breakdown: result.taxBreakdown
        .filter((line) => line.taxableAmount > 0)
        .map((line) => ({
          range_order: line.rangeOrder,
          taxable_amount: line.taxableAmount,
          tax_rate: line.taxRate,
          tax_amount: line.taxAmount,
        })),
    };
  }
}
