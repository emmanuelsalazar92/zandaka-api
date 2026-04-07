import { z } from 'zod';

const numberFromPath = z.string().regex(/^\d+$/).transform(Number);

export const getUserSchema = z.object({
  params: z.object({
    id: numberFromPath,
  }),
});

export const updateUserSchema = z.object({
  params: z.object({
    id: numberFromPath,
  }),
  body: z
    .object({
      name: z.string().trim().min(1).max(255).optional(),
      baseCurrency: z.string().trim().length(3).optional(),
    })
    .refine((value) => value.name !== undefined || value.baseCurrency !== undefined, {
      message: 'Provide at least one field to update.',
      path: ['general'],
    }),
});
