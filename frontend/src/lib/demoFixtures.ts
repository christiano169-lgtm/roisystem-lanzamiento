/**
 * Demo mode (VITE_DEMO_MODE=true) — a purely visual build with no login and
 * no connection to any real backend, for showing the product's design
 * without exposing a real client's data. `apiFetch` in api.ts routes every
 * call through here instead of hitting the network when this is on.
 *
 * All data below is fictitious. Shapes are hand-matched to each page's own
 * TS interface (see the route files) rather than the backend's real
 * response types, so this file can drift from the backend without breaking
 * anything real — it only ever feeds the demo build.
 */

export function isDemoMode(): boolean {
  return import.meta.env.VITE_DEMO_MODE === 'true';
}

const LOCATION_ID = 'demo-location';
const LAUNCH_ID = 'demo-launch-sep';

const NAMES = ['Ana Torres', 'Carlos Ruiz', 'María Gómez', 'Luis Fernández'];
const OWNER_IDS = NAMES.map((_, i) => `demo-owner-${i + 1}`);

function iso(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString();
}

function seedRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h / 4294967295;
}

const DEMO_LOCATION = {
  id: LOCATION_ID,
  tenantId: 'demo-tenant',
  ghlLocationId: 'demo-ghl-location',
  name: 'Escuela Digital Pro',
  businessLine: 'lanzamiento',
  syncStatus: 'synced',
  lastSyncedAt: iso(0),
};

const DEMO_LAUNCH = { id: LAUNCH_ID, name: 'Lanzamiento Septiembre 2026', startDate: iso(-10), endDate: iso(20), status: 'active' as const };
const PAST_LAUNCHES = [
  { id: 'demo-launch-jul', name: 'Lanzamiento Julio 2026', startDate: iso(-70), endDate: iso(-40), status: 'closed' as const },
  { id: 'demo-launch-may', name: 'Lanzamiento Mayo 2026', startDate: iso(-130), endDate: iso(-100), status: 'closed' as const },
];

const DEMO_PHASES = [
  { id: 'demo-phase-1', label: 'Early bird', startDate: iso(-10), endDate: iso(-4) },
  { id: 'demo-phase-2', label: 'Precio medio', startDate: iso(-3), endDate: iso(6) },
  { id: 'demo-phase-3', label: 'Cierre de carrito', startDate: iso(7), endDate: iso(9) },
];

const GHL_USERS = NAMES.map((name, i) => ({ ghlUserId: OWNER_IDS[i], name }));

const TAG_NAMES = ['Lead caliente', 'Asistió clase 1', 'Asistió clase 2', 'Objeción precio', 'VIP'];

const CONTACT_FIRST = ['Sofía', 'Mateo', 'Valentina', 'Diego', 'Camila', 'Andrés', 'Isabella', 'Santiago', 'Lucía', 'Emiliano', 'Renata', 'Joaquín'];
const CONTACT_LAST = ['García', 'Rodríguez', 'Martínez', 'López', 'Hernández', 'Pérez', 'Sánchez', 'Ramírez', 'Flores', 'Torres'];
const COUNTRIES = [
  { country: 'US', count: 153 },
  { country: 'MX', count: 61 },
  { country: 'CO', count: 16 },
  { country: 'PE', count: 12 },
  { country: 'EC', count: 10 },
  { country: 'BO', count: 6 },
  { country: 'GT', count: 5 },
  { country: 'PA', count: 4 },
];

function demoContacts(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const r = seedRandom(`contact-${i}`);
    const status: 'atendido' | 'pendiente' | 'sin_conversacion' = r < 0.6 ? 'atendido' : r < 0.85 ? 'pendiente' : 'sin_conversacion';
    const owner = OWNER_IDS[i % OWNER_IDS.length];
    const tags = TAG_NAMES.filter((_, ti) => seedRandom(`tag-${i}-${ti}`) < 0.35);
    const hasOpp = seedRandom(`opp-${i}`) < 0.55;
    return {
      id: `demo-contact-${i}`,
      firstName: CONTACT_FIRST[i % CONTACT_FIRST.length],
      lastName: CONTACT_LAST[(i * 3) % CONTACT_LAST.length],
      email: `lead${i}@ejemplo.com`,
      phone: `+57 3${(100000000 + i * 137).toString().slice(0, 8)}`,
      source: ['Meta Ads', 'Orgánico', 'Referido'][i % 3],
      ownerGhlId: r < 0.9 ? owner : null,
      ghlCreatedAt: iso(-Math.floor(r * 12)),
      conversationStatus: status,
      tags: tags.map((name, ti) => ({ tag: { id: `demo-tag-${ti}`, name } })),
      opportunities: hasOpp
        ? [{ monetaryValue: String(Math.round(200 + r * 800)), pipelineStage: { pipelineName: 'Ventas', stageName: ['Nuevo', 'Contactado', 'Ofertado', 'Ganado'][i % 4] } }]
        : [],
    };
  });
}

const DEMO_CONTACTS = demoContacts(24);

const SALES_KPIS = {
  comprasAprobadas: 214,
  upgradesVip: 58,
  orderBumps: 91,
  leadsGestionados: 1240,
  ticketPromedio: 187,
  ingresoBruto: 61_920,
  netoProductor: 52_450,
  ingresoPorUpgrade: 15_660,
  ingresoPorBumps: 4_368,
  pendientePorCobrar: 3_200,
  reembolsosYDisputas: -1_140,
};

const SALES_VOLUME = Array.from({ length: 10 }, (_, i) => {
  const d = new Date();
  d.setDate(d.getDate() - (9 - i));
  return { date: d.toISOString().slice(0, 10), compras: 12 + Math.round(seedRandom(`vol-c-${i}`) * 20), upgrades: 2 + Math.round(seedRandom(`vol-u-${i}`) * 8), orderBumps: 4 + Math.round(seedRandom(`vol-b-${i}`) * 12) };
});

const SALES_RANKING = NAMES.map((name, i) => {
  const compras = 40 + Math.round(seedRandom(`rank-c-${i}`) * 40);
  const leads = compras * (2 + Math.round(seedRandom(`rank-l-${i}`) * 3));
  return {
    ownerGhlId: OWNER_IDS[i],
    name,
    leads,
    compras,
    upgrades: 8 + Math.round(seedRandom(`rank-u-${i}`) * 15),
    bumps: 12 + Math.round(seedRandom(`rank-b-${i}`) * 20),
    ingresoNeto: compras * 210 + i * 1500,
    conversionPct: Math.round((compras / leads) * 1000) / 10,
  };
});

const STATUS_BREAKDOWN = {
  aprobadas: { plus: 58, general: 156 },
  abandonados: { plus: 22, general: 74 },
  canceladas: { plus: 6, general: 19 },
  ticketsEmitidos: { plus: 11, general: 33 },
  recovery: { total: 165, recuperados: 47, pendientes: 118 },
};

const TRIBES = [
  { tagName: 'tribu-fuego', label: 'Tribu Fuego', count: 89 },
  { tagName: 'tribu-agua', label: 'Tribu Agua', count: 76 },
  { tagName: 'tribu-tierra', label: 'Tribu Tierra', count: 64 },
  { tagName: 'tribu-aire', label: 'Tribu Aire', count: 52 },
];

const SETTERS_SUMMARY = NAMES.map((name, i) => ({
  ownerGhlId: OWNER_IDS[i],
  name,
  assignados: 60 + i * 10,
  atendidos: 48 + i * 8,
  pendientes: 6 + (i % 3) * 3,
  primeraRespuestaMinutosPromedio: 4 + i * 2.3,
  citas: 10 + i * 3,
  calidadIaPromedio: 6.5 + i * 0.4,
}));

const LAUNCH_SUMMARY = {
  launch: DEMO_LAUNCH,
  phases: DEMO_PHASES,
  ventas: {
    ingresos: SALES_KPIS.ingresoBruto,
    efectivoCobrado: 8_900,
    ticketPromedio: SALES_KPIS.ticketPromedio,
    wonCount: SALES_KPIS.comprasAprobadas,
    hotmart: { revenue: SALES_KPIS.ingresoBruto, salesCount: SALES_KPIS.comprasAprobadas, averageTicket: SALES_KPIS.ticketPromedio, byProduct: [] },
  },
  embudoVentas: { cerrada: 214, ofertada: 348, noOfertada: 96 },
  salesKpis: SALES_KPIS,
  salesVolume: SALES_VOLUME,
  salesRanking: SALES_RANKING,
  statusBreakdown: STATUS_BREAKDOWN,
  tribes: TRIBES,
  countries: COUNTRIES,
  funnel: [],
  asistencia: [
    { ruleId: 'a1', label: 'Asistió clase 1', matchType: 'tag', count: 612 },
    { ruleId: 'a2', label: 'Asistió clase 2', matchType: 'tag', count: 498 },
  ],
  setters: SETTERS_SUMMARY.map((s) => ({ ownerGhlId: s.ownerGhlId, atendidos: s.atendidos, primeraRespuestaMinutosPromedio: s.primeraRespuestaMinutosPromedio })),
};

const RENDIMIENTO_ROWS = [DEMO_LAUNCH, ...PAST_LAUNCHES].map((l, i) => ({
  id: l.id,
  name: l.name,
  startDate: l.startDate,
  endDate: l.endDate,
  status: l.status,
  comprasAprobadas: 214 - i * 40,
  ingresoBruto: 61_920 - i * 14_000,
  netoProductor: 52_450 - i * 11_000,
  ticketPromedio: 187 - i * 6,
  leadsGestionados: 1240 - i * 210,
  conversionPct: 17.3 - i * 1.8,
  aprobadasPlus: 58 - i * 12,
  aprobadasGeneral: 156 - i * 28,
}));

function demoConversation(contactId: string) {
  const seed = seedRandom(contactId);
  if (seed < 0.15) return { conversation: null };
  const count = 3 + Math.round(seed * 6);
  const scripts = [
    'Hola, vi el anuncio y quiero más información sobre el curso.',
    '¡Hola! Claro, con gusto te cuento. ¿Ya conoces el programa completo?',
    'No, cuéntame qué incluye.',
    'Incluye 6 semanas en vivo, comunidad privada y certificación. ¿Te gustaría agendar una llamada?',
    'Sí, me interesa. ¿Cuál es el precio?',
    'Tenemos dos opciones: General y Plus con mentoría 1:1. Te paso el link de pago.',
  ];
  return {
    conversation: {
      id: `demo-conv-${contactId}`,
      messages: Array.from({ length: count }, (_, i) => ({
        id: `demo-msg-${contactId}-${i}`,
        direction: i % 2 === 0 ? 'inbound' : 'outbound',
        body: scripts[i % scripts.length],
        ghlCreatedAt: iso(-3 + i * 0.1),
      })),
    },
  };
}

const HOTMART_PRODUCTS = ['Curso Completo General', 'Curso Completo Plus'];
function demoHotmartSales(status?: string) {
  const statuses = status ? [status] : ['APPROVED', 'APPROVED', 'BILLET_PRINTED', 'CANCELED', 'REFUNDED'];
  return Array.from({ length: 18 }, (_, i) => {
    const st = statuses[i % statuses.length]!;
    return {
      id: `demo-sale-${i}`,
      transactionId: `HP${100000 + i}`,
      productName: HOTMART_PRODUCTS[i % 2],
      buyerEmail: `comprador${i}@ejemplo.com`,
      priceValue: String(150 + (i % 5) * 40),
      currency: 'USD',
      status: st,
      purchaseDate: iso(-Math.floor(seedRandom(`sale-${i}`) * 9)),
    };
  });
}

function parseQuery(path: string): URLSearchParams {
  const qIndex = path.indexOf('?');
  return new URLSearchParams(qIndex >= 0 ? path.slice(qIndex + 1) : '');
}

/** Matches a request path (e.g. "/api/contacts?locationId=...") to a canned response. Returns undefined for anything not explicitly demo'd — caller falls back to a safe empty shape. */
export function resolveDemoResponse(path: string, method: string, body?: unknown): unknown {
  const p = path.split('?')[0]!;
  const q = parseQuery(path);

  if (p === '/api/locations') return { locations: [DEMO_LOCATION] };
  if (p === '/api/ghl-users') return { users: GHL_USERS };
  if (p === '/api/profile/me') return { user: { ghlUserId: OWNER_IDS[0] } };

  if (p === '/api/launches') return { launches: [DEMO_LAUNCH, ...PAST_LAUNCHES] };
  if (p === '/api/launches/comparison') return { rows: RENDIMIENTO_ROWS };
  if (p === '/api/launches/tribes') return { tribes: [] };
  if (/^\/api\/launches\/[^/]+\/phases$/.test(p)) return { phases: DEMO_PHASES };
  if (/^\/api\/launches\/[^/]+\/attendance-rules$/.test(p)) return { rules: [] };
  if (/^\/api\/launches\/[^/]+\/summary$/.test(p)) return LAUNCH_SUMMARY;

  if (p === '/api/contacts') {
    const search = (q.get('q') ?? '').toLowerCase();
    const items = search ? DEMO_CONTACTS.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(search)) : DEMO_CONTACTS;
    return { items, total: items.length };
  }
  const conversationMatch = p.match(/^\/api\/contacts\/([^/]+)\/conversation$/);
  if (conversationMatch) return demoConversation(conversationMatch[1]!);

  if (p === '/api/setters/summary') return { summary: SETTERS_SUMMARY };
  if (p === '/api/setters/detail') {
    return {
      detail: DEMO_CONTACTS.slice(0, 6).map((c, i) => ({
        conversationId: `demo-conv-detail-${i}`,
        contactName: `${c.firstName} ${c.lastName}`,
        contactPhone: c.phone,
        status: i % 3 === 0 ? 'pendiente' : 'atendido',
        lastMessageAt: iso(-i * 0.4),
        primeraRespuestaMinutos: 3 + i * 2,
      })),
    };
  }

  if (p === '/api/hotmart/connection') return { connected: true, webhookConnected: true };
  if (p === '/api/hotmart/summary') return { revenue: SALES_KPIS.ingresoBruto, salesCount: SALES_KPIS.comprasAprobadas, averageTicket: SALES_KPIS.ticketPromedio, byProduct: HOTMART_PRODUCTS.map((productName, i) => ({ productName, revenue: 30_000 - i * 8_000, salesCount: 120 - i * 30 })) };
  if (p === '/api/hotmart/sales') return { items: demoHotmartSales(q.get('status') ?? undefined) };
  if (p === '/api/hotmart/offers') return { offers: [] };

  if (p === '/api/kpis/funnel') return { stages: [
    { pipelineStageId: '1', pipelineName: 'Ventas', stageName: 'Nuevo', count: 1240, percentageOfTotalPct: 100 },
    { pipelineStageId: '2', pipelineName: 'Ventas', stageName: 'Contactado', count: 890, percentageOfTotalPct: 71.8 },
    { pipelineStageId: '3', pipelineName: 'Ventas', stageName: 'Ofertado', count: 348, percentageOfTotalPct: 28.1 },
    { pipelineStageId: '4', pipelineName: 'Ventas', stageName: 'Ganado', count: 214, percentageOfTotalPct: 17.3 },
  ] };
  if (p === '/api/kpis/operational') return { leadsGenerados: SALES_KPIS.leadsGestionados, wonCount: SALES_KPIS.comprasAprobadas, ingresos: SALES_KPIS.ingresoBruto, efectivoCobrado: 8_900, ticketPromedio: SALES_KPIS.ticketPromedio };
  if (p === '/api/kpis/operational-multi') {
    const kpis = { leadsGenerados: SALES_KPIS.leadsGestionados, ingresos: SALES_KPIS.ingresoBruto, efectivoCobrado: 8_900, ticketPromedio: SALES_KPIS.ticketPromedio };
    return { totals: kpis, byLocation: [{ locationId: LOCATION_ID, locationName: DEMO_LOCATION.name, kpis }] };
  }
  if (p === '/api/kpis/advisor') return { leadsAsignados: 120, chatsAtendidos: 96, citasAgendadas: 24, ventas: 18, ingresoNeto: 3_780 };
  if (p === '/api/kpis/acquisition') return { rows: [] };

  if (p === '/api/opportunities') return { items: [] };
  if (p === '/api/pipeline-stages') return { stages: [{ id: '1', pipelineName: 'Ventas', stageName: 'Ganado' }] };
  if (p === '/api/payments') return { payments: [] };
  if (p === '/api/settings/goals') return { dailyCallGoal: null, weeklyMeetingGoal: null };
  if (p === '/api/settings/stage-automation') return { rules: [] };
  if (p === '/api/settings/triggers') return {};

  if (p === '/api/assistant/ask') {
    const question = typeof body === 'object' && body && 'question' in body ? String((body as { question: unknown }).question) : '';
    return { answer: `Sobre "${question}": el lanzamiento activo lleva ${SALES_KPIS.comprasAprobadas} compras aprobadas (${STATUS_BREAKDOWN.aprobadas.plus} Plus / ${STATUS_BREAKDOWN.aprobadas.general} General) con $${SALES_KPIS.ingresoBruto.toLocaleString('en-US')} de ingreso bruto. De las ${STATUS_BREAKDOWN.recovery.total} personas con dinero sobre la mesa, ${STATUS_BREAKDOWN.recovery.recuperados} ya completaron su compra.` };
  }
  if (p === '/api/assistant/report') {
    return {
      launchName: DEMO_LAUNCH.name,
      from: DEMO_LAUNCH.startDate,
      to: DEMO_LAUNCH.endDate,
      lines: [
        `• Compras aprobadas: ${SALES_KPIS.comprasAprobadas} · Upgrades a VIP: ${SALES_KPIS.upgradesVip} · Order bumps: ${SALES_KPIS.orderBumps}.`,
        `• Ingreso bruto: $${SALES_KPIS.ingresoBruto.toLocaleString('en-US')} · Neto del productor: $${SALES_KPIS.netoProductor.toLocaleString('en-US')} · Ticket promedio: $${SALES_KPIS.ticketPromedio}.`,
        `• Dinero sobre la mesa: ${STATUS_BREAKDOWN.recovery.total} personas — ${STATUS_BREAKDOWN.recovery.recuperados} ya compraron, ${STATUS_BREAKDOWN.recovery.pendientes} siguen pendientes.`,
        `• Mejor asesor: ${SALES_RANKING[0]!.name} (${SALES_RANKING[0]!.compras} compras, $${SALES_RANKING[0]!.ingresoNeto.toLocaleString('en-US')} neto).`,
      ],
    };
  }

  if (p === '/api/locations' && method !== 'GET') return { message: 'Backfill enqueued', locationId: LOCATION_ID };
  if (/\/sync$/.test(p) && method === 'POST') return { message: 'Sincronización con GHL encolada — puede tardar unos minutos en reflejarse acá.', locationId: LOCATION_ID };

  return undefined;
}
