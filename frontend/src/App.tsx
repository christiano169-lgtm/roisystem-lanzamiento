import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Login from './routes/Login';
import Register from './routes/Register';
import AppLayout from './routes/AppLayout';
import Dashboard from './routes/Dashboard';
import Settings from './routes/Settings';
import Payments from './routes/Payments';
import Overview from './routes/Overview';
import CrmBoard from './routes/CrmBoard';
import Setters from './routes/lanzamiento/Setters';
import VentasHotmart from './routes/lanzamiento/VentasHotmart';
import Bandeja from './routes/Bandeja';
import MyPanel from './routes/MyPanel';
import Documentacion from './routes/Documentacion';
import Embudo from './routes/Embudo';
import Adquisicion from './routes/Adquisicion';
import Platform from './routes/Platform';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

function RequirePlatformAdmin({ children }: { children: React.ReactElement }) {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!user?.isPlatformAdmin) return <Navigate to="/app" replace />;
  return children;
}

export default function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/register" element={isAuthenticated ? <Navigate to="/app" replace /> : <Register />} />
      <Route
        path="/app"
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="overview" element={<Overview />} />
        <Route path="crm" element={<CrmBoard />} />
        <Route path="ventas-hotmart" element={<VentasHotmart />} />
        <Route path="setters" element={<Setters />} />
        <Route path="bandeja" element={<Bandeja />} />
        <Route path="me" element={<MyPanel />} />
        <Route path="docs" element={<Documentacion />} />
        <Route path="embudo" element={<Embudo />} />
        <Route path="adquisicion" element={<Adquisicion />} />
        <Route path="payments" element={<Payments />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route
        path="/platform"
        element={
          <RequirePlatformAdmin>
            <Platform />
          </RequirePlatformAdmin>
        }
      />
      <Route path="*" element={<Navigate to={isAuthenticated ? '/app' : '/login'} replace />} />
    </Routes>
  );
}
