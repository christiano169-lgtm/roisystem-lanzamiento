import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/app');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: 'radial-gradient(1200px 700px at 50% 40%, #0f1724 0%, #070a11 60%, #08080a 100%)' }}
    >
      <form
        onSubmit={handleSubmit}
        className="roi-pop flex w-full max-w-[520px] flex-col items-center gap-2 rounded-lg border border-[#1b2230] bg-[#0c111a] px-11 py-10"
      >
        <div className="mb-3 flex h-[66px] w-[66px] items-center justify-center rounded-lg bg-[#f4f7fb]">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2.2" strokeLinecap="round">
            <path d="M4 17l5-5 3.5 3.5L20 7" />
            <path d="M20 12V7h-5" />
          </svg>
        </div>
        <h1 className="text-[24.5px] font-bold tracking-tight">Iniciar Sesión</h1>
        <p className="mb-4 text-[13px] text-gray-500">Ingresa tus credenciales para acceder al dashboard</p>

        <div className="mb-3 w-full">
          <label className="mb-2 block text-[13px] font-semibold">Correo o usuario</label>
          <input
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="tu@email.com o tu usuario"
            className="w-full rounded-md border border-[#202a3a] bg-[#111825] px-[17px] py-[15px] text-[13px] outline-none focus:border-[#1d4ed8]"
          />
        </div>

        <div className="mb-4 w-full">
          <label className="mb-2 block text-[13px] font-semibold">Contraseña</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-[#202a3a] bg-[#111825] px-[17px] py-[15px] text-[13px] outline-none focus:border-[#1d4ed8]"
          />
        </div>

        {error && <p className="mb-2 w-full text-[13px] text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[#1d4ed8] py-4 text-center text-[13.5px] font-bold text-white hover:bg-[#2563eb] disabled:opacity-60"
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        <p className="mt-4 text-center text-[13px] text-gray-500">¿Eres cliente nuevo? Pide tus credenciales a tu proveedor.</p>
      </form>
    </div>
  );
}
