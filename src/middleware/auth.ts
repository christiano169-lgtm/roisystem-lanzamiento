import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { verifyAuthToken } from '../modules/auth/jwt.js';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
  }
  try {
    req.auth = verifyAuthToken(header.slice('Bearer '.length));
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: `Requires role: ${roles.join(' or ')}` });
    }
    return next();
  };
}

/** Cross-tenant access (see src/modules/platform/*) — independent of `role`, which stays scoped to one tenant. */
export function requirePlatformAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.auth) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (!req.auth.isPlatformAdmin) {
    return res.status(403).json({ error: 'Requires platform admin' });
  }
  return next();
}
