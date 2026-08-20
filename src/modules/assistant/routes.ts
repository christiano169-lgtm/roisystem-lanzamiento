import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { assertOwnedLocation } from '../../lib/authz.js';
import { getFunnel, getOperationalKpis, getRankingByAdvisor } from '../kpis/service.js';
import { getObjectionsBreakdown, getQualitySummary } from '../quality/service.js';
import { getTenantOpenAiClient } from '../quality/tenantAiSettings.js';

export const assistantRouter = Router();

const formatNumber = (n: number) => new Intl.NumberFormat('es-CO').format(n);
const formatCurrency = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const formatPct = (n: number) => `${n.toFixed(1)}%`;

assistantRouter.use(requireAuth);

const askSchema = z.object({
  locationId: z.string().min(1),
  from: z.string().datetime(),
  to: z.string().datetime(),
  question: z.string().min(1).max(500),
});

/**
 * "Habla con tus datos" — no function-calling/agent loop, just a single
 * completion grounded in real numbers computed the same way the Dashboard
 * computes them (same service functions), pasted into the prompt as
 * context. Simpler and more auditable than letting the model query the DB
 * itself, and cheap enough to recompute per question given the KPI queries
 * are already fast (see kpis/service.ts).
 */
assistantRouter.post('/ask', async (req, res, next) => {
  try {
    const input = askSchema.parse(req.body);
    await assertOwnedLocation(req.auth!.tenantId, input.locationId);
    const filters = { from: new Date(input.from), to: new Date(input.to) };

    const [kpis, funnel, ranking, quality, objections] = await Promise.all([
      getOperationalKpis(req.auth!.tenantId, input.locationId, filters),
      getFunnel(req.auth!.tenantId, input.locationId, filters),
      getRankingByAdvisor(req.auth!.tenantId, input.locationId, filters),
      getQualitySummary(input.locationId, filters),
      getObjectionsBreakdown(input.locationId, filters),
    ]);

    const context = [
      `KPIs operativos del período: ${formatNumber(kpis.leadsGenerados)} leads, ${formatNumber(kpis.llamadas)} llamadas, ${formatNumber(kpis.contestadas)} contestadas (${formatPct(kpis.tasaContestacionPct)}), ${formatNumber(kpis.agendadas)} citas agendadas, ${formatNumber(kpis.asistidas)} asistidas, ingresos ${formatCurrency(kpis.ingresos)}, efectivo cobrado ${formatCurrency(kpis.efectivoCobrado)}.`,
      `Embudo por etapa: ${funnel.map((f) => `${f.stageName}: ${f.count} (${formatPct(f.percentageOfTotalPct)})`).join(', ') || 'sin datos'}.`,
      `Ranking por asesor: ${ranking.map((r) => `${r.name} — ${r.leads} leads, ${r.llamadas} llamadas, ${r.agendadas} citas, ${formatCurrency(r.facturacion)} facturados`).join('; ') || 'sin datos'}.`,
      `Calidad de conversación por asesor: ${quality.map((q) => `${q.name} — ${q.analyzedCount} analizadas, interés promedio ${q.avgInterestScorePct}%, calidad ${q.avgQualityScore}/10`).join('; ') || 'sin conversaciones analizadas'}.`,
      `Objeciones más comunes: ${objections.map((o) => `${o.category}: ${o.count}x`).join(', ') || 'sin objeciones detectadas'}.`,
    ].join('\n');

    const { client, model } = await getTenantOpenAiClient(req.auth!.tenantId);
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content:
            'Eres el analista de datos de ROISystem, un dashboard de ventas. Responde preguntas del usuario ÚNICAMENTE con base en los datos reales que te doy a continuación — no inventes cifras. Si el dato no está en el contexto, dilo claramente. Responde en español, en 2-5 líneas, directo y accionable.',
        },
        { role: 'user', content: `Datos del período seleccionado:\n${context}\n\nPregunta: ${input.question}` },
      ],
    });

    const answer = response.choices[0]?.message?.content ?? 'No pude generar una respuesta.';
    res.json({ answer });
  } catch (err) {
    next(err);
  }
});
