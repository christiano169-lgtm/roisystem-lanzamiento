import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiPost } from './api';
import { isDemoMode } from './demoFixtures';

export type UserRole = 'admin' | 'manager' | 'asesor';

export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  tenantId: string;
  isPlatformAdmin: boolean;
  allowedPages: string[];
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

// POST /auth/register (src/modules/auth/service.ts registerFirstAdmin, only
// ever succeeds once) returns tenant + user separately — user.tenantId isn't
// echoed directly.
interface RegisterResponse {
  token: string;
  tenant: { id: string; name: string };
  user: { id: string; email: string; role: UserRole; isPlatformAdmin: boolean; allowedPages: string[] };
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (tenantName: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'roisystem_token';
const USER_KEY = 'roisystem_user';

const DEMO_USER: AuthUser = {
  id: 'demo-user',
  email: 'demo@roisystem.app',
  role: 'admin',
  tenantId: 'demo-tenant',
  isPlatformAdmin: false,
  allowedPages: [],
};

function loadStoredUser(): AuthUser | null {
  if (isDemoMode()) return DEMO_USER;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function persist(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<LoginResponse>('/auth/login', { email, password });
    persist(res.token, res.user);
    setUser(res.user);
  }, []);

  const register = useCallback(async (tenantName: string, email: string, password: string) => {
    const res = await apiPost<RegisterResponse>('/auth/register', { tenantName, email, password });
    const authUser: AuthUser = { ...res.user, tenantId: res.tenant.id };
    persist(res.token, authUser);
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    // Nothing to log out of in demo mode — there's no real session, and
    // clearing `user` would strand the visitor on a login screen that
    // can't actually authenticate against fixture data.
    if (isDemoMode()) return;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isAuthenticated: !!user, login, register, logout }),
    [user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
