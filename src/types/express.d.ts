import type { AuthTokenPayload } from '../modules/auth/jwt.js';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthTokenPayload;
    }
  }
}

export {};
