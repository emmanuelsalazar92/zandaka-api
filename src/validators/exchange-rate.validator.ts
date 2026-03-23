import { z } from 'zod';

const daySchema = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number);
const monthSchema = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number);
const yearSchema = z
  .string()
  .regex(/^\d{4}$/)
  .transform(Number);

export const getExchangeRateSchema = z.object({
  params: z.object({
    day: daySchema,
    month: monthSchema,
    year: yearSchema,
  }),
});
