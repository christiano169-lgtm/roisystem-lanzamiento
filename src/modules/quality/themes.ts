import { prisma } from '../../db/prisma.js';
import { getTenantOpenAiClient } from './tenantAiSettings.js';
import { analysisWhere, type QualityFilters } from './service.js';

const THEMES_SYSTEM_PROMPT = `Eres un director comercial que revisa las notas de mejora que un coach de IA le dejó a
cada asesor/closer de un equipo de ventas, tras auditar sus llamadas/videollamadas/chats. Tu trabajo es encontrar
patrones que se repiten ENTRE VARIOS asesores (no listar cada nota suelta) y agruparlos en temas accionables para
una reunión de equipo. Si una nota es un caso aislado de un solo asesor, no la conviertas en tema. Responde siempre
en español, en el formato JSON solicitado.`;

const THEMES_SCHEMA = {
  type: 'object' as const,
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string', description: 'Nombre corto del patrón repetido, ej: "Cierre débil ante objeciones de precio".' },
          affectedClosers: { type: 'array', items: { type: 'string' }, description: 'Nombres de los asesores a los que les aplica este patrón.' },
          recommendation: { type: 'string', description: 'Recomendación de coaching para el equipo sobre este patrón, 1-2 líneas.' },
        },
        required: ['theme', 'affectedClosers', 'recommendation'],
        additionalProperties: false,
      },
    },
  },
  required: ['themes'],
  additionalProperties: false,
};

export interface ImprovementTheme {
  theme: string;
  affectedClosers: string[];
  recommendation: string;
}

const MIN_NOTES_FOR_THEMES = 3;
// Bounded window: keeps the prompt (and cost) predictable regardless of how
// large the date range is — most recent analyses are the most relevant for
// "what's happening with the team right now" anyway.
const MAX_NOTES_IN_PROMPT = 150;

/**
 * Synthesizes recurring improvement patterns ACROSS closers from their
 * individual `QualityAnalysis.improvementNotes` — e.g. "3 of your 5 closers
 * struggle to close against price objections" instead of a flat per-closer
 * note list (which `getQualitySummary` already provides). This is an LLM
 * call, not a DB aggregate, so unlike the rest of the KPI/quality endpoints
 * it's meant to be triggered on demand (a button in the UI) rather than
 * re-run on every filter change.
 */
export async function getImprovementThemes(tenantId: string, locationId: string, filters: QualityFilters): Promise<ImprovementTheme[]> {
  const [ghlUsers, analyses] = await Promise.all([
    prisma.ghlUser.findMany({ where: { locationId } }),
    prisma.qualityAnalysis.findMany({
      where: analysisWhere(locationId, filters),
      orderBy: { analyzedAt: 'desc' },
      select: { ownerGhlId: true, improvementNotes: true },
      take: MAX_NOTES_IN_PROMPT,
    }),
  ]);

  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));
  const entries = analyses.filter((a): a is typeof a & { improvementNotes: string } => !!a.improvementNotes);
  if (entries.length < MIN_NOTES_FOR_THEMES) return [];

  const { client, model } = await getTenantOpenAiClient(tenantId);
  const notesBlock = entries
    .map((a) => `${a.ownerGhlId ? (nameByOwner.get(a.ownerGhlId) ?? a.ownerGhlId) : 'Asesor desconocido'}: ${a.improvementNotes}`)
    .join('\n---\n');

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: THEMES_SYSTEM_PROMPT },
      { role: 'user', content: `Notas de mejora por asesor (una por conversación analizada):\n\n${notesBlock}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'improvement_themes', strict: true, schema: THEMES_SCHEMA } },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned an empty improvement-themes response');
  return (JSON.parse(content) as { themes: ImprovementTheme[] }).themes;
}
