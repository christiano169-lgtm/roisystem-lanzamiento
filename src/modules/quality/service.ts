import { Prisma, type QualityChannel } from '@prisma/client';
import { prisma } from '../../db/prisma.js';

export interface QualityFilters {
  from?: Date;
  to?: Date;
  channel?: QualityChannel;
}

export interface QualitySummaryRow {
  ownerGhlId: string;
  name: string;
  analyzedCount: number;
  avgInterestScorePct: number;
  avgQualityScore: number;
  recentImprovementNotes: string[];
}

export function analysisWhere(locationId: string, filters: QualityFilters): Prisma.QualityAnalysisWhereInput {
  return {
    locationId,
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.from || filters.to
      ? { analyzedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } }
      : {}),
  };
}

export async function getQualitySummary(locationId: string, filters: QualityFilters): Promise<QualitySummaryRow[]> {
  const where = analysisWhere(locationId, filters);

  const [grouped, ghlUsers, recentByOwner] = await Promise.all([
    prisma.qualityAnalysis.groupBy({
      by: ['ownerGhlId'],
      where,
      _count: { _all: true },
      _avg: { interestScorePct: true, qualityScore: true },
    }),
    prisma.ghlUser.findMany({ where: { locationId } }),
    prisma.qualityAnalysis.findMany({
      where,
      orderBy: { analyzedAt: 'desc' },
      select: { ownerGhlId: true, improvementNotes: true },
      take: 200, // bounded recent window to build the per-owner "latest notes" list from
    }),
  ]);

  const nameByOwner = new Map(ghlUsers.map((u) => [u.ghlUserId, u.name]));
  const notesByOwner = new Map<string, string[]>();
  for (const row of recentByOwner) {
    if (!row.ownerGhlId || !row.improvementNotes) continue;
    const list = notesByOwner.get(row.ownerGhlId) ?? [];
    if (list.length < 5) list.push(row.improvementNotes);
    notesByOwner.set(row.ownerGhlId, list);
  }

  return grouped
    .filter((row): row is typeof row & { ownerGhlId: string } => row.ownerGhlId !== null)
    .map((row) => ({
      ownerGhlId: row.ownerGhlId,
      name: nameByOwner.get(row.ownerGhlId) ?? row.ownerGhlId,
      analyzedCount: row._count._all,
      avgInterestScorePct: Math.round(row._avg.interestScorePct ?? 0),
      avgQualityScore: Math.round((Number(row._avg.qualityScore) || 0) * 10) / 10,
      recentImprovementNotes: notesByOwner.get(row.ownerGhlId) ?? [],
    }))
    .sort((a, b) => b.analyzedCount - a.analyzedCount);
}

export async function getQualityDetailForCloser(locationId: string, ownerGhlId: string, filters: QualityFilters) {
  return prisma.qualityAnalysis.findMany({
    where: { ...analysisWhere(locationId, filters), ownerGhlId },
    orderBy: { analyzedAt: 'desc' },
    take: 100,
  });
}

export interface ObjectionBreakdownRow {
  category: string;
  count: number;
}

/**
 * Powers the "Objeciones más comunes" widget. `objectionCategories` is a
 * Postgres scalar array, which Prisma's `groupBy` can't unnest — counting in
 * JS over the matching rows is simplest given the bounded per-location,
 * per-range row count this filters to (same assumption as the 200-row cap
 * on `getQualitySummary`'s recent-notes query above).
 */
export async function getObjectionsBreakdown(locationId: string, filters: QualityFilters): Promise<ObjectionBreakdownRow[]> {
  const rows = await prisma.qualityAnalysis.findMany({
    where: analysisWhere(locationId, filters),
    select: { objectionCategories: true },
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const category of row.objectionCategories) {
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}
