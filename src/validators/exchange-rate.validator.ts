import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const numberFromQuery = (value: unknown) => {
  if (typeof value === 'string' && value.trim() !== '') {
    return Number(value);
  }
  return value;
};

const idFromPath = z.string().regex(/^\d+$/).transform(Number);
const currencyCode = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

const dateString = z
  .string()
  .regex(dateRegex)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Invalid date format');

const positiveRate = z.number().positive();

export const getExchangeRateSchema = z.object({
  params: z.object({
    day: z
      .string()
      .regex(/^\d{1,2}$/)
      .transform(Number),
    month: z
      .string()
      .regex(/^\d{1,2}$/)
      .transform(Number),
    year: z
      .string()
      .regex(/^\d{4}$/)
      .transform(Number),
  }),
});

export const listStoredExchangeRatesSchema = z.object({
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
    fromCurrency: currencyCode.optional(),
    toCurrency: currencyCode.optional(),
    effectiveDate: dateString.optional(),
  }),
});

export const getStoredExchangeRateSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});

export const createStoredExchangeRateSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    fromCurrency: currencyCode,
    toCurrency: currencyCode,
    rate: positiveRate,
    effectiveDate: dateString,
  }),
});

export const updateStoredExchangeRateSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  body: z
    .object({
      userId: z.number().int().positive(),
      fromCurrency: currencyCode.optional(),
      toCurrency: currencyCode.optional(),
      rate: positiveRate.optional(),
      effectiveDate: dateString.optional(),
    })
    .refine(
      (value) =>
        value.fromCurrency !== undefined ||
        value.toCurrency !== undefined ||
        value.rate !== undefined ||
        value.effectiveDate !== undefined,
      {
        message: 'Provide at least one field to update.',
        path: ['general'],
      },
    ),
});

export const deleteStoredExchangeRateSchema = z.object({
  params: z.object({
    id: idFromPath,
  }),
  query: z.object({
    userId: z.preprocess(numberFromQuery, z.number().int().positive()),
  }),
});
