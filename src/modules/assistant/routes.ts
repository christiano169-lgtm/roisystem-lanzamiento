import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { prisma } from '../../db/prisma.js';
import { getLaunchSummary, type LaunchSummary } from '../lanzamiento/launches/service.js';
import { getTenantOpenAiClient } from '../quality/tenantAiSettings.js';

export const assistantRouter = Router();

const formatNumber = (n: number) => new Intl.NumberFormat('es-CO').format(n);
const formatUsd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

assistantRouter.use(requireAuth);

/**
 * Every other screen filters by launch/phase, never a free date range (see
 * README + LaunchPhaseSelector) — the assistant grounds on the same
 * getLaunchSummary the Panel ejecutivo reads from, scoped to whichever
 * launch/phase the caller names, so "de inmediato con la data que piden"
 * actually means the same numbers the user is looking at on screen.
 */
async function resolveWindow(launchId: string, phaseId?: string): Promise<{ from: Date; to: Date } | undefined> {
  if (!phaseId) return undefined;
  const phase = await prisma.launchPhase.findFirst({ where: { id: phaseId, launchId } });
  return phase ? { from: phase.startDate, to: phase.endDate } : undefined;
}

function summaryToContext(summary: LaunchSummary): string {
  const { launch, salesKpis, statusBreakdown, embudoVentas, salesRanking, setters, asistencia, tribes, countries } = summary;

  const lines = [
    `Lanzamiento: ${launch.name} (${launch.status}), del ${launch.startDate.toISOString().slice(0, 10)} al ${launch.endDate.toISOString().slice(0, 10)}.`,
    `Ventas: ${formatNumber(salesKpis.comprasAprobadas)} compras aprobadas, ${formatNumber(salesKpis.upgradesVip)} upgrades a VIP, ${formatNumber(salesKpis.orderBumps)} order bumps. Ingreso bruto ${formatUsd(salesKpis.ingresoBruto)}, neto del productor ${formatUsd(salesKpis.netoProductor)}, ticket promedio ${formatUsd(salesKpis.ticketPromedio)}.`,
    `Dinero sobre la mesa — Aprobadas: ${statusBreakdown.aprobadas.plus} Plus / ${statusBreakdown.aprobadas.general} General. Carritos abandonados: ${statusBreakdown.abandonados.plus} Plus / ${statusBreakdown.abandonados.general} General. Canceladas: ${statusBreakdown.canceladas.plus} Plus / ${statusBreakdown.canceladas.general} General. Tickets de pago en efectivo emitidos: ${statusBreakdown.ticketsEmitidos.plus} Plus / ${statusBreakdown.ticketsEmitidos.general} General. De ${statusBreakdown.recovery.total} personas con dinero sobre la mesa, ${statusBreakdown.recovery.recuperados} ya compraron y ${statusBreakdown.recovery.pendientes} todavía no.`,
    `Embudo: ${embudoVentas.cerrada} cerradas, ${embudoVentas.ofertada} ofertadas, ${embudoVentas.noOfertada} no ofertadas.`,
    `Ranking por asesor: ${salesRanking.map((r) => `${r.name} — ${r.leads} leads, ${r.compras} compras, ${r.upgrades} upgrades, ${r.bumps} bumps, ${formatUsd(r.ingresoNeto)} neto, ${r.conversionPct.toFixed(1)}% conversión`).join('; ') || 'sin ventas atribuidas a un asesor'}.`,
    `Setters (chats atendidos): ${setters.map((s) => `${s.ownerGhlId} — ${s.atendidos} atendidos, ${s.primeraRespuestaMinutosPromedio ?? '—'} min de primera respuesta promedio`).join('; ') || 'sin datos'}.`,
    `Asistencia: ${asistencia.map((a) => `${a.label}: ${a.count}`).join(', ') || 'sin reglas de asistencia configuradas'}.`,
    `Leads por tribu: ${tribes.map((t) => `${t.label}: ${t.count}`).join(', ') || 'sin tribus configuradas'}.`,
    `Leads por país: ${countries.slice(0, 10).map((c) => `${c.country}: ${c.count}`).join(', ') || 'sin datos de país'}.`,
  ];
  return lines.join('\n');
}

const askSchema = z.object({
  locationId: z.string().min(1),
  launchId: z.string().min(1),
  phaseId: z.string().min(1).optional(),
  question: z.string().min(1).max(500),
});

/**
 * "Habla con tus datos" — no function-calling/agent loop, just a single
 * completion grounded in the real launch numbers (same getLaunchSummary the
 * Panel ejecutivo reads from), pasted into the prompt as context. Simpler
 * and more auditable than letting the model query the DB itself.
 */
assistantRouter.post('/ask', async (req, res, next) => {
  try {
    const input = askSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);

    const window = await resolveWindow(input.launchId, input.phaseId);
    const summary = await getLaunchSummary(req.auth!.tenantId, input.locationId, input.launchId, window);
    if (!summary) return res.status(404).json({ error: 'Launch not found' });

    const context = summaryToContext(summary);
    const { client, model } = await getTenantOpenAiClient(req.auth!.tenantId);
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Eres el analista de datos de ROISystem, un dashboard para lanzamientos (ventas, embudo, asesores). Responde preguntas del usuario ÚNICAMENTE con base en los datos reales que te doy a continuación — no inventes cifras. Si el dato no está en el contexto, dilo claramente. Responde en español, en 2-5 líneas, directo y accionable.',
        },
        { role: 'user', content: `Datos del lanzamiento seleccionado:\n${context}\n\nPregunta: ${input.question}` },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? 'No pude generar una respuesta.';
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});

const reportSchema = z.object({
  locationId: z.string().min(1),
  launchId: z.string().min(1),
  phaseId: z.string().min(1).optional(),
});

/** Same grounding as /ask, structured as report lines instead of a free-form answer — feeds "Generar reporte semanal". */
assistantRouter.post('/report', async (req, res, next) => {
  try {
    const input = reportSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);

    const window = await resolveWindow(input.launchId, input.phaseId);
    const summary = await getLaunchSummary(req.auth!.tenantId, input.locationId, input.launchId, window);
    if (!summary) return res.status(404).json({ error: 'Launch not found' });

    const { launch, salesKpis, statusBreakdown, salesRanking } = summary;
    const bestAdvisor = [...salesRanking].sort((a, b) => b.ingresoNeto - a.ingresoNeto)[0];

    const lines = [
      `• Compras aprobadas: ${formatNumber(salesKpis.comprasAprobadas)} · Upgrades a VIP: ${formatNumber(salesKpis.upgradesVip)} · Order bumps: ${formatNumber(salesKpis.orderBumps)}.`,
      `• Ingreso bruto: ${formatUsd(salesKpis.ingresoBruto)} · Neto del productor: ${formatUsd(salesKpis.netoProductor)} · Ticket promedio: ${formatUsd(salesKpis.ticketPromedio)}.`,
      `• Dinero sobre la mesa: ${formatNumber(statusBreakdown.recovery.total)} personas (canceladas/abandonos/tickets) — ${formatNumber(statusBreakdown.recovery.recuperados)} ya compraron, ${formatNumber(statusBreakdown.recovery.pendientes)} siguen pendientes.`,
      bestAdvisor
        ? `• Mejor asesor: ${bestAdvisor.name} (${formatNumber(bestAdvisor.compras)} compras, ${formatUsd(bestAdvisor.ingresoNeto)} neto, ${bestAdvisor.conversionPct.toFixed(1)}% conversión).`
        : '• Sin ventas atribuidas a un asesor todavía.',
    ];

    res.json({ launchName: launch.name, from: launch.startDate.toISOString(), to: launch.endDate.toISOString(), lines });
  } catch (err) {
    next(err);
  }
});
