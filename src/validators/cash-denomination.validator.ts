import { z } from 'zod';

const cashDenominationTypeSchema = z.enum(['BILL', 'COIN']);

const userIdQuerySchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return '1';
    return value;
  },
  z.string().regex(/^\d+$/).transform(Number),
);

const cashDenominationBodySchema = z
  .object({
    userId: z.number().int().positive(),
    currency: z.string().trim().min(1).max(10).transform((value) => value.toUpperCase()),
    value: z.number().positive(),
    type: cashDenominationTypeSchema,
    label: z.string().trim().max(50).nullable().optional(),
    sortOrder: z.number().int().min(0).optional().default(0),
    isActive: z.boolean().optional().default(true),
  })
  .strict();

export const listCashDenominationsSchema = z.object({
  query: z.object({
    userId: userIdQuerySchema,
    currency: z
      .string()
      .trim()
      .min(1)
      .max(10)
      .transform((value) => value.toUpperCase())
      .optional(),
    includeInactive: z
      .enum(['true', 'false'])
      .optional()
      .transform((value) => value === 'true'),
  }),
});

export const createCashDenominationSchema = z.object({
  body: cashDenominationBodySchema,
});

export const updateCashDenominationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: cashDenominationBodySchema,
});

export const deactivateCashDenominationSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  query: z.object({
    userId: userIdQuerySchema,
  }),
});
