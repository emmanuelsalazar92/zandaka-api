import { z } from 'zod';

export const createAccountSchema = z.object({
  body: z.object({
    userId: z.number().int().positive(),
    institutionId: z.number().int().positive(),
    name: z.string().min(1).max(255),
    currency: z.string().length(3), // ISO currency code
    allowOverdraft: z.boolean().optional().default(false),
  }),
});

export const updateAccountSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
  body: z.object({
    name: z.string().min(1).max(255).optional(),
  }),
});

export const deactivateAccountSchema = z.object({
  params: z.object({
    id: z.string().regex(/^\d+$/).transform(Number),
  }),
});

