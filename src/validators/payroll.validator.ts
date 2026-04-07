import { z } from 'zod';

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid date value');

const positiveIntFromQuery = z.preprocess(numberFromQuery, z.number().int().positive());
const ruleSetIdParam = z.object({
  id: z.preprocess(numberFromQuery, z.number().int().positive()),
});
const ruleTypeSchema = z.enum(['CCSS_WORKER', 'INCOME_TAX']);
const countryCodeSchema = z
  .string()
  .trim()
  .length(2)
  .transform((value) => value.toUpperCase());

const ccssDetailSchema = z.object({
  employee_rate: z.number().min(0).max(1),
  employer_rate: z.number().min(0).max(1).nullable(),
  base_type: z.string().trim().min(1).default('GROSS_SALARY'),
});

const incomeTaxBracketSchema = z.object({
  range_order: z.number().int().positive(),
  amount_from: z.number().min(0),
  amount_to: z.number().min(0).nullable(),
  tax_rate: z.number().min(0).max(1),
  is_exempt: z.union([z.literal(0), z.literal(1)]),
});

const incomeTaxBracketsSchema = z
  .array(incomeTaxBracketSchema)
  .min(1)
  .superRefine((brackets, ctx) => {
    const orders = new Set<number>();
    let openEndedCount = 0;

    brackets.forEach((bracket, index) => {
      if (orders.has(bracket.range_order)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'range_order'],
          message: 'range_order values must be unique',
        });
      }
      orders.add(bracket.range_order);

      if (bracket.amount_to !== null && bracket.amount_to <= bracket.amount_from) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'amount_to'],
          message: 'amount_to must be greater than amount_from',
        });
      }

      if (bracket.is_exempt === 1 && bracket.tax_rate !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'tax_rate'],
          message: 'Exempt brackets must use tax_rate = 0',
        });
      }

      if (bracket.amount_to === null) {
        openEndedCount += 1;
      }
    });

    if (openEndedCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['brackets'],
        message: 'Only one bracket can have amount_to = null',
      });
    }
  });

export const getActivePayrollRuleSchema = z.object({
  query: z.object({
    user_id: positiveIntFromQuery,
    type: ruleTypeSchema,
    date: isoDateString,
  }),
});

export const listPayrollRuleHistorySchema = z.object({
  query: z.object({
    user_id: positiveIntFromQuery,
    type: ruleTypeSchema.optional(),
  }),
});

export const getPayrollRuleByIdSchema = z.object({
  params: ruleSetIdParam,
  query: z.object({
    user_id: positiveIntFromQuery,
  }),
});

export const createPayrollCcssRuleSchema = z.object({
  body: z.object({
    user_id: z.number().int().positive(),
    country_code: countryCodeSchema.optional(),
    name: z.string().trim().min(1).max(120),
    effective_from: isoDateString,
    effective_to: isoDateString.nullable(),
    is_active: z.boolean().optional(),
    employee_rate: ccssDetailSchema.shape.employee_rate,
    employer_rate: ccssDetailSchema.shape.employer_rate,
    base_type: ccssDetailSchema.shape.base_type,
  }),
});

export const createPayrollIncomeTaxRuleSchema = z.object({
  body: z.object({
    user_id: z.number().int().positive(),
    country_code: countryCodeSchema.optional(),
    name: z.string().trim().min(1).max(120),
    effective_from: isoDateString,
    effective_to: isoDateString.nullable(),
    is_active: z.boolean().optional(),
    brackets: incomeTaxBracketsSchema,
  }),
});

export const updatePayrollRuleSchema = z.object({
  params: ruleSetIdParam,
  body: z.object({
    user_id: z.number().int().positive(),
    country_code: countryCodeSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    effective_from: isoDateString.optional(),
    effective_to: isoDateString.nullable().optional(),
    is_active: z.boolean().optional(),
    employee_rate: ccssDetailSchema.shape.employee_rate.optional(),
    employer_rate: ccssDetailSchema.shape.employer_rate.optional(),
    base_type: ccssDetailSchema.shape.base_type.optional(),
    brackets: incomeTaxBracketsSchema.optional(),
  }),
});

export const deactivatePayrollRuleSchema = z.object({
  params: ruleSetIdParam,
  query: z.object({
    user_id: positiveIntFromQuery,
  }),
});

export const calculateNetSalarySchema = z.object({
  body: z.object({
    user_id: z.number().int().positive(),
    gross_salary: z.number().positive(),
    period_date: isoDateString,
  }),
});
