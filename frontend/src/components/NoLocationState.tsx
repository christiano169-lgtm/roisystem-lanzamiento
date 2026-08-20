import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

/** Shown instead of a page's real content when no GHL subcuenta is connected/selected yet — every /app page renders its shell regardless (see AppLayout's OutletContext comment), this fills the data area. */
export default function NoLocationState() {
  const { user } = useAuth();

  return (
    <div className="roi-in mx-auto mt-10 max-w-md rounded-lg border border-border2 bg-panel p-8 text-center">
      <h2 className="mb-2 text-base font-semibold">Sin subcuenta conectada</h2>
      <p className="mb-5 text-[13px] text-gray-400">
        Esta pantalla necesita una subcuenta de GHL conectada para mostrar datos reales.
      </p>
      {user?.role === 'admin' ? (
        <Link to="/app/settings" className="rounded-md bg-gradient-to-r from-sky-500 to-accent px-4 py-2 text-sm font-bold text-[#04212b]">
          Conectar en Configuración
        </Link>
      ) : (
        <span className="text-[12px] text-gray-500">Pide a un admin de tu agencia que la conecte.</span>
      )}
    </div>
  );
}
