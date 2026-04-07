import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ErrorResponse } from '../types';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        const response: ErrorResponse = {
          message: 'Validation failed',
          errors: details.map((detail) => ({
            field: detail.path || 'general',
            detail: detail.message,
          })),
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details,
          },
        };
        return res.status(400).json(response);
      }
      next(error);
    }
  };
}
