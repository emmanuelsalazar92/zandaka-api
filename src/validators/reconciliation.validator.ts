import { z } from 'zod';

const reconciliationCountMethodSchema = z.enum(['MANUAL_TOTAL', 'DENOMINATION_COUNT']);
const denominationTypeSchema = z.enum(['BILL', 'COIN']);

const reconciliationLineSchema = z
  .object({
    denominationId: z.number().int().positive().optional(),
    denominationValue: z.number().positive().optional(),
    denominationType: denominationTypeSchema.optional(),
    denominationLabel: z.string().trim().max(50).nullable().optional(),
    quantity: z.number().int().min(0),
    sortOrder: z.number().int().min(0).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.denominationId !== undefined) {
      return;
    }

    if (value.denominationValue === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['denominationValue'],
        message: 'denominationValue is required when denominationId is not provided',
      });
    }

    if (value.denominationType === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['denominationType'],
        message: 'denominationType is required when denominationId is not provided',
      });
    }
  });

export const createReconciliationSchema = z.object({
  body: z
    .object({
      accountId: z.number().int().positive(),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      countMethod: reconciliationCountMethodSchema.optional(),
      realBalance: z.number().finite().optional(),
      countedTotal: z.number().finite().optional(),
      note: z.string().max(1000).optional(),
      notes: z.string().max(1000).optional(),
      lines: z.array(reconciliationLineSchema).optional(),
    })
    .superRefine((value, ctx) => {
      const countMethod =
        value.countMethod ?? (Array.isArray(value.lines) && value.lines.length > 0
          ? 'DENOMINATION_COUNT'
          : 'MANUAL_TOTAL');

      if (countMethod === 'MANUAL_TOTAL') {
        if (value.realBalance === undefined && value.countedTotal === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['realBalance'],
            message: 'realBalance or countedTotal is required for MANUAL_TOTAL reconciliations',
          });
        }
      }

      if (countMethod === 'DENOMINATION_COUNT' && (!value.lines || value.lines.length === 0)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['lines'],
          message: 'lines are required for DENOMINATION_COUNT reconciliations',
        });
      }
    }),
});

export const getReconciliationsSchema = z.object({
  query: z.object({
    account_id: z.string().regex(/^\d+$/).transform(Number).optional(),
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
    status: z.enum(['OPEN', 'BALANCED', 'IGNORED']).optional(),
    limit: z.string().regex(/^\d+$/).transform(Number).optional(),
    offset: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

export const getReconciliationByIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getActiveReconciliationSchema = z.object({
  params: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getCashDenominationsForAccountSchema = z.object({
  params: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getExpectedTotalForAccountSchema = z.object({
  params: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
  query: z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
});

export const updateReconciliationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z
    .object({
      note: z.string().max(1000).nullable(),
    })
    .strict(),
});

export const getReconciliationSummarySchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const ignoreReconciliationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});
