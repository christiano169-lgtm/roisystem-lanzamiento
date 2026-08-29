import { Router } from 'express';
import { z } from 'zod';
import { AuthError, login, registerFirstAdmin } from './service.js';

export const authRouter = Router();

const registerSchema = z.object({
  tenantName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

// Only ever succeeds once (see registerFirstAdmin) — after the first user
// exists, new tenants are created by a platform admin via POST /api/platform/tenants.
authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    const result = await registerFirstAdmin(input);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// `identifier` accepts either an email or a username (see User.username /
// auth/service.ts login()) — kept as one free-text field rather than two,
// since the client doesn't know in advance which kind was typed.
const loginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const result = await login(input);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Re-export so route-level errors keep a stable shape via the central handler.
export { AuthError };
