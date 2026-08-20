import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AuthError } from '../modules/auth/service.js';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation error', details: err.flatten() });
  }
  if (err instanceof AuthError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof Error && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
    return res.status((err as { status: number }).status).json({ error: err.message });
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  return res.status(500).json({ error: 'Internal server error' });
}
