import { z } from 'zod';

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const snapshotIdFromPath = z.string().regex(/^\d+$/).transform(Number);

export const listReportSnapshotsSchema = z.object({
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
    includeArchived: z
      .string()
      .regex(/^(true|false|1|0)$/i)
      .optional(),
  }),
});

export const getReportSnapshotSchema = z.object({
  params: z.object({
    id: snapshotIdFromPath,
  }),
});

export const archiveReportSnapshotSchema = z.object({
  params: z.object({
    id: snapshotIdFromPath,
  }),
  body: z.object({
    user_id: z.number().int().positive(),
  }),
});

export const getEnvelopeBalancesSchema = z.object({
  query: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number),
  }),
});

export const getAccountBalancesSchema = z.object({
  query: z.object({
    isActive: z
      .string()
      .regex(/^(true|false|1|0)$/i)
      .optional(),
  }),
});

export const getMonthlyExpensesSchema = z.object({
  query: z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  }),
});

export const getInconsistenciesSchema = z.object({
  query: z.object({
    accountId: z.string().regex(/^\d+$/).transform(Number).optional(),
  }),
});

export const getEnvelopeTotalByCurrencySchema = z.object({
  query: z.object({
    currency: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.toUpperCase()),
  }),
});

export const generateReportSnapshotSchema = z.object({
  body: z.object({
    user_id: z.number().int().positive(),
    report_month: z.string().regex(/^\d{4}-\d{2}$/),
    base_currency: z.enum(['CRC', 'USD']).optional(),
    exchange_rate_id: z.number().int().positive().optional(),
    usd_to_crc_rate: z.number().positive().optional(),
    ccss_rule_set_id: z.number().int().positive().optional(),
    income_tax_rule_set_id: z.number().int().positive().optional(),
    notes: z.string().trim().optional(),
  }),
});

export const getReportSnapshotPdfSchema = z.object({
  params: z.object({
    id: snapshotIdFromPath,
  }),
  query: z.object({
    disposition: z.enum(['inline', 'attachment']).optional(),
  }),
});
