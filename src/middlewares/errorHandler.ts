import { Request, Response, NextFunction } from 'express';
import { ErrorResponse } from '../types';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // If response already sent, delegate to default handler
  if (res.headersSent) {
    return next(err);
  }

  // Handle known error types
  if (err.code) {
    const statusMap: Record<string, number> = {
      VALIDATION_ERROR: 400,
      NOT_FOUND: 404,
      CONFLICT: 409,
      INACTIVE_RESOURCE: 409,
      INTERNAL_ERROR: 500,
    };

    const status = statusMap[err.code] || 500;
    const response: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message || 'An error occurred',
        details: err.details || [],
      },
    };

    return res.status(status).json(response);
  }

  // Unknown error
  console.error('Unhandled error:', err);
  const response: ErrorResponse = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An internal error occurred',
      details: [],
    },
  };

  return res.status(500).json(response);
}

