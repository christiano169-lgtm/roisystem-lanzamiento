import { useState } from 'react';

interface Block {
  title: string;
  body: string;
  code?: string;
}

const DOCS: Record<string, { title: string; intro: string; blocks: Block[] }> = {
  conexion: {
    title: 'Conectar con GoHighLevel',
    intro:
      'ROISystem lee y escribe en tu subcuenta de GHL por API usando un Private Integration Token (PIT) — no una app de Marketplace. Cada subcuenta se conecta por separado, con su propio token.',
    blocks: [
      {
        title: '1 · Genera el token en GHL',
        body: 'Dentro de la subcuenta: Settings → Private Integrations → Create. Dale permisos de lectura/escritura sobre contactos, oportunidades, calendarios/citas y conversaciones.',
        code: 'Settings → Private Integrations → Create',
      },
      {
        title: '2 · Conéctalo en ROISystem',
        body: 'En el selector de subcuentas de la barra lateral, "+ Agregar subcuenta" → pega el nombre, el ID de la Location y el token.',
        code: 'POST /api/locations',
      },
      {
        title: '3 · Primera sincronización',
        body: 'Al conectar, se encola una sincronización inicial de contactos, oportunidades, llamadas y citas. Puedes forzar una nueva desde el aviso amarillo si algo cambia.',
        code: 'POST /api/locations/:id/sync',
      },
      {
        title: '4 · Tiempo real (opcional)',
        body: 'Sin una app de Marketplace no hay webhooks nativos de GHL. Si quieres eventos casi en vivo, crea un Workflow en GHL con una acción "Webhook" apuntando a tu backend — la sincronización periódica sigue siendo la vía confiable.',
      },
    ],
  },
  metricas: {
    title: 'Definición de métricas',
    intro: 'Cada número del dashboard se calcula sobre datos crudos sincronizados desde GHL, sin fórmulas ocultas.',
    blocks: [
      { title: 'Tasa de contestación', body: 'Llamadas contestadas / llamadas realizadas en el rango de fechas.', code: 'answered / total_calls' },
      { title: 'Tiempo al lead', body: 'Minutos entre la creación del contacto y el primer intento de contacto registrado.' },
      { title: 'Efectivo cobrado', body: 'Suma de los pagos registrados manualmente en Pagos contra una oportunidad.', code: 'sum(payments.amount)' },
      { title: 'Objeciones', body: 'La IA clasifica cada llamada/videollamada/chat analizado en una categoría fija: precio, tiempo, competencia, confianza, necesidad u otro.' },
    ],
  },
  calidad: {
    title: 'Análisis de calidad con IA',
    intro: 'Con tu propia clave de OpenAI (Configuración → Clave de OpenAI), cada llamada/videollamada/chat con transcripción se analiza automáticamente.',
    blocks: [
      { title: 'Qué evalúa', body: 'Interés del lead (0-100%), calidad de ejecución del asesor (0-10), objeciones detectadas, resumen y aspectos de mejora.' },
      { title: 'Personalización', body: 'En Configuración → Control del sistema puedes agregar contexto de tu empresa e instrucciones de evaluación propias — se inyectan en el prompt de todos los análisis futuros.' },
      { title: 'Escritura a GHL (opcional)', body: 'Si activas "Escritura automática a GHL", cada análisis agrega etiquetas de interés/objeción y una nota con el resumen al contacto en GHL.' },
    ],
  },
  permisos: {
    title: 'Roles y permisos',
    intro: 'Cada usuario del dashboard tiene un rol dentro de su agencia.',
    blocks: [
      { title: 'Administrador', body: 'Acceso total: conectar subcuentas, configurar IA, mover pipeline, gestionar equipo.' },
      { title: 'Manager comercial', body: 'Puede registrar pagos, mover oportunidades en el CRM y asignar leads en Bandeja, pero no toca la configuración de IA/integraciones.' },
      { title: 'Asesor', body: 'Vista de solo lectura de los reportes, más su propio panel personal ("Mi panel") con sus leads y metas.' },
    ],
  },
};

const TABS = [
  { id: 'conexion', label: 'Conectar GHL' },
  { id: 'metricas', label: 'Métricas' },
  { id: 'calidad', label: 'Calidad con IA' },
  { id: 'permisos', label: 'Roles y permisos' },
];

export default function Documentacion() {
  const [tab, setTab] = useState('conexion');
  const doc = DOCS[tab]!;

  return (
    <div className="roi-in flex gap-4">
      <div className="flex w-[260px] shrink-0 flex-col gap-1 rounded-[7px] border border-border bg-panel p-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3.5 py-3 text-left text-[13px] font-semibold ${
              tab === t.id ? 'bg-accent/10 text-accent' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-5 rounded-lg border border-border bg-panel p-8">
        <h2 className="text-[19px] font-bold tracking-tight">{doc.title}</h2>
        <p className="text-[13.5px] leading-relaxed text-gray-400">{doc.intro}</p>
        <div className="roi-stagger flex flex-col gap-3">
          {doc.blocks.map((b, i) => (
            <div key={i} className="rounded-md border border-border2 bg-card p-[18px]">
              <span className="text-[13.5px] font-bold text-accent">{b.title}</span>
              <p className="mt-1 text-[13px] leading-relaxed text-gray-300">{b.body}</p>
              {b.code && <span className="mt-2 block font-mono text-[11.5px] text-gray-500">{b.code}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
